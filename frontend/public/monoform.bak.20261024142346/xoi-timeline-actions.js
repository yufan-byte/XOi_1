export function startTimelineActions(){
  const key=new URLSearchParams(location.search).get("key");
  let timeline,undo,backupId="",busy=false,status,timer;
  const buttons=new Map();
  const send=data=>{if(parent!==window)parent.postMessage({source:"monoform",key,...data},location.origin);};
  function announce(text){
    if(!status){status=document.createElement("div");status.className="xoi-timeline-status";status.setAttribute("role","status");document.body.append(status);}
    status.textContent=text;status.hidden=false;clearTimeout(timer);timer=setTimeout(()=>{if(status)status.hidden=true;},6500);
  }
  function save(){const button=[...document.querySelectorAll(".top-actions button")].find(b=>b.textContent.trim()==="保存");if(!button)throw new Error("请等待工程载入");button.click();return localStorage.getItem(`monoform-project-${key}`);}
  async function clear(kind){
    if(busy)return;
    try{if(parent!==window&&parent.document.querySelector('.director-skills-entry[data-busy="true"]')){announce("请等待当前方案应用或生成结束");return;}}catch{}
    if(document.querySelector('.app-shell[aria-busy="true"]')){announce("截图或导出结束后再清空记录");return;}
    const track=timeline.querySelector(`.${kind}-track`),keys=[...track?.querySelectorAll(".keyframe")||[]];if(!keys.length)return;
    busy=true;sync();
    try{
      document.querySelector(".play-button.is-playing")?.click();
      await Promise.resolve();
      const beforeRaw=save();if(!beforeRaw)throw new Error("请先保存工程");
      // 沿用原生删除回调，精确作用于当前轨道；不会通过名称猜测人物。
      for(const point of keys)if(point.isConnected)point.dispatchEvent(new MouseEvent("dblclick",{bubbles:true,cancelable:true}));
      await new Promise(resolve=>requestAnimationFrame(resolve));
      if(timeline.querySelectorAll(`.${kind}-track .keyframe`).length)throw new Error("部分记录未清空，请重试");
      const afterRaw=save();backupId=crypto.randomUUID();
      send({type:"timeline-cleared",id:backupId,kind,beforeRaw,afterRaw,frame:Number(timeline.querySelector(".time-readout strong")?.textContent)||0});
      announce(`已清空${kind==="camera"?"镜头":"当前人物或物体"}的 ${keys.length} 个记录点，其他轨道保留`);
    }catch(e){announce(e.message||"清空失败，请使用顶部撤销");}
    finally{busy=false;sync();}
  }
  function message(event){
    const data=event.data;if(event.origin!==location.origin||event.source!==parent||data?.source!=="xoi-director"||data.projectId!==key||data.type!=="timeline-clear-state"||data.id!==backupId)return;
    if(data.status==="ready"){timeline.dataset.xoiClearUndo="true";undo.disabled=false;}
    else {timeline.dataset.xoiClearUndo="false";backupId="";announce(data.status==="restored"?"已恢复清空前的记录点":data.message||"工程已继续修改，请使用顶部撤销");}
  }
  function sync(){
    const next=document.querySelector(".timeline");if(!next)return;timeline=next;
    for(const kind of ["camera","object"]){
      const record=timeline.querySelector(`.${kind}-keyframe-button`),track=timeline.querySelector(`.${kind}-track`);
      if(!record||!track){buttons.get(kind)?.remove();buttons.delete(kind);continue;}
      let button=buttons.get(kind);
      if(!button?.isConnected){button=document.createElement("button");button.type="button";button.className=`xoi-clear-track xoi-clear-${kind}`;button.textContent="清空";button.addEventListener("click",()=>clear(kind));button.addEventListener("keydown",event=>{if([" ","Enter"].includes(event.key))event.stopPropagation();});timeline.querySelector(".timeline-body").append(button);buttons.set(kind,button);}
      const person=document.querySelector(".inspector-head small")?.textContent==="PERSON";
      const label=kind==="camera"?"清空镜头记录":person?"清空当前人物记录":"清空当前物体记录";
      if(button.getAttribute("aria-label")!==label)button.setAttribute("aria-label",label);
      button.title=`${label}，保留对象和其他轨道，可撤销`;
      button.disabled=busy||!track.querySelector(".keyframe");
    }
    if(!timeline.querySelector(".xoi-clear-undo")){
      undo=document.createElement("button");undo.type="button";undo.className="xoi-clear-undo";undo.textContent="撤销清空";
      undo.addEventListener("click",async()=>{if(backupId){undo.disabled=true;document.querySelector(".play-button.is-playing")?.click();await Promise.resolve();send({type:"undo-timeline-clear",id:backupId});}});
      undo.addEventListener("keydown",event=>{if([" ","Enter"].includes(event.key))event.stopPropagation();});timeline.querySelector(".timeline-body").append(undo);
    }
  }
  addEventListener("message",message);
  return {sync,dispose(){removeEventListener("message",message);clearTimeout(timer);status?.remove();undo?.remove();for(const button of buttons.values())button.remove();}};
}
