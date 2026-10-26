"use client";
/* eslint-disable react-hooks/immutability -- R3F：useFrame 内逐帧修改 three 对象/uniform 是预期用法 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ORBIT_MODELS, flightAmount, smooth, type Box, type OrbitBus } from "./orbit-data";
import { REEL_MEDIA } from "./showreel";

/* 登录页三维模型地球（three.js / R3F）：曲面网格星空背景 + 菲涅尔亮边球体 + 陆地点阵 + 航线光迹 + 外圈光轨 + 立体模型图标 */

const FOV = 28, CAM_Z = 4, TAN = Math.tan((FOV / 2) * Math.PI / 180), TAU = Math.PI * 2;
const PITCH_LIMIT = 0.7; // 俯仰拖拽钳制（弧度），防止把地球翻得底朝天
const clampf = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const PAL = { bgA: "#050506", bgB: "#111214", grid: "#5f6770", cool: "#b9f0ec", silver: "#f4fcff", warm: "#c4d6eb", ink: "#f1f4f2" };
const FONT = '"Lexend", "PingFang SC", "Microsoft YaHei", sans-serif';
const N_NODES = 40;

const QUIET = `uniform vec2 uRes; uniform vec4 uQuiet; uniform float uAlpha;
float quiet(){ vec2 uv = gl_FragCoord.xy / uRes; return uAlpha * smoothstep(.9, 1.6, length((uv - uQuiet.xy) / max(uQuiet.zw, vec2(.001)))); }`;

const BG_FS = `precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec4 uHalo; uniform vec3 uBgA, uBgB, uGrid, uCool, uWarm, uSilver;
float hash(vec2 q){ return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453123); }
float skyLayer(vec2 p, float density, float seed, float threshold, float size){
  vec2 cell = floor(p * density); vec2 off = vec2(hash(cell + seed), hash(cell + seed + 31.7));
  vec2 delta = (fract(p * density) - .12 - off * .76) / density;
  float selected = step(threshold, hash(cell + seed + 7.1));
  float d = length(delta) * uRes.y; float core = exp(-d * d / (size * (.35 + off.x * .65)));
  float tw = .9 + .1 * sin(uTime * .6 + off.y * 6.2831853);
  return core * selected * (.14 + pow(off.y, 3.) * .6) * tw;
}
float gridLine(vec2 g){ vec2 w = fwidth(g); vec2 gf = abs(fract(g) - .5); vec2 l = smoothstep(.5 - 1.6 * w, .5 - .4 * w, gf); return max(l.x, l.y); }
void main(){
  vec2 sp = gl_FragCoord.xy / uRes; float aspect = uRes.x / uRes.y;
  vec3 col = mix(uBgA, uBgB, smoothstep(0., 1., (1. - sp.y) * .55 + sp.x * .45));
  vec2 p = (sp - vec2(.5, .51)) * vec2(aspect, 1.);
  vec2 q = p / (1. + .42 * dot(p, p));
  vec2 gp = q / .07;
  float fine = gridLine(gp), major = gridLine(gp / 4.);
  vec2 w4 = fwidth(gp / 4.); vec2 ci = fract(gp / 4. + .5) - .5;
  float crossm = max(step(abs(ci.x), w4.x * .6) * step(abs(ci.y), .08), step(abs(ci.y), w4.y * .6) * step(abs(ci.x), .08));
  float lineMask = clamp(fine * .55 + major * .9 + crossm * 1.4, 0., 1.);
  col += uGrid * lineMask * .09 * (.6 + .8 * length(sp - .5));
  vec2 hq = (sp - uHalo.xy) * vec2(aspect, 1.); float hr = length(hq) / max(uHalo.z, .001);
  float outside = smoothstep(.82, 1.15, hr);
  float far = skyLayer(p, 32., 43., .86, .5) * .5, distant = skyLayer(p, 16., 3., .78, 1.) * .9, near = skyLayer(p, 6., 19., .75, 2.);
  vec3 starColor = mix(uCool, uWarm, smoothstep(-.65, .7, p.x - p.y * .6));
  col += (uSilver * far + starColor * distant + uSilver * near) * mix(.04, 1., outside) * 1.4;
  float rim = exp(-abs(hr - 1.) * 58.) * .22 + exp(-abs(hr - 1.) * 14.) * .04;
  float facing = dot(normalize(hq + .00001), normalize(vec2(-.8 + .28 * sin(uTime * .15), 1.)));
  col += mix(uWarm, uCool, smoothstep(-.65, .55, facing)) * rim * (.35 + .65 * smoothstep(-.9, .65, facing)) * uHalo.w;
  float glint = pow(max(0., facing), 60.) + .45 * pow(max(0., -facing), 90.);
  col += uSilver * exp(-abs(hr - 1.) * 90.) * glint * .45 * uHalo.w;
  col *= 1. - .3 * smoothstep(.5, 1.15, length((sp - .5) * vec2(aspect * .78, 1.)));
  gl_FragColor = vec4(col, 1.);
}`;

const TRACK_VS = `uniform float uTime, uPxWorld; varying float vPhase, vTrack, vS; varying vec3 vView;
vec3 orbitP(float ph, float tr){ float a = ph * 6.2831853; float ang = tr < .5 ? -.27 : .54; float rad = tr < .5 ? 1.52 : 1.68;
  vec3 p = vec3(cos(a), sin(a) * .36, sin(a) * .93); p.y += sin(a * 2. + tr * 2. + uTime * .15) * .035;
  p.xy = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * p.xy; return p * rad; }
vec3 cv(float ph, float tr){ return (modelViewMatrix * vec4(orbitP(ph, tr), 1.)).xyz; }
void main(){ vPhase = position.x; vTrack = position.y; vS = position.z;
  vec3 c = cv(vPhase, vTrack); vec3 t = normalize(cv(vPhase + .0005, vTrack) - cv(vPhase - .0005, vTrack));
  vec3 side = normalize(cross(t, normalize(-c)));
  float scale = length(modelViewMatrix[0].xyz);
  float taper = .28 + .72 * pow(.5 + .5 * sin(vPhase * 6.2831853 + vTrack * 2.), 2.);
  float width = max(.008 * taper * scale, .7 * uPxWorld * -c.z);
  vec3 v = c + side * width * position.z; vView = v; gl_Position = projectionMatrix * vec4(v, 1.); }`;
const TRACK_FS = `uniform float uTime; uniform vec3 uCool, uWarm, uSilver; uniform vec4 uSphere; ${QUIET}
varying float vPhase, vTrack, vS; varying vec3 vView;
void main(){ vec3 ray = normalize(vView); float b = dot(ray, uSphere.xyz);
  float disc = b * b - dot(uSphere.xyz, uSphere.xyz) + uSphere.w * uSphere.w; float nearS = b - sqrt(max(0., disc));
  float behind = smoothstep(nearS + .005, nearS + .055, length(vView)) * smoothstep(0., .008, disc);
  float a = (vPhase - uTime * .02 - vTrack * .42) * 6.2831853; float light = pow(.5 + .5 * cos(a), 9.);
  vec3 tint = mix(uCool, uWarm, vTrack);
  float edge = 1. - smoothstep(.25, 1., abs(vS));
  gl_FragColor = vec4(mix(tint, uSilver, .35 + .55 * light), (.13 + .8 * light) * (1. - behind * .985) * (.5 + .5 * edge) * quiet()); }`;

const clearance = (a: Box, r: Box | null, pad: number) => {
  if (!r || r.r - r.l < 2) return 1;
  const gap = Math.max(r.l - a.r, a.l - r.r, r.t - a.b, a.t - r.b);
  return smooth(0, pad, gap);
};
const overlaps = (a: Box, b: Box, pad: number) => a.l < b.r + pad && b.l < a.r + pad && a.t < b.b + pad && b.t < a.b + pad;

/** 立体玻璃质感的图标砖：暗色圆角底 + 顶部高光 + 发光图标；返回纹理与图标主色（供光晕着色） */
function tileTexture(src: string, onChange: () => void) {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128; const ctx = cv.getContext("2d")!;
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; const tint = new THREE.Color(0.72, 0.86, 0.94);
  const draw = (img: HTMLImageElement | null) => {
    ctx.clearRect(0, 0, 128, 128);
    const g = ctx.createLinearGradient(0, 4, 0, 124); g.addColorStop(0, "rgba(58,62,68,0.78)"); g.addColorStop(0.5, "rgba(24,26,29,0.74)"); g.addColorStop(1, "rgba(12,13,15,0.8)");
    ctx.beginPath(); ctx.roundRect(4, 4, 120, 120, 22); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "rgba(150,160,172,0.5)"; ctx.stroke();
    const hl = ctx.createLinearGradient(0, 5, 0, 40); hl.addColorStop(0, "rgba(255,255,255,0.22)"); hl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath(); ctx.roundRect(6, 6, 116, 116, 20); ctx.lineWidth = 1.5; ctx.strokeStyle = hl; ctx.stroke();
    if (img) {
      const sm = document.createElement("canvas"); sm.width = sm.height = 24; const sc = sm.getContext("2d", { willReadFrequently: true })!; sc.drawImage(img, 0, 0, 24, 24);
      const px = sc.getImageData(0, 0, 24, 24).data; let lum = 0, cnt = 0, wr = 0, wg = 0, wb = 0, ws = 0;
      for (let i = 0; i < px.length; i += 4) { if (px[i + 3] <= 100) continue; const r = px[i], gg = px[i + 1], b = px[i + 2]; const sat = (Math.max(r, gg, b) - Math.min(r, gg, b)) / 255; cnt++; lum += (r + gg + b) / 3; wr += r * sat; wg += gg * sat; wb += b * sat; ws += sat; }
      if (ws > 0.06 * cnt) tint.setRGB(wr / ws / 255, wg / ws / 255, wb / ws / 255, THREE.LinearSRGBColorSpace).lerp(new THREE.Color(0.9, 0.95, 1), 0.15);
      const dark = cnt > 0 && lum / cnt < 65;
      ctx.save(); ctx.filter = `${dark ? "invert(1) " : ""}saturate(1.3) contrast(1.1)`;
      ctx.shadowColor = "rgba(200,230,245,0.9)"; ctx.shadowBlur = 10; ctx.globalAlpha = 0.3; ctx.drawImage(img, 25, 25, 78, 78);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.drawImage(img, 25, 25, 78, 78); ctx.restore();
    }
    tex.needsUpdate = true; onChange();
  };
  draw(null); const img = new Image(); img.onload = () => draw(img); img.src = src;
  return { tex, tint };
}
function labelTexture(text: string, onChange: () => void) {
  const cv = document.createElement("canvas"); cv.height = 64; const tex = new THREE.CanvasTexture(cv); const out = { tex, ratio: 1 };
  const draw = () => {
    let ctx = cv.getContext("2d")!; ctx.font = `400 34px ${FONT}`; cv.width = Math.ceil(ctx.measureText(text).width) + 20;
    ctx = cv.getContext("2d")!; ctx.font = `400 34px ${FONT}`; ctx.fillStyle = PAL.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, cv.width / 2, 33);
    out.ratio = cv.width / 64; tex.needsUpdate = true; onChange();
  };
  draw(); document.fonts?.ready.then(draw).catch(() => {});
  return out;
}
function glowTexture() {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128; const ctx = cv.getContext("2d")!; const img = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const px = (x - 63.5) / 64, py = (y - 63.5) / 64, r2 = px * px + py * py;
    const halo = Math.exp(-r2 * 11) * 0.105 + Math.exp(-r2 * 26) * 0.19; const rays = Math.exp(-Math.abs(px) * 26 - Math.abs(py) * 4.5) * 0.07 + Math.exp(-Math.abs(py) * 33 - Math.abs(px) * 5) * 0.05;
    const edge = 1 - smooth(0.8, 1, Math.max(Math.abs(px), Math.abs(py))); const a = Math.min(1, (halo + rays) * edge * 3.2); const i = (y * 128 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0); return new THREE.CanvasTexture(cv);
}

/** 程序化「大陆」遮罩（3D value noise fbm），避免引用外部地图资源 */
function makeLand() {
  const h = (x: number, y: number, z: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x: number, y: number, z: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z); let fx = x - ix, fy = y - iy, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const l = (a: number, b: number, t: number) => a + (b - a) * t;
    return l(l(l(h(ix, iy, iz), h(ix + 1, iy, iz), fx), l(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), fx), fy), l(l(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), fx), l(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), fx), fy), fz);
  };
  return (x: number, y: number, z: number) => { let a = 0, amp = 0.5, f = 1.6; for (let o = 0; o < 4; o++) { a += amp * noise(x * f + 11.3, y * f + 5.1, z * f + 2.7); f *= 2.03; amp *= 0.5; } return a; };
}

type Node = { model: number; home: THREE.Vector3; tile: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; label: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null; labelTex: { ratio: number } | null; x: number; y: number; z: number; depth: number; size: number; age: number };

/* ---------- 作品展映（3D 模式）：媒体贴在弧面卡片上环绕滑动（参考站 orbit-media 同款思路） ---------- */
const CARD_W = 16, CARD_H = 9;
const CARD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
/** 圆角遮罩 + 轻锐化 + 对比度/饱和度恢复 + 极轻暗角 + 侧卡压暗 + 亮边描线，一个 pass 完成。
 *  视频源码率有限，直接采样会显得发灰发糊：这里做轻度 unsharp 锐化 + 对比度/饱和度提升把画质「提」回来。 */
const CARD_FS = `varying vec2 vUv; uniform sampler2D tMap; uniform float uAlpha, uDim; uniform vec2 uTexel;
void main(){
  vec2 q = vUv - .5;
  float d = length(max(abs(q) - .45, 0.)) - .05;
  float m = 1. - smoothstep(-.0025, .0025, d);
  vec3 col = texture2D(tMap, vUv).rgb;
  vec3 nei = texture2D(tMap, vUv + vec2(uTexel.x, 0.)).rgb + texture2D(tMap, vUv - vec2(uTexel.x, 0.)).rgb
           + texture2D(tMap, vUv + vec2(0., uTexel.y)).rgb + texture2D(tMap, vUv - vec2(0., uTexel.y)).rgb;
  col += (col * 4. - nei) * 0.25;                       // unsharp 锐化（轻度，避免光晕）
  col = clamp((col - .5) * 1.09 + .5, 0., 1.);          // 对比度 +9%
  float lg = dot(col, vec3(.299, .587, .114));
  col = clamp(mix(vec3(lg), col, 1.12), 0., 1.);        // 饱和度 +12%（去灰蒙感）
  col *= 1. - .05 * dot(q, q);
  col += vec3(.58, .5, .95) * smoothstep(.014, .002, d) * .3;
  gl_FragColor = vec4(col * (1. - uDim), m * uAlpha);
}`;
/** 全屏媒体背景（参考站进展映时背后那层放大的作品画面）：无圆角，重暗角 + 重压暗（参考站背景近乎全黑） */
const BK_FS = `varying vec2 vUv; uniform sampler2D tMap; uniform float uAlpha, uDim;
void main(){
  vec2 q = vUv - .5;
  vec3 col = texture2D(tMap, vUv).rgb;
  col *= 1. - .6 * dot(q, q);
  gl_FragColor = vec4(col * (1. - uDim), uAlpha);
}`;

type WorkCard = { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; video: HTMLVideoElement | null; tex: THREE.Texture; cur: { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number; dim: number; a: number } };

function buildWorkCards() {
  const group = new THREE.Group(); group.visible = false;
  const geo = new THREE.PlaneGeometry(CARD_W, CARD_H, 48, 1);
  { // 弧面：左右边缘向后弯（曲面屏质感）；弯曲量按 x² 二次分布
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, -0.018 * x * x); }
  }
  const cards: WorkCard[] = REEL_MEDIA.map((m) => {
    let video: HTMLVideoElement | null = null; let tex: THREE.Texture;
    if (m.kind === "video") {
      video = document.createElement("video");
      video.muted = true; video.loop = true; video.playsInline = true; video.preload = "auto"; video.crossOrigin = "anonymous";
      tex = new THREE.VideoTexture(video); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    } else {
      tex = new THREE.TextureLoader().load(m.src);
    }
    const mat = new THREE.ShaderMaterial({ vertexShader: CARD_VS, fragmentShader: CARD_FS, uniforms: { tMap: { value: tex }, uAlpha: { value: 0 }, uDim: { value: 0 }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) } }, transparent: true, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat); mesh.visible = false; group.add(mesh);
    return { mesh, video, tex, cur: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 0, dim: 0, a: 0 } };
  });
  // 全屏背景层 ×2：A 显示当前作品，B 在切换瞬间接管旧画面做交叉淡出
  const bgeo = new THREE.PlaneGeometry(CARD_W, CARD_H);
  const mkBk = (ro: number) => {
    const mat = new THREE.ShaderMaterial({ vertexShader: CARD_VS, fragmentShader: BK_FS, uniforms: { tMap: { value: null }, uAlpha: { value: 0 }, uDim: { value: 0.84 } }, transparent: true, depthTest: false, depthWrite: false });
    const m = new THREE.Mesh(bgeo, mat); m.visible = false; m.renderOrder = ro; group.add(m); return m;
  };
  const bkA = mkBk(1), bkB = mkBk(2);
  let sourcesOn = false; // 视频源懒挂载：进展映舞台才下载（约 18MB），登录首屏零视频流量
  return {
    group, cards, bkA, bkB,
    ensureSources() {
      if (sourcesOn) return; sourcesOn = true;
      REEL_MEDIA.forEach((m, i) => { const v = cards[i]?.video; if (v && m.kind === "video") { v.src = m.src; v.load(); } });
    },
    dispose() {
      for (const c of cards) {
        if (c.video) { c.video.pause(); c.video.removeAttribute("src"); c.video.load(); }
        c.tex.dispose(); c.mesh.material.dispose();
      }
      bkA.material.dispose(); bkB.material.dispose(); geo.dispose(); bgeo.dispose();
    },
  };
}


function buildWorld(invalidate: () => void) {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const U = {
    uTime: { value: 0 }, uAlpha: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uQuiet: { value: new THREE.Vector4(0.5, 0.5, 0, 0) }, uHalo: { value: new THREE.Vector4(0.5, 0.5, 0.35, 1) },
    uPixelRatio: { value: 1 }, uSphere: { value: new THREE.Vector4() }, uPxWorld: { value: 0.001 },
    uCool: { value: hex(PAL.cool) }, uSilver: { value: hex(PAL.silver) }, uWarm: { value: hex(PAL.warm) }, uBgA: { value: hex(PAL.bgA) }, uBgB: { value: hex(PAL.bgB) }, uGrid: { value: hex(PAL.grid) },
  };
  const shader = (vertexShader: string, fragmentShader: string, extra: Partial<THREE.ShaderMaterialParameters> = {}) => keep(new THREE.ShaderMaterial({ uniforms: U, vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false, ...extra }));
  const scene = new THREE.Group();

  const bg = new THREE.Mesh(keep(new THREE.PlaneGeometry(2, 2)), shader("void main(){ gl_Position = vec4(position.xy, 0., 1.); }", BG_FS, { transparent: false }));
  bg.frustumCulled = false; bg.renderOrder = -10; scene.add(bg);

  const root = new THREE.Group(); scene.add(root);
  // 菲涅尔亮边球壳
  const shell = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 64, 40)), shader(
    "varying vec3 vNormal, vEye; void main(){ vec4 p = modelViewMatrix * vec4(position, 1.); vNormal = normalize(normalMatrix * normal); vEye = normalize(-p.xyz); gl_Position = projectionMatrix * p; }",
    `varying vec3 vNormal, vEye; uniform vec3 uCool, uSilver, uWarm; ${QUIET}
    void main(){ vec3 n = normalize(vNormal); float f = 1. - abs(dot(n, normalize(vEye))); float side = smoothstep(-.3, .9, n.x - n.y * .7);
      vec3 c = mix(mix(uCool, uWarm, side), uSilver, pow(f, 6.)); float sculpt = pow(max(0., dot(n, normalize(vec3(-.7, .8, .1)))), 5.);
      gl_FragColor = vec4(c, (.9 * pow(f, 12.) + .06 * pow(f, 3.) + sculpt * .025) * uAlpha); }`));
  shell.renderOrder = 1; root.add(shell);
  // 经纬线 + 倾斜环
  const lineMat = shader("varying float vDepth; void main(){ vDepth = normalize(normalMatrix * normalize(position)).z; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
    `varying float vDepth; uniform vec3 uCool, uSilver; ${QUIET} void main(){ gl_FragColor = vec4(mix(uCool, uSilver, .7), mix(.012, .1, smoothstep(-.1, .9, vDepth)) * quiet()); }`);
  const loop = (pts: THREE.Vector3[]) => { const l = new THREE.LineLoop(keep(new THREE.BufferGeometry().setFromPoints(pts)), lineMat); l.renderOrder = 2; return l; };
  for (let k = -2; k <= 2; k++) { const lat = (k * Math.PI) / 7; root.add(loop(Array.from({ length: 128 }, (_, i) => { const a = (i / 128) * TAU; return new THREE.Vector3(Math.cos(a) * Math.cos(lat), Math.sin(lat), Math.sin(a) * Math.cos(lat)); }))); }
  for (let k = 0; k < 6; k++) { const lon = (k / 6) * Math.PI; root.add(loop(Array.from({ length: 128 }, (_, i) => { const a = (i / 128) * TAU; return new THREE.Vector3(Math.cos(a) * Math.cos(lon), Math.sin(a), Math.cos(a) * Math.sin(lon)); }))); }
  const ring = loop(Array.from({ length: 256 }, (_, i) => { const a = (i / 256) * TAU; return new THREE.Vector3(1.29 * Math.cos(a), 0.32 * Math.sin(a), 0.86 * Math.sin(a)); })); ring.rotation.z = -0.2; root.add(ring);

  // 陆地点阵（Fibonacci 球面采样）
  const land = makeLand(); const pos: number[] = [], weight: number[] = []; const N = 22000, GA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) { const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), th = i * GA, x = Math.cos(th) * r, z = Math.sin(th) * r; const isLand = land(x, y, z) > 0.535; if (isLand || i % 19 === 0) { pos.push(x * 1.002, y * 1.002, z * 1.002); weight.push(isLand ? 1 : 0.13); } }
  const pg = keep(new THREE.BufferGeometry()); pg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); pg.setAttribute("weight", new THREE.Float32BufferAttribute(weight, 1));
  const points = new THREE.Points(pg, shader("attribute float weight; uniform float uPixelRatio; varying float vDepth, vWeight; void main(){ vDepth = normalize(normalMatrix * normalize(position)).z; vWeight = weight; gl_PointSize = 2.1 * uPixelRatio; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
    `varying float vDepth, vWeight; uniform vec3 uCool, uSilver; ${QUIET} void main(){ float m = 1. - smoothstep(.1, .5, length(gl_PointCoord - .5)); gl_FragColor = vec4(mix(uCool, uSilver, .64), mix(.01, .62, smoothstep(-.15, .85, vDepth)) * vWeight * m * quiet()); }`));
  points.renderOrder = 3; root.add(points);

  // 城市航线 + 流动光迹
  const cities = [[40, -74], [51, 0], [31, 121], [35, 139], [1, 104], [-23, -46], [-34, 151]].map(([la, lo]) => { const a = (la * Math.PI) / 180, o = (lo * Math.PI) / 180; return new THREE.Vector3(Math.cos(a) * Math.cos(o), Math.sin(a), Math.cos(a) * Math.sin(o)); });
  const rp: number[] = [], rprog: number[] = [], rid: number[] = [];
  [[0, 1], [1, 2], [2, 3], [2, 4], [0, 5], [4, 6]].forEach(([s, e], ri) => {
    const A = cities[s], B = cities[e], om = Math.acos(A.dot(B)), so = Math.sin(om);
    for (let i = 0; i < 72; i++) for (const t of [i / 72, (i + 1) / 72]) { const v = A.clone().multiplyScalar(Math.sin((1 - t) * om) / so).addScaledVector(B, Math.sin(t * om) / so).multiplyScalar(1.012 + 0.13 * Math.sin(Math.PI * t)); rp.push(v.x, v.y, v.z); rprog.push(t); rid.push(ri); }
  });
  const rg = keep(new THREE.BufferGeometry()); rg.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute("progress", new THREE.Float32BufferAttribute(rprog, 1)); rg.setAttribute("route", new THREE.Float32BufferAttribute(rid, 1));
  const routes = new THREE.LineSegments(rg, shader("attribute float progress, route; varying float vProgress, vRoute, vDepth; void main(){ vProgress = progress; vRoute = route; vDepth = normalize(normalMatrix * normalize(position)).z; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
    `varying float vProgress, vRoute, vDepth; uniform float uTime; uniform vec3 uCool, uSilver; ${QUIET}
    void main(){ float d = fract(vProgress - uTime * .18 + vRoute * .173); float trail = pow(1. - d, 18.); float fade = smoothstep(0., .07, vProgress) * (1. - smoothstep(.93, 1., vProgress));
      gl_FragColor = vec4(mix(uCool, uSilver, trail * .8), (.12 + trail * .85) * mix(.08, 1., smoothstep(-.2, .7, vDepth)) * fade * quiet()); }`));
  routes.renderOrder = 4; root.add(routes);

  // 外圈两条光轨（面向镜头的细带，经过球后被遮挡）
  const tp: number[] = [], ti: number[] = []; const SEG = 384;
  for (let tr = 0; tr < 2; tr++) { const base = tp.length / 3; for (let i = 0; i <= SEG; i++) { tp.push(i / SEG, tr, -1, i / SEG, tr, 1); if (i < SEG) { const a = base + i * 2; ti.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } } }
  const tg = keep(new THREE.BufferGeometry()); tg.setAttribute("position", new THREE.Float32BufferAttribute(tp, 3)); tg.setIndex(ti);
  const tracks = new THREE.Mesh(tg, shader(TRACK_VS, TRACK_FS, { side: THREE.DoubleSide })); tracks.frustumCulled = false; tracks.renderOrder = 6; root.add(tracks);

  // 模型图标：7 条纬圈共 83 个槽位，半径 1.14
  const slots: THREE.Vector3[] = [];
  [7, 11, 15, 17, 15, 11, 7].forEach((count, t) => { const lat = ((t - 3) * Math.PI) / 9; for (let a = 0; a < count; a++) { const lon = ((a + (t % 2) * 0.5) / count) * TAU; slots.push(new THREE.Vector3(Math.cos(lon) * Math.cos(lat) * 1.14, 1.14 * Math.sin(lat), Math.sin(lon) * Math.cos(lat) * 1.14)); } });
  const plane = keep(new THREE.PlaneGeometry(1, 1)); const glowTex = keep(glowTexture()); const tiles = new Map<string, ReturnType<typeof tileTexture>>();
  const nodes: Node[] = Array.from({ length: N_NODES }, (_, i) => {
    const model = i % ORBIT_MODELS.length; const m = ORBIT_MODELS[model];
    let t = tiles.get(m.icon); if (!t) { t = tileTexture(m.icon, invalidate); keep(t.tex); tiles.set(m.icon, t); }
    const basic = (map: THREE.Texture, extra: THREE.MeshBasicMaterialParameters = {}) => keep(new THREE.MeshBasicMaterial({ map, transparent: true, depthTest: false, depthWrite: false, opacity: 0, ...extra }));
    const tile = new THREE.Mesh(plane, basic(t.tex)); const glow = new THREE.Mesh(plane, basic(glowTex, { color: t.tint, blending: THREE.AdditiveBlending }));
    let label: Node["label"] = null, labelTex: Node["labelTex"] = null;
    if (i < ORBIT_MODELS.length) { const lt = labelTexture(m.name, invalidate); keep(lt.tex); labelTex = lt; label = new THREE.Mesh(plane, basic(lt.tex)); scene.add(label); }
    scene.add(glow, tile);
    return { model, home: slots[(37 * i) % slots.length], tile, glow, label, labelTex, x: 0, y: 0, z: 0, depth: 0, size: 0, age: 0 };
  });
  return { scene, root, U, nodes, dispose: () => disposables.forEach((d) => d.dispose()) };
}

function Scene({ bus, running, reduced }: { bus: React.RefObject<OrbitBus>; running: boolean; reduced: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const world = useMemo(() => buildWorld(invalidate), [invalidate]);
  const work = useMemo(() => buildWorkCards(), []);
  const worldRef = useRef(world);
  useEffect(() => { worldRef.current = world; return () => world.dispose(); }, [world]);
  useEffect(() => () => work.dispose(), [work]);
  useEffect(()=>{if(!running)for(const card of work.cards)card.video?.pause();},[running,work]);
  const time = useRef(0); const chosen = useRef([-1, -1]); const workAmt = useRef(0);
  const bkRef = useRef({ idx: -1, a: 0, b: 0 }); // 全屏背景：当前作品纹理 + 旧背景淡出
  const tmp = useRef({ v: new THREE.Vector3(), c: new THREE.Vector3() });

  useFrame((state, delta) => {
    const { size: { width: w, height: h }, camera, gl } = state; const b = bus.current; if (!b || w < 2 || h < 2) return;
    const fdt = Math.min(delta, 0.05);
    const d = b.drag;
    // 抓住地球时暂停自转时钟（画面稳在手里），松手后恢复
    if (running && !d.grabbing) time.current += fdt;
    const t = time.current; const { U, root, nodes } = worldRef.current; const { v: tv, c: tc } = tmp.current;
    gl.getDrawingBufferSize(U.uRes.value); U.uPixelRatio.value = gl.getPixelRatio(); U.uTime.value = t;
    U.uAlpha.value = reduced ? 1 : smooth(0, 1.4, t); U.uPxWorld.value = (2 * TAN) / h;

    // 展映舞台过渡量：0 = 地球舞台，1 = 作品展映（地球缩小退位、视频卡放大登场）；阻尼调快，跟手不拖沓
    const wTarget = b.work.active && !reduced ? 1 : 0;
    workAmt.current += (wTarget - workAmt.current) * Math.min(1, fdt * 11);
    const wa = workAmt.current;
    if (wa > 0.002) work.ensureSources();
    work.group.visible = wa > 0.004;

    // 拖拽：globe.tsx 把指针增量写进 d.px/d.py，这里消费并估计角速度（低通滤波防抖）
    if (d.px || d.py) {
      d.yaw += d.px; d.pitch = clampf(d.pitch + d.py, -PITCH_LIMIT, PITCH_LIMIT);
      if (fdt > 0) { d.vyaw = 0.7 * d.vyaw + 0.3 * (d.px / fdt); d.vpitch = 0.7 * d.vpitch + 0.3 * (d.py / fdt); }
      d.px = 0; d.py = 0;
    }
    // 松手惯性：角速度指数衰减（约 1s 剩 12%），几乎停下后清零
    if (!d.grabbing && (d.vyaw !== 0 || d.vpitch !== 0)) {
      d.yaw += d.vyaw * fdt; d.pitch = clampf(d.pitch + d.vpitch * fdt, -PITCH_LIMIT, PITCH_LIMIT);
      const dec = Math.pow(0.12, fdt); d.vyaw *= dec; d.vpitch *= dec;
      if (Math.abs(d.vyaw) < 0.02) d.vyaw = 0; if (Math.abs(d.vpitch) < 0.02) d.vpitch = 0;
    }
    // 悬停视差：鼠标位置轻推姿态（阻尼跟随，不抢戏）
    const hk = Math.min(1, fdt * 3); const hv = b.hover;
    hv.x += (hv.tx - hv.x) * hk; hv.y += (hv.ty - hv.y) * hk;

    const ppu0 = h / (2 * TAN * CAM_Z);
    // 竖屏（手机）：地球放大到近全宽、中心下移到 66%，给上方文案让位；横屏保持桌面构图
    const portrait = w < h * 0.95;
    const radiusPx = portrait ? Math.min(0.24 * h, 0.44 * w) : Math.min(0.367 * h, 0.235 * w);
    const scale = radiusPx / ppu0;
    const cyPx = portrait ? 0.66 * h : 0.49 * h; const worldY = -(cyPx - h / 2) / ppu0;
    // 展映过渡（参考站同款）：进入时地球**缩小**退位、卡片放大登场；返回时反向——地球放大回来
    root.position.set(0, worldY - wa * (h / ppu0) * 0.16, 0); root.scale.setScalar(scale * (1 - 0.62 * wa));
    root.rotation.set(0.07 + d.pitch + hv.y * 0.05, -0.55 + (t / 42) * TAU + d.yaw + hv.x * 0.08, -0.17); root.updateMatrixWorld(true);
    const sil = (Math.tan(Math.asin(Math.min(0.99, scale / Math.hypot(CAM_Z, worldY)))) / TAN) * (h / 2);
    U.uHalo.value.set(0.5, 1 - cyPx / h, sil / h, U.uAlpha.value * (1 - wa)); U.uSphere.value.set(0, worldY, -CAM_Z, scale);
    const q = b.quiet; if (q && q.r - q.l > 2) U.uQuiet.value.set((q.l + q.r) / 2 / w, 1 - (q.t + q.b) / 2 / h, ((q.r - q.l) / 2 / w) * 1.2, (q.b - q.t) / 2 / h);

    const ppu = (z: number) => h / (2 * TAN * (CAM_Z - z));
    const centerZ = tc.set(0, worldY, 0).project(camera).z;
    for (const n of nodes) {
      tv.copy(n.home).applyMatrix4(root.matrixWorld); n.depth = (tv.z / scale / 1.14 + 1) / 2;
      const zWorld = tv.z; tv.project(camera); n.x = ((tv.x + 1) * w) / 2; n.y = ((1 - tv.y) * h) / 2; n.z = tv.z;
      n.size = 0.125 * ppu(zWorld) * scale * (0.7 + 0.44 * n.depth);
    }
    // 聚光位：本轮 focus 模型从球面飞到左右卡片的图标槽（展映接管后跳过）
    const flights = [0, 1].map((side) => {
      const amt = reduced || wa > 0.02 ? 0 : flightAmount(b.age, side); const dock = b.docks[side];
      if (amt <= 0 || !dock || dock.r - dock.l < 4) { chosen.current[side] = -1; return null; }
      if (chosen.current[side] < 0 || nodes[chosen.current[side]].model !== b.focus[side]) {
        let best = -1, score = -Infinity;
        nodes.forEach((n, i) => { if (n.model !== b.focus[side]) return; const s = ((side === 0 ? -n.x : n.x) / w) * 1.5 + n.depth; if (s > score) { score = s; best = i; } });
        chosen.current[side] = best;
      }
      return chosen.current[side] < 0 ? null : { idx: chosen.current[side], amt, dock };
    });

    const fs = w > 1440 ? 12 : 10; const labelH = (64 * fs) / 34; const taken: Box[] = [];
    const order = nodes.map((_, i) => i).sort((a, c) => nodes[c].depth - nodes[a].depth);
    for (const i of order) {
      const n = nodes[i]; const f = flights.find((x) => x?.idx === i) ?? null;
      let { x, y, size } = n; let zN = n.z;
      let k = 0.05 + 0.92 * smooth(0.3, 0.92, n.depth);
      const ib: Box = { l: x - size / 2, r: x + size / 2, t: y - size / 2, b: y + size / 2 };
      k *= clearance(ib, b.quiet, 42) * clearance(ib, b.cards[0], 30) * clearance(ib, b.cards[1], 30) * smooth(0, 1.2, t + (reduced ? 2 : 0));
      let la = n.label ? k * smooth(0.6, 0.85, n.depth) : 0;
      if (f) {
        const { amt, dock } = f; const dx = (dock.l + dock.r) / 2, dy = (dock.t + dock.b) / 2;
        x += (dx - x) * amt; y += (dy - y) * amt - Math.sin(amt * Math.PI) * 34; zN += (centerZ - zN) * amt; size += (dock.r - dock.l - size) * amt;
        k += (0.99 - k) * smooth(0, 0.12, amt); la = n.label ? 0.9 * (1 - smooth(0.65, 0.96, amt)) : 0;
      }
      k *= 1 - wa; // 展映接管：图标随地球一起退场
      const lw = labelH * (n.labelTex?.ratio ?? 1); const lb: Box = { l: x - lw / 2, r: x + lw / 2, t: y + size / 2 + 5, b: y + size / 2 + 5 + labelH };
      if (la > 0 && !f) { la *= clearance(lb, b.quiet, 35) * clearance(lb, b.cards[0], 26) * clearance(lb, b.cards[1], 26); if (taken.some((o) => overlaps(o, lb, 8))) la = 0; }
      if (la > 0.15) taken.push(lb);
      n.age = reduced || f ? (la > 0.15 ? 1.15 : 0) : Math.max(0, Math.min(1.15, n.age + Math.min(delta, 0.05) * (la > 0.15 ? 1 : -2)));
      la *= smooth(0.15, 1.15, n.age);

      tv.set((x / w) * 2 - 1, 1 - (y / h) * 2, zN).unproject(camera); const p = ppu(tv.z);
      const ro = f ? 200 : 10 + Math.round(n.depth * 40) * 3;
      n.tile.position.copy(tv); n.tile.scale.setScalar(size / p); n.tile.material.opacity = k; n.tile.visible = k > 0.002; n.tile.renderOrder = ro + 1;
      n.glow.position.copy(tv); n.glow.scale.setScalar((size * 2.3) / p); n.glow.material.opacity = Math.pow(k, 1.45) * 0.6; n.glow.visible = k > 0.01; n.glow.renderOrder = ro;
      if (n.label) { n.label.position.set(tv.x, tv.y - (size / 2 + 5 + labelH / 2) / p, tv.z); n.label.scale.set(lw / p, labelH / p, 1); n.label.material.opacity = la * (1 - wa); n.label.visible = la > 0.002; n.label.renderOrder = ro + 2; }
    }

    /* ---------- 作品展映：视频弧面卡布局（阻尼跟随，切换时卡片沿弧线滑位） ---------- */
    const N = work.cards.length;
    if (N > 0 && work.group.visible) {
      const zF = 1.35, zS = 0.6;
      const ppuAt = (z: number) => h / (2 * TAN * (CAM_Z - z));
      const focusW = Math.min(0.46 * w, 0.86 * h); // 主卡像素宽（参考站比例：约 0.86 倍视口高）
      const baseS = focusW / ppuAt(zF) / CARD_W;
      const idx = ((b.work.index % N) + N) % N;
      for (let i = 0; i < N; i++) {
        const card = work.cards[i];
        let rel = (((i - idx) % N) + N) % N; if (rel > N / 2) rel -= N; // -2..2，最短环绕距离
        // 参考站布局：主卡居中偏下 + 仅右侧一张候场卡；换下的卡向左滑出并淡出（稳态时画面里只有两张）
        let px = w / 2, py = h * 0.52, rx = 0, ry = 0, rz = (i % 2 ? 1 : -1) * 0.012, sc = 1, dim = 0, z = zF, vis = 1;
        if (rel === 1) { px += focusW * 0.86; rx = 0.03; ry = -0.42; sc = 0.58; dim = 0.18; z = zS; }
        else if (rel === -1) { px -= focusW * 0.92; rx = 0.03; ry = 0.42; sc = 0.52; dim = 0.6; vis = 0; }
        else if (rel !== 0) { vis = 0; }
        if (rel === 0) { sc *= 1 + 0.012 * Math.sin(t * 0.55); py += Math.sin(t * 0.8 + i) * 3; } // 主卡 Ken-Burns 微缩放 + 轻微悬浮
        tv.set((px - w / 2) / ppuAt(z), (h / 2 - py) / ppuAt(z), z);
        const cur = card.cur; const kk = Math.min(1, fdt * 8); // 卡片滑位阻尼调快：切换跟手、不拖泥带水
        cur.x += (tv.x - cur.x) * kk; cur.y += (tv.y - cur.y) * kk; cur.z += (z - cur.z) * kk;
        cur.rx += (rx - cur.rx) * kk; cur.ry += (ry - cur.ry) * kk; cur.rz += (rz - cur.rz) * kk;
        cur.s += (sc - cur.s) * kk; cur.dim += (dim - cur.dim) * kk;
        cur.a += (wa * vis - cur.a) * Math.min(1, fdt * 9);
        const mesh = card.mesh;
        mesh.position.set(cur.x, cur.y, cur.z); mesh.rotation.set(cur.rx, cur.ry, cur.rz);
        mesh.scale.setScalar(baseS * cur.s);
        mesh.material.uniforms.uAlpha.value = cur.a; mesh.material.uniforms.uDim.value = cur.dim;
        if (card.video && card.video.videoWidth > 0) mesh.material.uniforms.uTexel.value.set(1 / card.video.videoWidth, 1 / card.video.videoHeight); // 锐化 texel 跟随真实视频分辨率
        mesh.visible = cur.a > 0.004;
        mesh.renderOrder = 100 - Math.round(cur.z * 10); // 远卡先画，近卡压在上面
      }
      // 播放控制：主卡与右侧候场卡播放（静音循环），其余暂停省解码
      for (let i = 0; i < N; i++) {
        const vid = work.cards[i].video; if (!vid || !vid.src) continue;
        let rel = (((i - idx) % N) + N) % N; if (rel > N / 2) rel -= N;
        const want = running && wa > 0.6 && (rel === 0 || rel === 1);
        if (want && vid.paused) vid.play().catch(() => {});
        else if (!want && !vid.paused) vid.pause();
      }
      /* 全屏媒体背景：当前作品放大铺满 + 压暗（参考站同款）；切换时旧背景交叉淡出 */
      const bk = bkRef.current;
      if (idx !== bk.idx) {
        if (bk.idx >= 0) { work.bkB.material.uniforms.tMap.value = work.cards[bk.idx].tex; bk.b = 1; }
        work.bkA.material.uniforms.tMap.value = work.cards[idx].tex;
        bk.idx = idx;
      }
      bk.a += (wa - bk.a) * Math.min(1, fdt * 12);
      if (bk.b > 0) { bk.b *= Math.pow(0.004, fdt); if (bk.b < 0.01) bk.b = 0; }
      const ppuB = h / (2 * TAN * CAM_Z);
      const cover = Math.max(w / ppuB / CARD_W, h / ppuB / CARD_H) * (1.07 + 0.025 * Math.sin(t * 0.22)); // cover 全屏 + 缓慢呼吸
      const layBk = (m: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>, alpha: number) => {
        m.position.set(0, 0, 0); m.scale.set(cover, cover, 1); m.rotation.set(0, 0, 0);
        m.material.uniforms.uAlpha.value = alpha; m.visible = alpha > 0.004;
      };
      layBk(work.bkA, bk.a * wa); layBk(work.bkB, bk.b);
    }
  });
  return (
    <>
      <primitive object={world.scene} />
      <primitive object={work.group} />
    </>
  );
}

const subscribeVisibility = (cb: () => void) => { document.addEventListener("visibilitychange", cb); return () => document.removeEventListener("visibilitychange", cb); };

/** GPU 分级：入门核显 / 软件渲染降 DPR 保帧率（参考站同款 onDegrade 思路，结果缓存） */
let dprCap = 0;
function maxDpr(): number {
  if (dprCap) return dprCap;
  dprCap = 2;
  try {
    const cv = document.createElement("canvas");
    const gl = cv.getContext("webgl2") || cv.getContext("webgl");
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const r = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) ?? "");
      if (/swiftshader|llvmpipe|softpipe|software/i.test(r) || (/intel/i.test(r) && !/iris|arc|\bxe\b/i.test(r))) dprCap = 1.25;
    }
  } catch {}
  return dprCap;
}

/** 渲染器：DPR 按 GPU 分级封顶；标签页隐藏 / 减少动态效果时停帧（按需渲染）。
 *  注意：不再随「舞台切到作品展映」停帧——展映的视频卡也渲染在这块画布里 */
export default function OrbitScene({ bus, reduced, paused = false }: { bus: React.RefObject<OrbitBus>; reduced: boolean; paused?: boolean }) {
  const hidden = useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
  const running = !hidden && !reduced && !paused;
  return (
    <Canvas dpr={[1, maxDpr()]} flat linear frameloop={running ? "always" : "demand"} style={{ pointerEvents: "none" }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }} camera={{ fov: FOV, position: [0, 0, CAM_Z], near: 0.1, far: 50 }}>
      <Scene bus={bus} running={running} reduced={reduced} />
    </Canvas>
  );
}
