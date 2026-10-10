<template>
  <div class="director-skills-entry">
    <button class="skills-trigger" type="button" :aria-expanded="visible" @click="visible = !visible">✦ 导演技能 <span>{{ visible ? '收起' : '7 项' }}</span></button>
    <section v-if="visible" class="skills-panel" aria-label="导演技能助手">
      <header><div><small>当前场景 · {{ projectName }}</small><h2>把创意变成镜头</h2></div><button type="button" aria-label="关闭导演技能" @click="visible = false">×</button></header>
      <p class="skills-intro">读取本场景的演员、机位与关键帧，先生成方案，再选择预演或制作。</p>
      <div class="skills-list" role="group" aria-label="选择导演技能">
        <button v-for="skill in skills" :key="skill.id" type="button" :disabled="busy || applying || skill.available === false" :aria-pressed="skillId === skill.id" :class="{ selected: skillId === skill.id }" :title="skill.description" @click="selectSkill(skill.id)">{{ skill.name }}<small v-if="skill.available === false">未导入</small></button>
      </div>
      <p class="skill-description">{{ activeSkill?.description }}</p>
      <label class="request-label" for="director-skill-request">导演需求</label>
      <textarea id="director-skill-request" v-model="intent" maxlength="12000" :disabled="busy || applying" :placeholder="requestPlaceholder"></textarea>
      <div class="skill-controls"><label>方案镜头数 <select v-model.number="shotCount" :disabled="busy || applying"><option :value="1">1 个</option><option :value="3">3 个</option><option :value="6">6 个</option></select></label><model-select v-model="model" v-model:label="modelLabel" :type="'text'" :showIcon="false" :showAdd="false" :disabled="busy || applying" /></div>
      <p v-if="scene" class="scene-meta">已读取 {{ scene.objects.length }} 个物体 · {{ scene.shotNames.length }} 个镜头 · 每镜 {{ scene.durationSeconds }} 秒 · {{ scene.aspectRatio }}</p>
      <div class="primary-actions"><button type="button" :disabled="busy || applying || !intent.trim() || activeSkill?.available === false" @click="generatePlan">{{ busy ? '正在生成方案…' : '读取场景并生成方案' }}</button><button v-if="busy" type="button" @click="controller?.abort()">停止</button><button v-if="undoRaw" type="button" :disabled="busy || applying" @click="undoApply">撤销本次添加</button></div>
      <p class="billing-note">生成方案调用所选文本模型，按用量结算。应用预演镜头不调用媒体模型。</p>
      <p v-if="error" class="skill-error" role="alert">{{ error }}</p>
      <p v-if="notice" class="skill-notice" role="status">{{ notice }}</p>
      <article v-if="plan" class="plan-results">
        <h3>镜头方案 <small>{{ planSkill?.name }}</small></h3><p>{{ plan.summary }}</p>
        <ul v-if="plan.assumptions.length" class="plan-notes"><li v-for="item in plan.assumptions" :key="item">假设：{{ item }}</li></ul>
        <ul v-if="plan.warnings.length" class="plan-notes"><li v-for="item in plan.warnings" :key="item">{{ item }}</li></ul>
        <p class="plan-boundary">预演只添加相机路径；演员调度、微表情、灯光精修和转场仍是制作建议。</p>
        <section v-for="(shot, index) in plan.shots" :key="index" class="shot-proposal">
          <h4>{{ String(index + 1).padStart(2, '0') }} · {{ shot.name }}</h4><p>{{ shot.purpose }}</p>
          <dl><dt>构图 / 运镜</dt><dd>{{ shot.framing }} · {{ shot.movement }}</dd><dt>调度 / 表演</dt><dd>{{ shot.blocking }} · {{ shot.performance }}</dd><dt>光影 / 衔接</dt><dd>{{ shot.lighting }} · {{ shot.transition }}</dd></dl>
          <details><summary>查看镜头提示词</summary><p class="prompt-text">{{ shot.prompt }}</p></details>
          <button v-if="shot.camera && planSkill?.canApplyCamera" type="button" :disabled="busy || applying" @click="applyShots([shot])">{{ applying ? '正在应用…' : '添加为预演镜头' }}</button>
        </section>
        <details><summary>成片 / 精修提示词</summary><p class="prompt-text">{{ plan.renderPrompt }}</p></details>
        <div class="result-actions"><button type="button" :disabled="busy || applying" @click="copyPlan">复制完整方案</button><button type="button" :disabled="busy || applying" @click="sendToCanvas">带入画布制作 →</button></div>
        <small class="billing-note">带入画布会创建文字与视频配置节点；点击生成后才执行媒体制作。精修请另导出白模截图或录像作为参考。</small>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import ModelSelect from "@/components/modelSelect.vue";
import { DIRECTOR_SKILLS, validateDirectorPlan, validateDirectorScene, type DirectorPlan, type DirectorScene, type DirectorShot, type DirectorSkill } from "../../../../shared/directorSkills";
import { appendDirectorShots, captureDirectorScene, importDirectorProject, sceneFingerprint } from "@/utils/directorScene";

const props = defineProps<{ projectId: string; ownerId: string; projectName: string; getIframe: () => HTMLIFrameElement | null }>();
const router = useRouter();
const visible = ref(false), busy = ref(false), applying = ref(false);
const skills = ref<DirectorSkill[]>(DIRECTOR_SKILLS.map(s => ({ ...s })));
const skillId = ref(DIRECTOR_SKILLS[0].id), intent = ref(""), shotCount = ref(3);
const model = ref(localStorage.getItem("xo_assistant_model_value") || ""), modelLabel = ref(localStorage.getItem("xo_assistant_model_label") || "");
const activeSkill = computed(() => skills.value.find(s => s.id === skillId.value));
const scene = ref<DirectorScene | null>(null), plan = ref<DirectorPlan | null>(null), planSkill = ref<DirectorSkill | null>(null);
const error = ref(""), notice = ref(""), fingerprint = ref("");
const undoRaw = ref(""), undoFingerprint = ref("");
let controller: AbortController | null = null;
let disposed = false;
const mountedToken = localStorage.getItem("token") || "";
function checkAccount() {
  if (!mountedToken || localStorage.getItem("token") !== mountedToken) throw new Error("账号已切换，请重新打开导演台");
}
const storageKey = () => `xoi_director_skill_plan_v1:u${props.ownerId}:${props.projectId}`;
const requestPlaceholder = computed(() => skillId.value === "seedance-previz-to-render" ? "例如：保持这段白模机位和动作，设计雨夜电影感的材质与光影方案" : "例如：两人在桌边对峙，先展示空间关系，再推进到主角的情绪变化");
function selectSkill(id: string) { skillId.value = id; }
function persistDraft() {
  try { localStorage.setItem(storageKey(), JSON.stringify({ skillId: skillId.value, intent: intent.value, shotCount: shotCount.value, model: model.value, modelLabel: modelLabel.value, plan: plan.value, planSkillId: planSkill.value?.id, scene: scene.value, fingerprint: fingerprint.value })); } catch {}
}
watch([skillId, intent, shotCount, model, modelLabel], persistDraft);
onMounted(async () => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()) || "null");
    if (saved) {
      if (DIRECTOR_SKILLS.some(s => s.id === saved.skillId)) skillId.value = saved.skillId;
      intent.value = typeof saved.intent === "string" ? saved.intent.slice(0, 12000) : "";
      if ([1, 3, 6].includes(saved.shotCount)) shotCount.value = saved.shotCount;
      if (typeof saved.model === "string") model.value = saved.model;
      if (typeof saved.modelLabel === "string") modelLabel.value = saved.modelLabel;
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
  if (busy.value || applying.value) return;
  busy.value = true; error.value = ""; notice.value = "";
  const token = localStorage.getItem("token") || "";
  controller = new AbortController();
  try {
    checkAccount();
    const snapshot = await captureDirectorScene(props.getIframe(), props.projectId, props.ownerId, props.projectName);
    const response = await fetch("/api/aiAssistant/director/plan", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json", Authorization: token }, body: JSON.stringify({ skillId: skillId.value, intent: intent.value, shotCount: shotCount.value, model: model.value || undefined, scene: snapshot.scene }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "导演方案请求失败");
    if (disposed || localStorage.getItem("token") !== token) return;
    if (body.data?.projectId !== props.projectId || body.data?.activeShotId !== snapshot.scene.activeShotId) throw new Error("方案与当前场景不匹配，请重新生成");
    const selected = DIRECTOR_SKILLS.find(s => s.id === skillId.value)!;
    const validated = validateDirectorPlan(body.data.plan, selected, shotCount.value);
    plan.value = validated; planSkill.value = selected; scene.value = snapshot.scene; fingerprint.value = snapshot.fingerprint;
    notice.value = "方案已生成，请检查构图与运镜后选择预演或制作";
    persistDraft();
  } catch (e: any) { if (!disposed) error.value = e.name === "AbortError" ? "已停止本次方案生成" : e.message || "方案生成失败"; }
  finally { busy.value = false; controller = null; }
}
async function applyShots(shots: DirectorShot[]) {
  if (busy.value || applying.value) return;
  applying.value = true; error.value = ""; notice.value = "";
  try {
    checkAccount();
    const snapshot = await captureDirectorScene(props.getIframe(), props.projectId, props.ownerId, props.projectName);
    if (snapshot.fingerprint !== fingerprint.value) throw new Error("场景或当前镜头已变化，请重新生成方案后应用，避免覆盖新修改");
    const next = appendDirectorShots(snapshot.project, shots);
    undoRaw.value = snapshot.raw; undoFingerprint.value = "";
    const raw = await importDirectorProject(props.getIframe(), props.projectId, props.ownerId, next);
    undoFingerprint.value = await sceneFingerprint(raw);
    fingerprint.value = undoFingerprint.value;
    notice.value = `已添加 ${shots.length} 个预演镜头；原镜头、演员和动作保留，可在时间轴播放`;
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
  applying.value = true; error.value = "";
  try {
    checkAccount();
    const snapshot = await captureDirectorScene(props.getIframe(), props.projectId, props.ownerId, props.projectName);
    if (undoFingerprint.value && snapshot.fingerprint !== undoFingerprint.value) throw new Error("场景已继续修改，不能用旧备份覆盖；请先保存工程并使用导演台编辑工具调整");
    const raw = await importDirectorProject(props.getIframe(), props.projectId, props.ownerId, JSON.parse(undoRaw.value));
    fingerprint.value = await sceneFingerprint(raw); undoRaw.value = ""; undoFingerprint.value = "";
    notice.value = "已撤销本次添加，恢复原镜头与场景";
  } catch (e: any) { error.value = e.message; }
  finally { applying.value = false; }
}
function planText() {
  if (!plan.value || !scene.value) return "";
  return `${props.projectName} · ${planSkill.value?.name}\n${plan.value.summary}\n\n${plan.value.shots.map((s, i) => `${i + 1}. ${s.name}\n构图：${s.framing}\n运镜：${s.movement}\n调度：${s.blocking}\n表演：${s.performance}\n光影：${s.lighting}\n衔接：${s.transition}\n提示词：${s.prompt}`).join("\n\n")}\n\n成片提示词：\n${plan.value.renderPrompt}\n\n假设与限制：\n${[...plan.value.assumptions, ...plan.value.warnings].join("\n")}\n原预演：${scene.value.durationSeconds} 秒，${scene.value.fps}fps，${scene.value.aspectRatio}。需保留精确调度时，请导出白模视频并上传为参考。`;
}
async function copyPlan() { try { await navigator.clipboard.writeText(planText()); notice.value = "已复制完整镜头方案"; } catch { error.value = "复制失败，请展开提示词手动复制"; } }
function sendToCanvas() {
  if (!plan.value || !scene.value || busy.value || applying.value) return;
  try {
    checkAccount();
    const textNodes = plan.value.shots.map((s, i) => ({ id: crypto.randomUUID(), type: "text", x: 80 + i * 660, y: 360, w: 320, h: 240, data: { label: s.name, content: s.prompt } }));
    const configs = plan.value.shots.map((s, i) => ({ id: crypto.randomUUID(), type: "videoConfig", x: 420 + i * 660, y: 360, w: 280, h: 240, data: { label: `${s.name} · 视频制作`, prompt: s.prompt, duration: scene.value!.durationSeconds, ratio: scene.value!.aspectRatio } }));
    localStorage.setItem("xoi_canvas_graph_v1", JSON.stringify({ title: `${props.projectName} · 镜头方案`, nodes: [
      { id: crypto.randomUUID(), type: "text", x: 80, y: 40, w: 620, h: 260, data: { label: "导演方案与精修提示词", content: planText() } }, ...textNodes, ...configs,
    ], edges: textNodes.map((n, i) => ({ s: n.id, t: configs[i].id })) }));
    sessionStorage.setItem("xoi_director_return_scene_v1", props.projectId);
    // graph 无顶层 prompt：只建立可审阅节点，不提交 pendingAgentRequest。
    void router.push({ path: "/canvas", query: { source: "xoi", graph: "1", from: "director3d" } });
  } catch { error.value = "画布交接数据保存失败，请先复制方案"; }
}
</script>

<style scoped>
.director-skills-entry{position:absolute;left:16px;top:76px;z-index:25;color:#34302d;font:13px "PingFang SC",sans-serif}.skills-trigger{padding:10px 14px;border:1px solid #e4d6c5;border-radius:12px;background:#fff8ed;color:#704e29;box-shadow:0 4px 18px #0002;cursor:pointer;font-weight:650}.skills-trigger span{margin-left:8px;color:#9b8060;font-size:11px}.skills-panel{width:min(420px,calc(100vw - 120px));max-height:calc(100vh - 165px);overflow:auto;margin-top:8px;padding:18px;border:1px solid #e6ddd2;border-radius:16px;background:#fffcf7;box-shadow:0 12px 45px #0003;box-sizing:border-box}.skills-panel header{display:flex;justify-content:space-between;align-items:center}.skills-panel header small{color:#8e8072}.skills-panel h2{margin:5px 0;font-size:20px}.skills-panel header button{border:0;background:none;font-size:24px;cursor:pointer}.skills-intro,.skill-description,.billing-note,.plan-boundary{color:#897968;font-size:12px;line-height:1.6}.skills-list{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.skills-list button{padding:7px 9px;border:1px solid #e4dcd2;border-radius:9px;background:#fff;color:#5c5146;cursor:pointer;font-size:12px}.skills-list button.selected{background:#6b4b2c;color:#fff;border-color:#6b4b2c}.skills-list button small{margin-left:4px}.request-label{display:block;margin:10px 0 6px;font-weight:600}.skills-panel textarea{width:100%;min-height:94px;resize:vertical;border:1px solid #ddd3c7;border-radius:10px;padding:10px;box-sizing:border-box;font:inherit;line-height:1.6;background:#fff;color:inherit}.skill-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}.skill-controls label{white-space:nowrap}.skill-controls select{padding:5px;border:1px solid #ded4c7;border-radius:6px}.skill-controls :deep(.t-select__wrap){max-width:230px}.scene-meta{font-size:11px;color:#8c765d}.primary-actions,.result-actions{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}.skills-panel .primary-actions button,.skills-panel .result-actions button,.shot-proposal>button{padding:9px 11px;border:1px solid #daccb9;border-radius:9px;background:#fff;color:#624629;cursor:pointer;font:inherit}.primary-actions button:first-child{background:#6b4b2c;color:#fff;border-color:#6b4b2c}.skills-panel button:disabled{opacity:.5;cursor:not-allowed}.skill-error{color:#b33e2e;font-size:12px;line-height:1.6}.skill-notice{color:#40704d;font-size:12px;line-height:1.6}.plan-results{border-top:1px solid #e6dbce;margin-top:14px;padding-top:10px}.plan-results h3{font-size:16px}.plan-results h3 small{display:block;margin-top:5px;color:#947c61;font-size:11px;font-weight:400}.plan-results p,.plan-notes{font-size:12px;line-height:1.7}.plan-notes{padding-left:18px;color:#8e7559}.plan-boundary{padding:8px;background:#f3ebdf;border-radius:8px}.shot-proposal{border:1px solid #e6dbcc;border-radius:12px;padding:12px;margin:10px 0;background:#fff}.shot-proposal h4{margin:0 0 5px}.shot-proposal dl{margin:10px 0;font-size:12px;line-height:1.7}.shot-proposal dt{color:#93775a;margin-top:7px}.shot-proposal dd{margin:0}.prompt-text{white-space:pre-wrap;overflow-wrap:anywhere}.plan-results summary{cursor:pointer;color:#86623b;font-size:12px;margin:8px 0}@media(max-width:760px){.director-skills-entry{left:8px;top:68px}.skills-panel{width:calc(100vw - 96px);padding:13px;max-height:calc(100vh - 150px)}}
</style>
