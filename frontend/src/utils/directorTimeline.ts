// 核对原生轨道清空前后，只允许删除一条动画轨道，不接受其他工程变化。
export function validateTimelineClear(beforeRaw:string,afterRaw:string,kind:"camera"|"object") {
  if(typeof beforeRaw!=="string"||typeof afterRaw!=="string"||beforeRaw.length>8_000_000||afterRaw.length>8_000_000)throw new Error("清空备份无效");
  const before=JSON.parse(beforeRaw),after=JSON.parse(afterRaw);
  if(!before.activeShotId||before.activeShotId!==after.activeShotId)throw new Error("镜头已切换");
  const expected=structuredClone(before),shot=expected.shots?.find((s:any)=>s.id===expected.activeShotId);
  if(!shot)throw new Error("镜头不存在");
  if(kind==="camera"){
    if(!Array.isArray(before.keyframes)||!before.keyframes.length||after.keyframes?.length!==0)throw new Error("镜头轨道未清空");
    expected.keyframes=[];shot.keyframes=[];
  }else if(kind==="object"){
    const old=before.objectKeyframes||{},now=after.objectKeyframes||{};
    const removed=Object.keys(old).filter(id=>old[id]?.length&&!now[id]?.length);
    if(removed.length!==1)throw new Error("人物轨道清空范围不符");
    const id=removed[0];
    if(Object.prototype.hasOwnProperty.call(now,id))expected.objectKeyframes[id]=[];else delete expected.objectKeyframes[id];
    shot.objectKeyframes=structuredClone(expected.objectKeyframes);
  }else throw new Error("轨道无效");
  if(JSON.stringify(expected)!==JSON.stringify(after))throw new Error("清空期间工程已变化，请使用顶部撤销");
  return before;
}
