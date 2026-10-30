import {retimeDirectorShot} from "../../../shared/directorReview";
import { assertDirectorOwner, directorVec3, validateDirectorScene, type DirectorScene, type DirectorShot, type Vec3 } from "../../../shared/directorSkills";

export type NativeDirectorProject = Record<string, any>;
export interface DirectorSnapshot { raw: string; project: NativeDirectorProject; scene: DirectorScene; fingerprint: string }
export async function sceneFingerprint(raw: string, currentFrame = 0): Promise<string> {
  const project=JSON.parse(raw),keys=[...(project.keyframes||[])].sort((a,b)=>a.frame-b.frame);
  // 播放与拖动时间线会把评估后的相机保存下来；它们不算工程修改。
  // 仅当相机确实等于当前帧的插值结果才归一化，手动改机位仍会使版本失效。
  if(keys.length){
    let expected:any;
    if(currentFrame<=keys[0].frame)expected=keys[0];
    else if(currentFrame>=keys.at(-1).frame)expected=keys.at(-1);
    else {
      const index=keys.findIndex(k=>k.frame>=currentFrame),a=keys[index-1],b=keys[index];let t=(currentFrame-a.frame)/(b.frame-a.frame);
      t=a.interpolation==="hold"?0:a.interpolation==="linear"?t:t*t*(3-2*t);
      expected={position:a.position.map((v:number,i:number)=>v+(b.position[i]-v)*t),rotation:a.rotation.map((v:number,i:number)=>v+Math.atan2(Math.sin(b.rotation[i]-v),Math.cos(b.rotation[i]-v))*t),focalLength:a.focalLength+(b.focalLength-a.focalLength)*t};
    }
    const camera=project.camera;
    if(camera&&["position","rotation"].every(k=>Array.isArray(camera[k])&&camera[k].every((v:number,i:number)=>Math.abs(v-expected[k][i])<1e-6))&&Math.abs(camera.focalLength-expected.focalLength)<1e-6){
      const canonical={position:keys[0].position,rotation:keys[0].rotation,focalLength:keys[0].focalLength,aspectRatio:camera.aspectRatio,...Object.fromEntries(['follow','route','motionMode','shot'].filter(k=>k in camera).map(k=>[k,camera[k]]))};
      project.camera=canonical;const shot=project.shots?.find((s:any)=>s.id===project.activeShotId);if(shot)shot.camera=structuredClone(canonical);
    }
  }
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(project)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
export function checkedDirectorDocument(iframe: HTMLIFrameElement | null, projectId: string, ownerId: string): Document {
  assertDirectorOwner(projectId, Number(ownerId));
  if (!iframe || new URL(iframe.src, location.href).origin !== location.origin || new URL(iframe.src, location.href).searchParams.get("key") !== projectId) throw new Error("当前导演台工程尚未就绪");
  const doc = iframe.contentDocument;
  if (!doc?.querySelector('.top-actions input[type="file"]')) throw new Error("请等待导演台载入完成");
  if (doc.querySelector('.app-shell[aria-busy="true"]')) throw new Error("请等待截图或录像完成，再使用导演技能");
  return doc;
}
function saveNative(doc: Document) {
  const save = [...doc.querySelectorAll<HTMLButtonElement>(".top-actions button")].find(b => b.textContent?.trim() === "保存");
  if (!save) throw new Error("当前导演台不支持场景读取");
  save.click();
}
export function sceneFromNative(project: NativeDirectorProject, projectId: string, projectName: string): DirectorScene {
  const active = project.shots?.find((shot: any) => shot.id === project.activeShotId);
  if (!active || !Array.isArray(project.objects)) throw new Error("场景数据格式无效，请先在导演台保存工程");
  const camera = project.camera || active.camera;
  const lastFrame=Math.max(1,(active.fps||project.settings.fps)*(active.durationSeconds||project.settings.durationSeconds)-1);
  const objectPaths:Record<string,any[]>=Object.create(null);
  for(const [id,keys] of Object.entries(project.objectKeyframes||{}) as [string,any[]][]){
    if(!project.objects.some((o:any)=>o.id===id)||!keys.length)continue;
    const ordered=[...keys].sort((a,b)=>a.frame-b.frame),samples=ordered.length<=16?ordered:Array.from({length:16},(_,i)=>ordered[Math.round(i*(ordered.length-1)/15)]);
    const unique=new Map(samples.map(k=>[Math.min(1,k.frame/lastFrame),k]));
    objectPaths[id]=[...unique].map(([t,k])=>({t,position:k.position,pose:k.pose,rigRoot:k.rigRoot,interpolation:k.interpolation}));
  }
  return validateDirectorScene({
    projectId, activeShotId: project.activeShotId, name: projectName,
    fps: active.fps || project.settings?.fps, durationSeconds: active.durationSeconds || project.settings?.durationSeconds,
    aspectRatio: camera?.aspectRatio || "16:9", camera,
    objects: project.objects.map((o: any) => ({ id: o.id, name: o.name || o.id, type: o.type, position: o.position, rotation: o.rotation || [0, 0, 0], scale: o.scale || [1, 1, 1], pose: o.pose, bodyType:o.bodyType, rigRoot:o.rigRoot, visible:o.visible, locked:o.locked===true })),
    cameraKeyframes: (project.keyframes || []).map((k: any) => ({ frame: k.frame, position: k.position, rotation: k.rotation, focalLength: k.focalLength })),
    objectPaths,lighting: project.lighting || {}, shotNames: project.shots.map((s: any) => s.name),
  });
}
export async function captureDirectorScene(iframe: HTMLIFrameElement | null, projectId: string, ownerId: string, projectName: string): Promise<DirectorSnapshot> {
  const doc = checkedDirectorDocument(iframe, projectId, ownerId);
  // 读取的是稳定帧；生成、撤销不能与播放中的插值状态竞争。
  doc.querySelector<HTMLButtonElement>(".play-button.is-playing")?.click();
  await Promise.resolve();
  saveNative(doc);
  const raw = localStorage.getItem(`monoform-project-${projectId}`);
  if (!raw || raw.length > 8_000_000) throw new Error("场景尚未保存或体积过大，请先保存工程");
  const project = JSON.parse(raw);
  const frame=Number(doc.querySelector(".time-readout strong")?.textContent)||0;
  return { raw, project, scene: sceneFromNative(project, projectId, projectName), fingerprint: await sceneFingerprint(raw,frame) };
}
/** Native camera monitor explicitly uses preserveDrawingBuffer. Capture only its
 * rendered camera canvas, never the editor viewport or a DOM/logo overlay. */
export async function captureDirectorReference(iframe:HTMLIFrameElement|null,projectId:string,ownerId:string){
 const doc=checkedDirectorDocument(iframe,projectId,ownerId);
 const restore=doc.querySelector<HTMLButtonElement>('.monitor-head-actions button[title="恢复摄像机窗口"]');restore?.click();
 try{
  await new Promise(resolve=>setTimeout(resolve,150));
  const canvas=doc.querySelector<HTMLCanvasElement>('.monitor-canvas canvas');
  if(!canvas||canvas.width<16||canvas.height<16)throw new Error('主摄像机画面尚未就绪');
  const url=canvas.toDataURL('image/png');if(!url.startsWith('data:image/png;base64,')||url.length<1000)throw new Error('主摄像机截图为空');
  return {url,width:canvas.width,height:canvas.height};
 }catch{throw new Error('白模参考图读取失败，请稍后再试，或取消“附上当前机位白模图”后带入提示词');}
 finally{if(restore)doc.querySelector<HTMLButtonElement>('.monitor-head-actions button[title="最小化摄像机窗口"]')?.click();}
}
// 与白模工作台一致：相机沿 -Z 看，X/Y 为弧度，roll 为 0。
export function lookAtRotation(position: Vec3, target: Vec3): Vec3 {
  const delta = target.map((v, i) => v - position[i]);
  const length = Math.hypot(...delta);
  if (length < .01) throw new Error("机位和视线目标重合");
  return [Math.asin(delta[1] / length), Math.atan2(-delta[0], -delta[2]), 0];
}
export function appendDirectorShots(project: NativeDirectorProject, proposals: DirectorShot[]): NativeDirectorProject {
  if (!proposals.length || !proposals.every(s => s.camera)) throw new Error("所选方案没有可应用的机位");
  if (!Array.isArray(project.shots) || project.shots.length + proposals.length > 30) throw new Error("导演台最多 30 个镜头，请先整理已有镜头");
  const next = structuredClone(project);
  const source = next.shots.find((s: any) => s.id === next.activeShotId);
  if (!source) throw new Error("原镜头已不存在");
  const added = proposals.map(s => {
    const shot = structuredClone(source);
    shot.id = `shot-director-${crypto.randomUUID()}`;
    shot.name = s.name;
    shot.thumbnail = "";
    // This camera path replaces old camera keys; preserve and retime actor tracks.
    shot.keyframes=[];retimeDirectorShot(shot,s.durationSeconds??source.durationSeconds);
    const lastFrame = shot.fps * shot.durationSeconds - 1;
    shot.keyframes = s.camera!.keyframes.map(k => ({ frame: Math.round(k.t * lastFrame), interpolation: "smooth",
      position: directorVec3(k.position, "机位"), rotation: lookAtRotation(k.position, k.target), focalLength: k.focalLength }));
    if (new Set(shot.keyframes.map((k: any) => k.frame)).size !== shot.keyframes.length) throw new Error("运镜关键点过密，请减少关键点或延长原镜头");
    shot.camera = { ...shot.camera, ...shot.keyframes[0] };
    delete shot.camera.frame;
    delete shot.camera.interpolation;
    return shot;
  });
  next.shots.push(...added);
  const first = added[0];
  next.activeShotId = first.id;
  for (const key of ["objects", "camera", "lighting", "reference", "keyframes", "objectKeyframes"]) next[key] = structuredClone(first[key]);
  next.settings = { ...next.settings, fps: first.fps, durationSeconds: first.durationSeconds, loopPlayback: first.loopPlayback };
  return next;
}
export async function importDirectorProject(iframe: HTMLIFrameElement | null, projectId: string, ownerId: string, project: NativeDirectorProject): Promise<string> {
  const doc = checkedDirectorDocument(iframe, projectId, ownerId);
  const input = doc.querySelector<HTMLInputElement>('.top-actions input[type="file"]')!;
  const transfer = new DataTransfer();
  transfer.items.add(new File([JSON.stringify(project)], "director-skill.monoform.json", { type: "application/json" }));
  input.files = transfer.files;
  const event = doc.createEvent("HTMLEvents");
  event.initEvent("change", true, false);
  input.dispatchEvent(event);
  // 原生引擎会补齐骨骼与动作默认值，核对请求的关键状态，不依赖补齐字段的顺序。
  const objectState=(objects:any[])=>objects?.map(o=>({id:o.id,name:o.name,type:o.type,position:o.position,rotation:o.rotation,scale:o.scale,pose:o.type==="person"?o.pose:undefined}));
  const keyState=(tracks:Record<string,any[]>)=>Object.fromEntries(Object.entries(tracks||{}).map(([id,keys])=>[id,keys.map(k=>({frame:k.frame,position:k.position,rotation:k.rotation,scale:k.scale,pose:k.pose,continuousMotion:!!k.continuousMotion}))]));
  const cameraState=(keys:any[])=>keys?.map(k=>({frame:k.frame,interpolation:k.interpolation,position:k.position,rotation:k.rotation,focalLength:k.focalLength}));
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 60));
    if (!iframe?.isConnected) throw new Error("工程已切换，请回到原工程检查镜头");
    saveNative(checkedDirectorDocument(iframe, projectId, ownerId));
    const raw = localStorage.getItem(`monoform-project-${projectId}`);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.activeShotId === project.activeShotId && saved.shots?.length === project.shots.length && JSON.stringify(cameraState(saved.keyframes)) === JSON.stringify(cameraState(project.keyframes))
        && JSON.stringify(objectState(saved.objects)) === JSON.stringify(objectState(project.objects)) && JSON.stringify(keyState(saved.objectKeyframes)) === JSON.stringify(keyState(project.objectKeyframes))) return raw;
    }
  }
  throw new Error("导演台没有确认应用结果，可用“撤销本次添加”恢复原工程");
}
