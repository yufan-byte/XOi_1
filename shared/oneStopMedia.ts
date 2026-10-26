/** Shared, deterministic media policy. No network or browser state. */
import {speechStale} from './oneStopSpeech';
export function movieSources(p: any) {
  return { ratio: p.ratio, clips: (p.script?.episodes || []).flatMap((e: any) => (e.scenes || []).map((s: any) => ({ id: s.id, video: s.videoUrl || '', audio: s.speechUrl || '', state: s.videoStatus || '',...(speechStale(p,s)?{audioState:'stale'}:{}) }))) };
}
export function movieSignature(p: any): string { return JSON.stringify(movieSources(p)); }
export function movieCurrent(p: any): boolean { return !!p.finalMovie?.url && p.finalMovie.source === movieSignature(p); }
export function imageReferenceLimit(m:any) {
  // Agnes' generation queue explicitly rejects `images` (verified HTTP400, quota0).
  if(/^agnes-image/i.test(m?.modelName || m?.id || ''))return 0;
  const ps=m?.paramSchema || {},field=ps.images || ps.image;
  return field ? Math.min(16,Math.max(0,Number(field.max_items)||4)) : Object.keys(ps).length ? 0 : 4;
}
export function videoInputPolicy(m: any) {
  const ps = m?.paramSchema || {}, modes = (ps.mode?.enum || ps.mode?.options?.map((x: any) => x.value) || []).map(String);
  const nativeReference = /^seedance2\.[05]-(line1(?:-fast)?|full(?:-fast)?)(?:-xoi)?$/.test(m?.modelName || m?.id || '');
  const first = !nativeReference && (!!ps.input_reference || !!ps.start_frame || modes.includes('first-frame') || m?.aicost?.firstFrame === true || (!Object.keys(ps).length && !/^agnes-/i.test(m?.modelName || m?.id || '')));
  const images = ps.images || ps.image;
  const reference = !first && (!!images || nativeReference || /^agnes-/i.test(m?.modelName || m?.id || ''));
  const cap = reference ? Math.min(16, Math.max(1, Number(images?.max_items || m?.aicost?.images || 4))) : first ? 1 : 0;
  return { first, reference, cap };
}
const sameName = (a: string, b: string) => !!a && !!b && (a.includes(b) || b.includes(a));
/** Keep one character and the matching environment ahead of decorative style refs. */
export function storyboardInputs(p:any,target:string,m:any){
  const scene=(p.script?.episodes||[]).flatMap((e:any)=>e.scenes||[]).find((s:any)=>s.id===target);
  if(!scene)throw Error('目标镜头不存在');
  const characters=(p.assets||[]).filter((a:any)=>a.kind==='character'&&scene.characters?.some((name:string)=>sameName(name,a.name)));
  const locations=(p.assets||[]).filter((a:any)=>a.kind==='scene'&&sameName(scene.location,a.name));
  const actors=characters.map((a:any)=>a.imageUrl).filter(Boolean),places=locations.map((a:any)=>a.imageUrl).filter(Boolean);
  return {
    images:[...new Set([...actors.slice(0,1),...places.slice(0,1),...actors.slice(1),...(p.styleRefs||[])])].slice(0,imageReferenceLimit(m)) as string[],
    description:[...characters,...locations].map((a:any)=>`${a.kind==='scene'?'场景':'人物'} ${a.name}：${a.description||''}`).join('\n'),
  };
}
export function videoReferences(p: any, target: string, m: any) {
  const episode = p.script?.episodes?.find((e: any) => e.scenes.some((s: any) => s.id === target));
  const index = episode?.scenes.findIndex((s: any) => s.id === target) ?? -1, scene = episode?.scenes[index];
  if (!scene) throw Error('目标镜头不存在');
  if (p.videoInput === 'text') {
    if (p.videoProduction === 'image-motion') throw Error('图片运镜需要关键帧，不能使用纯提示词模式');
    if (p.videoChain === 'serial') throw Error('纯提示词模式不能尾帧续接，请选择独立镜头');
    if (!m?.mode?.includes('text')) throw Error('当前视频模型未声明支持纯提示词生成，请选择参考图模式');
    return { images: [] as string[], previous: undefined, from: undefined };
  }
  const policy = videoInputPolicy(m);
  if (p.videoChain === 'serial') {
    if (!policy.first) throw Error('当前视频模型不支持首帧续接，请切换支持首帧的模型或使用独立镜头');
    if (index > 0) {
      const prev = episode.scenes[index - 1];
      if (!prev.videoUrl || prev.videoStatus === 'stale') throw Error('请先完成上一镜视频，再续接本镜；未提交生成请求');
      return { images: [] as string[], previous: prev.videoUrl as string, from: prev.videoUrl as string };
    }
  }
  if (!scene.imageUrl) throw Error('请先生成分镜关键帧');
  const characters = (p.assets || []).filter((a: any) => a.kind === 'character' && a.imageUrl && scene.characters?.some((name: string) => sameName(name, a.name))).map((a: any) => a.imageUrl);
  return { images: [scene.imageUrl, ...(policy.reference ? characters : [])].slice(0, policy.cap), previous: undefined, from: undefined };
}
