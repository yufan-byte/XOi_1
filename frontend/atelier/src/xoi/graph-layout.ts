/** Expand legacy workflow controls without dropping nodes, edges or source ordering. */
export const CONFIG_NODE_SIZE={width:560,height:360};
type Node={id:string;type:string;position:{x:number;y:number};width:number;height:number;metadata?:Record<string,any>};
export function normalizeWorkflowLayout<T extends Node>(input:T[]):T[]{
 const source=input.map(n=>({...n,position:{...n.position}})),next=source.map(n=>({...n,position:{...n.position},...(n.type==='config'?{width:Math.max(n.width,CONFIG_NODE_SIZE.width),height:Math.max(n.height,CONFIG_NODE_SIZE.height)}:{})}));
 if(!next.some((n,i)=>n.width!==source[i].width||n.height!==source[i].height))return input;
 const leaf=source.map((n,i)=>({n,i})).filter(({n})=>n.type!=='group');
 const overlap=(a:number,b:number,c:number,d:number)=>Math.min(b,d)-Math.max(a,c)>8;
 for(const {n:b,i:j}of [...leaf].sort((a,b)=>a.n.position.x-b.n.position.x))for(const {n:a,i}of leaf){
  const gap=b.position.x-a.position.x-a.width;
  if(i!==j&&a.position.x<b.position.x&&gap>=-12&&overlap(a.position.y,a.position.y+a.height,b.position.y,b.position.y+b.height))next[j].position.x=Math.max(next[j].position.x,next[i].position.x+next[i].width+Math.max(48,gap));
 }
 for(const {n:b,i:j}of [...leaf].sort((a,b)=>a.n.position.y-b.n.position.y))for(const {n:a,i}of leaf){
  const gap=b.position.y-a.position.y-a.height;
  if(i!==j&&a.position.y<b.position.y&&gap>=-12&&overlap(a.position.x,a.position.x+a.width,b.position.x,b.position.x+b.width))next[j].position.y=Math.max(next[j].position.y,next[i].position.y+next[i].height+Math.max(56,gap));
 }
 for(let pass=0;pass<4;pass++)for(const group of next.filter(n=>n.type==='group')){
  const children=next.filter(n=>n.metadata?.groupId===group.id&&n.id!==group.id);if(!children.length)continue;
  const x=Math.min(group.position.x,...children.map(n=>n.position.x-24)),y=Math.min(group.position.y,...children.map(n=>n.position.y-48));
  group.width=Math.max(group.position.x+group.width,...children.map(n=>n.position.x+n.width+24))-x;group.height=Math.max(group.position.y+group.height,...children.map(n=>n.position.y+n.height+24))-y;group.position={x,y};
 }
 return next as T[];
}
