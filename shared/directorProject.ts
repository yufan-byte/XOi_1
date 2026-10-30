/** Portable white-box projects; never treat an arbitrary legacy object as a native scene. */
export interface DirectorLink {
  schemaVersion: 1;
  sceneId: string;
  shotId: string;
  revision: number;
  sceneName: string;
  shotName: string;
  fps: number;
  durationSeconds: number;
  aspectRatio: string;
  frame: number;
}
export interface DirectorReferenceProject {
  schemaVersion: 1;
  link: DirectorLink;
  snapshot: Record<string, any>;
}
const finiteVec = (v: any) =>
  Array.isArray(v) &&
  v.length === 3 &&
  v.every(
    (n: any) =>
      typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 10000,
  );
export function assertNativeDirectorProject(
  project: any,
): asserts project is Record<string, any> {
  if (
    !project ||
    typeof project !== "object" ||
    !Array.isArray(project.shots) ||
    !project.shots.length ||
    project.shots.length > 30 ||
    !project.shots.some((s: any) => s?.id === project.activeShotId)
  )
    throw new Error("导演工程缺少有效镜头");
  const seen = new Set<string>();
  const checkObjects = (objects: any) => {
    if (!Array.isArray(objects) || objects.length > 120)
      throw new Error("场景物体数量无效");
    const ids = new Set();
    for (const o of objects) {
      if (
        !o ||
        typeof o.id !== "string" ||
        !o.id ||
        o.id.length > 160 ||
        ids.has(o.id) ||
        !finiteVec(o.position) ||
        !finiteVec(o.rotation) ||
        !finiteVec(o.scale)
      )
        throw new Error("场景物体数据无效");
      ids.add(o.id);
    }
  };
  const checkCamera = (camera: any) => {
    if (
      !camera ||
      !finiteVec(camera.position) ||
      !finiteVec(camera.rotation) ||
      !Number.isFinite(camera.focalLength) ||
      camera.focalLength < 1 ||
      camera.focalLength > 1000
    )
      throw new Error("摄影机数据无效");
    if(camera.motionMode!==undefined&&!["manual","follow","route"].includes(camera.motionMode))throw new Error("摄影机运动方式无效");
    if(camera.follow!=null){
      const follow=camera.follow;
      if(typeof follow!=="object"||typeof follow.targetId!=="string"||follow.targetId.length>160||follow.enabled!==undefined&&typeof follow.enabled!=="boolean")throw new Error("相机跟随设置无效");
      for(const key of ["distance","height","lookHeight","focalLength","orbitDegrees","sideOffset"])if(follow[key]!==undefined&&(!Number.isFinite(follow[key])||Math.abs(follow[key])>1000))throw new Error("相机跟随参数无效");
      if(follow.offset!==undefined&&!finiteVec(follow.offset))throw new Error("相机跟随偏移无效");
    }
    if(camera.route!=null){
      const route=camera.route;
      if(route.version!==1||typeof route.id!=="string"||!/^[\w-]{1,160}$/.test(route.id)||typeof route.enabled!=="boolean"||!Array.isArray(route.points)||route.points.length<2||route.points.length>128||!route.points.every(finiteVec)||!Number.isInteger(route.startFrame)||!Number.isInteger(route.endFrame)||route.startFrame<0||route.endFrame<=route.startFrame||route.endFrame>18000||!finiteVec(route.rotation)||!["fixed","tangent","target"].includes(route.orientation)||typeof route.targetId!=="string"||route.targetId.length>160)throw new Error("独立相机路线无效");
    }
  };
  const checkKeys = (keys: any) => {
    if (!Array.isArray(keys) || keys.length > 4000)
      throw new Error("关键帧数量无效");
    let previous = -1;
    for (const k of keys) {
      if (
        !Number.isInteger(k.frame) ||
        k.frame < 0 ||
        k.frame <= previous ||
        !finiteVec(k.position)
      )
        throw new Error("关键帧数据无效");
      previous = k.frame;
    }
  };
  const checkRoutes=(routes:any)=>{
    if(routes===undefined)return;
    if(!routes||typeof routes!=="object"||Array.isArray(routes)||Object.keys(routes).length>120)throw new Error("人物路线无效");
    for(const [id,route] of Object.entries(routes) as [string,any][]){
      if(id.length>160||!route||!Array.isArray(route.points)||route.points.length<2||route.points.length>4000||!route.points.every(finiteVec)||!Number.isInteger(route.startFrame)||!Number.isInteger(route.endFrame)||route.startFrame<0||route.endFrame<=route.startFrame||route.endFrame>18000)throw new Error("人物路线节点或时间无效");
    }
  };
  for (const shot of project.shots) {
    if (
      !shot ||
      typeof shot.id !== "string" ||
      !shot.id ||
      shot.id.length > 160 ||
      seen.has(shot.id) ||
      ![24, 25, 30, 60].includes(shot.fps) ||
      !Number.isFinite(shot.durationSeconds) ||
      shot.durationSeconds < 1 ||
      shot.durationSeconds > 600
    )
      throw new Error("镜头时长或帧率无效");
    seen.add(shot.id);
    checkObjects(shot.objects);
    checkCamera(shot.camera);
    checkRoutes(shot.routeTracks);
    if(shot.camera.route?.endFrame>shot.fps*shot.durationSeconds)throw new Error("相机路线超出镜头时长");
    checkKeys(shot.keyframes || []);
    for (const keys of Object.values(shot.objectKeyframes || {}))
      checkKeys(keys);
  }
  checkObjects(project.objects);
  checkCamera(project.camera);
  checkRoutes(project.routeTracks);
  checkKeys(project.keyframes || []);
  for (const keys of Object.values(project.objectKeyframes || {}))
    checkKeys(keys);
}
export function ownedDirectorSceneId(id: string, userId: string | number) {
  return (
    /^director3d-u\d+-[a-zA-Z0-9_-]{1,120}$/.test(id) &&
    id.startsWith(`director3d-u${userId}-`)
  );
}
export function assertDirectorReference(
  value: any,
  userId: string | number,
): asserts value is DirectorReferenceProject {
  if (
    value?.schemaVersion !== 1 ||
    value.link?.schemaVersion !== 1 ||
    !ownedDirectorSceneId(value.link.sceneId, userId) ||
    !Number.isSafeInteger(value.link.revision) ||
    value.link.revision < 1
  )
    throw new Error("镜头参考不属于当前账号或版本无效");
  assertNativeDirectorProject(value.snapshot);
  if (value.snapshot.activeShotId !== value.link.shotId)
    throw new Error("参考镜头与工程不一致");
  const shot = value.snapshot.shots.find(
    (s: any) => s.id === value.link.shotId,
  );
  if (
    shot.fps !== value.link.fps ||
    shot.durationSeconds !== value.link.durationSeconds ||
    value.snapshot.camera.aspectRatio !== value.link.aspectRatio ||
    !Number.isInteger(value.link.frame) ||
    value.link.frame < 0 ||
    value.link.frame > Math.ceil(shot.fps * shot.durationSeconds)
  )
    throw new Error("参考时间与镜头不一致");
}
