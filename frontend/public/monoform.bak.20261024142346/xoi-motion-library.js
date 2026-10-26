// 原生资源栏只负责发现预设、拖拽与路线预览；应用走宿主的工程校验与导入。
const catalog=[
  ["push","缓慢推进","靠近主体，强调情绪","M 22 58 L 88 58"],
  ["pull","拉远揭示","离开主体，展开空间","M 88 58 L 22 58"],
  ["slide","横移跟拍","横向移动，保持主体","M 20 74 L 122 74"],
  ["orbit","环绕人物","绕主体转动，突出登场","M 30 83 A 48 48 0 0 1 105 26"],
  ["rise","低位升起","抬升机位，揭示环境","M 28 86 Q 75 86 110 24"],
  ["follow","前后跟随","人物走动，相机跟随","M 20 82 Q 60 82 76 53 T 122 24"],
];
export function startMotionLibrary(){
  let sidebar,tab,library,overlay,track,preview,projection,drag,playbar,playObserver,observedPlay,viewObserver,observedView,autoMinimized=false,autoPlaying=false,internalPlay=false,playRevision=0,starting=false,disposed=false,previewKind="camera",autoTimeline=false,subject=null,selectionRevision=0;
  const key=new URLSearchParams(location.search).get("key");
  const send=data=>parent.postMessage({source:"monoform",key,...data},location.origin);
  const open=id=>send({type:"motion-preset",presetId:id});
  function closeLibrary(){if(sidebar)sidebar.dataset.xoiMotion="false";tab?.setAttribute("aria-pressed","false");}
  const nativeTab=event=>{if(event.target.closest(".panel-tabs button")&&!event.target.closest(".xoi-motion-tab"))closeLibrary();};
  function drop(event){const id=event.dataTransfer?.getData("application/x-xoi-motion");if(catalog.some(p=>p[0]===id)){event.preventDefault();event.stopPropagation();open(id);}}
  const over=event=>{if([...event.dataTransfer?.types||[]].includes("application/x-xoi-motion")){event.preventDefault();event.dataTransfer.dropEffect="copy";}};
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  function hasTimelineMotion(){
    try{
      const p=JSON.parse(localStorage.getItem(`monoform-project-${key}`)||'null');
      const changes=(keys,fields)=>keys?.length>=2&&keys.some(k=>fields.some(field=>JSON.stringify(k[field])!==JSON.stringify(keys[0][field])));
      return !!(changes(p?.keyframes,['position','rotation','focalLength'])||Object.values(p?.objectKeyframes||{}).some(keys=>changes(keys,['position','rotation','scale','pose','poseTime','rigRoot','joints'])||keys.length>=2&&keys.some(k=>k.continuousMotion)));
    }catch{return false;}
  }
  function needsCameraPreview(){return !document.querySelector(".play-button.is-playing")&&document.querySelectorAll(".camera-track .keyframe").length>=2&&document.querySelector(".viewport-label strong")?.textContent!=="摄像机视角";}
  function manualPlay(event){if(internalPlay||!needsCameraPreview())return;event.preventDefault();event.stopImmediatePropagation();void playCamera();}
  function keyboardPlay(event){if(event.code!=="Space"||!needsCameraPreview()||document.querySelector("dialog[open]")||event.target?.closest?.("input,select,textarea,button,[contenteditable=true]"))return;event.preventDefault();event.stopImmediatePropagation();void playCamera();}
  const cameraView=()=>document.querySelector(".viewport-label strong")?.textContent==="摄像机视角";
  const setText=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
  function pause(){document.querySelector(".play-button.is-playing")?.click();}
  function endPreview(){
    ++playRevision;starting=false;pause();autoPlaying=false;
    overlay?.remove();overlay=null;preview=null;
    playbar?.remove();playbar=null;
    if(autoTimeline){const toggle=document.querySelector('.xoi-layout-controls [data-panel="timeline"]');if(toggle?.getAttribute("aria-pressed")==="true")toggle.click();autoTimeline=false;}
    document.querySelector('.viewport-view-options .view-options-expand')?.click();
    // 原生按钮仅改变观察视角，不改场景或关键帧；无需等待另一个动画帧。
    document.querySelector('.viewport-view-options button[title="使用固定的编辑观察相机自由布置场景"]')?.click();
    if(autoMinimized)document.querySelector('.monitor-head-actions button[title="恢复摄像机窗口"]')?.click();
    autoMinimized=false;
  }
  function showPlayback(){
    if(playbar?.isConnected)return;
    playbar=document.createElement("section");playbar.className="xoi-motion-playback";playbar.setAttribute("aria-label","运镜播放控制");
    const title=document.createElement("strong"),help=document.createElement("small"),toggle=document.createElement("button"),replay=document.createElement("button"),edit=document.createElement("button");
    help.textContent=previewKind==="blocking"?"正在自由视角检查人物走位；下一步再设置相机怎么拍。":"正在看镜头拍到的画面；摆放人物、自由观察请返回编辑。";
    for(const button of [toggle,replay,edit])button.type="button";
    toggle.dataset.toggle="true";toggle.addEventListener("click",()=>{internalPlay=true;try{document.querySelector(".play-button")?.click();}finally{internalPlay=false;}});
    replay.textContent="从头重播";replay.addEventListener("click",()=>void playCamera(previewKind));
    edit.textContent="返回场景编辑";edit.dataset.edit="true";edit.addEventListener("click",endPreview);
    playbar.addEventListener("keydown",event=>event.stopPropagation());playbar.append(title,help,toggle,replay,edit);const toggleTimeline=document.querySelector('.xoi-layout-controls [data-panel="timeline"]');if(toggleTimeline?.getAttribute("aria-pressed")==="false"){toggleTimeline.click();autoTimeline=true;}
    document.querySelector(".timeline-controls")?.append(playbar);
  }
  function updatePlayback(){
    if(!playbar)return;
    if(!cameraView()&&!starting&&previewKind!=="blocking"){playbar.remove();playbar=null;autoPlaying=false;return;}
    const playing=!!document.querySelector(".play-button.is-playing");
    const frame=Number(document.querySelector(".time-readout strong")?.textContent)||0;
    const last=Number(document.querySelector(".time-readout span")?.textContent.match(/\/\s*(\d+)/)?.[1])||Infinity;
    const motion=hasTimelineMotion();
    const title=previewKind==="blocking"?"人物走位预演":"镜头预演";
    setText(playbar.querySelector("strong"),!motion?"静态镜头 · 当前构图":playing?`${title} · 播放中`:frame>=last?`${title} · 已播放结束`:`${title} · 已暂停`);
    const button=playbar.querySelector("[data-toggle]");button.hidden=!motion;setText(button,playing?"暂停":"继续");
    const label=playing?"暂停运镜预演":"继续运镜预演";if(button.getAttribute("aria-label")!==label)button.setAttribute("aria-label",label);
  }
  async function playCamera(kind="camera"){
    if(starting||disposed||document.querySelector('.app-shell[aria-busy="true"]'))return;
    const revision=++playRevision;starting=true;previewKind=kind;
    pause();
    document.querySelector('.viewport-view-options .view-options-expand')?.click();
    await nextFrame();
    if(disposed||revision!==playRevision)return;
    document.querySelector(previewKind==="blocking"?'.viewport-view-options button[title="使用固定的编辑观察相机自由布置场景"]':'.viewport-view-options button[title="切换到场景中主摄像机的实际画面"]')?.click();
    const minimize=document.querySelector('.monitor-head-actions button[title="最小化摄像机窗口"]');
    if(minimize&&previewKind!=="blocking"){minimize.click();autoMinimized=true;}
    document.querySelector('.timeline button[aria-label="回到开头"]')?.click();
    await nextFrame();
    if(disposed||revision!==playRevision)return;
    if(overlay)overlay.hidden=true;
    showPlayback();autoPlaying=true;starting=false;
    if(hasTimelineMotion()&&!document.querySelector(".play-button.is-playing")){internalPlay=true;try{document.querySelector(".play-button")?.click();}finally{internalPlay=false;}}
    updatePlayback();
  }
  function escapePreview(event){
    if(event.key!=="Escape"||document.querySelector("dialog[open]"))return;
    endPreview();send({type:"close-assistant"});
  }
  function makeSvg(tag,attrs){const node=document.createElementNS("http://www.w3.org/2000/svg",tag);for(const [name,value]of Object.entries(attrs))node.setAttribute(name,String(value));return node;}
  function draw(data){
    preview=data;
    if(!overlay||!Array.isArray(data.points)||data.points.length<2){overlay?.remove();overlay=null;return;}
    const points=data.points;
    const coords=points.flatMap(p=>[p.position,p.target]);
    let minX=Math.min(...coords.map(p=>p[0])),maxX=Math.max(...coords.map(p=>p[0])),minZ=Math.min(...coords.map(p=>p[2])),maxZ=Math.max(...coords.map(p=>p[2]));
    const extent=Math.max(maxX-minX,maxZ-minZ,2)*1.25,cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
    projection={minX:cx-extent/2,minZ:cz-extent/2,extent};
    const project=p=>[14+(p[0]-projection.minX)/extent*180,12+(p[2]-projection.minZ)/extent*144];
    const svg=overlay.querySelector("svg");svg.replaceChildren();
    svg.append(makeSvg("polyline",{points:points.map(p=>project(p.position).join(",")).join(" "),class:"xoi-motion-route"}));
    svg.append(makeSvg("polyline",{points:points.map(p=>project(p.target).join(",")).join(" "),class:"xoi-motion-target-route"}));
    const subject=project(points[0].target);svg.append(makeSvg("circle",{cx:subject[0],cy:subject[1],r:4,class:"xoi-motion-target"}));
    for(const [index,p]of [[0,points[0]],[1,points.at(-1)]]){
      const xy=project(p.position),handle=makeSvg("circle",{cx:xy[0],cy:xy[1],r:7,class:"xoi-motion-endpoint",tabindex:0,role:"button","aria-label":index===0?"拖动路线起点":"拖动路线终点"});
      handle.addEventListener("pointerdown",event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();drag={index,handle,position:[...p.position],projection:{...projection}};handle.setPointerCapture(event.pointerId);});
      handle.addEventListener("pointermove",event=>{
        if(!drag||drag.handle!==handle)return;
        const rect=svg.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*208,z=(event.clientY-rect.top)/rect.height*168;
        drag.position[0]=drag.projection.minX+(x-14)/180*drag.projection.extent;drag.position[2]=drag.projection.minZ+(z-12)/144*drag.projection.extent;
        handle.setAttribute("cx",String(x));handle.setAttribute("cy",String(z));
      });
      const finish=()=>{if(!drag)return;send({type:"motion-endpoint",index:drag.index,x:drag.position[0],z:drag.position[2]});drag=null;};
      handle.addEventListener("pointerup",finish);handle.addEventListener("pointercancel",()=>{drag=null;if(preview)draw(preview);});
      handle.addEventListener("keydown",event=>{
        if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key))return;event.preventDefault();event.stopPropagation();
        const next=[...p.position],step=event.shiftKey?.5:.1;next[event.key==="ArrowLeft"||event.key==="ArrowRight"?0:2]+=["ArrowLeft","ArrowUp"].includes(event.key)?-step:step;
        send({type:"motion-endpoint",index,x:next[0],z:next[2]});
      });
      const label=makeSvg("text",{x:xy[0]+10,y:xy[1]+3,class:"xoi-motion-point-label"});label.textContent=index===0?"起":"终";svg.append(handle,label);
    }
    overlay.querySelector("strong").textContent=`${data.name||"运镜"} · 路线草稿（俯视）`;
  }
  async function selectSubject(data){
    const current=++selectionRevision;
    let project;try{project=JSON.parse(localStorage.getItem(`monoform-project-${key}`)||'null');}catch{return;}
    const index=project?.objects?.findIndex(o=>o.id===data.subjectId);
    if(index<0||!project?.objects?.[index])return;
    subject={id:data.subjectId,name:project.objects[index].name,applied:data.applied===true,context:data.context};
    subjectBadge();
    const tabs=[...document.querySelectorAll('.left-sidebar .panel-tabs button')],sceneTab=tabs.find(b=>b.textContent.trim()==='场景层级'),prior=tabs.find(b=>b.classList.contains('is-active'));
    sceneTab?.click();await nextFrame();
    if(disposed||current!==selectionRevision)return;
    const row=document.querySelectorAll('.scene-row')[index+1];
    if(row?.querySelector('span')?.textContent===subject.name)row.click();
    if(prior&&prior!==sceneTab)prior.click();
  }
  function subjectBadge(){
    document.querySelectorAll('.xoi-subject-badge,.xoi-current-subject').forEach(n=>n.remove());
    if(!subject)return;
    const caption=document.createElement('span');caption.className='xoi-current-subject';caption.textContent=`${subject.context==='blocking'?'走位人物':subject.applied?'拍摄主体':'取景草稿'}：${subject.name}${subject.applied||subject.context==='blocking'?'':' · 待应用'}`;document.querySelector('.viewport-label')?.append(caption);
    const frame=document.querySelector('.monitor-canvas');if(!frame)return;
    const badge=document.createElement('span');badge.className='xoi-subject-badge';badge.textContent=`${subject.context==='blocking'?'走位人物':subject.applied?'拍摄主体':'取景草稿'}：${subject.name}${subject.applied||subject.context==='blocking'?'':' · 待应用'}`;frame.append(badge);
  }
  function message(event){
    const d=event.data;
    if(event.origin!==location.origin||event.source!==parent||d?.source!=="xoi-director"||d.projectId!==key)return;
    if(d.type==="subject-focus"){void selectSubject(d);return;}
    if(d.type==="end-preview"){endPreview();return;}
    if(d.type==="play-camera"){void playCamera();return;}
    if(d.type==="play-blocking"){void playCamera("blocking");return;}
    if(d.type!=="motion-preview")return;
    if(!Array.isArray(d.points)||d.points.length>200||!d.points.every(p=>[p.position,p.target].every(v=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==="number"&&Number.isFinite(n)&&Math.abs(n)<10000))))return;
    if(d.points.length<2){overlay?.remove();overlay=null;preview=null;return;}
    if(autoPlaying||starting)endPreview();
    const viewport=document.querySelector(".viewport-shell");if(!viewport)return;
    if(!overlay){
      overlay=document.createElement("section");overlay.className="xoi-motion-preview";overlay.setAttribute("aria-label","运镜俯视路线预览");
      overlay.addEventListener("keydown",event=>event.stopPropagation());
      const header=document.createElement("header"),title=document.createElement("strong"),close=document.createElement("button");close.type="button";close.textContent="×";close.setAttribute("aria-label","收起路线预览");close.addEventListener("click",()=>{overlay.remove();overlay=null;});header.append(title,close);
      const svg=makeSvg("svg",{viewBox:"0 0 208 168","aria-label":"拖动或用方向键调整起点、终点"});
      const help=document.createElement("small");help.textContent="这里只调整路线；应用并播放后看真实画面";
      overlay.append(header,svg,help);viewport.append(overlay);
    }
    overlay.hidden=false;
    draw(d);
  }
  function setup(){
    if(parent===window)return;
    if(subject&&(!document.querySelector(".xoi-current-subject")||!document.querySelector(".xoi-subject-badge")&&document.querySelector(".monitor-canvas")))subjectBadge();
    const label=document.querySelector(".viewport-label");
    if(label&&label!==observedView){
      viewObserver?.disconnect();observedView=label;
      viewObserver=new MutationObserver(()=>{if(cameraView()&&!starting)showPlayback();updatePlayback();});
      viewObserver.observe(label,{childList:true,subtree:true,characterData:true});
    }
    // 清空 / 撤销 / 原生导入会重建时间线：摄像机视角也始终保留返回入口。
    if(cameraView()&&!starting){showPlayback();updatePlayback();}
    else if(!starting)updatePlayback();
    const play=document.querySelector(".play-button");
    if(play&&play!==observedPlay){playObserver?.disconnect();observedPlay?.removeEventListener("click",manualPlay,true);observedPlay=play;play.addEventListener("click",manualPlay,true);playObserver=new MutationObserver(updatePlayback);playObserver.observe(play,{attributes:true,attributeFilter:["class"]});}
    const next=document.querySelector(".left-sidebar");
    if(next&&next!==sidebar){sidebar?.removeEventListener("click",nativeTab);sidebar=next;sidebar.style.position="relative";sidebar.addEventListener("click",nativeTab);}
    const tabs=sidebar?.querySelector(".panel-tabs");
    if(tabs&&!tabs.querySelector(".xoi-motion-tab")){
      tab=document.createElement("button");tab.type="button";tab.className="xoi-motion-tab";tab.textContent="运镜";tab.setAttribute("aria-pressed","false");
      tab.addEventListener("keydown",event=>{if([" ","Enter"].includes(event.key))event.stopPropagation();});
      tab.addEventListener("click",()=>{sidebar.dataset.xoiMotion="true";tab.setAttribute("aria-pressed","true");});tabs.append(tab);
      library=document.createElement("section");library.className="xoi-native-motion-library";library.setAttribute("aria-label","运镜预设资源库");
      const help=document.createElement("p");help.textContent="先选拍谁，再选运镜 → 右侧点“应用运镜并试播”。";library.append(help);
      for(const [id,name,desc,path]of catalog){
        const button=document.createElement("button");button.type="button";button.className="xoi-native-motion-card";button.draggable=true;
        button.addEventListener("keydown",event=>{if([" ","Enter"].includes(event.key))event.stopPropagation();});
        const svg=makeSvg("svg",{viewBox:"0 0 144 100","aria-hidden":"true"});svg.append(makeSvg("path",{d:path}),makeSvg("circle",{cx:76,cy:49,r:4,class:"subject"}));
        const moving=makeSvg("circle",{r:4,class:"camera"});moving.append(makeSvg("animateMotion",{path,dur:"3s",repeatCount:"indefinite"}));svg.append(moving);
        const copy=document.createElement("div"),title=document.createElement("strong"),detail=document.createElement("small");title.textContent=name;detail.textContent=desc;copy.append(title,detail);button.append(svg,copy);
        button.addEventListener("click",()=>open(id));button.addEventListener("dragstart",event=>{event.dataTransfer.setData("application/x-xoi-motion",id);event.dataTransfer.effectAllowed="copy";});library.append(button);
      }
      sidebar.append(library);
    }
    const nextTrack=document.querySelector(".camera-track-slot");
    if(nextTrack!==track){track?.removeEventListener("dragover",over);track?.removeEventListener("drop",drop);track=nextTrack;track?.addEventListener("dragover",over);track?.addEventListener("drop",drop);}
  }
  addEventListener("message",message);
  addEventListener("keydown",keyboardPlay,true);
  addEventListener("keydown",escapePreview,true);
  return {setup,dispose(){disposed=true;++selectionRevision;document.querySelectorAll(".xoi-subject-badge,.xoi-current-subject").forEach(n=>n.remove());++playRevision;removeEventListener("message",message);removeEventListener("keydown",keyboardPlay,true);removeEventListener("keydown",escapePreview,true);observedPlay?.removeEventListener("click",manualPlay,true);playObserver?.disconnect();viewObserver?.disconnect();sidebar?.removeEventListener("click",nativeTab);track?.removeEventListener("dragover",over);track?.removeEventListener("drop",drop);tab?.remove();library?.remove();overlay?.remove();playbar?.remove();closeLibrary();}};
}
