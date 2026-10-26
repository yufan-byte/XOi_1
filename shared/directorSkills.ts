export type Vec3 = [number, number, number];
export interface DirectorSkill {
  id: string; name: string; description: string; category: string; canApplyCamera: boolean;
  available?: boolean;
}
export const DIRECTOR_SKILLS: DirectorSkill[] = [
  { id: "seedance-shot-design", name: "电影镜头设计", category: "镜头", description: "把创意转成景别、构图、焦距、光影与运镜方案", canApplyCamera: true },
  { id: "seedance-shotlist-director", name: "导演分镜表", category: "分镜", description: "把故事拆成分镜，检查演员站位、视线与镜头连续性", canApplyCamera: true },
  { id: "emotion-director", name: "情绪与场面调度", category: "表演", description: "把情绪转成可拍摄的动作、节奏与机位安排", canApplyCamera: true },
  { id: "emotion-expression-director", name: "微表情指导", category: "表演", description: "细化眼神、呼吸、眉嘴动作，输出表演提示词", canApplyCamera: false },
  { id: "seedance-previz-to-render", name: "白模预演精修", category: "精修", description: "保留已有调度和机位，补充材质、灯光与成片提示词", canApplyCamera: false },
  { id: "fpv", name: "FPV 穿越运镜", category: "运镜", description: "设计空间穿越、速度变化与有纵深的连续镜头", canApplyCamera: true },
  { id: "seedance-seamless-stitch", name: "镜头衔接与转场", category: "衔接", description: "规划镜头出入点、动作接续与转场提示词", canApplyCamera: false },
];
export interface DirectorScene {
  projectId: string; activeShotId: string; name: string; fps: number; durationSeconds: number; aspectRatio: string;
  camera: { position: Vec3; rotation: Vec3; focalLength: number };
  objects: Array<{ id: string; name: string; type: string; position: Vec3; rotation: Vec3; scale: Vec3; pose?: string; bodyType?:string; rigRoot?:Vec3; visible?:boolean; locked?:boolean }>;
  cameraKeyframes: Array<{ frame: number; position: Vec3; rotation: Vec3; focalLength: number }>;
  lighting: Record<string, number | string>;
  shotNames: string[];
  objectPaths?:Record<string,Array<{t:number;position:Vec3;pose?:string;rigRoot?:Vec3;interpolation?:string}>>;
}
export interface DirectorCameraPoint { t: number; position: Vec3; target: Vec3; focalLength: number }
export interface DirectorShot {
  name: string; purpose: string; framing: string; movement: string; blocking: string; performance: string;
  lighting: string; transition: string; prompt: string;
  durationSeconds?: number; subjectId?:string;
  camera?: { keyframes: DirectorCameraPoint[] };
}
export interface DirectorPlan {
  summary: string; assumptions: string[]; warnings: string[]; renderPrompt: string; shots: DirectorShot[];
}
export class DirectorInputError extends Error {}
export function directorVec3(value: unknown, label: string, limit = 10000): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || value.some(v => typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > limit)) {
    throw new DirectorInputError(`${label} 必须是有效的三维坐标`);
  }
  return [...value] as Vec3;
}
function text(value: unknown, label: string, max: number, optional = false): string {
  if (optional && value == null) return "";
  if (typeof value !== "string" || (!optional && !value.trim()) || value.length > max) throw new DirectorInputError(`${label}格式或长度无效`);
  return value.trim();
}
function focal(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 18 || value > 120) throw new DirectorInputError("焦距必须在 18–120mm 内");
  return value;
}
export function validateDirectorScene(input: unknown): DirectorScene {
  const s = input as DirectorScene;
  if (!s || ![24, 25, 30].includes(s.fps) || !Number.isInteger(s.durationSeconds) || s.durationSeconds < 1 || s.durationSeconds > 60) throw new DirectorInputError("场景帧率或时长无效");
  if (!Array.isArray(s.objects) || s.objects.length > 120 || !Array.isArray(s.cameraKeyframes) || s.cameraKeyframes.length > 200) throw new DirectorInputError("场景对象或关键帧过多");
  const result: DirectorScene = {
    projectId: text(s.projectId, "场景 ID", 160), activeShotId: text(s.activeShotId, "镜头 ID", 160), name: text(s.name, "场景名", 100),
    fps: s.fps, durationSeconds: s.durationSeconds, aspectRatio: text(s.aspectRatio, "画幅", 60),
    camera: { position: directorVec3(s.camera?.position, "相机位置"), rotation: directorVec3(s.camera?.rotation, "相机旋转", 100), focalLength: focal(s.camera?.focalLength) },
    objects: s.objects.map(o => ({ id: text(o.id, "物体 ID", 160), name: text(o.name, "物体名", 150), type: text(o.type, "物体类型", 40),
      position: directorVec3(o.position, "物体位置"), rotation: directorVec3(o.rotation, "物体旋转", 100), scale: directorVec3(o.scale, "物体缩放", 1000), pose: text(o.pose, "姿态", 100, true), bodyType:text(o.bodyType,"体型",30,true), rigRoot:o.rigRoot===undefined?undefined:directorVec3(o.rigRoot,"骨骼偏移",100), visible:o.visible!==false, locked:o.locked===true })),
    cameraKeyframes: s.cameraKeyframes.map(k => {
      if (!Number.isInteger(k.frame) || k.frame < 0 || k.frame > s.fps * s.durationSeconds) throw new DirectorInputError("相机关键帧时间无效");
      return { frame: k.frame, position: directorVec3(k.position, "关键帧位置"), rotation: directorVec3(k.rotation, "关键帧旋转", 100), focalLength: focal(k.focalLength) };
    }),
    lighting: {}, shotNames: Array.isArray(s.shotNames) ? s.shotNames.slice(0, 30).map(n => text(n, "镜头名称", 100)) : [],
  };
  if (new Set(result.objects.map(o => o.id)).size !== result.objects.length) throw new DirectorInputError("物体 ID 重复");
  if(s.objectPaths!==undefined){
    if(!s.objectPaths||typeof s.objectPaths!=='object'||Array.isArray(s.objectPaths)||Object.keys(s.objectPaths).length>120)throw new DirectorInputError("人物路线格式无效");
    result.objectPaths=Object.create(null);
    for(const [id,path] of Object.entries(s.objectPaths)){
      if(!result.objects.some(o=>o.id===id)||!Array.isArray(path)||!path.length||path.length>16)throw new DirectorInputError("人物路线对象或数量无效");
      let last=-1;result.objectPaths![id]=path.map(p=>{if(!Number.isFinite(p.t)||p.t<0||p.t>1||p.t<=last)throw new DirectorInputError("人物路线时间无效");last=p.t;return {t:p.t,position:directorVec3(p.position,"路线位置"),pose:text(p.pose,"路线姿态",100,true),rigRoot:p.rigRoot===undefined?undefined:directorVec3(p.rigRoot,"路线骨骼偏移",100),interpolation:['hold','linear','smooth'].includes(p.interpolation||'')?p.interpolation:'smooth'};});
    }
  }
  for (const [key, value] of Object.entries(s.lighting || {}).slice(0, 20)) {
    if (/^[a-zA-Z]{1,40}$/.test(key) && ((typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1000) || (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)))) result.lighting[key] = value;
  }
  return result;
}
export function assertDirectorOwner(projectId: string, userId: number): void {
  if (!Number.isSafeInteger(userId) || userId <= 0 || !projectId.startsWith(`director3d-u${userId}-`) || !/^[a-zA-Z0-9-]+$/.test(projectId)) throw new DirectorInputError("场景不属于当前账号");
}
export function validateDirectorPlan(input: unknown, skill: DirectorSkill, maxShots = 6): DirectorPlan {
  const p = input as DirectorPlan;
  const list = (v: unknown, label: string): string[] => {
    if (!Array.isArray(v) || v.length > 12) throw new DirectorInputError(`${label}格式无效`);
    return v.map(t => text(t, label, 1000));
  };
  if (!p || !Array.isArray(p.shots) || !p.shots.length || p.shots.length > maxShots) throw new DirectorInputError("镜头方案数量无效");
  return {
    summary: text(p.summary, "方案摘要", 3000), assumptions: list(p.assumptions, "假设"), warnings: list(p.warnings, "限制"), renderPrompt: text(p.renderPrompt, "成片提示词", 10000),
    shots: p.shots.map(s => {
      const shot: DirectorShot = {
        name: text(s.name, "镜头名称", 30), purpose: text(s.purpose, "镜头目的", 1000), framing: text(s.framing, "构图", 1000),
        movement: text(s.movement, "运镜", 1000), blocking: text(s.blocking, "调度", 2000), performance: text(s.performance, "表演", 2000),
        lighting: text(s.lighting, "光影", 1000), transition: text(s.transition, "衔接", 1000), prompt: text(s.prompt, "镜头提示词", 5000),
      };
      if(s.durationSeconds!==undefined){if(!Number.isInteger(s.durationSeconds)||s.durationSeconds<1||s.durationSeconds>60)throw new DirectorInputError("镜头时长须为 1–60 秒");shot.durationSeconds=s.durationSeconds;}
      if(s.subjectId!==undefined)shot.subjectId=text(s.subjectId,"主体",160);
      if (s.camera !== undefined) {
        if (!skill.canApplyCamera) throw new DirectorInputError("这个技能须保留原机位，只能输出制作建议");
        const points = s.camera?.keyframes;
        if (!Array.isArray(points) || points.length < 2 || points.length > 8 || points[0]?.t !== 0 || points[points.length - 1]?.t !== 1) throw new DirectorInputError("运镜路径须包含起点、终点，最多 8 个关键点");
        let last = -1;
        shot.camera = { keyframes: points.map(k => {
          if (typeof k.t !== "number" || !Number.isFinite(k.t) || k.t < 0 || k.t > 1 || k.t <= last) throw new DirectorInputError("运镜时间顺序无效");
          last = k.t;
          const position = directorVec3(k.position, "机位"), target = directorVec3(k.target, "视线目标");
          if (Math.hypot(...position.map((v, i) => target[i] - v)) < .01) throw new DirectorInputError("机位与视线目标不能重合");
          return { t: k.t, position, target, focalLength: focal(k.focalLength) };
        }) };
      }
      return shot;
    }),
  };
}
