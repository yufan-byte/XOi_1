<template>
  <t-dialog v-model:visible="visible" :header="false" :footer="false" :close-btn="false" width="min(1160px, 96vw)" placement="center" attach="body" class="shotEditDialog">
    <div v-if="current" class="shotEdit">
      <header class="editHeader"><div><span class="editSpark">✦</span><div><strong>对话修改画面</strong><small>镜头 S{{ number }} · {{ episodeTitle }}</small></div></div><div class="editHeaderActions"><button type="button" @click="openInspector">检查衔接</button><button type="button" @click="openCanvas">在无限画布编辑 ↗</button><button type="button" class="editClose" aria-label="关闭修改画面" @click="visible = false">×</button></div></header>
      <div class="shotEditWorkspace">
        <section class="editVisual"><div class="editVisualHeading"><strong>当前画面</strong><span>{{ current.state === '生成中' ? '正在生成 · 保留原图' : '本镜底图' }}</span></div><div class="editVisualFrame"><img v-if="current.src" :src="continuityImageUrl(current.src)" alt="当前分镜画面" /><div v-else class="shotEditEmpty">还没有分镜图，请先生成画面</div></div><div class="editPrevious" v-if="previous?.src"><img :src="continuityImageUrl(previous.src)" alt="上一镜画面" /><span><strong>上一镜</strong><small>对照人物位置与动作</small></span></div></section>
        <section class="editConversation"><div class="conversationScroll"><div class="assistantIntro"><span>✦</span><div><strong>想调整哪里？</strong><p>直接描述你想修改的画面，例如“把床移到右墙，保持人物和光线不变”。</p><small>生成完成后将更新本镜，原画面可在历史版本中恢复。</small></div></div><div class="referenceHeading">本次参考</div><div class="referenceCards"><div class="referenceCard"><img v-if="current.src" :src="continuityImageUrl(current.src)" alt="" /><span><strong>当前分镜</strong><small>修改底图</small></span></div><div v-for="asset in references" :key="asset.id" class="referenceCard"><img :src="continuityImageUrl(asset.src)" alt="" /><span><strong>{{ asset.name }}</strong><small>{{ asset.type === 'scene' ? '场景参考' : asset.type === 'role' ? '角色参考' : '资产参考' }}</small></span></div></div><p v-if="!references.length" class="referenceNote">本镜暂未关联角色或场景图，可以在镜头信息中补充。</p></div>
          <div class="conversationComposer"><textarea v-model="instruction" maxlength="4000" rows="4" aria-label="修改画面描述" placeholder="描述想修改的内容，例如：让人物转向窗外，保留场景和服装…" /><div class="composerMeta"><span>图片模型 · {{ modelLabel }}</span><span>{{ instruction.length }} / 4000</span></div><div v-if="!approved" class="shotEditWarning">请先确认导演计划和分镜表，再生成画面。</div><div v-if="error" class="shotEditWarning" role="alert">{{ error }}</div><footer><span>使用项目图片模型 · 按实际生成计费</span><button type="button" class="shotEditSubmit" :disabled="busy || !approved || !current.src || current.state === '生成中' || !instruction.trim()" @click="submit">{{ busy ? '正在提交…' : current.state === '生成中' ? '画面生成中' : '生成修改' }} <span>➜</span></button></footer></div>
        </section>
      </div>
    </div>
    <t-empty v-else description="镜头不存在，请重新选择" />
  </t-dialog>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch, type Ref } from "vue";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import productionAgentStore from "@/stores/productionAgent";
import { continuityImageUrl } from "@/utils/continuityAnalysis";
import { accountBoundary } from "@/utils/accountBoundary";
import type { ShotContinuity } from "../../../../../../shared/shotContinuity";

const props = defineProps<{ storyboardId?: number }>();
const visible = defineModel<boolean>("visible", { required: true });
const emit = defineEmits<{ inspect: [id: number]; canvas: [id: number] }>();
const agent = productionAgentStore();
const project = projectStore();
const episode = inject<Ref<number>>("episodesId", ref(0));
const episodeTitle = inject<Ref<string>>("productionEpisodeTitle", ref("当前分集"));
const owner = accountBoundary.capture();
const modelLabel = computed(() => project.project?.imageModel?.replace(/^newapi:/, "") || "未配置");
const frames = computed(() => agent.flowData.storyboard || []);
const index = computed(() => frames.value.findIndex((f) => f.id === props.storyboardId));
const current = computed(() => frames.value[index.value]);
const previous = computed(() => index.value > 0 ? frames.value[index.value - 1] : undefined);
const number = computed(() => String(index.value + 1).padStart(2, "0"));
const approved = computed(() => Boolean(agent.flowData.reviewState?.planApproved && agent.flowData.reviewState?.tableApproved));
const references = computed(() => agent.flowData.assets.flatMap((a) => [a, ...(a.derive || [])]).filter((a) => current.value?.associateAssetsIds?.includes(a.id) && a.src));
const instruction = ref("");
const busy = ref(false);
const error = ref("");
watch(() => props.storyboardId, () => { instruction.value = ""; error.value = ""; });
function openInspector() { if (current.value?.id) { visible.value = false; emit("inspect", current.value.id); } }
function openCanvas() { if (current.value?.id) { visible.value = false; emit("canvas", current.value.id); } }
async function submit() {
  if (busy.value || !current.value?.id || !current.value.src || !instruction.value.trim() || !approved.value) return;
  const frame = current.value, id = frame.id!, scriptId = episode.value, projectId = Number(project.project?.id);
  const expected = frame.continuity ? JSON.parse(JSON.stringify(frame.continuity)) : null;
  const base: ShotContinuity = expected || { sceneId: null, transition: "cut", startState: "", endState: "", screenDirection: "", spatialLayout: "", repairNotes: "", anchorStoryboardId: null };
  busy.value = true; error.value = "";
  try {
    // Older servers silently ignore unknown generation options. Probe support before saving or billing.
    try {
      const support = await axios.post("/production/storyboard/batchGenerateImage", { projectId, scriptId, storyboardIds: [], checkImageEditSupport: true });
      accountBoundary.assert(owner);
      if (episode.value !== scriptId || Number(project.project?.id) !== projectId || current.value?.id !== id) throw Error("项目或分集已切换，请重新打开当前镜头");
      if (!support.data?.useCurrentImage) throw Error("unsupported");
    } catch { throw Error("服务端尚未更新到支持以原图修改的版本，请先部署或重启服务后再试。"); }
    const { data } = await axios.post("/production/storyboard/saveContinuity", { projectId, scriptId, id, expectedContinuity: expected, continuity: { ...base, repairNotes: instruction.value.trim() }, applySceneLayout: false });
    accountBoundary.assert(owner);
    if (episode.value !== scriptId || Number(project.project?.id) !== projectId || current.value?.id !== id) return;
    frame.continuity = data.continuity;
    await agent.batchGenerateStoryboard([id], true, true);
    accountBoundary.assert(owner);
    if (episode.value !== scriptId || Number(project.project?.id) !== projectId || current.value?.id !== id) return;
    instruction.value = "";
    visible.value = false;
    window.$message.success("修改任务已提交，生成完成后会更新画面；原图保留在历史版本。");
  } catch (e: any) { error.value = e?.message || "提交失败，请检查设置后重试"; }
  finally { busy.value = false; }
}
</script>

<style scoped>
.shotEdit { color:#302a26; overflow:hidden; border-radius:16px; background:#fff; }
.editHeader,.editHeader>div,.editHeaderActions { display:flex; align-items:center; }
.editHeader { justify-content:space-between; gap:16px; padding:16px 20px; border-bottom:1px solid #eee9e3; }
.editHeader>div { gap:10px; }.editHeader strong,.editHeader small { display:block; }.editHeader strong { font-size:16px; }.editHeader small { margin-top:3px; color:#9d938a; font-size:11px; }
.editSpark,.assistantIntro>span { display:grid; place-items:center; width:36px; height:36px; flex:none; border-radius:12px; background:#fff1e7; color:#dc713d; }
.editHeaderActions { gap:8px; }.editHeaderActions button { padding:8px 10px; border:1px solid #ece7e1; border-radius:9px; background:#fff; color:#746b63; font:inherit; font-size:11px; cursor:pointer; }.editHeaderActions button:hover { color:#bd4e28; border-color:#e8bd9e; }.editHeaderActions .editClose { width:34px; height:34px; padding:0; font-size:20px; }
.shotEditWorkspace { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(340px,0.9fr); min-height:min(500px,68vh); }
.editVisual { min-width:0; padding:20px; background:#f7f6f4; }.editVisualHeading { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; font-size:13px; }.editVisualHeading span { color:#a1968d; font-size:11px; }.editVisualFrame { display:grid; min-height:220px; aspect-ratio:16/10; place-items:center; overflow:hidden; border-radius:14px; background:#272421; }.editVisualFrame img { display:block; width:100%; height:100%; object-fit:contain; }.shotEditEmpty { color:#ada49d; font-size:12px; }
.editPrevious { display:flex; align-items:center; gap:10px; margin-top:14px; }.editPrevious img { width:84px; height:52px; object-fit:cover; border-radius:8px; }.editPrevious strong,.editPrevious small { display:block; font-size:11px; }.editPrevious small { margin-top:4px; color:#a0958d; }
.editConversation { display:flex; min-width:0; min-height:0; flex-direction:column; padding:20px; }.conversationScroll { flex:1; min-height:140px; overflow:auto; }.assistantIntro { display:flex; align-items:flex-start; gap:10px; }.assistantIntro strong { font-size:14px; }.assistantIntro p { margin:7px 0; color:#756d66; font-size:12px; line-height:1.7; }.assistantIntro small,.referenceNote { color:#a39990; font-size:11px; line-height:1.6; }.referenceHeading { margin:24px 0 9px; color:#8c8178; font-size:11px; font-weight:600; }.referenceCards { display:flex; flex-wrap:wrap; gap:8px; }.referenceCard { display:flex; align-items:center; min-width:0; gap:8px; padding:5px; border:1px solid #eee9e3; border-radius:9px; background:#fbfaf8; }.referenceCard img { width:45px; height:45px; object-fit:cover; border-radius:6px; }.referenceCard span { padding-right:5px; }.referenceCard strong,.referenceCard small { display:block; max-width:90px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; }.referenceCard small { margin-top:4px; color:#a79b91; font-size:10px; }
.conversationComposer { margin-top:18px; padding:13px; border:1px solid #e8e1da; border-radius:16px; background:#fff; box-shadow:0 8px 30px #3327190b; }.conversationComposer:focus-within { border-color:#dfa989; box-shadow:0 0 0 3px #edc3ad33; }.conversationComposer textarea { box-sizing:border-box; width:100%; min-height:92px; padding:3px; resize:vertical; border:0; background:transparent; color:#302a26; font:inherit; font-size:13px; line-height:1.7; outline:none; }.composerMeta,.conversationComposer footer { display:flex; align-items:center; justify-content:space-between; gap:10px; }.composerMeta { padding:4px 2px 10px; color:#a49a90; font-size:10px; }.conversationComposer footer { padding-top:10px; border-top:1px solid #f0ebe6; }.conversationComposer footer>span { color:#a2968d; font-size:10px; }.shotEditWarning { margin:8px 0; color:#af4c2f; font-size:12px; }.shotEditSubmit { display:flex; align-items:center; gap:12px; padding:10px 15px; border:0; border-radius:10px; background:#bd4e28; color:#fff; font:inherit; font-size:12px; cursor:pointer; }.shotEditSubmit:disabled { opacity:.45; cursor:not-allowed; }
@media(max-width:760px) { .shotEditWorkspace { grid-template-columns:1fr; max-height:75vh; overflow:auto; }.editVisual { padding:14px; }.editVisualFrame { min-height:150px; aspect-ratio:16/8; }.editPrevious { display:none; }.editConversation { min-height:320px; padding:16px; }.editHeader { padding:12px; }.editHeaderActions button:not(.editClose) { display:none; } }
</style>
<style>
.shotEditDialog .t-dialog { max-height: calc(100dvh - 32px); overflow: hidden; border-radius: 16px; }
.shotEditDialog .t-dialog__body { max-height: calc(100dvh - 32px); padding: 0 !important; overflow-y: auto; }
</style>
