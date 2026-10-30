import React from 'react'
import {CAMERA_SHOT_PRESETS,shotPreset} from '../upstream/src/cameraMotion.js'
import {cameraMotionMode} from './camera-route.js'
export function CameraRoutePanel({camera,objects,draft,onDraft,onMode,onDraw,onEdit,onClear,onPreset,onUpdateCamera,drawing,currentFrame,fps,totalFrames}){
  const mode=drawing?'route':cameraMotionMode(camera),follow=camera.follow
  const patchFollow=patch=>onUpdateCamera({follow:{...follow,...patch}})
  return <section className="xoi-camera-route inspector-section" aria-label="相机独立路线">
    <div className="section-title"><span>相机运动</span></div>
    <label className="select-field"><span>方式</span><select aria-label="相机运动方式" value={mode} onChange={e=>onMode(e.target.value)}><option value="manual">手动摆放 / 关键帧</option><option value="follow">跟随人物</option><option value="route">沿相机路线移动</option></select></label>
    <small>本镜头连续拍摄一段动作 · 当前 {(currentFrame/fps).toFixed(1)} 秒。人物动作单独设置。</small>
    {mode==='manual'&&<p>在编辑视角拖动相机的坐标轴调整机位；需要连续运镜时，在时间轴记录不同时间的相机关键帧。</p>}
    {mode==='follow'&&follow&&<div className="camera-follow-control">
      <p>相机会随人物的位置与朝向移动。调节距离、高度与角度即可构图，无需再画相机路线。</p>
      <label className="select-field"><span>跟随对象</span><select aria-label="相机跟随对象" value={follow.targetId} onChange={e=>patchFollow({targetId:e.target.value})}>{objects.filter(o=>o.type==='person').map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <div className="shot-preset-buttons" aria-label="跟随景别">{Object.entries(CAMERA_SHOT_PRESETS).map(([value,preset])=><button type="button" key={value} className={(follow.shot||'medium')===value?'is-active':''} onClick={()=>patchFollow({...shotPreset(value),shot:value})}>{preset.label}</button>)}</div>
      {[['distance','跟随距离',1,20,.1,'H'],['height','跟随高度',.2,10,.1,'H'],['orbitDegrees','环绕角度',-180,180,1,'°'],['sideOffset','左右偏移',-10,10,.1,'H']].map(([key,label,min,max,step,unit])=><label className="range-field" key={key}><span>{label}</span><input aria-label={label} type="range" min={min} max={max} step={step} value={follow[key]??0} onChange={e=>patchFollow({[key]:Number(e.target.value)})}/><output>{Number(follow[key]??0).toFixed(step===1?0:1)} {unit}</output></label>)}
      <small>H 为人物高度。改为“手动摆放”会保留当前构图，并停止自动跟随。</small>
    </div>}
    {mode==='route'&&<>
      <p>相机沿你画的路线移动。切到“手动摆放”即可停止路线并拖动相机；已画的路线会保留。</p>
      {camera.route?.orientation==='target'&&!objects.some(o=>o.id===camera.route.targetId)&&<p role="alert">原注视对象已移除，请选择新对象后重新应用路线。</p>}
      <details open={drawing||!camera.route}><summary>路线设置</summary>
        <label className="select-field"><span>朝向</span><select aria-label="相机路线朝向" value={draft.orientation} onChange={e=>onDraft({orientation:e.target.value})}><option value="fixed">保持当前角度</option><option value="tangent">沿路线前进方向</option><option value="target">看向人物 / 物体</option></select></label>
        {draft.orientation==='target'&&<label className="select-field"><span>看向谁</span><select aria-label="相机注视对象" value={draft.targetId} onChange={e=>onDraft({targetId:e.target.value})}><option value="">请选择</option>{objects.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
        <label>绘线高度（米）<input aria-label="相机路线高度" type="number" min="0.2" max="30" step="0.1" value={draft.height} onChange={e=>onDraft({height:Number(e.target.value)})}/></label>
        <label>结束时间（秒）<input aria-label="相机路线结束时间" type="number" min="0.1" max={totalFrames/fps} step="0.1" value={draft.endSecond} onChange={e=>onDraft({endSecond:Number(e.target.value)})}/></label>
        <small>新路线从当前时间开始；修改设置后重新绘制生效。</small>
      </details>
      <div className="route-button-row"><button type="button" onClick={onDraw}>{camera.route?'重画相机路线':'画相机路线'}</button>{camera.route&&<><button type="button" onClick={onEdit}>编辑节点</button><button type="button" onClick={onClear}>清除相机路线</button></>}</div>
      {camera.route&&<details><summary>节点高度 · {camera.route.points.length} 点</summary>{camera.route.points.map((p,i)=><label className="xoi-route-height" key={i}>节点 {i+1} 高度<input type="number" aria-label={`相机节点 ${i+1} 高度`} min="0.2" max="30" step="0.1" value={p[1]} onChange={e=>onDraft({nodeHeight:{index:i,height:Number(e.target.value)}})}/></label>)}</details>}
    </>}
    {mode!=='follow'&&<details><summary>常用运镜</summary><small>只调整相机，从当前帧到结束时间；场景和人物动作保持原样。</small><label className="select-field"><span>拍摄主体</span><select aria-label="运镜拍摄主体" value={draft.targetId} onChange={e=>onDraft({targetId:e.target.value})}><option value="">默认人物 / 物体</option>{objects.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label>结束时间（秒）<input aria-label="常用运镜结束时间" type="number" min="0.1" max={totalFrames/fps} step="0.1" value={draft.endSecond} onChange={e=>onDraft({endSecond:Number(e.target.value)})}/></label><div className="route-button-row">{[['push','推进'],['pull','拉远'],['slide','横移'],['orbit','环绕'],['rise','升起']].map(([id,name])=><button type="button" key={id} onClick={()=>onPreset(id)}>{name}</button>)}</div></details>}
  </section>
}
