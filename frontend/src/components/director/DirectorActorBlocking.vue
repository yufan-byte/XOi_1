<template>
  <section class="actor-blocking" aria-label="人物走位设置">
    <p class="skills-intro">让谁从哪里走到哪里。这里只改人物走位，机位保持原样；下一步选择跟随或其他运镜。</p>
    <div class="actor-route-presets" role="group" aria-label="常用人物走位"><button v-for="preset in presets" :key="preset.name" type="button" :disabled="disabled || reading" :aria-pressed="direction === preset.direction && pose === preset.pose" @click="direction=preset.direction;pose=preset.pose;distance=2">{{ preset.name }}</button></div>
    <label class="motion-field">移动谁<select v-model="targetId" :disabled="disabled || reading"><option value="" disabled>选择人物</option><option v-for="actor in actors" :key="actor.id" :value="actor.id" :disabled="actor.locked">{{ actor.name }}{{ actor.locked ? '（已锁定）' : '' }}</option></select></label>
    <div class="motion-setting-grid">
      <label class="motion-field">走向<select v-model="direction" :disabled="disabled || reading"><option value="right">画面向右</option><option value="left">画面向左</option><option value="away">远离镜头</option><option value="toward">靠近镜头</option></select></label>
      <label class="motion-field">距离（米）<input v-model.number="distance" type="number" min="0.2" max="10" step="0.2" :disabled="disabled || reading" /></label>
      <label class="motion-field">时长（秒）<input v-model.number="duration" type="number" min="1" max="60" :disabled="disabled || reading" /></label>
      <label class="motion-field">动作<select v-model="pose" :disabled="disabled || reading"><option value="walk">行走</option><option value="run">奔跑</option></select></label>
    </div>
    <p v-if="!actors.length && !reading" class="skill-notice">场景里还没有人物，先去“搭场景”添加人物。</p>
    <p v-if="error" class="skill-error" role="alert">{{ error }}</p>
    <div class="primary-actions"><button type="button" :disabled="disabled || reading || !targetId || applied" @click="apply">{{ reading ? '同步人物中…' : applied ? '走位已应用' : '设置走位并试播' }}</button></div>
    <p class="billing-note">本地设置 · 不扣积分。人物会自然摆臂、沿路线转身；桌椅挡路时自动增加绕行点。坐姿人物会起身，请在试播中确认路线。</p>
    <button type="button" class="blocking-next" :disabled="disabled || reading" @click="$emit('next')">人物走位好了，选择运镜 →</button>
  </section>
</template>
<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref,shallowRef,watch} from 'vue';
import {applyActorTravel} from '../../../../shared/directorMotion';
import {captureDirectorScene,type DirectorSnapshot,type NativeDirectorProject} from '@/utils/directorScene';
const props=defineProps<{projectId:string;ownerId:string;projectName:string;getIframe:()=>HTMLIFrameElement|null;disabled:boolean;committedSnapshot?:DirectorSnapshot|null;modelValue?:string}>();
const emit=defineEmits<{apply:[project:NativeDirectorProject,fingerprint:string];next:[];"update:modelValue":[id:string]}>();
const snapshot=shallowRef<DirectorSnapshot|null>(null),targetId=ref(''),direction=ref<'left'|'right'|'away'|'toward'>('right'),distance=ref(2),duration=ref(5),pose=ref<'walk'|'run'>('walk'),reading=ref(false),error=ref(''),applied=ref(false);
watch(()=>props.modelValue,id=>{if(id&&id!==targetId.value)targetId.value=id;},{immediate:true});
watch(targetId,id=>emit("update:modelValue",id));
const presets=[{name:'向右行走',direction:'right',pose:'walk'},{name:'向左行走',direction:'left',pose:'walk'},{name:'走向远处',direction:'away',pose:'walk'},{name:'跑向镜头',direction:'toward',pose:'run'}] as const;
watch(targetId,id=>{if(id)props.getIframe()?.contentWindow?.postMessage({source:'xoi-director',type:'subject-focus',projectId:props.projectId,subjectId:id,context:'blocking'},location.origin);});
const actors=computed(()=>snapshot.value?.project.objects.filter((o:any)=>o.type==='person')||[]);
let disposed=false;
onUnmounted(()=>disposed=true);
watch([targetId,direction,distance,duration,pose],()=>applied.value=false);
watch(()=>props.committedSnapshot,value=>{if(value){snapshot.value=value;applied.value=true;}});
async function read(){snapshot.value=await captureDirectorScene(props.getIframe(),props.projectId,props.ownerId,props.projectName);if(!actors.value.some((a:any)=>a.id===targetId.value&&!a.locked))targetId.value=actors.value.find((a:any)=>!a.locked)?.id||'';}
async function apply(){if(props.disabled||reading.value||applied.value)return;reading.value=true;error.value='';try{await read();if(disposed)return;emit('apply',applyActorTravel(snapshot.value!.project,targetId.value,duration.value,distance.value,direction.value,pose.value),snapshot.value!.fingerprint);}catch(e:any){if(!disposed)error.value=e.message;}finally{reading.value=false;}}
onMounted(async()=>{reading.value=true;try{await read();duration.value=snapshot.value!.project.settings.durationSeconds;}catch(e:any){error.value=e.message;}finally{reading.value=false;}});
</script>
<style scoped>.actor-route-presets{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0}.actor-route-presets button{background:transparent;color:#cbb8a9;border:1px solid #51463e;border-radius:4px;padding:9px;cursor:pointer;font-size:12px}.actor-route-presets button[aria-pressed=true]{border-color:#b77d56;color:#edb48c}.blocking-next{margin-top:16px;padding:10px 0;border:0;border-top:1px solid #51463e;background:transparent;color:#edb48c;text-align:left;width:100%;cursor:pointer;font:inherit;font-size:12px}</style>
