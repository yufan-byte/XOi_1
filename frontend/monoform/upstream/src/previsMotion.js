import {CatmullRomCurve3,Vector3} from 'three'
// Pure geometry for drawing an actor's ground-plane route and timing keyframes.
export const distance3 = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])
export function simplifyRoutePoints(points,tolerance=.035,maxPoints=24) {
  if(points.length<=2)return points.map(point=>[...point])
  const simplify=epsilon=>{
    const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]]
    while(stack.length){const [start,end]=stack.pop();let farthest=-1,distance=epsilon
      const a=points[start],b=points[end],delta=b.map((v,i)=>v-a[i]),length=delta.reduce((sum,v)=>sum+v*v,0)
      for(let i=start+1;i<end;i++){const t=length?Math.max(0,Math.min(1,points[i].reduce((sum,v,j)=>sum+(v-a[j])*delta[j],0)/length)):0;const d=distance3(points[i],a.map((v,j)=>v+t*delta[j]));if(d>distance){distance=d;farthest=i}}
      if(farthest>=0){keep.add(farthest);stack.push([start,farthest],[farthest,end])}
    }
    return [...keep].sort((a,b)=>a-b).map(i=>[...points[i]])
  }
  let result=simplify(tolerance)
  while(result.length>maxPoints){tolerance*=1.5;result=simplify(tolerance)}
  return result
}
export function smoothRoutePoints(points,maxPoints=512) {
  const distinct=points.filter((point,index)=>!index||distance3(point,points[index-1])>1e-6)
  if(distinct.length<3)return distinct.map(point=>[...point])
  const curve=new CatmullRomCurve3(distinct.map(point=>new Vector3(...point)),false,'centripetal')
  const result=curve.getSpacedPoints(Math.min(maxPoints-1,Math.max(24,distinct.length*6))).map(point=>point.toArray())
  result[0]=[...points[0]];result[result.length-1]=[...points.at(-1)]
  return result
}
export function pathToKeys(points, startFrame, endFrame, template, maxKeys=48) {
  if(!Array.isArray(points)||points.length<2) throw Error('请在地面上拖出至少两个点')
  // XOI-PATCH:route-sampling — measure from the last retained sample, not the
  // immediate input neighbour, and retain the exact endpoint on dense strokes.
  if(points.length>4000||!points.every(p=>Array.isArray(p)&&p.length===3&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=10000)))throw Error('路线节点过多或坐标无效')
  if(!Number.isFinite(startFrame)||!Number.isFinite(endFrame)||endFrame<=startFrame) throw Error('轨迹结束时间必须晚于开始时间')
  const sampled=[points[0]]
  for(let i=1;i<points.length;i++){const distance=distance3(points[i],sampled.at(-1));if(distance>.02||i===points.length-1&&distance>1e-8)sampled.push(points[i])}
  if(sampled.length<2) throw Error('轨迹太短')
  const curvePoints=smoothRoutePoints(sampled)
  const lengths=[0];for(let i=1;i<curvePoints.length;i++)lengths.push(lengths.at(-1)+distance3(curvePoints[i],curvePoints[i-1]))
  const total=lengths.at(-1)
  if(total<=.02) throw Error('轨迹太短')
  // Resample by arc length instead of dropping points after maxKeys. The old
  // implementation kept the first 47 points and then jumped directly to the
  // endpoint, which made long routes visibly skip their final bends.
  const count=Math.max(2,Math.min(maxKeys,curvePoints.length,Math.round(endFrame-startFrame)+1))
  const sampleAtDistance=distance=>{
    const target=Math.max(0,Math.min(total,distance))
    let right=lengths.findIndex(value=>value>=target)
    if(right<=0)return [...curvePoints[0]]
    if(right<0)return [...curvePoints.at(-1)]
    const left=right-1
    const span=Math.max(.000001,lengths[right]-lengths[left])
    const amount=(target-lengths[left])/span
    return curvePoints[left].map((value,index)=>value+(curvePoints[right][index]-value)*amount)
  }
  const result=[]
  for(let index=0;index<count;index++){
    const amount=index/(count-1)
    const distance=total*amount
    const position=sampleAtDistance(distance)
    const before=sampleAtDistance(Math.max(0,distance-total/Math.max(2,count-1)))
    const after=sampleAtDistance(Math.min(total,distance+total/Math.max(2,count-1)))
    const heading=Math.atan2(after[0]-before[0],after[2]-before[2])
    const rotation=[...(template.rotation||[0,0,0])];rotation[1]=heading
    if(result.length){while(rotation[1]-result.at(-1).rotation[1]>Math.PI)rotation[1]-=Math.PI*2;while(rotation[1]-result.at(-1).rotation[1]<-Math.PI)rotation[1]+=Math.PI*2}
    const frame=index===count-1?endFrame:startFrame+Math.round((endFrame-startFrame)*amount)
    result.push({...template,frame,position,rotation,interpolation:'linear'})
  }
  return result
}
