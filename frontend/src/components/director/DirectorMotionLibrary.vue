<template>
  <div class="motion-library">
    <p class="skills-intro">选谁就拍谁。先选主体，再选运镜，点击试播后会更新当前镜头；可以撤销。</p>
    <div class="motion-quick-actions">
    <label class="motion-field">拍谁<select v-model="targetId" :disabled="disabled || reading"><option value="" disabled>选择人物或物体</option><option v-for="object in snapshot?.project.objects || []" :key="object.id" :value="object.id">{{ object.name }}</option></select></label>
    <div class="motion-framing-choice" role="group" aria-label="镜头远近"><button type="button" :aria-pressed="shotSize === 'close'" :disabled="disabled || reading" @click="setShotSize('close')">近景</button><button type="button" :aria-pressed="shotSize === 'medium'" :disabled="disabled || reading" @click="setShotSize('medium')">中景</button><button type="button" :aria-pressed="shotSize === 'wide'" :disabled="disabled || reading" @click="setShotSize('wide')">全景</button></div>
    <div class="primary-actions"><button type="button" :disabled="disabled || reading || !ready || alreadyApplied" @click="apply">{{ reading ? '正在同步当前场景…' : alreadyApplied ? '当前运镜已应用' : needsTravel ? '设置走位并跟拍' : '应用运镜并试播' }}</button></div>
    </div>
    <p v-if="alreadyApplied" class="skill-notice" role="status">当前镜头已使用这组运镜。切换主体或预设，再点试播即可更新，不会增加新镜头。</p>
    <p v-if="selectedObject" class="motion-target-state" role="status">{{ alreadyApplied ? '正在拍：' : '准备拍：' }}<strong>{{ selectedObject.name }}</strong> · {{ selected.name }} · {{ shotSizeLabel }}<small v-if="!alreadyApplied">{{ needsTravel ? '将设置 2 米人物走位并跟拍，已有布景不变。' : `当前距主体约 ${distance} 米；点击试播后应用到 3D 镜头。` }}</small></p>
    <DirectorFramingPreview v-if="points.length && snapshot" :scene="snapshot.scene" :shot="framingShot" />
    <div class="motion-preset-grid">
      <button v-for="preset in MOTION_PRESETS" :key="preset.id" type="button" :aria-pressed="presetId === preset.id" :disabled="disabled || reading" @click="presetId = preset.id">
        <svg viewBox="0 0 144 100" aria-hidden="true"><circle cx="76" cy="49" r="5" class="motion-subject"/><path :d="preset.path"/><circle r="4" class="motion-camera"><animateMotion :path="preset.path" dur="3s" repeatCount="indefinite"/></circle></svg>
        <strong>{{ preset.name }}</strong><small>{{ preset.description }}</small>
      </button>
    </div>
    <p v-if="snapshot && !snapshot.project.objects.length" class="skill-description">场景里还没有主体，可以先用“搭场景”添加人物和布景。</p>
    <div v-if="needsTravel" class="follow-route-state" role="status"><strong>{{ selectedObject?.name }} 还没有走位</strong><p>点击“设置走位并跟拍”，人物会远离镜头走 2 米，相机同步跟随；已有布景保留。</p></div>
    <p v-else-if="presetId === 'follow' && !hasSubjectMotion" class="skill-description" role="status">请先选择未锁定的人物，或在“人物走位”中设置路线。</p>
    <div class="motion-setting-grid">
      <label class="motion-field">时长（秒）<input v-model.number="duration" type="number" min="1" max="60" :disabled="disabled || reading" /></label>
      <label class="motion-field">方向<select v-model.number="direction" :disabled="disabled || reading"><option :value="1">正向</option><option :value="-1">反向</option></select></label>
    </div>
    <details class="motion-advanced"><summary>更多调整 · 距离、幅度与节奏</summary>
    <label class="motion-field">距主体 {{ distance }} 米<input v-model.number="distance" type="range" min="1" max="20" step=".1" :disabled="disabled || reading" @input="shotSize = 'custom'" /></label>
    <label class="motion-field">运动幅度 {{ amount.toFixed(1) }} 倍<input v-model.number="amount" type="range" min=".2" max="2" step=".1" :disabled="disabled || reading" /></label>
    <label class="motion-field">表达风格<select v-model="style" :disabled="disabled || reading"><option value="calm">克制长镜头 · 柔和起停</option><option value="suspense">紧张悬疑 · 渐进加速</option><option value="bright">轻快广告 · 展开空间</option></select></label>
    <label class="motion-check"><input v-model="follow" type="checkbox" :disabled="disabled || reading || presetId === 'follow'" />持续看向并跟随主体的已记录路线</label>
    </details>
    <p class="billing-note">人物已有走位时沿用原路线；没有走位时可一键设置走位并跟拍。全程本地计算，不调用 AI。</p>
    <p v-if="points.length" class="scene-meta">路线草稿 · {{ duration }} 秒 · 可拖动俯视图中的起点和终点</p>
    <p v-if="error" class="skill-error" role="alert">{{ error }}</p>
    <p class="billing-note">只更新当前镜头，可撤销；改变时长时，人物走位同步适配。</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { MOTION_PRESETS, createMotionPath, createFollowDemo, hasObjectTravel, editMotionEndpoint, applyMotionToCurrent, replaceCurrentShot, type MotionId, type MotionStyle, type MotionPoint } from "../../../../shared/directorMotion";
import { captureDirectorScene, type DirectorSnapshot, type NativeDirectorProject } from "@/utils/directorScene";
import DirectorFramingPreview from "./DirectorFramingPreview.vue";
const props=defineProps<{projectId:string;ownerId:string;projectName:string;getIframe:()=>HTMLIFrameElement|null;selectedPreset?:string;disabled:boolean;committedSnapshot?:DirectorSnapshot|null;modelValue?:string}>();
const emit=defineEmits<{apply:[project:NativeDirectorProject,fingerprint:string,name:string];error:[message:string];"update:modelValue":[id:string]}>();
const snapshot=shallowRef<DirectorSnapshot|null>(null),points=ref<MotionPoint[]>([]),reading=ref(false),appliedSignature=ref("");
const presetId=ref<MotionId>("push"),targetId=ref(""),duration=ref(5),distance=ref(5.5),amount=ref(1),direction=ref<1|-1>(1),style=ref<MotionStyle>("calm"),follow=ref(false),framing=ref<'subject'|'scene'>('subject'),shotSize=ref<'close'|'medium'|'wide'|'custom'>('medium'),error=ref("");
let disposed=false,revision=0,previewTimer:ReturnType<typeof setTimeout>|undefined;const token=localStorage.getItem("token");
const needsTravel=computed(()=>presetId.value==='follow'&&!hasSubjectMotion.value&&selectedObject.value?.type==='person'&&!selectedObject.value?.locked);
const ready=computed(()=>!!snapshot.value&&(points.value.length>=2||needsTravel.value));
const framingShot=computed<any>(()=>({subjectId:targetId.value,framing:framing.value==='subject'?"中景":"全景",durationSeconds:duration.value,camera:{keyframes:points.value}}));
const signature=computed(()=>JSON.stringify([presetId.value,targetId.value,duration.value,points.value]));
const alreadyApplied=computed(()=>!!appliedSignature.value&&signature.value===appliedSignature.value);
const hasSubjectMotion=computed(()=>hasObjectTravel(snapshot.value?.project||{},targetId.value));
const selectedObject=computed(()=>snapshot.value?.project.objects?.find((o:any)=>o.id===targetId.value));
const selected=computed(()=>MOTION_PRESETS.find(p=>p.id===presetId.value)!);
const focalLength=computed(()=>shotSize.value==='close'?65:shotSize.value==='wide'?35:50);
const shotSizeLabel=computed(()=>shotSize.value==='close'?'近景':shotSize.value==='wide'?'全景':shotSize.value==='custom'?'自定义远近':'中景');
watch(()=>props.modelValue,id=>{if(id&&id!==targetId.value)targetId.value=id;},{immediate:true});
watch(targetId,id=>emit("update:modelValue",id));
function focusSubject(applied=false){if(!selectedObject.value)return;props.getIframe()?.contentWindow?.postMessage({source:"xoi-director",type:"subject-focus",projectId:props.projectId,subjectId:targetId.value,applied},location.origin);}
function setShotSize(value:'close'|'medium'|'wide'){shotSize.value=value;distance.value=value==='close'?3.5:value==='medium'?5.5:8;framing.value=value==='wide'?'scene':'subject';}
function sendPreview() {
  props.getIframe()?.contentWindow?.postMessage({source:"xoi-director",type:"motion-preview",projectId:props.projectId,name:selected.value.name,points:points.value.map(p=>({position:[...p.position],target:[...p.target]})),duration:duration.value},location.origin);
}
function regenerate() {
  clearTimeout(previewTimer);previewTimer=undefined;error.value="";focusSubject();
  if(!snapshot.value||!targetId.value){points.value=[];sendPreview();return;}
  try {
    points.value=createMotionPath(snapshot.value.project,{presetId:presetId.value,targetId:targetId.value,duration:duration.value,distance:distance.value,amount:amount.value,direction:direction.value,style:style.value,follow:follow.value,framing:framing.value,focalLength:focalLength.value});
    sendPreview();
  }catch(e:any){points.value=[];error.value=presetId.value==='follow'&&!hasSubjectMotion.value?'':e.message;sendPreview();}
}
watch([presetId,targetId,duration,distance,amount,direction,style,follow,framing,shotSize],()=>{clearTimeout(previewTimer);previewTimer=setTimeout(regenerate,80);});
watch(()=>props.committedSnapshot,value=>{if(value){appliedSignature.value=signature.value;snapshot.value=value;focusSubject(true);}});
watch(()=>props.selectedPreset,id=>{if(MOTION_PRESETS.some(p=>p.id===id))presetId.value=id as MotionId;},{immediate:true});
async function readScene() {
  if(reading.value||props.disabled)return;
  const current=++revision;reading.value=true;appliedSignature.value="";
  try {
    if(!token||localStorage.getItem("token")!==token)throw new Error("账号已切换，请重新打开导演台");
    const next=await captureDirectorScene(props.getIframe(),props.projectId,props.ownerId,props.projectName);
    if(disposed||current!==revision)return;
    if(!snapshot.value)duration.value=next.project.settings.durationSeconds;
    snapshot.value=next;
    const selectedName=props.getIframe()?.contentDocument?.querySelector<HTMLInputElement>(".inspector-name-input")?.value;
    if(!next.project.objects.some((o:any)=>o.id===targetId.value))targetId.value=next.project.objects.find((o:any)=>o.name===selectedName)?.id||next.project.objects.find((o:any)=>o.type==="person")?.id||next.project.objects[0]?.id||"";
    regenerate();
  }catch(e:any){if(!disposed){snapshot.value=null;points.value=[];error.value=e.message;sendPreview();}}
  finally{if(!disposed&&current===revision)reading.value=false;}
}
function onMessage(event:MessageEvent) {
  if(event.origin!==location.origin||event.source!==props.getIframe()?.contentWindow||event.data?.source!=="monoform"||event.data?.key!==props.projectId||event.data?.type!=="motion-endpoint"||props.disabled||reading.value)return;
  const {index,x,z}=event.data;
  if(![0,1].includes(index)||typeof x!=="number"||typeof z!=="number"||!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>200||Math.abs(z)>200||!snapshot.value||points.value.length<2)return;
  try {
    const old=points.value[index===0?0:points.value.length-1];
    points.value=editMotionEndpoint(points.value,index,[x,old.position[1],z]);
    sendPreview();
  }catch(e:any){error.value=e.message;}
}
function applyFollowDemo(){
 if(!snapshot.value||props.disabled||reading.value)return;
 try{emit('apply',replaceCurrentShot(snapshot.value.project,createFollowDemo({...snapshot.value.project,shots:[snapshot.value.project.shots.find((s:any)=>s.id===snapshot.value!.project.activeShotId)]},targetId.value,duration.value,{distance:distance.value,amount:amount.value,direction:direction.value,style:style.value,framing:framing.value,focalLength:focalLength.value},'away')),snapshot.value.fingerprint,selected.value.name);}
 catch(e:any){error.value=e.message;}
}
async function apply(){
  if(alreadyApplied.value||props.disabled||reading.value)return;
  await readScene();
  if(disposed||!snapshot.value)return;
  if(needsTravel.value){applyFollowDemo();return;}
  if(previewTimer)regenerate();
  if(!ready.value||!snapshot.value||props.disabled||reading.value||alreadyApplied.value)return;
  try{emit("apply",applyMotionToCurrent(snapshot.value.project,points.value,duration.value,selected.value.name),snapshot.value.fingerprint,selected.value.name);}
  catch(e:any){error.value=e.message;}
}
onMounted(()=>{addEventListener("message",onMessage);void readScene();});
onUnmounted(()=>{disposed=true;revision++;clearTimeout(previewTimer);removeEventListener("message",onMessage);props.getIframe()?.contentWindow?.postMessage({source:"xoi-director",type:"end-preview",projectId:props.projectId},location.origin);});
</script>

<style scoped>.motion-framing-choice{display:flex;gap:4px;margin:8px 0}.motion-framing-choice button{flex:1;padding:7px;border:1px solid #51463e;border-radius:4px;color:#c6b6a8;background:transparent;cursor:pointer;font-size:12px}.motion-framing-choice button[aria-pressed=true]{color:#ffd0ac;border-color:#be855d;background:#ed955f15}.motion-target-state{margin:8px 0;font-size:12px;color:#c9b8a9}.motion-target-state strong{color:#edb48c}.motion-target-state small{display:block;margin-top:5px;font-size:11px}.follow-route-state{padding:10px;border-left:2px solid #ed955f;background:#ed955f0c;font-size:12px}.follow-route-state p{margin:6px 0 0;line-height:1.6}.follow-demo-button{padding:9px 10px;border:1px solid #b9865c66;border-radius:5px;background:#b9865c18;color:inherit;cursor:pointer;font:inherit;width:100%;margin:6px 0}.follow-demo-button:disabled{opacity:.5;cursor:not-allowed}</style>
