const oneK=new Set(["1024x1024","1536x1024","1024x1536","1280x960","960x1280","1280x1024","1024x1280","1920x1088","1088x1920","2016x864","864x2016"]);
export function imageGenerationTier(size:unknown,width:number,height:number,resolution?:unknown):"1K"|"2K"|"4K" {
  const explicit=String(resolution||size||"").toUpperCase();
  if(explicit==="1K"||explicit==="2K"||explicit==="4K")return explicit;
  if(oneK.has(`${width}x${height}`))return "1K";
  return Math.max(width,height)>=2880?"4K":Math.max(width,height)>1536?"2K":"1K";
}
