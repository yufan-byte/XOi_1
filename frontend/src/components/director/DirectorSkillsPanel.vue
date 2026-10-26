<template>
  <div class="director-skills-entry" :class="{ 'is-rail': hideTrigger }" :data-busy="busy || applying">
    <button v-if="!hideTrigger" class="skills-trigger" type="button" :aria-expanded="visible" @click="visible ? closePanel() : openPanel()">✦ AI 导演助理 <span>{{ visible ? '收起' : '运镜 / 搭建' }}</span></button>
    <section v-if="visible" class="skills-panel" aria-label="AI 导演助理">
      <header><div><small>当前场景 · {{ projectName }}</small><h2>{{ mode === 'presets' ? '镜头怎么拍' : activeStep === 'blocking' ? '人物怎么走' : mode === 'build-local' || mode === 'build' ? '先把场景搭好' : mode === 'adjust' ? '修改已有布景' : '用 AI 规划运镜' }}</h2></div><button type="button" aria-label="关闭 AI 导演助理" @click="closePanel">×</button></header>
      <div class="director-mode-tabs" role="group" aria-label="导演助理工作方式">
        <button v-for="item in modes" :key="item.id" type="button" :aria-pressed="activeStep === item.id" :disabled="busy || applying" @click="selectMode(item.id === 'build' ? 'build-local' : item.id)">{{ item.name }}</button>
      </div>
      <div class="director-camera-method" role="group" aria-label="选择处理方式"><button type="button" :aria-pressed="isLocalMethod" :disabled="busy || applying" @click="selectMode(activeStep === 'build' ? 'build-local' : activeStep === 'blocking' ? 'blocking' : 'presets')">直接选预设</button><button type="button" :aria-pressed="!isLocalMethod" :disabled="busy || applying" @click="selectMode(activeStep === 'build' ? 'build' : activeStep === 'blocking' ? 'blocking-ai' : 'camera')">{{ activeStep === 'build' ? '用 AI 描述场景（可选）' : activeStep === 'blocking' ? '用 AI 描述走位（可选）' : '用 AI 描述运镜（可选）' }}</button></div>

      <p v-if="mode === 'presets'" class="director-cost-hint">本地预演 · 不扣积分</p>
      <div v-if="busy || applying" class="director-task-state" role="status">{{ applying ? '正在核对并应用镜头，请稍候…' : '正在生成方案，可停止或关闭助理' }}</div>
      <section v-if="lastApplied" class="director-applied-state" aria-label="本次应用结果">
        <strong>{{ appliedKind === 'scene' ? lastApplied === '人物走位' ? '人物走位已设置' : '场景已更新' : '运镜已应用' }} · {{ lastApplied }}</strong><p>{{ appliedFeedback }} · {{ appliedKind === 'scene' ? '只更新当前镜头中的场景，其他镜头不变。' : '可返回编辑或撤销本次运镜。' }}</p>
        <div class="result-actions"><button type="button" :disabled="busy || applying" @click="replayApplied">{{ appliedKind === 'scene' ? '试播当前场景' : '重播镜头' }}</button><button v-if="appliedKind !== 'scene' || previewing" type="button" @click="returnEditing">返回编辑</button><button v-if="undoRaw" type="button" :disabled="busy || applying" @click="undoApply">{{ appliedKind === 'scene' ? '撤销场景更改' : '撤销运镜更改' }}</button></div>
      </section>
      <DirectorMotionLibrary v-model="subjectId" v-if="mode === 'presets'" :key="motionReset" :committed-snapshot="committedMotion" :project-id="projectId" :owner-id="ownerId" :project-name="projectName" :get-iframe="getIframe" :selected-preset="selectedPreset" :disabled="busy || applying" @apply="(project, fingerprint, name) => applyPrepared(project, fingerprint, {kind:'camera',replace:true,name})" />
      <div v-if="mode === 'presets' && undoRaw && !lastApplied" class="result-actions"><button type="button" :disabled="busy || applying" @click="undoApply">{{ appliedKind === 'scene' ? '撤销场景更改' : '撤销运镜更改' }}</button></div>
      <p v-if="mode === 'presets' && error" class="skill-error" role="alert">{{ directorMessage(error) }}</p><p v-if="mode === 'presets' && notice" class="skill-notice" role="status">{{ notice }}</p>
      <DirectorActorBlocking v-model="subjectId" :key="motionReset" v-if="mode === 'blocking'" :project-id="projectId" :owner-id="ownerId" :project-name="projectName" :get-iframe="getIframe" :disabled="busy || applying" :committed-snapshot="committedMotion" @apply="(project, fingerprint) => applyPrepared(project, fingerprint, {kind:'scene',name:'人物走位',play:true})" @next="selectMode('presets')" />
      <template v-if="mode !== 'presets' && mode !== 'blocking'">
      <section v-if="mode === 'build-local'" class="scene-starters" aria-label="常用场景预设">
        <div class="starter-heading"><strong>常用场景</strong><small>本地使用 · 不扣积分</small></div>
        <div class="starter-grid"><button v-for="preset in DIRECTOR_SCENE_PRESETS" :key="preset.id" type="button" :disabled="busy || applying" :aria-pressed="scenePreset === preset.id" @click="scenePreset = preset.id"><strong>{{ preset.name }}</strong><small>{{ preset.duration }} 秒 · {{ preset.actors }} 人</small></button></div>
        <p>{{ selectedScenePreset.description }}</p>
        <button class="use-scene-preset" type="button" :disabled="busy || applying" @click="applyScenePreset">使用{{ selectedScenePreset.name }}（本地免费）</button>
        <small class="starter-boundary">替换当前镜头中的布景，可撤销；其他镜头不变。</small>
      </section>
      <div v-if="mode === 'build-local'" class="director-stage-next"><button type="button" :disabled="busy || applying" @click="selectMode('blocking')">场景好了，设置人物走位 →</button><button type="button" :disabled="busy || applying" @click="selectMode('presets')">人物不动，直接选运镜 →</button></div>
      <template v-if="!isLocalMethod">
      <div v-if="activeStep === 'build'" class="director-build-task" role="group" aria-label="场景处理范围"><button type="button" :disabled="busy || applying" :aria-pressed="mode === 'build'" @click="selectMode('build')">搭建新布景</button><button type="button" :disabled="busy || applying" :aria-pressed="mode === 'adjust'" @click="selectMode('adjust')">修改已有布景</button></div>
      <p class="skills-intro">{{ mode === 'camera' ? '基于已有场景，用文字描述怎么拍。AI 生成相机路线供你选择；不会添加人物、改布景或设置人物走位。' : mode === 'build' ? '描述需求，让 AI 为你搭建可编辑的白模场景。' : mode === 'blocking-ai' ? '描述人物怎样走、在哪里停下或转弯。只生成现有人物的走位和姿势，机位与布景保持原样。' : '增减人物、移动桌椅或调整灯光，先检查修改清单再应用。人物行走请用第二步。' }}</p>
      <details v-if="mode === 'camera'" class="director-skill-options"><summary>导演技能 · {{ activeSkill?.name }}</summary><div class="skills-list" role="group" aria-label="选择导演技能">
        <button v-for="skill in skills" :key="skill.id" type="button" :disabled="busy || applying || skill.available === false" :aria-pressed="skillId === skill.id" :class="{ selected: skillId === skill.id }" :title="skill.description" @click="selectSkill(skill.id)">{{ skill.name }}<small v-if="skill.available === false">未导入</small></button>
      </div>
      <p class="skill-description">{{ activeSkill?.description }} · {{ activeSkill?.canApplyCamera ? '可应用相机路线，其他内容为制作建议' : '仅生成制作建议，不会自动修改场景' }}</p></details>
      <label class="request-label" for="director-skill-request">{{ mode === 'build' ? '描述场景' : mode === 'blocking-ai' ? '描述人物走位' : '导演需求' }}</label>
      <textarea id="director-skill-request" v-model="intent" maxlength="12000" :disabled="busy || applying" :placeholder="requestPlaceholder"></textarea>
      <div class="skill-controls"><label v-if="mode === 'camera'">方案镜头数 <select v-model.number="shotCount" :disabled="busy || applying"><option :value="1">1 个</option><option :value="3">3 个</option><option :value="6">6 个</option></select></label><model-select v-model="model" v-model:label="modelLabel" :type="'text'" :showIcon="false" :showAdd="false" :disabled="busy || applying" /></div>
      <label v-if="mode === 'build'" class="fresh-scene-setting"><input v-model="buildFromEmpty" type="checkbox" :disabled="busy || applying" />清空当前镜头后重搭</label>
      <p v-if="mode === 'build' && buildFromEmpty" class="skill-error" role="alert">会移除当前镜头里的桌椅、人物和已有走位，只保留 AI 本次新建内容；应用前可检查，应用后可撤销。</p>
      <details class="director-advanced"><summary>时长与主体 · {{ timingHint }}</summary><div class="director-review-controls">
        <label>本镜时长（秒）<input v-model.number="durationInput" type="number" min="1" max="60" :placeholder="`自动：${inferredDuration}秒`" :disabled="busy || applying" /></label>
        <label v-if="mode !== 'build' || !buildFromEmpty">{{ mode === 'blocking-ai' ? '移动谁' : '镜头主体' }}<select v-model="subjectId" :disabled="busy || applying"><option value="">从需求自动识别</option><option v-for="object in (liveScene?.objects || scene?.objects || []).filter(object => mode !== 'blocking-ai' || object.type === 'person')" :key="object.id" :value="object.id">{{ object.name }}</option></select></label>
        <label v-if="mode === 'build'" class="ground-setting"><input v-model="groundNewObjects" type="checkbox" :disabled="busy || applying" />新添人物和桌椅自动落地、对齐坐姿</label>
        <small>{{ timingHint }}</small>
      </div>
      </details>
      <div v-if="billingState" class="director-billing-state" role="status"><span>{{ billingState.state === 'recorded' ? `本次实际 ${billingState.points || 0} 积分` : billingState.state === 'not_submitted' ? '本次未提交模型' : billingState.needsReview ? '上次请求未完成' : '账单待回传，可继续操作' }}</span><button v-if="billingState.state === 'pending' && billingState.needsReview" type="button" :disabled="checkingReceipt || busy" @click="stopBilling">结束本次尝试</button><a href="/console/usage" target="_blank" rel="noopener" @click="returnEditing">去积分明细 ↗</a></div>
      <div class="primary-actions"><button type="button" :disabled="busy || applying || billingState?.needsReview || !intent.trim() || (mode === 'camera' && activeSkill?.available === false)" @click="mode === 'camera' ? generatePlan() : generateScene()">{{ busy ? '正在生成方案…' : mode === 'camera' ? '生成运镜方案' : mode === 'build' ? '生成搭建方案' : mode === 'blocking-ai' ? '生成人物走位方案' : '生成布景修改方案' }}</button><button v-if="busy" type="button" @click="controller?.abort()">停止</button><button v-if="undoRaw && !lastApplied" type="button" :disabled="busy || applying" @click="undoApply">{{ appliedKind === 'scene' ? '撤销场景更改' : '撤销运镜更改' }}</button></div>
      <p class="billing-note">AI 生成按所选模型计费；本地预设、应用、试播和撤销不扣积分。</p>
      <p v-if="error" class="skill-error" role="alert">{{ directorMessage(error) }}</p>
      <p v-if="notice" class="skill-notice" role="status">{{ notice }}</p>
      <article v-if="plan && mode === 'camera'" class="plan-results">
        <h3>镜头方案 <small>{{ planSkill?.name }}</small></h3><p>{{ plan.summary }}</p>
        <ul v-if="plan.assumptions.length" class="plan-notes"><li v-for="item in plan.assumptions" :key="item">假设：{{ item }}</li></ul>
        <ul v-if="plan.warnings.length" class="plan-notes"><li v-for="item in plan.warnings" :key="item">{{ item }}</li></ul>
        <p class="plan-boundary">预演只添加相机路径；演员调度、微表情、灯光精修和转场仍是制作建议。</p>
        <section v-for="(shot, index) in plan.shots" :key="index" class="shot-proposal">
          <p class="scene-meta">{{ shot.durationSeconds || scene?.durationSeconds }} 秒 · {{ scene?.fps }} FPS</p><DirectorFramingPreview v-if="scene && shot.camera" :scene="scene" :shot="shot" /><h4>{{ String(index + 1).padStart(2, '0') }} · {{ shot.name }}</h4><p>{{ shot.purpose }}</p>
          <dl><dt>构图 / 运镜</dt><dd>{{ shot.framing }} · {{ shot.movement }}</dd><dt>调度 / 表演</dt><dd>{{ shot.blocking }} · {{ shot.performance }}</dd><dt>光影 / 衔接</dt><dd>{{ shot.lighting }} · {{ shot.transition }}</dd></dl>
          <details><summary>查看镜头提示词</summary><p class="prompt-text">{{ shot.prompt }}</p></details>
          <button v-if="shot.camera && planSkill?.canApplyCamera" type="button" :disabled="busy || applying || appliedShotKeys.includes(shotKey(shot))" @click="applyShots([shot])">{{ appliedShotKeys.includes(shotKey(shot)) ? '已添加到镜头' : applying ? '正在应用…' : '添加为预演镜头（不扣积分）' }}</button>
        </section>
        <details><summary>成片 / 精修提示词</summary><p class="prompt-text">{{ plan.renderPrompt }}</p></details>
        <p class="billing-note">包含当前镜头的真实白模截图，不把未应用方案当作预演。</p>
        <div class="result-actions"><button type="button" :disabled="busy || applying" @click="copyPlan">复制完整方案</button><button type="button" :disabled="busy || applying || !lastApplied || appliedKind !== 'camera'" @click="sendToCanvas">带入已应用镜头 →</button></div>
        <small class="billing-note">先应用并检查镜头，再带入当前镜头的可编辑场景和参考图。带入本地镜头不扣积分；到画布确认费用后才生成视频。</small>
      </article>
      <article v-if="actionPlan && mode !== 'camera' && actionPlanScope === (mode === 'blocking-ai' ? 'blocking' : 'scene')" class="plan-results">
        <h3>{{ actionPlan.name }}</h3><p>{{ actionPlan.summary }}</p><p class="scene-meta">本镜 {{ actionPlan.durationSeconds || scene?.durationSeconds }} 秒 · 操作清单确认后应用</p>
        <ul class="scene-action-list"><li v-for="(action, index) in actionPlan.actions" :key="index">{{ sceneActionLabel(action, scene?.objects || [], actionPlan.actions) }}</li></ul>
        <ul v-if="actionPlan.warnings.length" class="plan-notes"><li v-for="warning in actionPlan.warnings" :key="warning">{{ directorMessage(warning) }}</li></ul>
        <p class="plan-boundary">应用到当前镜头中的场景，可撤销；其他镜头不变。精细材质、服装与表情需后续制作。</p>
        <div class="result-actions"><button type="button" :disabled="busy || applying" @click="applyScene">{{ mode === 'blocking-ai' ? '应用走位并试播' : '应用到当前场景' }}</button></div>
      </article>
      <div v-if="mode !== 'camera' && conversation.length" class="director-conversation"><p v-for="(message, index) in conversation.slice(-4)" :key="index"><strong>{{ message.role === 'user' ? '你' : '导演助理' }}</strong> · {{ message.content }}</p></div>
      </template>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { useRouter } from "vue-router";
// 面板暗色主题：必须走普通 CSS（不能 scoped），否则打不进
// DirectorMotionLibrary / DirectorActorBlocking 子组件内部的控件
import "./director-panel.css";
import ModelSelect from "@/components/modelSelect.vue";
import {reviewDirectorReceipt,type DirectorBill} from "@/utils/directorBillingState";
import {DIRECTOR_SCENE_PRESETS,applyCurrentScenePreset,applyCurrentSceneActions,type ScenePresetId} from "../../../../shared/directorScenePresets";
import DirectorMotionLibrary from "./DirectorMotionLibrary.vue";
import DirectorActorBlocking from "./DirectorActorBlocking.vue";
import DirectorFramingPreview from "./DirectorFramingPreview.vue";
import {directorShotPackage} from "@/utils/directorHandoff";
import {resolveDirectorDuration} from "../../../../shared/directorReview";
import { validateTimelineClear } from "@/utils/directorTimeline";
import { MOTION_PRESETS, applyBlockingToCurrent, validateBlockingPlan, validateSceneActionPlan, sceneActionLabel, type SceneActionPlan } from "../../../../shared/directorMotion";
import { DIRECTOR_SKILLS, validateDirectorPlan, validateDirectorScene, type DirectorPlan, type DirectorScene, type DirectorShot, type DirectorSkill } from "../../../../shared/directorSkills";
import { appendDirectorShots, captureDirectorScene, captureDirectorReference, importDirectorProject, sceneFingerprint, sceneFromNative, type DirectorSnapshot } from "@/utils/directorScene";

const props = defineProps<{
  projectId: string;
  ownerId: string;
  projectName: string;
  getIframe: () => HTMLIFrameElement | null;
  /** 由宿主（导演台右侧工具条）触发时置 true：不渲染自己的胶囊按钮，只保留面板 */
  hideTrigger?: boolean;
}>();
const router = useRouter();
const directorMessage=(text:string)=>text.split("设计镜头").join("镜头运镜 → 用 AI 描述运镜");
const visible = ref(false), busy = ref(false), applying = ref(false);
/** 宿主工具条调用：打开/关闭面板（触发器在宿主侧时不走内部按钮） */
defineExpose({ open: () => { void openPanel(); }, close: () => closePanel(), toggle: () => (visible.value ? closePanel() : void openPanel()) });
const modes = [{id:"build",name:"1 搭场景"},{id:"blocking",name:"2 人物走位"},{id:"presets",name:"3 镜头运镜"}] as const;
const mode = ref<"build-local"|"build"|"blocking"|"blocking-ai"|"presets"|"camera"|"adjust">("build-local"), selectedPreset = ref("push");
const isLocalMethod=computed(()=>["build-local","blocking","presets"].includes(mode.value));
const activeStep=computed(()=>mode.value==='adjust'||mode.value==='build-local'?'build':mode.value==='blocking-ai'?'blocking':mode.value==='camera'?'presets':mode.value);
const attachReference=ref(true);
const actionPlan = ref<SceneActionPlan|null>(null), conversation = ref<Array<{role:"user"|"assistant";content:string}>>([]);
const skills = ref<DirectorSkill[]>(DIRECTOR_SKILLS.map(s => ({ ...s })));
const skillId = ref(DIRECTOR_SKILLS[0].id), intent = ref(""), shotCount = ref(1);
const durationInput=ref<number|"">(""),subjectId=ref(""),groundNewObjects=ref(true),liveScene=ref<DirectorScene|null>(null),appliedFeedback=ref("");
const inferredDuration=computed(()=>{try{return resolveDirectorDuration(intent.value,undefined,liveScene.value?.durationSeconds||scene.value?.durationSeconds||15);}catch{return "待确认";}});
const timingHint=computed(()=>{try{return `本次 ${resolveDirectorDuration(intent.value,durationInput.value,liveScene.value?.durationSeconds||scene.value?.durationSeconds||15)} 秒；演员动作与机位使用同一时间线。`;}catch(e:any){return e.message;}});
const scenePreset=ref<ScenePresetId>('solo'),buildFromEmpty=ref(false),actionPlanFresh=ref(false),actionPlanScope=ref<'scene'|'blocking'>('scene');
const selectedScenePreset=computed(()=>DIRECTOR_SCENE_PRESETS.find(p=>p.id===scenePreset.value)!);
async function applyScenePreset(){
 if(busy.value||applying.value)return;
 try{checkAccount();const snapshot=await captureDirectorScene(props.getIframe(),props.projectId,props.ownerId,props.projectName);
 if(await applyPrepared(applyCurrentScenePreset(snapshot.project,scenePreset.value),snapshot.fingerprint,{kind:'scene',name:selectedScenePreset.value.name})){actionPlan.value=null;plan.value=null;conversation.value=[];durationInput.value='';subjectId.value='';taskDrafts.build=intent.value;mode.value='build-local';intent.value='';persistDraft();}
 }catch(e:any){error.value=e.message||'预设应用失败，原场景保留';}
}
const billingState=ref<DirectorBill|null>(null),billingHistory=ref<DirectorBill[]>([]),checkingReceipt=ref(false);
let requestStartedAt=0,callBillingId="";
function billingUpdate(event:Event){
 const d=(event as CustomEvent).detail;
 if(!d||!["AI 导演方案","AI 场景搭建与调整"].includes(d.label)||!/^([0-9a-f-]{36})$/.test(d.id))return;
 if(visible.value)event.preventDefault();
 const previous=billingHistory.value.find(b=>b.id===d.id);
 if(previous){if(previous.state==='pending')Object.assign(previous,{state:d.state,points:Number.isFinite(d.points)?d.points:undefined});persistDraft();return;}
 if(d.id!==billingState.value?.id&&(!busy.value||d.issuedAt<requestStartedAt||!d.issuedAt))return;
 if(billingState.value&&billingState.value.id!==d.id)billingHistory.value.push({...billingState.value});
 if(d.id===billingState.value?.id&&billingState.value?.state!=='pending'&&d.state==='pending')return;
 if(busy.value&&d.issuedAt>=requestStartedAt)callBillingId=d.id;
 billingState.value={id:d.id,state:d.state,points:Number.isFinite(d.points)?d.points:undefined,needsReview:d.state==='pending'&&(busy.value||billingState.value?.needsReview)||false};persistDraft();
}
async function checkReceipt(requestId?:string){
 const id=requestId||billingState.value?.id;if(!id||checkingReceipt.value)return;checkingReceipt.value=true;
 try{checkAccount();const r=await fetch(`/api/billing/receipt/${id}`,{headers:{Authorization:mountedToken},signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('费用查询失败，请稍后核对原请求');const d=(await r.json()).data;if(disposed||localStorage.getItem('token')!==mountedToken)return;
 const bill=billingState.value?.id===id?billingState.value:billingHistory.value.find(b=>b.id===id);if(!bill)return;
 Object.assign(bill,reviewDirectorReceipt(bill,d));persistDraft();
 if(bill.state==='pending'&&bill.needsReview)notice.value='请求状态未确认，可结束本次尝试后重试；费用请到积分明细查看。';
 }catch(e:any){error.value=e.message;}finally{checkingReceipt.value=false;}
}
async function stopBilling(){const id=billingState.value?.id;if(!id||checkingReceipt.value||busy.value)return;checkingReceipt.value=true;
 try{checkAccount();const r=await fetch(`/api/billing/budget/${id}/stop`,{method:'POST',headers:{Authorization:mountedToken},signal:AbortSignal.timeout(10000)});if(!r.ok||(await r.json()).data?.stopped!==true)throw new Error('停止失败，请核对原请求');if(disposed||localStorage.getItem('token')!==mountedToken||billingState.value?.id!==id)return;
 billingState.value={...billingState.value,needsReview:false};persistDraft();error.value='';notice.value='已结束本次尝试，可换模型重新生成。';
 }catch(e:any){error.value=e.message;}finally{checkingReceipt.value=false;}}
function markUncertain(){if(callBillingId&&billingState.value?.id===callBillingId&&billingState.value.state==='pending'){billingState.value={...billingState.value,needsReview:true};void checkReceipt();}}
onMounted(()=>addEventListener('xoi:model-billing-state',billingUpdate));
onUnmounted(()=>removeEventListener('xoi:model-billing-state',billingUpdate));
const model = ref(localStorage.getItem("xo_assistant_model_value") || ""), modelLabel = ref(localStorage.getItem("xo_assistant_model_label") || "");
const activeSkill = computed(() => skills.value.find(s => s.id === skillId.value));
const scene = ref<DirectorScene | null>(null), plan = ref<DirectorPlan | null>(null), planSkill = ref<DirectorSkill | null>(null);
const error = ref(""), notice = ref(""), fingerprint = ref("");
const committedMotion=shallowRef<DirectorSnapshot|null>(null),motionReset=ref(0),lastApplied=ref("");
const appliedShotKeys=ref<string[]>([]),lastShotKeys=ref<string[]>([]);
const shotKey=(shot:DirectorShot)=>JSON.stringify(shot);
const undoRaw = ref(""), undoFingerprint = ref(""),appliedKind=ref<'scene'|'camera'>('camera'),previewing=ref(false);
let timelineClearId="";
let controller: AbortController | null = null;
let disposed = false,requestTimer:ReturnType<typeof setTimeout>|undefined;
const mountedToken = localStorage.getItem("token") || "";
function checkAccount() {
  if (!mountedToken || localStorage.getItem("token") !== mountedToken) throw new Error("账号已切换，请重新打开导演台");
}
const undoStorageKey=()=>`xoi_director_scene_undo_v1:u${props.ownerId}:${props.projectId}`;
function persistUndo(){
 if(!undoRaw.value){localStorage.removeItem(undoStorageKey());return;}
 try{localStorage.setItem(undoStorageKey(),JSON.stringify({raw:undoRaw.value,fingerprint:undoFingerprint.value,kind:appliedKind.value,name:lastApplied.value,feedback:appliedFeedback.value}));}
 catch{throw new Error('无法保存撤销备份，请先导出工程或释放浏览器存储后再应用');}
}
const storageKey = () => `xoi_director_skill_plan_v1:u${props.ownerId}:${props.projectId}`;
const requestPlaceholder = computed(() => mode.value === "blocking-ai" ? "例如：让所选人物先向右走 2 米，再转向远处走 1 米，其他人物保持原样。" : mode.value === "build" ? "例如：搭一个两人在桌边对峙的场景，主角坐左边，镜头拍到两人。" : mode.value === "adjust" ? "例如：把桌子移到两人中间，人物保持原位，灯光柔和一些。" : skillId.value === "seedance-previz-to-render" ? "例如：保持这段白模机位和动作，设计雨夜电影感的材质与光影方案" : "例如：两人在桌边对峙，先展示空间关系，再推进到主角的情绪变化");
function sendWorkspace(type:string){props.getIframe()?.contentWindow?.postMessage({source:"xoi-director",type,projectId:props.projectId},location.origin);}
function returnEditing(){previewing.value=false;sendWorkspace("end-preview");}
async function openPanel(){visible.value=true;if(document.getElementById("xoi-billing-notice")?.dataset.billingId===billingState.value?.id)document.getElementById("xoi-billing-notice")?.remove();try{const snapshot=await captureDirectorScene(props.getIframe(),props.projectId,props.ownerId,props.projectName);liveScene.value=snapshot.scene;}catch{}if(billingState.value?.state==='pending')void checkReceipt();}
function closePanel(){
  controller?.abort();returnEditing();visible.value=false;
}
const taskDrafts:Record<string,string>={};
function selectMode(next:typeof mode.value){
  if(next===mode.value)return;
  taskDrafts[mode.value]=intent.value;returnEditing();error.value="";notice.value="";
  mode.value=next;intent.value=taskDrafts[next]||"";
}
function replayApplied(){if(!busy.value&&!applying.value){previewing.value=true;sendWorkspace(appliedKind.value==='scene'&&lastApplied.value==='人物走位'?"play-blocking":"play-camera");}}
function startRequest(){
  const next=new AbortController();controller=next;
  requestStartedAt=Date.now();callBillingId="";
  requestTimer=setTimeout(()=>next.abort(),120_000);return next;
}
function finishRequest(){clearTimeout(requestTimer);controller=null;busy.value=false;}
function handleEscape(event:KeyboardEvent){if(event.key==="Escape"&&visible.value){event.preventDefault();closePanel();}}
onMounted(()=>addEventListener("keydown",handleEscape));
onUnmounted(()=>{removeEventListener("keydown",handleEscape);clearTimeout(requestTimer);returnEditing();});
function selectSkill(id: string) { skillId.value = id; }
function persistDraft() {
  try { localStorage.setItem(storageKey(), JSON.stringify({ skillId: skillId.value, intent: intent.value, shotCount: shotCount.value, model: model.value, modelLabel: modelLabel.value, plan: plan.value, planSkillId: planSkill.value?.id, scene: scene.value, fingerprint: fingerprint.value, mode:mode.value, actionPlan:actionPlan.value,actionPlanScope:actionPlanScope.value, conversation:conversation.value,durationInput:durationInput.value,subjectId:subjectId.value,groundNewObjects:groundNewObjects.value,billingState:billingState.value,billingHistory:billingHistory.value,actionPlanFresh:actionPlanFresh.value })); } catch {}
}
watch([skillId, intent, shotCount, model, modelLabel, mode, actionPlan, actionPlanScope, conversation,durationInput,subjectId,groundNewObjects,billingState,billingHistory], persistDraft);
onMounted(async () => {
  try{const backup=JSON.parse(localStorage.getItem(undoStorageKey())||'null');
    if(backup&&typeof backup.raw==='string'&&backup.raw.length<=8_000_000&&typeof backup.fingerprint==='string'){
      undoRaw.value=backup.raw;undoFingerprint.value=backup.fingerprint;appliedKind.value=backup.kind==='scene'?'scene':'camera';lastApplied.value=typeof backup.name==='string'?backup.name:'';appliedFeedback.value=typeof backup.feedback==='string'?backup.feedback:'';
    }
  }catch{}
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()) || "null");
    if (saved) {
      if(Number.isInteger(saved.durationInput)&&saved.durationInput>=1&&saved.durationInput<=60)durationInput.value=saved.durationInput;
      if(typeof saved.subjectId==='string')subjectId.value=saved.subjectId;
      if(typeof saved.groundNewObjects==='boolean')groundNewObjects.value=saved.groundNewObjects;
      // “清空后重搭”是一次性破坏性选择，刷新或再次打开时永不沿用旧值。
      buildFromEmpty.value=false;
      actionPlanFresh.value=saved.actionPlanFresh===true;
      if(Array.isArray(saved.billingHistory))billingHistory.value=saved.billingHistory.filter((b:any)=>/^[0-9a-f-]{36}$/.test(b?.id)&&['pending','recorded','not_submitted'].includes(b.state));
      if(saved.billingState&&/^[0-9a-f-]{36}$/.test(saved.billingState.id)&&['pending','recorded','not_submitted'].includes(saved.billingState.state))billingState.value={id:saved.billingState.id,state:saved.billingState.state,points:saved.billingState.points,needsReview:saved.billingState.state==='pending'};
      if (DIRECTOR_SKILLS.some(s => s.id === saved.skillId)) skillId.value = saved.skillId;
      intent.value = typeof saved.intent === "string" ? saved.intent.slice(0, 12000) : "";
      if ([1, 3, 6].includes(saved.shotCount)) shotCount.value = saved.shotCount;
      if (typeof saved.model === "string") model.value = saved.model;
      if (typeof saved.modelLabel === "string") modelLabel.value = saved.modelLabel;
      if(["build-local","build","adjust","blocking","blocking-ai","presets","camera"].includes(saved.mode))mode.value=saved.mode;
      if(Array.isArray(saved.conversation))conversation.value=saved.conversation.slice(-6).filter((m:any)=>["user","assistant"].includes(m?.role)&&typeof m.content==="string"&&m.content.length<=3000);
      if(saved.actionPlan){
        const savedScene=validateDirectorScene(saved.scene);
        if(savedScene.projectId!==props.projectId||typeof saved.fingerprint!=="string")throw new Error("场景不匹配");
        actionPlanScope.value=saved.actionPlanScope==='blocking'?'blocking':'scene';actionPlan.value=actionPlanScope.value==='blocking'?validateBlockingPlan(saved.actionPlan,savedScene.objects,saved.subjectId||undefined):validateSceneActionPlan(saved.actionPlan,savedScene.objects);scene.value=savedScene;fingerprint.value=saved.fingerprint;
      }
      const selected = DIRECTOR_SKILLS.find(s => s.id === saved.planSkillId);
      if (saved.plan && selected) {
        const savedScene = validateDirectorScene(saved.scene);
        const savedPlan = validateDirectorPlan(saved.plan, selected);
        if (savedScene.projectId !== props.projectId || typeof saved.fingerprint !== "string") throw new Error("场景不匹配");
        scene.value = savedScene; plan.value = savedPlan; planSkill.value = selected; fingerprint.value = saved.fingerprint;
      }
    }
  } catch {}
  try {
    const res = await fetch("/api/aiAssistant/director/skills", { headers: { Authorization: localStorage.getItem("token") || "" } });
    const data = await res.json();
    if (!disposed && res.ok && Array.isArray(data.data)) skills.value = data.data;
  } catch { if (!disposed) error.value = "技能目录读取失败，请检查本地服务并重新打开"; }
});
onUnmounted(() => { disposed = true; controller?.abort(); });
async function generatePlan() {
  if (busy.value || applying.value || billingState.value?.needsReview) return;
  busy.value = true; error.value = ""; notice.value = "";
  const token = localStorage.getItem("token") || "";
  const requestController=startRequest();
  try {
    checkAccount();
    const snapshot = await captureDirectorScene(props.getIframe(), props.projectId, props.ownerId, props.projectName);
    liveScene.value=snapshot.scene;
    const durationSeconds=resolveDirectorDuration(intent.value,durationInput.value,snapshot.scene.durationSeconds);
    const response = await fetch("/api/aiAssistant/director/plan", { method: "POST", signal: requestController.signal, headers: { "Content-Type": "application/json", Authorization: token }, body: JSON.stringify({ skillId: skillId.value, intent: intent.value, shotCount: shotCount.value,durationSeconds,subjectId:subjectId.value||undefined, model: model.value || undefined, scene: snapshot.scene }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "导演方案请求失败");
    if (disposed || requestController.signal.aborted || localStorage.getItem("token") !== token) return;
    if (body.data?.projectId !== props.projectId || body.data?.activeShotId !== snapshot.scene.activeShotId) throw new Error("方案与当前场景不匹配，请重新生成");
    const selected = DIRECTOR_SKILLS.find(s => s.id === skillId.value)!;
    const validated = validateDirectorPlan(body.data.plan, selected, shotCount.value);
    appliedShotKeys.value=[];lastShotKeys.value=[];
    plan.value = validated; planSkill.value = selected; scene.value = snapshot.scene; fingerprint.value = snapshot.fingerprint;
    notice.value = "方案已生成，请检查构图与运镜后选择预演或制作";
    persistDraft();if(callBillingId)void checkReceipt();
  } catch (e: any) { markUncertain();if (!disposed) error.value = e.name === "AbortError" ? "已停止等待，原场景和已有方案保留。已提交请求的费用请核对原账单。" : e.message || "方案生成失败"; }
  finally { finishRequest(); }
}
function openMotion(event:MessageEvent) {
  if(event.origin===location.origin&&event.source===props.getIframe()?.contentWindow&&event.data?.source==="monoform"&&event.data?.key===props.projectId&&event.data?.type==="close-assistant"){closePanel();return;}
  if(event.origin !== location.origin || event.source !== props.getIframe()?.contentWindow || event.data?.source !== "monoform" || event.data?.key !== props.projectId || event.data?.type !== "motion-preset" || busy.value || applying.value)return;
  if(!MOTION_PRESETS.some(p=>p.id===event.data.presetId))return;
  selectedPreset.value=event.data.presetId;selectMode("presets");visible.value=true;
}
onMounted(()=>addEventListener("message",openMotion));
onUnmounted(()=>removeEventListener("message",openMotion));
async function timelineMessage(event:MessageEvent){
  const data=event.data,iframe=props.getIframe();
  if(event.origin!==location.origin||event.source!==iframe?.contentWindow||data?.source!=="monoform"||data.key!==props.projectId||!["timeline-cleared","undo-timeline-clear"].includes(data.type)||busy.value||applying.value)return;
  const respond=(status:string,message="")=>iframe?.contentWindow?.postMessage({source:"xoi-director",type:"timeline-clear-state",projectId:props.projectId,id:data.id,status,message},location.origin);
  try{
    checkAccount();
    if(data.type==="undo-timeline-clear"){
      if(data.id!==timelineClearId)throw new Error("已有更新的操作，请使用顶部撤销");
      if(await undoApply()){timelineClearId="";respond("restored");}else respond("stale",error.value);
      return;
    }
    if(typeof data.id!=="string"||data.id.length>60)throw new Error("清空记录无效");
    validateTimelineClear(data.beforeRaw,data.afterRaw,data.kind);
    const snapshot=await captureDirectorScene(iframe,props.projectId,props.ownerId,props.projectName);
    const afterFingerprint=await sceneFingerprint(data.afterRaw,Number(data.frame)||0);
    if(snapshot.fingerprint!==afterFingerprint)throw new Error("工程已继续修改，请使用顶部撤销");
    lastApplied.value="";committedMotion.value=null;
    undoRaw.value=data.beforeRaw;undoFingerprint.value=snapshot.fingerprint;timelineClearId=data.id;persistUndo();
    respond("ready");
  }catch(e:any){respond("stale",e.message||"请使用顶部撤销恢复记录");}
}
onMounted(()=>addEventListener("message",timelineMessage));
onUnmounted(()=>removeEventListener("message",timelineMessage));
async function generateScene() {
  if(busy.value || applying.value || billingState.value?.needsReview || !["build","adjust","blocking-ai"].includes(mode.value))return;
  busy.value=true;error.value="";notice.value="";const requestController=startRequest();
  try {
    checkAccount();
    const snapshot=await captureDirectorScene(props.getIframe(),props.projectId,props.ownerId,props.projectName);
    liveScene.value=snapshot.scene;const durationSeconds=resolveDirectorDuration(intent.value,durationInput.value,snapshot.scene.durationSeconds);
    const fresh=mode.value==='build'&&buildFromEmpty.value;
    const composeScene=fresh?{...snapshot.scene,objects:[],objectPaths:{},cameraKeyframes:[]}:snapshot.scene;
    const request=intent.value.trim(),token=localStorage.getItem("token")||"";
    const response=await fetch("/api/aiAssistant/director/compose",{method:"POST",signal:requestController.signal,headers:{"Content-Type":"application/json",Authorization:token},body:JSON.stringify({task:mode.value==='blocking-ai'?'adjust':mode.value,intent:mode.value==='blocking-ai'?`只设置现有人物的走位与姿势，保留布景、灯光和机位：${request}`:request,durationSeconds,subjectId:fresh?undefined:subjectId.value||undefined,groundNewObjects:groundNewObjects.value,scene:composeScene,history:fresh?[]:conversation.value.slice(-6),model:model.value||undefined})});
    const body=await response.json();if(!response.ok)throw new Error(body.message||"场景方案生成失败");
    if(disposed || requestController.signal.aborted || localStorage.getItem("token")!==token)return;
    if(body.data?.projectId!==props.projectId || body.data?.activeShotId!==snapshot.scene.activeShotId)throw new Error("方案与当前场景不匹配，请重新生成");
    const validatedPlan=mode.value==='blocking-ai'?validateBlockingPlan(body.data.plan,composeScene.objects,subjectId.value||undefined):validateSceneActionPlan(body.data.plan,composeScene.objects);
    actionPlanScope.value=mode.value==='blocking-ai'?'blocking':'scene';actionPlan.value=validatedPlan;actionPlanFresh.value=fresh;
    actionPlan.value.summary=actionPlan.value.summary.replace(/应用为新版本镜头，原镜头保留。?/g,'应用到当前场景，可撤销。');
    scene.value=composeScene;fingerprint.value=snapshot.fingerprint;
    conversation.value=[...conversation.value,{role:"user" as const,content:request.slice(0,3000)},{role:"assistant" as const,content:actionPlan.value.summary.slice(0,3000)}].slice(-6);
    notice.value="方案已生成。检查调整清单后应用，再继续对话调整。";persistDraft();if(callBillingId)void checkReceipt();
  }catch(e:any){markUncertain();if(!disposed)error.value=e.name==="AbortError"?"已停止等待，原场景保留。已提交请求的费用请核对原账单。":e.message||"场景方案生成失败";}
  finally{finishRequest();}
}
async function applyScene() {
  if(!actionPlan.value || busy.value || applying.value)return;
  try {
    checkAccount();const snapshot=await captureDirectorScene(props.getIframe(),props.projectId,props.ownerId,props.projectName);
    if(snapshot.fingerprint!==fingerprint.value)throw new Error("场景已变化，请重新生成调整方案");
    const blocking=mode.value==='blocking-ai';if(actionPlanScope.value!==(blocking?'blocking':'scene'))throw new Error('请在对应步骤应用方案');
    const next=blocking?applyBlockingToCurrent(snapshot.project,actionPlan.value,subjectId.value||undefined):applyCurrentSceneActions(snapshot.project,actionPlan.value,actionPlanFresh.value);
    if(await applyPrepared(next,snapshot.fingerprint,{kind:'scene',name:blocking?'人物走位':actionPlan.value.name,play:blocking})){
      actionPlan.value=null;if(!blocking)subjectId.value='';if(actionPlanFresh.value){taskDrafts.build=intent.value;mode.value='build';intent.value='';}persistDraft();
    }
  }catch(e:any){error.value=e.message;}
}
function describeApplied(project:Record<string,any>){const camera=project.keyframes?.length>1,actors=Object.values(project.objectKeyframes||{}).some((keys:any)=>keys.length>1);return `${project.settings.durationSeconds} 秒 · ${camera?'相机移动': '固定机位'} · ${actors?'人物有动作路线':'人物静态摆位'}`;}
async function applyPrepared(next:Record<string,any>, expected:string,options:{kind:'scene'|'camera';name?:string;replace?:boolean;play?:boolean}={kind:'camera'}) {
  if(busy.value || applying.value)return;
  applying.value=true;error.value="";notice.value="";returnEditing();
  try {
    checkAccount();const snapshot=await captureDirectorScene(props.getIframe(),props.projectId,props.ownerId,props.projectName);
    if(snapshot.fingerprint!==expected)throw new Error("场景或镜头已变化，请重新读取并预览，避免覆盖新修改");
    undoRaw.value=snapshot.raw;undoFingerprint.value="";
    timelineClearId="";appliedKind.value=options.kind;persistUndo();
    const raw=await importDirectorProject(props.getIframe(),props.projectId,props.ownerId,next);
    undoFingerprint.value=await sceneFingerprint(raw);fingerprint.value=undoFingerprint.value;liveScene.value=sceneFromNative(JSON.parse(raw),props.projectId,props.projectName);
    lastShotKeys.value=[];
    lastApplied.value=options.name||next.shots.find((shot:any)=>shot.id===next.activeShotId)?.name||"新镜头";
    appliedFeedback.value=describeApplied(next);
    if(mode.value==="presets"||mode.value==="blocking"||mode.value==="blocking-ai")committedMotion.value={raw,project:JSON.parse(raw),scene:sceneFromNative(JSON.parse(raw),props.projectId,props.projectName),fingerprint:undoFingerprint.value};
    persistUndo();notice.value=options.kind==='scene'?'当前场景已更新，继续摆放或主动试播；可撤销。':options.replace?'当前镜头运镜已更新，可撤销；其他镜头不变。':'已添加独立镜头，原镜头保留。';
    if((options.kind==='camera'||options.play)&&visible.value){previewing.value=true;props.getIframe()?.contentWindow?.postMessage({source:"xoi-director",type:options.play?'play-blocking':'play-camera',projectId:props.projectId},location.origin);}
    return true;
  }catch(e:any){
    if(undoRaw.value&&!undoFingerprint.value){const current=localStorage.getItem(`monoform-project-${props.projectId}`);if(current)undoFingerprint.value=await sceneFingerprint(current);}
    error.value=e.message||"应用失败";
    return false;
  }finally{applying.value=false;}
}
async function applyShots(shots: DirectorShot[]) {
  if (busy.value || applying.value || shots.some(shot=>appliedShotKeys.value.includes(shotKey(shot)))) return;
  applying.value = true; error.value = ""; notice.value = "";
  try {
    checkAccount();
    const snapshot = await captureDirectorScene(props.getIframe(), props.projectId, props.ownerId, props.projectName);
    if (snapshot.fingerprint !== fingerprint.value) throw new Error("场景或当前镜头已变化，请重新生成方案后应用，避免覆盖新修改");
    const next = appendDirectorShots(snapshot.project, shots);
    undoRaw.value = snapshot.raw; undoFingerprint.value = "";
    timelineClearId="";appliedKind.value='camera';persistUndo();
    returnEditing();
    const raw = await importDirectorProject(props.getIframe(), props.projectId, props.ownerId, next);
    undoFingerprint.value = await sceneFingerprint(raw);
    fingerprint.value = undoFingerprint.value;
    lastShotKeys.value=shots.map(shotKey);appliedShotKeys.value.push(...lastShotKeys.value);
    lastApplied.value=shots.map(s=>s.name).join("、");
    notice.value = `已添加 ${shots.length} 个预演镜头；原镜头、演员和动作保留，可在时间轴播放`;
    appliedFeedback.value=describeApplied(next);persistUndo();if(visible.value)sendWorkspace("play-camera");
    // 已有演员与动作保持不变，更新版本后可继续添加本轮的其他机位。
  } catch (e: any) {
    if (undoRaw.value && !undoFingerprint.value) {
      const current = localStorage.getItem(`monoform-project-${props.projectId}`);
      if (current) undoFingerprint.value = await sceneFingerprint(current);
    }
    error.value = e.message || "应用失败";
  }
  finally { applying.value = false; }
}
async function undoApply() {
  if (busy.value || applying.value || !undoRaw.value) return;
  applying.value = true; error.value = "";returnEditing();
  try {
    checkAccount();
    const snapshot = await captureDirectorScene(props.getIframe(), props.projectId, props.ownerId, props.projectName);
    if (!undoFingerprint.value || snapshot.fingerprint !== undoFingerprint.value) throw new Error("场景已继续修改，不能用旧备份覆盖；请先保存工程并使用导演台编辑工具调整");
    const raw = await importDirectorProject(props.getIframe(), props.projectId, props.ownerId, JSON.parse(undoRaw.value));
    fingerprint.value = await sceneFingerprint(raw);liveScene.value=sceneFromNative(JSON.parse(raw),props.projectId,props.projectName); undoRaw.value = ""; undoFingerprint.value = "";persistUndo();
    appliedShotKeys.value=appliedShotKeys.value.filter(key=>!lastShotKeys.value.includes(key));lastShotKeys.value=[];
    lastApplied.value="";committedMotion.value=null;motionReset.value++;
    notice.value = "已撤销本次操作，恢复原镜头与场景";
    return true;
  } catch (e: any) { error.value = e.message;return false; }
  finally { applying.value = false; }
}
function planText() {
  if (!plan.value || !scene.value) return "";
  return `${props.projectName} · ${planSkill.value?.name}\n${plan.value.summary}\n\n${plan.value.shots.map((s, i) => `${i + 1}. ${s.name}\n构图：${s.framing}\n运镜：${s.movement}\n调度：${s.blocking}\n表演：${s.performance}\n光影：${s.lighting}\n衔接：${s.transition}\n提示词：${s.prompt}`).join("\n\n")}\n\n成片提示词：\n${plan.value.renderPrompt}\n\n假设与限制：\n${[...plan.value.assumptions, ...plan.value.warnings].join("\n")}\n原预演：${scene.value.durationSeconds} 秒，${scene.value.fps}fps，${scene.value.aspectRatio}。需保留精确调度时，请导出白模视频并上传为参考。`;
}
async function copyPlan() { try { await navigator.clipboard.writeText(planText()); notice.value = "已复制完整镜头方案"; } catch { error.value = "复制失败，请展开提示词手动复制"; } }
async function sendToCanvas() {
  if (!plan.value || !scene.value || busy.value || applying.value) return;
  applying.value=true;error.value='';returnEditing();
  try {
    checkAccount();
    if(!lastApplied.value||appliedKind.value!=='camera')throw new Error('请先应用并检查镜头');
    const {graph}=await directorShotPackage(props.getIframe(),props.projectId,props.ownerId,props.projectName,plan.value.renderPrompt);
    checkAccount();if(disposed)return;
    localStorage.setItem("xoi_canvas_graph_v1",JSON.stringify(graph));
    sessionStorage.setItem("xoi_director_return_scene_v1", props.projectId);
    await router.push({ path: "/canvas", query: { source: "xoi", graph: "1", from: "director3d" } });
  } catch(e:any) { error.value=e.message||"画布交接数据保存失败，请先复制方案"; }
  finally{applying.value=false;}
}

</script>

<style scoped>
.director-skills-entry{position:absolute;right:16px;top:76px;z-index:25;color:#ece9e0;font:13px "PingFang SC",sans-serif;display:flex;flex-direction:column;align-items:flex-end}
.director-skills-entry.is-rail{right:72px;top:10px;z-index:42}
.skills-trigger{padding:9px 13px;border:1px solid #494139;border-radius:10px;background:#2b2724;color:#ffb27a;box-shadow:0 6px 22px #0006;cursor:pointer;font-weight:600}
.skills-trigger:hover{border-color:#6b5b4a;background:#332e2a}
.skills-trigger span{margin-left:8px;color:#a2968a;font-size:11px}
.skills-panel{width:min(420px,calc(100vw - 120px));max-height:calc(100vh - 165px);overflow:auto;margin-top:8px;padding:18px;border:1px solid #3d3833;border-radius:14px;background:#232120;color:#ece9e0;box-shadow:0 18px 48px #0009;box-sizing:border-box}
.skills-panel header{display:flex;justify-content:space-between;align-items:center;gap:8px}
.skills-panel header small{color:#9a8f84}
.skills-panel h2{margin:5px 0;font-size:19px;color:#f2efe9}
.skills-panel header button{border:0;background:none;color:#9a8f84;font-size:22px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px}
.skills-panel header button:hover{background:#35302b;color:#f2efe9}
.skills-intro,.skill-description,.billing-note,.plan-boundary{color:#a2968a;font-size:12px;line-height:1.6}
.skills-list{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}
.skills-list button{padding:7px 9px;border:1px solid #453d36;border-radius:8px;background:#2c2825;color:#c9bfb4;cursor:pointer;font-size:12px}
.skills-list button:hover{border-color:#6b5b4a;color:#f2efe9}
.skills-list button.selected{background:#f57400;color:#231a12;border-color:#f57400;font-weight:600}
.skills-list button small{margin-left:4px}
.request-label{display:block;margin:10px 0 6px;font-weight:600;color:#d8d0c6}
.skills-panel textarea{width:100%;min-height:94px;resize:vertical;border:1px solid #453d36;border-radius:9px;padding:10px;box-sizing:border-box;font:inherit;line-height:1.6;background:#1c1a18;color:#ece9e0}
.skills-panel textarea::placeholder{color:#7d7268}
.skill-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
.skill-controls label{white-space:nowrap;color:#a2968a}
.skill-controls select{padding:5px;border:1px solid #453d36;border-radius:6px;background:#1c1a18;color:#ece9e0}
.skill-controls :deep(.t-select__wrap){max-width:230px}
.scene-meta{font-size:11px;color:#8c8074}
.primary-actions,.result-actions{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}
.skills-panel .primary-actions button,.skills-panel .result-actions button,.shot-proposal>button{padding:9px 11px;border:1px solid #4d443b;border-radius:8px;background:#2c2825;color:#d8d0c6;cursor:pointer;font:inherit}
.skills-panel .primary-actions button:hover,.skills-panel .result-actions button:hover{border-color:#6b5b4a;color:#f2efe9}
.primary-actions button:first-child{background:#f57400;color:#231a12;border-color:#f57400;font-weight:600}
.skills-panel button:disabled{opacity:.45;cursor:not-allowed}
.skill-error{color:#ff9d8a;font-size:12px;line-height:1.6}
.skill-notice{color:#8fd3a8;font-size:12px;line-height:1.6}
.plan-results{border-top:1px solid #3a342e;margin-top:14px;padding-top:10px}
.plan-results h3{font-size:15px;color:#f2efe9}
.plan-results h3 small{display:block;margin-top:5px;color:#8c8074;font-size:11px;font-weight:400}
.plan-results p,.plan-notes{font-size:12px;line-height:1.7}
.plan-notes{padding-left:18px;color:#9a8f84}
.plan-boundary{padding:8px;background:#2c2825;border-radius:8px}
.shot-proposal{border:1px solid #3d3833;border-radius:10px;padding:12px;margin:10px 0;background:#262322}
.shot-proposal h4{margin:0 0 5px;color:#f2efe9}
.shot-proposal dl{margin:10px 0;font-size:12px;line-height:1.7}
.shot-proposal dt{color:#8c8074;margin-top:7px}
.shot-proposal dd{margin:0}
.prompt-text{white-space:pre-wrap;overflow-wrap:anywhere}
.plan-results summary{cursor:pointer;color:#c9a887;font-size:12px;margin:8px 0}
@media(max-width:760px){.director-skills-entry{right:8px;top:68px}.skills-panel{width:calc(100vw - 96px);padding:13px;max-height:calc(100vh - 150px)}}
</style>

<style scoped>
.director-review-controls{display:grid;grid-template-columns:100px minmax(0,1fr);gap:8px;margin:12px 0}.director-review-controls label{display:grid;gap:6px;font-size:12px}.director-review-controls input[type=number],.director-review-controls select{width:100%;min-width:0;box-sizing:border-box;padding:7px;border:1px solid #a991733f;border-radius:6px;background:transparent;color:inherit;font:inherit}.director-review-controls .ground-setting{grid-column:1/-1;display:flex;align-items:center}.director-review-controls small{grid-column:1/-1;line-height:1.5;opacity:.7}.director-billing-state{padding:9px 11px;border:1px solid #c9ab872e;border-radius:7px;font-size:12px;line-height:1.6}.director-billing-state button{margin-left:6px;border:0;background:transparent;color:inherit;text-decoration:underline;cursor:pointer}.director-billing-state small{display:block;opacity:.75}
</style>

<style scoped>.director-billing-state a{margin-left:6px;color:inherit;text-underline-offset:3px;font-size:11px}</style>

<style scoped>
.scene-starters{margin:12px 0 18px;padding:12px;border:1px solid #a9917338;border-radius:10px;background:#b98b5810}.starter-heading{display:flex;justify-content:space-between;align-items:center;gap:8px}.starter-heading small,.starter-boundary{font-size:11px;opacity:.7}.starter-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:10px 0}.starter-grid button{display:grid;gap:4px;padding:10px;text-align:left;border:1px solid #a9917338;border-radius:7px;background:transparent;color:inherit;cursor:pointer}.starter-grid button[aria-pressed=true]{border-color:#d4925c;background:#d4925c20}.starter-grid strong{font-size:13px}.starter-grid small{font-size:11px;opacity:.65}.scene-starters p{font-size:12px;line-height:1.6;margin:8px 0}.use-scene-preset{width:100%;padding:9px;border:1px solid #b9865c;border-radius:7px;background:#b9865c26;color:inherit;cursor:pointer;font:inherit}.starter-boundary{display:block;margin-top:7px}.fresh-scene-setting{display:flex;align-items:center;gap:5px;font-size:12px;margin:12px 0}.director-advanced{margin:10px 0}.director-advanced>summary,.director-billing-history>summary{cursor:pointer;font-size:11px;line-height:1.6;opacity:.75}.director-billing-history{margin:10px 0}.director-billing-history>div{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0}.director-billing-history button{border:0;background:transparent;color:inherit;text-decoration:underline;cursor:pointer}
</style>

<style scoped>.reference-setting{display:flex;align-items:flex-start;gap:6px;margin:12px 0;font-size:12px;line-height:1.6}.director-billing-state{display:flex;align-items:center;flex-wrap:wrap;justify-content:space-between;gap:5px;border:0;border-top:1px solid #a9917335;padding:8px 0;color:inherit}.director-billing-state a{white-space:nowrap}.director-billing-state span{font-size:11px;opacity:.75}</style>
