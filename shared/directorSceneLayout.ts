type Point={x:number;y:number};
const error=()=>Object.assign(new Error("识图结构不完整或超出安全范围，未应用到场景；请查看任务及积分明细"),{status:422});
const finite=(v:unknown,max=1000):v is number=>typeof v==="number"&&Number.isFinite(v)&&Math.abs(v)<=max;
const vec=(v:any)=>Array.isArray(v)&&v.length===3&&v.every(n=>finite(n));
function point(value:any):Point{if(!finite(value?.x)||!finite(value?.y))throw error();return {x:value.x,y:value.y};}
const name=(value:unknown,fallback:string)=>typeof value==="string"?value.slice(0,100):fallback;
export function validateSceneLayout(input:any){
  if(!input||!Array.isArray(input.creations)||!Array.isArray(input.walls)||!input.creations.length&&!input.walls.length||input.creations.length+input.walls.length>100)throw error();
  const ids=new Set<string>();
  const base=(item:any,index:number)=>{
    if(!item||typeof item.id!=="string"||!/^[A-Za-z0-9_-]{1,100}$/.test(item.id)||ids.has(item.id)||!finite(item.height,100)||item.height<=0)throw error();ids.add(item.id);
    return {id:item.id,name:name(item.name,`结构 ${index+1}`),a:point(item.a),b:point(item.b),height:item.height,color:/^#[a-fA-F0-9]{6}$/.test(item.color)?item.color:"#d2d0ca"};
  };
  const creations=input.creations.map((item:any,i:number)=>{const next=base(item,i);if(next.b.x<=next.a.x||next.b.y<=next.a.y||item.baseZ!==undefined&&!finite(item.baseZ,100))throw error();return {...next,baseZ:item.baseZ??0};});
  const walls=input.walls.map((item:any,i:number)=>{const next=base(item,i);if(Math.hypot(next.a.x-next.b.x,next.a.y-next.b.y)<.01)throw error();return next;});
  const camera=input.previs?.camera;if(!vec(camera?.position)||!vec(camera?.target)||Math.hypot(...camera.position.map((v:number,i:number)=>v-camera.target[i]))<.01||!finite(camera.fov,100)||camera.fov<18)throw error();
  const warnings=Array.isArray(input.previs?.uncertainties)?input.previs.uncertainties.filter((v:any)=>typeof v==="string").slice(0,12).map((v:string)=>v.slice(0,300)):[];
  if(input.walls.some((w:any)=>w.holes?.length))warnings.push("墙洞可能未完整还原，请在白模中检查门窗开口");
  const evidence=Array.isArray(input.previs?.evidence)?input.previs.evidence.slice(0,100).map((e:any)=>({name:name(e?.name,"结构待核对"),depth:name(e?.depth,"unknown"),support:name(e?.support,"unknown")})):[];
  return {version:2,title:name(input.title,"场景图白模"),creations,walls,previs:{camera:{position:camera.position.map(Number),target:camera.target.map(Number),fov:camera.fov},evidence,uncertainties:warnings}};
}
