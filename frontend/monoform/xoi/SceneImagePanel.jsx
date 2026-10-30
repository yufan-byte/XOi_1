import React,{useEffect,useMemo,useRef,useState} from 'react'
import {CameraPreview} from '../upstream/src/Viewport.jsx'
import {sceneToMonoform} from '../upstream/src/sceneToMonoform.js'
import {rotationToward} from '../upstream/src/cameraMotion.js'
import {sceneImageFromFile} from './scene-client.js'
import {Sparkles,ImagePlus,ChevronDown,Download,CheckCircle2} from 'lucide-react'
import {Scene,Mesh,BoxGeometry,MeshStandardMaterial} from 'three'
const PATH='/api/aiAssistant/director/scene-tasks'
const TERMINAL=new Set(['succeeded','failed','cancelled'])
const STATUS_LABEL={succeeded:'已完成',failed:'失败',unknown:'待核对',queued:'排队中',running:'识别中',cancelled:'已取消'}
const safeFileName=value=>String(value||'XOi白模布景').replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').trim().slice(0,70)||'XOi白模布景'
const mergeTask=(previous,next)=>({...previous,...next,...(previous&&TERMINAL.has(previous.status)&&!TERMINAL.has(next.status)?{status:previous.status}:{})})
export function SceneImagePanel({sceneId,shotId,getScope,onApply}){
  const owner=useRef(localStorage.getItem('xoi_session')||''),alive=useRef(true),scopeGetter=useRef(getScope),timer=useRef(),fileRef=useRef(),stopPoll=useRef(false),pollEpoch=useRef(0)
  scopeGetter.current=getScope
  const key=`xoi-director-scene-task:${sceneId}:${shotId}`
  const [models,setModels]=useState([]),[model,setModel]=useState(''),[image,setImage]=useState(null),[prompt,setPrompt]=useState(''),[price,setPrice]=useState(null),[points,setPoints]=useState(10),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[record,setRecord]=useState(null),[result,setResult]=useState(null),[applying,setApplying]=useState(false)
  const [taskRows,setTaskRows]=useState([]),[nextCursor,setNextCursor]=useState(null)
  const [receipt,setReceipt]=useState(null)
  const [previewTab,setPreviewTab]=useState('model'),[exportFormat,setExportFormat]=useState('project'),[exporting,setExporting]=useState(false),[exportIds,setExportIds]=useState(null)
  const submitting=useRef(false)
  const recordRef=useRef(null),phaseRef=useRef('idle')
  const [taskPhase,setTaskPhase]=useState('idle')
  function phase(value){phaseRef.current=value;setTaskPhase(value)}
  function valid(){if(!alive.current||!owner.current||localStorage.getItem('xoi_session')!==owner.current){if(alive.current)setReceipt(null);throw Error('场景或账号已切换，请重新打开')}}
  async function request(path,init={}){
    valid();const headers=new Headers(init.headers);headers.set('X-Xoi-Expected-User',owner.current.split(':')[0]);if(typeof init.body==='string')headers.set('Content-Type','application/json')
    const response=await fetch(path,{...init,headers,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000)}),data=await response.json().catch(()=>null);valid()
    if(!response.ok||data?.success===false)throw Object.assign(Error(data?.message||'请求暂未确认，请稍后查询原任务'),{status:response.status});return data?.data??data
  }
  function save(value){valid();recordRef.current=value;try{localStorage.setItem(key,JSON.stringify(value))}catch{setMessage('本机缓存未保存；已受理任务仍可从本镜头的云端识图历史查询')}setRecord(value)}
  function rememberTask(task){
    setTaskRows(rows=>{
      const previous=rows.find(row=>row.id===task.id)
      const next=mergeTask(previous,{id:task.id,status:task.status,createdAt:task.createdAt||previous?.createdAt||Date.now()})
      return previous?rows.map(row=>row.id===task.id?next:row):[next,...rows]
    })
  }
  async function loadTasks(more=false){
    if(!sceneId)return []
    const page=await request(`${PATH}?sceneId=${encodeURIComponent(sceneId)}&shotId=${encodeURIComponent(shotId)}${more&&nextCursor?`&before=${nextCursor}`:''}`)
    setTaskRows(rows=>{
      const incoming=page.items.map(row=>mergeTask(rows.find(old=>old.id===row.id),row))
      return more?[...rows,...incoming.filter(row=>!rows.some(old=>old.id===row.id))]:[...incoming,...rows.filter(row=>!incoming.some(next=>next.id===row.id))]
    });setNextCursor(page.nextCursor);return page.items
  }
  async function poll(saved,epoch=++pollEpoch.current){
    try{
      if(stopPoll.current)return
      const task=await request(saved.taskId?`${PATH}/${encodeURIComponent(saved.taskId)}`:`${PATH}/lookup/${encodeURIComponent(saved.clientId)}`)
      if(epoch!==pollEpoch.current)return
      if(task.id&&!saved.taskId){saved={...saved,taskId:task.id};save(saved)}
      if(task.scope?.sceneId!==sceneId||task.scope?.shotId!==shotId)throw Error('任务与当前镜头不匹配，未导入结果')
      rememberTask({...task,id:task.id||saved.taskId})
      setReceipt(TERMINAL.has(task.status)||task.status==='unknown'?task.receipt||{status:'pending',points:null}:null)
      if(task.status==='succeeded'&&task.result){phase('idle');setResult(task.result);setPreviewTab('model');setExportIds(null);setMessage('白模已生成并保存在本镜头历史。先检查预览，再导入或导出。');return}
      if(task.recoveryRequired||['failed','cancelled','unknown'].includes(task.status)){phase(task.recoveryRequired||task.status==='unknown'?'uncertain':'idle');setResult(null);setMessage(task.error||'结果待核对；请查看原任务和积分明细，不能自动重复生成');return}
      phase('working')
      setMessage(task.status==='queued'?'已入队，可离开页面；再次打开原镜头查询':'正在识别空间，可停止等待；已提交任务不因此取消')
      timer.current=setTimeout(()=>void poll(saved,epoch),2500)
    }catch(e){if(alive.current&&epoch===pollEpoch.current){phase('uncertain');setMessage(`${e.message}；原任务编号已保留，可点击查询，不会自动重试生成。`)}}
  }
  useEffect(()=>{
    alive.current=true;stopPoll.current=false;setReceipt(null)
    void request('/api/aiAssistant/director/scene-models').then(list=>{setModels(list);setModel(list.find(item=>!item.disabled)?.id||'')}).catch(e=>{if(alive.current)setMessage(e.message)})
    let saved=null;try{saved=JSON.parse(localStorage.getItem(key)||'null');if(saved?.clientId||saved?.taskId){recordRef.current=saved;setRecord(saved);phase('working');void poll(saved)}}catch{}
    void loadTasks().then(rows=>{if(!saved&&!recordRef.current&&!submitting.current&&phaseRef.current==='idle'&&rows[0]){const recovered={taskId:rows[0].id};save(recovered);void poll(recovered)}}).catch(e=>{if(alive.current)setMessage(e.message)})
    return()=>{alive.current=false;stopPoll.current=true;pollEpoch.current++;clearTimeout(timer.current)}
  },[key])
  const mapped=useMemo(()=>{try{return result?.scene?sceneToMonoform(result.scene,[],'preview'):null}catch{return null}},[result])
  const selectedModel=models.find(item=>item.id===model),modelAvailable=!!selectedModel&&!selectedModel.disabled
  const unavailableReason=selectedModel?.unavailableReason||(!models.some(item=>!item.disabled)?models.find(item=>item.unavailableReason)?.unavailableReason:'')
  const actualPoints=typeof receipt?.points==='number'&&Number.isFinite(receipt.points)&&receipt.points>=0?receipt.points:null
  const receiptText=receipt?.status==='recorded'&&actualPoints!==null?`本次实际消耗 ${new Intl.NumberFormat('zh-CN',{maximumFractionDigits:5}).format(actualPoints)} 积分`:receipt?.status==='not_charged'&&actualPoints===0?'本次未扣积分':'费用待核对，请稍后刷新任务或查看积分明细。'
  const camera=mapped?.camera?{...mapped.camera,rotation:rotationToward(mapped.camera.position,mapped.camera.target)}:null
  const selectedObjects=mapped?.objects.filter(item=>exportIds===null||exportIds.includes(item.id))||[]
  async function exportResult(){
    if(exporting||!selectedObjects.length||!camera)return
    setExporting(true)
    let scene3d
    try{
      valid()
      // Export only geometry chosen by this user; account IDs, task scopes and private image URLs stay out of the file.
      const objects=structuredClone(selectedObjects),name=safeFileName(result.scene.title)
      let blob,extension
      if(exportFormat==='glb'){
        const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js')
        valid();scene3d=new Scene();scene3d.name=name
        for(const item of objects){
          const mesh=new Mesh(new BoxGeometry(1,1,1),new MeshStandardMaterial({color:item.color}))
          mesh.name=item.name;mesh.position.fromArray(item.position);mesh.rotation.fromArray([...item.rotation,'XYZ']);mesh.scale.fromArray(item.scale);scene3d.add(mesh)
        }
        blob=new Blob([await new GLTFExporter().parseAsync(scene3d,{binary:true})],{type:'model/gltf-binary'});extension='glb'
      }else{
        const data={settings:{name,fps:24,durationSeconds:4,loopPlayback:false},objects,camera:{...camera,follow:null,route:null,motionMode:'manual'},keyframes:[],objectKeyframes:{},routeTracks:{}}
        blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});extension='monoform.json'
      }
      valid();const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${name}.${extension}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
      setMessage(`已导出 ${objects.length} 个体块${exportFormat==='glb'?'，可用于支持 GLB 的三维工具':'，可通过“导入工程”重新打开'}。`)
    }catch(error){if(alive.current)setMessage(error.message||'导出失败，识图结果仍保留在历史中')}
    finally{scene3d?.traverse(item=>{item.geometry?.dispose();item.material?.dispose()});if(alive.current)setExporting(false)}
  }
  async function previewPrice(){
    if(!image||!modelAvailable||phaseRef.current!=='idle')return;setBusy(true);setMessage('')
    try{const quote=await request('/api/billing/preview',{method:'POST',body:JSON.stringify({path:PATH,body:{model,inputTokens:60000,inputLength:3000+prompt.length,hasReferenceImage:true}})});setPrice(quote);setPoints(quote.budget.defaultPoints)}catch(e){if(alive.current)setMessage(e.message)}finally{if(alive.current)setBusy(false)}
  }
  async function start(){
    if(busy||submitting.current||phaseRef.current!=='idle'||!image||!modelAvailable||!price||price.modelId!==model.replace(/^newapi:/,''))return
    submitting.current=true
    phase('working')
    setBusy(true);setMessage('');setResult(null);setReceipt(null);pollEpoch.current++;clearTimeout(timer.current);let authorized=null,accepted=false
    try{
      valid();const checkpoint=await window.xoiDirectorScene?.checkpoint();valid();if(!checkpoint?.revision)throw Error('云端保存未确认，请先保存场景')
      const scope=await scopeGetter.current();valid();scope.revision=checkpoint.revision
      const upload=await request('/api/canvas-files?ext=jpg',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:image.blob})
      authorized=await request('/api/billing/authorize',{method:'POST',body:JSON.stringify({path:PATH,model:price.modelId,points:Number(points),freeOnly:price.free===true,automatic:false})})
      const saved={clientId:crypto.randomUUID(),scope};save(saved);stopPoll.current=false;setPrice(null)
      try{
        const task=await request(PATH,{method:'POST',headers:{'X-Xoi-Billing-Id':authorized.id},body:JSON.stringify({scope,model,imageUrl:upload.url,prompt,clientTaskId:saved.clientId})});accepted=true
        const next={...saved,taskId:task.id};save(next);setPrice(null);setResult(null);void poll(next);void loadTasks().catch(()=>{})
      }catch(e){if(e.status&&e.status<500){await request(`/api/billing/budget/${authorized.id}/stop`,{method:'POST',body:'{}'}).catch(()=>{});throw e}accepted=true;phase('uncertain');setMessage('提交响应未确认，请查询已保存的原任务；确认前不会重复生成')}
    }catch(e){if(alive.current){if(!accepted)phase('idle');setMessage(e.message)}}finally{submitting.current=false;if(authorized&&!accepted)void request(`/api/billing/budget/${authorized.id}/stop`,{method:'POST',body:'{}'}).catch(()=>{});if(alive.current)setBusy(false)}
  }
  return <section className="xoi-scene-image" aria-label="场景图转白模">
    <div className="section-kicker">场景图转白模 <span className="scene-ai-badge">AI 识图</span></div>
    <small>上传参考图，还原空间、比例和遮挡，生成可编辑的白模布景。</small>
    <input ref={fileRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;pollEpoch.current++;clearTimeout(timer.current);setReceipt(null);try{const next=await sceneImageFromFile(file);valid();setImage(next);setResult(null);setPrice(null);setMessage('图片已准备好，点击生成白模查看费用。')}catch(error){if(alive.current)setMessage(error.message)}}}/>
    <button className="import-drop scene-image-generate scene-image-featured" type="button" disabled={busy||taskPhase!=='idle'} onClick={()=>fileRef.current?.click()}>{image?<img src={image.preview} alt="待识别场景图" className="xoi-scene-thumb"/>:<ImagePlus size={24}/>}<strong>{image?'更换场景参考图':'上传场景图 → 生成白模'}</strong><span>空间与比例优先 · 原布景保留</span></button>
    <label>识图模型<select aria-label="场景识图模型" disabled={busy||taskPhase!=='idle'} value={model} onChange={e=>{setModel(e.target.value);setPrice(null)}}>{!model&&<option value="" disabled>暂无可用识图模型</option>}{models.map(m=><option key={m.id} value={m.id} disabled={m.disabled}>{m.name||m.id}{m.disabled?' · 暂不可用':''}</option>)}</select></label>
    <small className="scene-model-source">来自当前账号的上游模型目录 · 调用前先确认费用</small>
    {selectedModel&&<small className="scene-model-id">上游标识：{selectedModel.id.replace(/^newapi:/,'')}</small>}
    {unavailableReason&&<small className="scene-model-unavailable">{unavailableReason}</small>}
    {modelAvailable&&models.some(item=>item.disabled)&&<details className="scene-model-unavailable"><summary>有 {models.filter(item=>item.disabled).length} 个模型暂不可用 <ChevronDown size={12}/></summary>{models.filter(item=>item.disabled).map(item=><small key={item.id}>{item.name||item.id}：{item.unavailableReason||'当前不可调用'}</small>)}</details>}
    {!models.length&&<small>当前账号暂无可用识图模型，请联系管理员开放。手动搭景可继续使用。</small>}
    <textarea aria-label="场景识别补充说明" maxLength={2000} value={prompt} disabled={busy||taskPhase!=='idle'} onChange={e=>{setPrompt(e.target.value);setPrice(null)}} placeholder="可选：说明主体、空间和尺度"/>
    <button className="scene-generate-action" type="button" disabled={busy||taskPhase!=='idle'||!image||!modelAvailable} onClick={()=>void previewPrice()}><Sparkles size={15}/>{busy?'正在处理…':taskPhase==='working'?'识图任务处理中':taskPhase==='uncertain'?'等待确认原任务':'生成白模 · 查看费用'}</button>
    {taskPhase==='uncertain'&&record&&<button type="button" onClick={()=>{stopPoll.current=false;clearTimeout(timer.current);void poll(record)}}>查询原任务结果</button>}
    {price&&<div className="xoi-scene-price"><p>{price.free?'免费模型':price.quote?`参考 ${price.quote.points} 积分`:'价格需核对'} · 视觉输入用量可能增加，实际以账单为准。</p><label>本次预算上限<input aria-label="识图预算上限" type="number" min="0.001" max={price.budget.maxPoints} step="0.001" value={points} disabled={busy||price.free} onChange={e=>setPoints(e.target.value)}/></label><button type="button" disabled={busy} onClick={()=>void start()}>{busy?'正在提交…':'确认费用并生成白模'}</button></div>}
    {message&&<p role="status">{message}</p>}
    {receipt&&<p className="scene-task-receipt" data-receipt-status={receipt.status} role="status">{receiptText}</p>}
    {mapped&&camera&&<div className="scene-result-card" aria-label="识图白模结果">
      <div className="scene-result-heading"><CheckCircle2 size={16}/><strong>{result.scene.title||'白模布景'}</strong><span>{mapped.objects.length} 个体块</span></div>
      <div className="scene-preview-tabs" role="tablist" aria-label="识图结果预览"><button type="button" role="tab" aria-selected={previewTab==='model'} onClick={()=>setPreviewTab('model')}>白模预览</button><button type="button" role="tab" aria-selected={previewTab==='image'} onClick={()=>setPreviewTab('image')}>原图对照</button></div>
      <div className="xoi-scene-preview" role="tabpanel" aria-label={previewTab==='model'?'白模预览':'原图对照'}>{previewTab==='model'?<CameraPreview objects={mapped.objects} animationTime={0} cameraData={camera} cameraAspect={16/9}/>:<img src={result.imageUrl} alt="识别任务原图"/>}</div>
      <small>布景为 AI 估测。检查空间、比例和遮挡后，导入到新镜头；原镜头保留。</small>
      {mapped.warnings.length>0&&<details className="scene-result-notes"><summary>有 {mapped.warnings.length} 项待核对 <ChevronDown size={12}/></summary>{mapped.warnings.map((w,i)=><p key={i}>{w}</p>)}</details>}
      <button className="scene-result-import" type="button" disabled={applying||exporting} onClick={async()=>{setApplying(true);try{valid();await onApply(result);if(alive.current)setMessage('白模已导入到新镜头，原镜头保留，可撤销。')}catch(e){if(alive.current)setMessage(e.message)}finally{if(alive.current)setApplying(false)}}}>{applying?'正在导入…':'导入为新镜头'}</button>
      <details className="scene-result-export"><summary><span><Download size={13}/> 保存 / 导出白模</span><ChevronDown size={12}/></summary>
        <small>结果已保存在本镜头历史。也可选择体块下载到本地。</small>
        <div className="scene-export-selection"><strong>导出 {selectedObjects.length} / {mapped.objects.length} 个体块</strong><button type="button" disabled={exporting} onClick={()=>setExportIds(selectedObjects.length===mapped.objects.length?[]:null)}>{selectedObjects.length===mapped.objects.length?'取消全选':'全选'}</button></div>
        <div className="scene-export-objects">{mapped.objects.map(item=><label key={item.id}><input type="checkbox" checked={exportIds===null||exportIds.includes(item.id)} disabled={exporting} onChange={e=>setExportIds(ids=>e.target.checked?[...(ids||mapped.objects.map(o=>o.id)),item.id]:(ids||mapped.objects.map(o=>o.id)).filter(id=>id!==item.id))}/><span>{item.name}</span></label>)}</div>
        <label>文件格式<select aria-label="白模导出格式" value={exportFormat} disabled={exporting} onChange={e=>setExportFormat(e.target.value)}><option value="project">XOi 工程 JSON · 可重新编辑</option><option value="glb">GLB 模型 · 用于三维工具</option></select></label>
        <button type="button" disabled={exporting||!selectedObjects.length} onClick={()=>void exportResult()}><Download size={13}/>{exporting?'正在导出…':`导出所选 ${selectedObjects.length} 项`}</button>
      </details>
    </div>}
    {(record||taskRows.length>0)&&<details className="scene-task-details" open={taskPhase!=='idle'}><summary>识图历史 {taskRows.length>0?`· ${taskRows.length} 次`:''}<ChevronDown size={12}/></summary>
      {taskRows.length>0&&<label>本镜头识图历史<select aria-label="本镜头识图历史" disabled={busy||taskPhase!=='idle'} value={record?.taskId||''} onChange={e=>{clearTimeout(timer.current);stopPoll.current=false;setResult(null);setPrice(null);setReceipt(null);const saved={taskId:e.target.value};save(saved);void poll(saved)}}><option value="" disabled>选择一次识图结果</option>{taskRows.map(row=><option key={row.id} value={row.id}>{new Date(row.createdAt).toLocaleString()} · {STATUS_LABEL[row.status]||row.status}</option>)}</select></label>}
      {record&&<div className="route-button-row"><button type="button" disabled={busy} onClick={()=>{stopPoll.current=false;clearTimeout(timer.current);void poll(record)}}>刷新任务</button>{taskPhase==='working'&&<button type="button" onClick={()=>{stopPoll.current=true;pollEpoch.current++;clearTimeout(timer.current);setMessage('已停止等待，任务仍在云端执行。点击刷新任务查看结果。')}}>停止等待</button>}</div>}
      {taskPhase==='working'&&<small>当前任务结束后，可切换查看之前的结果。</small>}
      {nextCursor&&<button type="button" onClick={()=>void loadTasks(true).catch(e=>setMessage(e.message))}>加载更早任务</button>}
      {record&&<small className="scene-task-id">任务编号 {record.taskId||record.clientId}</small>}
    </details>}
  </section>
}
