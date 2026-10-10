import { assertDirectorOwner, directorVec3, validateDirectorScene, type DirectorScene, type DirectorShot, type Vec3 } from "../../../shared/directorSkills";

export type NativeDirectorProject = Record<string, any>;
export interface DirectorSnapshot { raw: string; project: NativeDirectorProject; scene: DirectorScene; fingerprint: string }
export async function sceneFingerprint(raw: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
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
  return validateDirectorScene({
    projectId, activeShotId: project.activeShotId, name: projectName,
    fps: active.fps || project.settings?.fps, durationSeconds: active.durationSeconds || project.settings?.durationSeconds,
    aspectRatio: camera?.aspectRatio || "16:9", camera,
    objects: project.objects.map((o: any) => ({ id: o.id, name: o.name || o.id, type: o.type, position: o.position, rotation: o.rotation || [0, 0, 0], scale: o.scale || [1, 1, 1], pose: o.pose })),
    cameraKeyframes: (project.keyframes || []).map((k: any) => ({ frame: k.frame, position: k.position, rotation: k.rotation, focalLength: k.focalLength })),
    lighting: project.lighting || {}, shotNames: project.shots.map((s: any) => s.name),
  });
}
export async function captureDirectorScene(iframe: HTMLIFrameElement | null, projectId: string, ownerId: string, projectName: string): Promise<DirectorSnapshot> {
  const doc = checkedDirectorDocument(iframe, projectId, ownerId);
  saveNative(doc);
  const raw = localStorage.getItem(`monoform-project-${projectId}`);
  if (!raw || raw.length > 8_000_000) throw new Error("场景尚未保存或体积过大，请先保存工程");
  const project = JSON.parse(raw);
  return { raw, project, scene: sceneFromNative(project, projectId, projectName), fingerprint: await sceneFingerprint(raw) };
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
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 60));
    if (!iframe?.isConnected) throw new Error("工程已切换，请回到原工程检查镜头");
    saveNative(checkedDirectorDocument(iframe, projectId, ownerId));
    const raw = localStorage.getItem(`monoform-project-${projectId}`);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.activeShotId === project.activeShotId && saved.shots?.length === project.shots.length && JSON.stringify(saved.keyframes) === JSON.stringify(project.keyframes)) return raw;
    }
  }
  throw new Error("导演台没有确认应用结果，可用“撤销本次添加”恢复原工程");
}
