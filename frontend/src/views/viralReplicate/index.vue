<template>
  <main class="viralPage">
    <section class="hero">
      <div class="heroCopy">
        <div class="eyebrow"><span></span>XOi VIRAL LAB</div>
        <h1>爆款复刻工作台</h1>
        <p>把对标视频和参考图拆成可复用的镜头语言，再用你的商品与品牌重新创作。</p>
        <div class="heroFlow">
          <span>上传参考</span><b>→</b><span>AI 拆解</span><b>→</b><span>可控复刻</span><b>→</b><span>导出成片</span>
        </div>
      </div>
      <div class="heroVisual" aria-hidden="true">
        <div class="visualCard cardBack">REFERENCE</div>
        <div class="visualCard cardFront"><strong>RE</strong><span>MAKE</span></div>
        <div class="visualSpark">✦</div>
      </div>
    </section>

    <nav class="moduleTabs" aria-label="爆款复刻能力">
      <button v-for="item in modules" :key="item.key" :class="{ active: activeModule === item.key }" @click="activeModule = item.key">
        <span class="tabIcon">{{ item.icon }}</span>
        <span class="tabText"><strong>{{ item.title }}</strong><small>{{ item.subtitle }}</small></span>
        <span class="tabArrow">↗</span>
      </button>
    </nav>

    <section class="workspace">
      <div class="workPanel">
        <header class="panelHeader">
          <div>
            <span class="stepTag">{{ activeMeta.tag }}</span>
            <h2>{{ activeMeta.title }}</h2>
            <p>{{ activeMeta.description }}</p>
          </div>
          <span class="privacyBadge">🔒 素材仅用于本次任务</span>
        </header>

        <div v-if="activeModule === 'oneclick'" class="toolBody">
          <div class="linkResolver">
            <div class="resolverIcon">↗</div>
            <div class="resolverMain">
              <div class="resolverHeading"><strong>粘贴分享链接，一键获取对标视频</strong><span>抖音 · Bilibili · 视频直链</span></div>
              <div class="resolverInput"><t-input v-model="oneclick.shareLink" size="large" placeholder="可直接粘贴整段分享文案，系统会自动识别其中的链接" @enter="resolveRemote('oneclick')" /><t-button size="large" variant="outline" :loading="resolving === 'oneclick'" @click="resolveRemote('oneclick')">获取视频</t-button></div>
              <div v-if="oneclick.remote" class="resolvedSource">
                <img v-if="oneclick.remote.cover" :src="oneclick.remote.cover" />
                <div class="resolvedFallback" v-else>▶</div>
                <div><span>{{ platformName(oneclick.remote.platform) }}</span><strong>{{ oneclick.remote.title }}</strong><small>{{ oneclick.remote.duration ? formatTime(oneclick.remote.duration) : '时长将在读取后获取' }}</small></div>
                <button @click="clearRemote('oneclick')">更换</button>
              </div>
            </div>
          </div>
          <div class="sourceDivider"><span>或者上传本地素材</span></div>
          <div class="sourceGrid">
            <UploadCard title="对标视频" hint="MP4 / MOV，建议 5–60 秒" accept="video/*" :file="oneclick.video" kind="video" required @change="setLocalVideo('oneclick', $event)" />
            <UploadCard title="商品或品牌图" hint="用于替换原片主体，可选" accept="image/*" :file="oneclick.product" kind="image" @change="oneclick.product = $event" />
          </div>
          <div class="settingsCard">
            <div class="settingsTitle"><strong>生成设置</strong><span>模型变化时，价格提示会同步更新</span></div>
            <div class="modelGrid three">
              <label><span>① 视频理解模型</span><model-select v-model="oneclick.visionModel" type="text" size="large" placeholder="选择视觉理解模型" /></label>
              <label><span>② 分镜生图模型</span><model-select v-model="oneclick.imageModel" type="image" size="large" placeholder="选择图片模型" /></label>
              <label><span>③ 视频生成模型</span><model-select v-model="oneclick.videoModel" type="video" size="large" placeholder="选择视频模型" /></label>
            </div>
            <div class="inlineSettings">
              <label><span>单镜时长</span><t-select v-model="oneclick.seconds"><t-option :value="5" label="5 秒" /><t-option :value="10" label="10 秒" /></t-select></label>
              <label><span>画面比例</span><t-select v-model="oneclick.ratio"><t-option value="16:9" label="16:9 横屏" /><t-option value="9:16" label="9:16 竖屏" /><t-option value="1:1" label="1:1 方形" /></t-select></label>
              <label class="switchLabel"><span>逐步确认</span><t-switch v-model="oneclick.stepwise" /><small>打开后，每一阶段由你确认</small></label>
            </div>
          </div>

          <div v-if="shots.length" class="pipelineResult">
            <div class="resultHeading"><div><span class="liveDot"></span><strong>已拆出 {{ shots.length }} 个镜头</strong></div><span>{{ oneclickSummary }}</span></div>
            <div class="shotRail">
              <article v-for="shot in shots" :key="shot.id" class="shotCard">
                <div class="shotPreview">
                  <video v-if="shot.clip" :src="shot.clip" controls muted></video>
                  <img v-else-if="shot.board || shot.frame" :src="shot.board || shot.frame" />
                  <div v-else class="shotPlaceholder">{{ String(shot.no).padStart(2, '0') }}</div>
                  <span>{{ shot.status }}</span>
                </div>
                <strong>镜头 {{ shot.no }} · {{ shot.seconds }}s</strong>
                <p>{{ shot.scene }}</p>
                <small>{{ shot.camera }}</small>
              </article>
            </div>
          </div>

          <footer class="actionBar">
            <div class="costStack">
              <strong>本次费用预估</strong>
              <div class="costLines">
                <ModelCostHint :model="bareModel(oneclick.visionModel)" type="text" :input-length="oneclick.video?.size || 0" :output-tokens="1800" compact />
                <ModelCostHint :model="bareModel(oneclick.imageModel)" type="image" compact />
                <ModelCostHint :model="bareModel(oneclick.videoModel)" type="video" :duration="oneclick.seconds" compact />
              </div>
              <small>生图、视频按实际镜头数累计，开始前可逐步确认。</small>
            </div>
            <t-button v-if="oneclick.stepwise && oneclickStage === 'boards'" size="large" theme="primary" :loading="working" @click="generateAllBoards">确认分镜并生成故事板</t-button>
            <t-button v-else-if="oneclick.stepwise && oneclickStage === 'videos'" size="large" theme="primary" :loading="working" @click="generateAllVideos">确认故事板并生成视频</t-button>
            <t-button v-else size="large" theme="primary" :loading="working" @click="startOneclick">{{ shots.length ? '重新拆解并复刻' : '开始智能复刻' }} <span class="buttonArrow">→</span></t-button>
          </footer>
        </div>

        <div v-else-if="activeModule === 'reverse'" class="toolBody">
          <div class="linkResolver">
            <div class="resolverIcon">↗</div>
            <div class="resolverMain">
              <div class="resolverHeading"><strong>从分享链接读取视频</strong><span>支持抖音 / B站分享文案和视频直链</span></div>
              <div class="resolverInput"><t-input v-model="reverse.shareLink" size="large" placeholder="粘贴链接或整段分享文案" @enter="resolveRemote('reverse')" /><t-button size="large" variant="outline" :loading="resolving === 'reverse'" @click="resolveRemote('reverse')">获取视频</t-button></div>
              <div v-if="reverse.remote" class="resolvedSource">
                <img v-if="reverse.remote.cover" :src="reverse.remote.cover" /><div class="resolvedFallback" v-else>▶</div>
                <div><span>{{ platformName(reverse.remote.platform) }}</span><strong>{{ reverse.remote.title }}</strong><small>{{ reverse.remote.duration ? formatTime(reverse.remote.duration) : '已就绪' }}</small></div>
                <button @click="clearRemote('reverse')">更换</button>
              </div>
            </div>
          </div>
          <div class="sourceDivider"><span>或者上传本地素材</span></div>
          <UploadCard title="上传对标视频" hint="系统会在浏览器中均匀抽取关键帧，再交给所选模型分析" accept="video/*" :file="reverse.video" kind="video" wide required @change="setLocalVideo('reverse', $event)" />
          <div class="settingsCard compactCard">
            <div class="modelGrid two">
              <label><span>分析模型</span><model-select v-model="reverse.model" type="text" size="large" placeholder="选择支持视觉理解的模型" /></label>
              <label><span>分析深度</span><t-select v-model="reverse.depth" size="large"><t-option :value="6" label="快速 · 6 帧" /><t-option :value="9" label="标准 · 9 帧" /><t-option :value="12" label="精细 · 12 帧" /></t-select><small>帧数越多，镜头与节奏判断越细</small></label>
            </div>
          </div>
          <div v-if="reverseResult" class="analysisResult">
            <div class="analysisTop"><span>AI 拆解结果</span><button @click="copyReversePrompt">复制完整提示词</button></div>
            <div class="analysisGrid">
              <article v-for="item in reverseCards" :key="item.label"><small>{{ item.label }}</small><p>{{ item.value || '—' }}</p></article>
            </div>
            <div class="promptBox"><small>可复用提示词</small><p>{{ reverseResult.prompt || reverseResult.prompt_en }}</p></div>
          </div>
          <footer class="actionBar">
            <div class="costStack"><strong>分析费用</strong><ModelCostHint :model="bareModel(reverse.model)" type="text" :input-length="reverse.video?.size || 0" :output-tokens="1600" /><small>只在点击分析后产生费用。</small></div>
            <t-button size="large" theme="primary" :loading="working" @click="runReverse">开始视频反推 <span class="buttonArrow">→</span></t-button>
          </footer>
        </div>

        <div v-else-if="activeModule === 'image'" class="toolBody">
          <div class="sourceGrid">
            <UploadCard title="参考爆款图" hint="保留构图、氛围与视觉节奏" accept="image/*" :file="imageJob.reference" kind="image" required @change="imageJob.reference = $event" />
            <UploadCard title="你的商品图" hint="主体清晰、背景简洁效果更好" accept="image/*" :file="imageJob.product" kind="image" required @change="imageJob.product = $event" />
          </div>
          <div class="modeChooser">
            <button v-for="mode in imageModes" :key="mode.key" :class="{ active: imageJob.mode === mode.key }" @click="imageJob.mode = mode.key"><span>{{ mode.icon }}</span><strong>{{ mode.name }}</strong><small>{{ mode.desc }}</small></button>
          </div>
          <div class="settingsCard compactCard">
            <div class="modelGrid two">
              <label><span>图片生成模型</span><model-select v-model="imageJob.model" type="image" size="large" placeholder="选择支持参考图的图片模型" /></label>
              <label><span>补充要求（可选）</span><t-input v-model="imageJob.requirement" size="large" placeholder="如：保留橙色包装，适配小红书封面" /></label>
            </div>
          </div>
          <div v-if="imageResult" class="imageResult">
            <img :src="imageResult" alt="图片复刻结果" />
            <div><strong>复刻完成</strong><p>你可以下载结果，或继续调整模式和要求再次生成。</p><t-button variant="outline" @click="downloadUrl(imageResult, 'xoi-image-replicate.png')">下载图片</t-button></div>
          </div>
          <footer class="actionBar">
            <div class="costStack"><strong>生成费用</strong><ModelCostHint :model="bareModel(imageJob.model)" type="image" /><small>最终费用由 NewAPI 按所选模型实际结算。</small></div>
            <t-button size="large" theme="primary" :loading="working" @click="runImageReplicate">生成复刻图 <span class="buttonArrow">→</span></t-button>
          </footer>
        </div>

        <div v-else class="toolBody">
          <UploadCard title="上传动作参考视频" hint="素材只在浏览器本地抽帧，不上传模型、不扣费" accept="video/*" :file="motion.video" kind="video" wide required @change="motion.video = $event" />
          <div class="motionIntro">
            <div><span>01</span><strong>本地解析</strong><p>读取视频时长并均匀提取动作关键帧。</p></div>
            <div><span>02</span><strong>动作序列</strong><p>生成可视化序列，方便选择关键姿势。</p></div>
            <div><span>03</span><strong>作为参考</strong><p>下载关键帧，后续可送进画布或视频工作流。</p></div>
          </div>
          <div v-if="motionFrames.length" class="motionFrames"><article v-for="frame in motionFrames" :key="frame.time"><img :src="frame.url" /><span>{{ formatTime(frame.time) }}</span></article></div>
          <footer class="actionBar">
            <div class="costStack"><strong>本地工具 · ¥0</strong><small>当前版本做动作关键帧捕捉；深度图模型将在浏览器运行时按需加载。</small></div>
            <t-button size="large" theme="primary" :loading="working" @click="runMotionCapture">捕捉动作关键帧 <span class="buttonArrow">→</span></t-button>
          </footer>
        </div>
      </div>

      <aside class="historyPanel">
        <div class="historyTitle"><div><small>TASKS</small><strong>最近任务</strong></div><button v-if="history.length" @click="clearHistory">清空</button></div>
        <div v-if="!history.length" class="emptyHistory"><span>⌁</span><strong>还没有复刻任务</strong><p>完成的分析与生成记录会留在这里，方便继续创作。</p></div>
        <div v-else class="historyList">
          <article v-for="item in history" :key="item.id">
            <span class="historyIcon">{{ moduleByKey(item.module).icon }}</span>
            <div><strong>{{ item.title }}</strong><small>{{ item.summary }}</small><time>{{ item.createdAt }}</time></div>
            <em :class="item.status">{{ item.status === 'success' ? '完成' : '失败' }}</em>
          </article>
        </div>
        <div class="principleCard"><span>✦</span><strong>不是复制，是可控重创</strong><p>参考内容只帮助理解结构、镜头和节奏。请确保上传素材拥有合法使用权。</p></div>
      </aside>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, reactive, ref } from "vue";
import { MessagePlugin } from "tdesign-vue-next";
import axios from "@/utils/axios";
import ModelSelect from "@/components/modelSelect.vue";
import ModelCostHint from "@/components/ModelCostHint.vue";
import { bareModel, captureVideoFrames, downloadUrl, fileToDataUrl, formatTime, parseJsonContent, type CapturedFrame } from "./utils";

type ModuleKey = "oneclick" | "reverse" | "motion" | "image";
interface HistoryItem { id: string; module: ModuleKey; title: string; summary: string; status: "success" | "error"; createdAt: string }
interface Shot { id: string; no: number; seconds: number; scene: string; camera: string; copy: string; frame?: string; board?: string; clip?: string; status: string }
interface RemoteSource { platform: "douyin" | "bilibili" | "direct"; title: string; cover?: string; duration?: number; sourceUrl: string; originalUrl: string }

const modules = [
  { key: "oneclick" as const, icon: "▦", title: "一键复刻", subtitle: "拆解 → 分镜 → 成片", tag: "FULL PIPELINE", description: "完整复刻工作流：理解爆款结构、生成品牌故事板，再输出视频片段。" },
  { key: "reverse" as const, icon: "⌘", title: "爆款视频反推", subtitle: "还原镜头与提示词", tag: "VIDEO REVERSE", description: "从关键帧、节奏、运镜、光线和风格中，反推出可复用的生成提示词。" },
  { key: "motion" as const, icon: "◎", title: "深度动作捕捉", subtitle: "提取动作关键帧", tag: "MOTION CAPTURE", description: "先在浏览器本地提取动作序列，快速挑出可用于创作的关键姿势。" },
  { key: "image" as const, icon: "▣", title: "图片复刻", subtitle: "换商品不换质感", tag: "IMAGE REMAKE", description: "参考爆款构图与氛围，将画面主体替换成你的商品或品牌视觉。" },
];
const activeModule = ref<ModuleKey>("oneclick");
const activeMeta = computed(() => moduleByKey(activeModule.value));
const working = ref(false);
const resolving = ref<"oneclick" | "reverse" | "">("");
const oneclick = reactive<{video?: File; product?: File; shareLink: string; remote?: RemoteSource; visionModel: string; imageModel: string; videoModel: string; seconds: number; ratio: string; stepwise: boolean}>({ shareLink: "", visionModel: "", imageModel: "", videoModel: "", seconds: 5, ratio: "9:16", stepwise: true });
const reverse = reactive<{video?: File; shareLink: string; remote?: RemoteSource; model: string; depth: number}>({ shareLink: "", model: "", depth: 9 });
const motion = reactive<{video?: File}>({});
const imageJob = reactive<{reference?: File; product?: File; model: string; mode: string; requirement: string}>({ model: "", mode: "replace", requirement: "" });
const shots = ref<Shot[]>([]);
const oneclickSummary = ref("");
const oneclickStage = ref<"analyze" | "boards" | "videos" | "done">("analyze");
const reverseResult = ref<Record<string, any> | null>(null);
const imageResult = ref("");
const motionFrames = ref<CapturedFrame[]>([]);
const imageModes = [
  { key: "replace", icon: "↔", name: "主体替换", desc: "保留构图，替换商品" },
  { key: "composition", icon: "⊞", name: "构图借鉴", desc: "借用布局，重新设计" },
  { key: "scene", icon: "◫", name: "场景迁移", desc: "保留商品，更换氛围" },
  { key: "fullset", icon: "✦", name: "全套复刻", desc: "构图、场景、质感重创" },
];

const history = ref<HistoryItem[]>(loadHistory());
const reverseCards = computed(() => [
  { label: "主体", value: reverseResult.value?.subject }, { label: "动作", value: reverseResult.value?.action },
  { label: "场景", value: reverseResult.value?.scene }, { label: "运镜", value: reverseResult.value?.camera },
  { label: "光线", value: reverseResult.value?.lighting }, { label: "视觉风格", value: reverseResult.value?.style },
]);

const UploadCard = defineComponent({
  props: { title: String, hint: String, accept: String, file: Object, kind: String, wide: Boolean, required: Boolean },
  emits: ["change"],
  setup(props, { emit }) {
    const input = ref<HTMLInputElement>();
    return () => h("button", { type: "button", class: ["uploadCard", props.wide && "wide", props.file && "hasFile"], onClick: () => input.value?.click(), onDragover: (e: DragEvent) => e.preventDefault(), onDrop: (e: DragEvent) => { e.preventDefault(); const file = e.dataTransfer?.files?.[0]; if (file) emit("change", file); } }, [
      h("input", { ref: input, type: "file", accept: props.accept, hidden: true, onChange: (event: Event) => emit("change", (event.target as HTMLInputElement).files?.[0]) }),
      h("span", { class: "uploadGlyph" }, props.kind === "video" ? "▶" : "＋"),
      h("div", [h("strong", `${props.title}${props.required ? " *" : ""}`), h("p", props.file ? (props.file as File).name : props.hint), props.file ? h("small", `${((props.file as File).size / 1024 / 1024).toFixed(1)} MB · 点击替换`) : h("small", "点击选择或拖拽到这里")]),
      props.file ? h("em", "已就绪") : null,
    ]);
  },
});

function moduleByKey(key: ModuleKey) { return modules.find((item) => item.key === key) || modules[0]; }
function loadHistory(): HistoryItem[] { try { return JSON.parse(localStorage.getItem("xoi:viral-history") || "[]"); } catch { return []; } }
function addHistory(item: Omit<HistoryItem, "id" | "createdAt">) {
  history.value.unshift({ ...item, id: crypto.randomUUID(), createdAt: new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) });
  history.value = history.value.slice(0, 20);
  localStorage.setItem("xoi:viral-history", JSON.stringify(history.value));
}
function clearHistory() { history.value = []; localStorage.removeItem("xoi:viral-history"); }
function platformName(platform: RemoteSource["platform"]) { return platform === "douyin" ? "抖音" : platform === "bilibili" ? "Bilibili" : "视频直链"; }
function clearRemote(target: "oneclick" | "reverse") { if (target === "oneclick") oneclick.remote = undefined; else reverse.remote = undefined; }
function setLocalVideo(target: "oneclick" | "reverse", file?: File) {
  if (target === "oneclick") { oneclick.video = file; oneclick.remote = undefined; }
  else { reverse.video = file; reverse.remote = undefined; }
}
async function resolveRemote(target: "oneclick" | "reverse") {
  const state = target === "oneclick" ? oneclick : reverse;
  if (!state.shareLink.trim()) return MessagePlugin.warning("请粘贴抖音、B站分享文案或视频直链");
  try {
    resolving.value = target;
    const response: any = await axios.post("/viral/resolve", { input: state.shareLink });
    const data = response?.data || response;
    if (!data?.sourceUrl) throw new Error("解析接口没有返回视频地址");
    state.remote = data as RemoteSource;
    state.video = undefined;
    MessagePlugin.success(`已获取${platformName(data.platform)}视频`);
  } catch (error) { MessagePlugin.error(apiError(error)); }
  finally { resolving.value = ""; }
}
function requireValue(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function apiError(error: any) { return error?.response?.data?.message || error?.response?.data?.msg || error?.message || "请求失败，请稍后重试"; }
function generatedUrl(response: any) { return response?.data?.[0]?.url || response?.data?.[0]?.b64_json && `data:image/png;base64,${response.data[0].b64_json}` || response?.url || ""; }

async function chatJson(model: string, messages: any[], maxTokens = 1800) {
  const response: any = await axios.post("/v1/chat/completions", { model: bareModel(model), messages, temperature: 0.35, max_tokens: maxTokens, response_format: { type: "json_object" } });
  return parseJsonContent(response?.choices?.[0]?.message?.content ?? response?.data?.choices?.[0]?.message?.content);
}

async function runReverse() {
  try {
    const source = reverse.remote?.sourceUrl || reverse.video;
    requireValue(source, "请粘贴分享链接获取视频，或上传本地视频"); requireValue(reverse.model, "请选择分析模型"); working.value = true;
    const { duration, frames } = await captureVideoFrames(source, reverse.depth);
    const content = [{ type: "text", text: `分析这个 ${duration.toFixed(1)} 秒视频的关键帧。只输出 JSON：{subject,action,scene,camera,lighting,style,duration,prompt,prompt_en,negative}。prompt 必须是可以直接用于视频生成的中文提示词，包含主体、动作、场景、镜头、光线、节奏。` }, ...frames.map((frame) => ({ type: "image_url", image_url: { url: frame.url } }))];
    reverseResult.value = await chatJson(reverse.model, [{ role: "system", content: "你是专业广告导演和 AI 视频提示词工程师。基于连续关键帧做结构化反推，不要照搬品牌标识或受保护角色。" }, { role: "user", content }]);
    addHistory({ module: "reverse", title: reverse.remote?.title || reverse.video?.name || "视频反推", summary: `${duration.toFixed(1)} 秒 · ${reverse.depth} 帧分析`, status: "success" });
    MessagePlugin.success("视频反推完成");
  } catch (error) { addHistory({ module: "reverse", title: reverse.remote?.title || reverse.video?.name || "视频反推", summary: apiError(error), status: "error" }); MessagePlugin.error(apiError(error)); }
  finally { working.value = false; }
}

async function copyReversePrompt() {
  const value = reverseResult.value?.prompt || reverseResult.value?.prompt_en || "";
  await navigator.clipboard.writeText(value); MessagePlugin.success("提示词已复制");
}

async function runImageReplicate() {
  try {
    requireValue(imageJob.reference, "请上传参考爆款图"); requireValue(imageJob.product, "请上传商品图"); requireValue(imageJob.model, "请选择图片模型"); working.value = true;
    const [reference, product] = await Promise.all([fileToDataUrl(imageJob.reference), fileToDataUrl(imageJob.product)]);
    const mode = imageModes.find((item) => item.key === imageJob.mode)!;
    const prompt = `商业视觉重创任务。第一张图是构图和氛围参考，第二张图是必须保留身份特征的商品。模式：${mode.name}（${mode.desc}）。不要复制参考图中的商标、文字和受保护角色。请输出专业成品图。${imageJob.requirement ? `补充要求：${imageJob.requirement}` : ""}`;
    const response: any = await axios.post("/v1/images/generations", { model: bareModel(imageJob.model), prompt, n: 1, response_format: "url", images: [reference, product] });
    imageResult.value = generatedUrl(response);
    if (!imageResult.value) throw new Error("模型没有返回可用图片");
    addHistory({ module: "image", title: `${mode.name} · ${imageJob.product.name}`, summary: bareModel(imageJob.model), status: "success" });
    MessagePlugin.success("图片复刻完成");
  } catch (error) { addHistory({ module: "image", title: "图片复刻", summary: apiError(error), status: "error" }); MessagePlugin.error(apiError(error)); }
  finally { working.value = false; }
}

async function analyzeOneclick() {
  const source = oneclick.remote?.sourceUrl || oneclick.video;
  requireValue(source, "请粘贴分享链接获取视频，或上传本地对标视频"); requireValue(oneclick.visionModel, "请选择视频理解模型");
  const guessedDuration = oneclick.remote?.duration || (oneclick.video ? durationGuess(oneclick.video) : 32);
  const { duration, frames } = await captureVideoFrames(source, Math.max(6, Math.min(12, Math.round(guessedDuration / 4) || 8)));
  const result: any = await chatJson(oneclick.visionModel, [
    { role: "system", content: "你是爆款短视频导演。把参考视频拆成可重拍的原创分镜，不照搬品牌、台词或受保护角色。严格输出 JSON。" },
    { role: "user", content: [{ type: "text", text: `视频时长 ${duration.toFixed(1)} 秒。输出 {summary,shots:[{no,seconds,scene,camera,copy}]}。拆为 3-8 个关键镜头，每个镜头必须包含场景内容、运镜和屏幕文案/旁白。` }, ...frames.map((frame) => ({ type: "image_url", image_url: { url: frame.url } }))] },
  ], 2400);
  const resultShots = Array.isArray(result?.shots) ? result.shots : [];
  if (!resultShots.length) throw new Error("没有拆解出有效镜头，请重试");
  oneclickSummary.value = result.summary || `${duration.toFixed(1)} 秒参考视频`;
  shots.value = resultShots.map((item: any, index: number) => ({ id: crypto.randomUUID(), no: index + 1, seconds: Number(item.seconds) || oneclick.seconds, scene: item.scene || "未命名场景", camera: item.camera || "固定镜头", copy: item.copy || "", frame: frames[Math.min(index, frames.length - 1)]?.url, status: "待生成" }));
  oneclickStage.value = "boards";
}
function durationGuess(file: File) { return Math.max(20, Math.min(60, file.size / 500_000)); }

async function generateAllBoards() {
  try {
    requireValue(oneclick.imageModel, "请选择分镜生图模型"); working.value = true;
    const product = oneclick.product ? await fileToDataUrl(oneclick.product) : "";
    for (const shot of shots.value) {
      shot.status = "生成故事板";
      const response: any = await axios.post("/v1/images/generations", { model: bareModel(oneclick.imageModel), prompt: `原创商业短视频故事板，第 ${shot.no} 镜。场景：${shot.scene}。运镜：${shot.camera}。文案：${shot.copy}。保持专业广告质感、画面干净、主体一致，不生成水印和无意义文字。`, n: 1, response_format: "url", images: [product, shot.frame].filter(Boolean) });
      shot.board = generatedUrl(response); if (!shot.board) throw new Error(`镜头 ${shot.no} 没有返回图片`); shot.status = "故事板完成";
    }
    oneclickStage.value = "videos"; MessagePlugin.success("全部故事板已生成，请确认后生成视频");
  } catch (error) { MessagePlugin.error(apiError(error)); }
  finally { working.value = false; }
}

async function createVideo(shot: Shot) {
  const created: any = await axios.post("/v1/videos", { model: oneclick.videoModel, prompt: `${shot.scene}。${shot.camera}。${shot.copy}。商业短视频，动作自然，主体稳定。`, seconds: shot.seconds || oneclick.seconds, aspect_ratio: oneclick.ratio, resolution: "720p", images: shot.board ? [shot.board] : [] });
  const payload = created?.data || created; const id = payload?.id || payload?.task_id;
  if (payload?.url) return payload.url; if (!id) throw new Error("视频任务创建失败：未返回任务编号");
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 4000));
    const polled: any = await axios.get(`/v1/videos/${id}`, { params: { model: bareModel(oneclick.videoModel) } });
    const data = polled?.data || polled; const status = String(data?.status || "").toLowerCase();
    if (["completed", "succeeded", "success"].includes(status) || data?.url) return data.url || data.output?.url || data.content?.url;
    if (["failed", "error", "cancelled"].includes(status)) throw new Error(data?.error || data?.message || `镜头 ${shot.no} 生成失败`);
  }
  throw new Error(`镜头 ${shot.no} 生成超时`);
}

async function generateAllVideos() {
  try {
    requireValue(oneclick.videoModel, "请选择视频生成模型"); working.value = true;
    for (const shot of shots.value) { shot.status = "生成视频"; shot.clip = await createVideo(shot); shot.status = "视频完成"; }
    oneclickStage.value = "done";
    addHistory({ module: "oneclick", title: oneclick.remote?.title || oneclick.video?.name || "一键复刻", summary: `${shots.value.length} 个镜头 · 已完成`, status: "success" });
    MessagePlugin.success("全部视频片段已生成");
  } catch (error) { addHistory({ module: "oneclick", title: oneclick.remote?.title || oneclick.video?.name || "一键复刻", summary: apiError(error), status: "error" }); MessagePlugin.error(apiError(error)); }
  finally { working.value = false; }
}

async function startOneclick() {
  try {
    working.value = true; await analyzeOneclick();
    if (!oneclick.stepwise) { requireValue(oneclick.imageModel, "请选择分镜生图模型"); requireValue(oneclick.videoModel, "请选择视频生成模型"); working.value = false; await generateAllBoards(); await generateAllVideos(); }
    else MessagePlugin.success("视频拆解完成，请确认镜头后生成故事板");
  } catch (error) { addHistory({ module: "oneclick", title: oneclick.remote?.title || oneclick.video?.name || "一键复刻", summary: apiError(error), status: "error" }); MessagePlugin.error(apiError(error)); }
  finally { working.value = false; }
}

async function runMotionCapture() {
  try { requireValue(motion.video, "请上传动作参考视频"); working.value = true; const result = await captureVideoFrames(motion.video, 12); motionFrames.value = result.frames; addHistory({ module: "motion", title: motion.video.name, summary: `${result.frames.length} 个动作关键帧 · 本地处理`, status: "success" }); MessagePlugin.success("动作关键帧捕捉完成"); }
  catch (error) { MessagePlugin.error(apiError(error)); } finally { working.value = false; }
}
</script>

<style scoped lang="scss">
.viralPage { --orange:#ff713f; --ink:#282631; --muted:#85808e; min-height:100%; padding:24px clamp(18px,2.2vw,36px) 56px; color:var(--ink); background:radial-gradient(circle at 84% 3%,rgba(255,180,139,.16),transparent 24%),#f7f7fa; }
.hero { position:relative; display:flex; min-height:230px; padding:38px 46px; overflow:hidden; border:1px solid #ece9ef; border-radius:28px; background:linear-gradient(118deg,#fff 0%,#faf8ff 52%,#fff0e8 100%); box-shadow:0 20px 60px rgba(48,37,61,.07); }
.hero::after { content:""; position:absolute; right:8%; top:-110px; width:400px; height:400px; border:1px solid rgba(255,113,63,.16); border-radius:50%; }
.heroCopy { position:relative; z-index:2; max-width:720px; }.eyebrow { display:flex; align-items:center; gap:10px; color:#ef6c3d; font-size:12px; font-weight:800; letter-spacing:.23em; }.eyebrow span { width:26px; height:2px; background:var(--orange); }.hero h1 { margin:16px 0 10px; font-size:clamp(32px,3vw,50px); letter-spacing:-.04em; }.hero p { margin:0; color:#74707c; font-size:16px; }.heroFlow { display:flex; align-items:center; gap:12px; margin-top:30px; font-size:13px; }.heroFlow span { padding:9px 13px; border-radius:10px; background:rgba(255,255,255,.78); border:1px solid #eee9ec; }.heroFlow b { color:#d4cdd2; }
.heroVisual { position:absolute; right:8%; top:34px; z-index:1; width:230px; height:170px; }.visualCard { position:absolute; width:130px; height:160px; padding:18px; box-sizing:border-box; border-radius:24px; color:#fff; box-shadow:0 22px 45px rgba(59,40,61,.2); }.cardBack { left:10px; top:10px; transform:rotate(-10deg); background:#393542; font-size:10px; letter-spacing:.16em; }.cardFront { right:10px; top:2px; transform:rotate(8deg); display:flex; flex-direction:column; justify-content:center; background:linear-gradient(145deg,#ff8e59,#fb5c3f); }.cardFront strong { font-size:35px; }.cardFront span { font-size:12px; letter-spacing:.2em; }.visualSpark { position:absolute; right:103px; top:61px; z-index:2; display:grid; place-items:center; width:42px; height:42px; border-radius:50%; color:#ff7040; background:white; box-shadow:0 8px 20px rgba(40,25,30,.15); }
.moduleTabs { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:18px 0; }.moduleTabs button { display:flex; align-items:center; gap:12px; min-width:0; padding:17px 18px; text-align:left; border:1px solid #e8e5eb; border-radius:18px; color:#77727d; background:rgba(255,255,255,.88); cursor:pointer; transition:.22s ease; }.moduleTabs button:hover { transform:translateY(-2px); box-shadow:0 12px 28px rgba(39,28,45,.08); }.moduleTabs button.active { color:#fff; border-color:#29262d; background:#29262d; box-shadow:0 14px 30px rgba(27,23,30,.18); }.tabIcon { display:grid; place-items:center; width:38px; height:38px; flex:none; border-radius:12px; color:#f16d3d; background:#fff1e9; font-size:20px; }.moduleTabs button.active .tabIcon { background:rgba(255,255,255,.12); color:#ff9367; }.tabText { display:flex; flex-direction:column; gap:3px; min-width:0; }.tabText strong { color:inherit; font-size:14px; }.tabText small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; color:#aaa4ae; }.tabArrow { margin-left:auto; opacity:.6; }
.workspace { display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:18px; align-items:start; }.workPanel,.historyPanel { border:1px solid #e9e6ec; border-radius:24px; background:#fff; box-shadow:0 18px 48px rgba(44,34,50,.055); }.workPanel { overflow:hidden; }.panelHeader { display:flex; justify-content:space-between; align-items:flex-start; gap:18px; padding:28px 30px 22px; border-bottom:1px solid #efedf1; }.panelHeader h2 { margin:8px 0 5px; font-size:25px; }.panelHeader p { margin:0; color:var(--muted); }.stepTag { color:#ee7141; font-size:10px; font-weight:800; letter-spacing:.2em; }.privacyBadge { padding:8px 11px; color:#77717c; border-radius:99px; background:#f6f4f6; font-size:11px; white-space:nowrap; }.toolBody { padding:24px 30px 0; }.sourceGrid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }.uploadCard { position:relative; display:flex; align-items:center; gap:16px; width:100%; min-height:122px; padding:22px; text-align:left; border:1.5px dashed #d8d2db; border-radius:18px; color:var(--ink); background:#fcfbfc; cursor:pointer; transition:.2s ease; }.uploadCard.wide { min-height:142px; }.uploadCard:hover { border-color:#ff9b76; background:#fffaf7; }.uploadCard.hasFile { border-style:solid; border-color:#ffd1bd; background:#fff8f4; }.uploadGlyph { display:grid; place-items:center; width:48px; height:48px; flex:none; border-radius:15px; color:#ee6c3c; background:#ffede3; font-size:18px; }.uploadCard strong { font-size:15px; }.uploadCard strong::first-letter { color:inherit; }.uploadCard p { max-width:480px; margin:6px 0 4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#77717d; }.uploadCard small { color:#aaa4ae; }.uploadCard em { margin-left:auto; padding:5px 9px; color:#2b9360; border-radius:99px; background:#eaf8f0; font-size:11px; font-style:normal; }
.linkResolver { display:flex; gap:15px; padding:20px; border:1px solid #ffd8c6; border-radius:18px; background:linear-gradient(120deg,#fffaf7,#fff5ee); }.resolverIcon { display:grid; place-items:center; width:46px; height:46px; flex:none; border-radius:14px; color:#fff; background:linear-gradient(145deg,#ff8b5c,#fb673d); box-shadow:0 10px 24px rgba(246,104,61,.22); font-size:20px; }.resolverMain { flex:1; min-width:0; }.resolverHeading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }.resolverHeading strong { font-size:14px; }.resolverHeading span { color:#a89288; font-size:11px; }.resolverInput { display:grid; grid-template-columns:minmax(0,1fr) 108px; gap:9px; }.resolverInput :deep(.t-input) { height:44px; border-color:#eadbd4; border-radius:11px; background:#fff; }.resolverInput :deep(.t-button) { height:44px; border-color:#ff9c78; border-radius:11px; color:#e96639; background:#fff; }.resolvedSource { display:grid; grid-template-columns:54px minmax(0,1fr) auto; gap:11px; align-items:center; margin-top:12px; padding:10px; border:1px solid #f1dfd6; border-radius:13px; background:#fff; }.resolvedSource img,.resolvedFallback { width:54px; height:45px; object-fit:cover; border-radius:9px; }.resolvedFallback { display:grid; place-items:center; color:#fff; background:#302c35; }.resolvedSource>div:nth-child(2) { display:flex; flex-direction:column; min-width:0; }.resolvedSource span { color:#f06c3d; font-size:9px; font-weight:800; }.resolvedSource strong { margin:2px 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }.resolvedSource small { color:#a39ca5; font-size:10px; }.resolvedSource button { border:0; color:#e76a3d; background:transparent; cursor:pointer; }.sourceDivider { display:flex; align-items:center; gap:12px; margin:15px 0; color:#aaa3ac; font-size:10px; }.sourceDivider::before,.sourceDivider::after { content:""; height:1px; flex:1; background:#efecf0; }
.settingsCard { margin-top:16px; padding:20px; border-radius:18px; background:#f8f7fa; }.compactCard { margin-bottom:2px; }.settingsTitle { display:flex; justify-content:space-between; margin-bottom:16px; }.settingsTitle span { color:#99939e; font-size:12px; }.modelGrid { display:grid; gap:14px; }.modelGrid.three { grid-template-columns:repeat(3,1fr); }.modelGrid.two { grid-template-columns:repeat(2,1fr); }.modelGrid label,.inlineSettings label { min-width:0; }.modelGrid label>span,.inlineSettings label>span { display:block; margin-bottom:8px; color:#5f5966; font-size:12px; font-weight:700; }.modelGrid label>small { display:block; margin-top:6px; color:#aaa4ae; font-size:11px; }.inlineSettings { display:grid; grid-template-columns:160px 180px 1fr; gap:16px; align-items:end; margin-top:17px; padding-top:16px; border-top:1px solid #e9e5eb; }.switchLabel { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding-bottom:5px; }.switchLabel span { width:100%; margin:0!important; }.switchLabel small { color:#9b959f; }
.modeChooser { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:16px; }.modeChooser button { display:grid; grid-template-columns:34px 1fr; grid-template-rows:auto auto; column-gap:9px; padding:15px; text-align:left; border:1px solid #e5e1e8; border-radius:15px; color:#4e4953; background:#fff; cursor:pointer; }.modeChooser button span { grid-row:1/3; display:grid; place-items:center; width:34px; height:34px; color:#ef6d3e; border-radius:10px; background:#fff0e8; }.modeChooser button small { margin-top:3px; color:#a19ba4; }.modeChooser button.active { border-color:#ff9c78; background:#fff8f4; box-shadow:0 8px 18px rgba(255,113,63,.09); }
.actionBar { display:flex; justify-content:space-between; align-items:center; gap:20px; margin:24px -30px 0; padding:18px 30px; border-top:1px solid #ebe8ed; background:linear-gradient(90deg,#fff,#fcfafc); }.costStack { display:flex; flex-direction:column; gap:4px; min-width:0; }.costStack>strong { font-size:13px; }.costStack>small { color:#aaa4ae; font-size:10px; }.costLines { display:flex; flex-wrap:wrap; gap:4px 14px; }.actionBar :deep(.t-button) { min-width:175px; height:46px; border-radius:13px; font-weight:700; }.buttonArrow { margin-left:9px; }
.pipelineResult,.analysisResult,.imageResult { margin-top:16px; padding:18px; border:1px solid #eee9ef; border-radius:18px; background:#fff; }.resultHeading,.analysisTop { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }.resultHeading>div { display:flex; align-items:center; gap:8px; }.resultHeading>span { color:#99939e; font-size:12px; }.liveDot { width:7px; height:7px; border-radius:50%; background:#2fbe76; box-shadow:0 0 0 4px #e4f7ed; }.shotRail { display:grid; grid-template-columns:repeat(auto-fill,minmax(165px,1fr)); gap:11px; }.shotCard { min-width:0; padding:8px; border-radius:14px; background:#f8f7f9; }.shotPreview { position:relative; height:112px; margin-bottom:9px; overflow:hidden; border-radius:10px; background:#e7e3e8; }.shotPreview img,.shotPreview video { width:100%; height:100%; object-fit:cover; }.shotPreview>span { position:absolute; left:7px; top:7px; padding:3px 6px; color:#fff; border-radius:6px; background:rgba(26,23,29,.72); font-size:9px; }.shotPlaceholder { display:grid; place-items:center; height:100%; color:#aaa3ae; font-size:30px; }.shotCard>strong { font-size:12px; }.shotCard>p { margin:5px 0; display:-webkit-box; overflow:hidden; color:#6e6872; font-size:11px; -webkit-line-clamp:2; -webkit-box-orient:vertical; }.shotCard>small { color:#aaa3ae; font-size:10px; }
.analysisTop span { font-size:15px; font-weight:700; }.analysisTop button,.historyTitle button { border:0; color:#e76a3d; background:transparent; cursor:pointer; }.analysisGrid { display:grid; grid-template-columns:repeat(3,1fr); gap:9px; }.analysisGrid article { padding:13px; border-radius:12px; background:#f7f6f8; }.analysisGrid small,.promptBox small { color:#9d97a0; }.analysisGrid p { margin:6px 0 0; font-size:12px; line-height:1.6; }.promptBox { margin-top:10px; padding:15px; border-radius:13px; background:#fff6f1; }.promptBox p { margin:8px 0 0; line-height:1.7; }.imageResult { display:flex; gap:18px; align-items:center; }.imageResult img { width:180px; height:150px; object-fit:cover; border-radius:13px; }.imageResult p { color:#817b85; }.motionIntro { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:16px; }.motionIntro div { padding:18px; border-radius:16px; background:#f8f7f9; }.motionIntro span { color:#f07343; font-size:11px; font-weight:800; }.motionIntro strong { display:block; margin:8px 0 5px; }.motionIntro p { margin:0; color:#8e8892; font-size:11px; }.motionFrames { display:grid; grid-template-columns:repeat(6,1fr); gap:8px; margin-top:16px; }.motionFrames article { position:relative; overflow:hidden; border-radius:11px; background:#222; }.motionFrames img { display:block; width:100%; aspect-ratio:16/10; object-fit:cover; filter:grayscale(.2); }.motionFrames span { position:absolute; right:5px; bottom:5px; padding:2px 5px; border-radius:5px; color:#fff; background:#000a; font-size:9px; }
.historyPanel { position:sticky; top:18px; padding:20px; }.historyTitle { display:flex; align-items:center; justify-content:space-between; padding-bottom:16px; border-bottom:1px solid #efedf0; }.historyTitle>div { display:flex; flex-direction:column; gap:4px; }.historyTitle small { color:#ef7040; font-size:9px; font-weight:800; letter-spacing:.18em; }.emptyHistory { display:flex; flex-direction:column; align-items:center; padding:48px 16px; text-align:center; }.emptyHistory>span { display:grid; place-items:center; width:48px; height:48px; margin-bottom:13px; border-radius:16px; color:#f07849; background:#fff0e7; font-size:24px; }.emptyHistory p { margin:8px 0 0; color:#a19ba5; font-size:11px; line-height:1.6; }.historyList { display:flex; flex-direction:column; max-height:480px; overflow:auto; }.historyList article { display:grid; grid-template-columns:36px 1fr auto; gap:10px; align-items:start; padding:14px 0; border-bottom:1px solid #f0edf1; }.historyIcon { display:grid; place-items:center; width:36px; height:36px; border-radius:11px; color:#ec7143; background:#fff0e8; }.historyList article>div { display:flex; flex-direction:column; min-width:0; }.historyList strong,.historyList small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.historyList strong { font-size:12px; }.historyList small,.historyList time { margin-top:3px; color:#99939c; font-size:10px; }.historyList em { padding:3px 6px; color:#2b9760; border-radius:99px; background:#e9f7ef; font-size:9px; font-style:normal; }.historyList em.error { color:#cf554f; background:#fff0ef; }.principleCard { margin-top:16px; padding:16px; border-radius:16px; color:#fff; background:linear-gradient(145deg,#332f39,#27242c); }.principleCard span { color:#ff8b5e; }.principleCard strong { display:block; margin:7px 0; font-size:12px; }.principleCard p { margin:0; color:#bbb4bf; font-size:10px; line-height:1.6; }
@media (max-width:1200px) { .workspace { grid-template-columns:1fr; }.historyPanel { position:static; }.historyList { display:grid; grid-template-columns:repeat(2,1fr); gap:0 20px; }.heroVisual { opacity:.55; }.modelGrid.three { grid-template-columns:1fr; } }
@media (max-width:800px) { .viralPage { padding:12px; }.hero { padding:26px 22px; }.heroVisual { display:none; }.heroFlow { flex-wrap:wrap; }.moduleTabs { grid-template-columns:1fr 1fr; }.workspace { display:block; }.historyPanel { margin-top:14px; }.sourceGrid,.modelGrid.two,.modeChooser,.analysisGrid,.motionIntro { grid-template-columns:1fr; }.inlineSettings { grid-template-columns:1fr 1fr; }.panelHeader { padding:22px; }.privacyBadge { display:none; }.toolBody { padding:18px 20px 0; }.actionBar { align-items:stretch; flex-direction:column; margin:20px -20px 0; padding:18px 20px; }.motionFrames { grid-template-columns:repeat(3,1fr); }.linkResolver { padding:16px; }.resolverIcon { display:none; }.resolverHeading { align-items:flex-start; flex-direction:column; gap:3px; }.resolverInput { grid-template-columns:1fr; } }
</style>
