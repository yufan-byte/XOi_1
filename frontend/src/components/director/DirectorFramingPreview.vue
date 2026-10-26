<template>
  <details v-if="frames.length" class="director-framing-review" open>
    <summary>构图检查 · {{ duration }} 秒 · {{ scene.fps * duration }} 帧</summary>
    <div class="framing-cards">
      <figure v-for="frame in frames" :key="frame.label">
        <svg :viewBox="`0 0 240 ${height}`" role="img" :aria-label="frame.label + '主体取景示意'">
          <rect width="240" :height="height" fill="currentColor" class="frame-ground" />
          <path :d="`M80 0V${height}M160 0V${height}M0 ${height / 3}H240M0 ${height * 2 / 3}H240`" class="thirds" />
          <g v-for="object in frame.objects" :key="object.id" :class="{ subject: object.selected }">
            <rect :x="object.x" :y="object.y" :width="object.width" :height="object.height" rx="3" />
            <text :x="Math.max(3, Math.min(190, object.x))" :y="Math.max(12, Math.min(height - 4, object.y + 12))">{{ object.name }}</text>
          </g>
        </svg>
        <figcaption>{{ frame.label }} · {{ frame.outside ? '主体范围超出画幅' : '主体范围在画幅内' }}</figcaption>
      </figure>
    </div>
    <small>按白模范围估算起点与终点，细节、遮挡及运动过程请在应用后的 3D 预演中确认。</small>
  </details>
</template>
<script setup lang="ts">
import {computed} from 'vue';
import {directorAspect,projectSubject,subjectAtTime} from '../../../../shared/directorReview';
import type {DirectorScene,DirectorShot} from '../../../../shared/directorSkills';
const props=defineProps<{scene:DirectorScene;shot:DirectorShot}>();
const duration=computed(()=>props.shot.durationSeconds??props.scene.durationSeconds);
const height=computed(()=>Math.round(240/directorAspect(props.scene.aspectRatio)));
const frames=computed(()=>{
 const points=props.shot.camera?.keyframes;if(!points?.length)return [];
 return [points[0],points.at(-1)!].map((point,index)=>{
  let outside=false;
  const objects=props.scene.objects.filter(o=>o.type==='person'||o.id===props.shot.subjectId).slice(0,20).map(o=>{
   const selected=props.shot.subjectId?o.id===props.shot.subjectId:o.type==='person';
   const projected=projectSubject(point,subjectAtTime(props.scene,o,point.t),props.scene.aspectRatio,selected?props.shot.framing:'');
   const visible=projected.every(p=>p.depth>.01);
   if(selected&&(!visible||projected.some(p=>p.x<0||p.x>1||p.y<0||p.y>1)))outside=true;
   if(!visible)return null;
   const xs=projected.map(p=>p.x),ys=projected.map(p=>p.y);
   return {id:o.id,name:o.name,selected,x:Math.max(-240,Math.min(...xs)*240),y:Math.max(-height.value,Math.min(...ys)*height.value),width:Math.min(720,(Math.max(...xs)-Math.min(...xs))*240),height:Math.min(height.value*3,(Math.max(...ys)-Math.min(...ys))*height.value)};
  }).filter((o):o is NonNullable<typeof o>=>!!o);
  return {label:index===0?'起点':'终点',outside,objects};
 });
});
</script>
<style scoped>
.director-framing-review{margin:12px 0;padding:10px;border:1px solid #d3bba33d;border-radius:9px}.director-framing-review summary{cursor:pointer;font-weight:600}.framing-cards{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.framing-cards figure{margin:0;min-width:0}.framing-cards svg{display:block;width:100%;max-height:220px;overflow:hidden;border-radius:5px;background:#292723}.frame-ground{color:#34302b}.thirds{stroke:#bca88b36;fill:none}.framing-cards g rect{fill:#d6c2a115;stroke:#b3aaa0;stroke-width:1}.framing-cards g.subject rect{fill:#edaa6b25;stroke:#e8a268}.framing-cards text{fill:#ddd2c5;font-size:10px}.framing-cards figcaption,.director-framing-review small{display:block;margin-top:5px;font-size:11px;line-height:1.5;opacity:.75}
</style>
