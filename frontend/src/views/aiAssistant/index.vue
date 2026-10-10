<template>
  <div class="aiAssistant creativeWorkspace" :class="{ emptyMode: !visibleMessages.length, navOpen: uiPrefs.aiAssistantChromeVisible }">
    <header class="workspaceHeader">
      <router-link to="/aiAssistant" class="workspaceBrand"><img src="@/assets/XOI_logo.png" alt="XOi" /><span>创作</span></router-link>
      <nav class="workspaceNav" aria-label="创作工作区">
        <span class="current">对话</span>
        <router-link to="/canvas?source=xoi" @click="rememberConversation">画布</router-link>
        <router-link to="/director3d" @click="rememberConversation">导演台</router-link>
      </nav>
      <div class="sessionActions">
        <button type="button" class="chromeToggle" :aria-expanded="uiPrefs.aiAssistantChromeVisible" :aria-label="uiPrefs.aiAssistantChromeVisible ? '关闭工作台导航' : '打开工作台导航'" @click="uiPrefs.toggleAiAssistantChrome()"><i-menu-unfold /></button>
        <button type="button" :aria-expanded="showHistory" @click="showHistory = !showHistory"><i-history /><span>历史</span></button>
        <button type="button" :disabled="status !== 'idle'" aria-label="新建对话" @click="newConversation"><i-plus /><span>新对话</span></button>
      </div>
    </header>

    <aside v-if="showHistory" class="historyDrawer" aria-label="对话历史">
      <header><strong>对话历史</strong><button type="button" aria-label="关闭历史" @click="showHistory = false"><i-close /></button></header>
      <p v-if="!conversations.length" class="emptyHint">还没有对话，开始聊聊你的想法吧。</p>
      <div class="conversationList">
        <button v-for="cv in [...conversations].reverse()" :key="cv.id" type="button" :class="{ active: cv.id === activeId }" :disabled="status !== 'idle'" @click="switchConversation(cv.id)"><strong>{{ cv.title || '新的创作' }}</strong><small>{{ cv.messages.length }} 条消息</small></button>
      </div>
      <button v-if="conversations.length" type="button" class="clearAllBtn" :disabled="status !== 'idle'" @click="clearConversations">清空历史</button>
    </aside>

    <div class="assistantPanel">
      <main ref="mainRef" class="mainScrollArea" aria-label="创作对话">
        <section v-if="!visibleMessages.length" class="welcome">
          <span class="welcomeMark" aria-hidden="true">✦</span>
          <h1>今天，想把什么拍成作品？</h1>
          <p>从一个想法或一段参考开始，一起把故事和镜头打磨好。</p>
        </section>
        <section v-else ref="messagesRef" class="messageList" aria-label="对话内容">
          <div class="conversationTitle">{{ activeSessionTitle }}</div>
          <article v-for="message in visibleMessages" :key="message.id" class="messageWrapper" :class="message.role">
            <span v-if="message.role === 'assistant'" class="messageAvatar" aria-label="XOi">✦</span>
            <div class="messageBubble" :class="message.role">
              <div class="messageContent" v-html="formatMessage(message.content)"></div>
              <div v-if="message.images?.length" class="referenceImages"><img v-for="image in message.images" :key="image.name" :src="image.dataUrl" :alt="image.name" /></div>
              <div v-if="message.status === 'pending' || (message.status === 'streaming' && !message.content)" class="agentPendingState" role="status"><span class="progressDot"></span>{{ message.toolStatus || '正在整理你的想法…' }}</div>
              <details v-if="message.video" class="videoAnalysisPreview">
                <summary>{{ message.video.name }} · {{ message.video.frames.length }} 张参考画面 <span>查看抽帧</span></summary>
                <div class="analysisFrameStrip"><figure v-for="frame in message.video.frames" :key="frame.time"><img :src="frame.dataUrl" :alt="`视频 ${formatFrameTime(frame.time)} 的抽样画面`" loading="lazy" /><figcaption>{{ formatFrameTime(frame.time) }}</figcaption></figure></div>
                <small>按抽样画面分析，未读取音轨；镜头边界与运动为推测。</small>
              </details>
              <p v-if="message.toolStatus && message.status === 'streaming' && message.content" class="analysisToolStatus" role="status">{{ message.toolStatus }}</p>
              <div v-if="message.role === 'assistant' && message.status === 'complete' && message.content" class="replyActions">
                <button type="button" class="analysisHandoff" :disabled="status !== 'idle'" @click="openCanvasWithPrompt(`根据这份创作方案继续制作，先整理执行计划：\n${message.content}`, true)"><i-cube />在画布制作 <span>↗</span></button>
                <button type="button" class="msgCopyBtn" @click="handleMsgCopy(message, $event)"><i-copy />{{ copiedId === message.id ? '已复制' : '复制' }}</button>
              </div>
            </div>
          </article>
        </section>
      </main>

      <footer ref="composerRef" class="composerToolbar" @click.self="focusComposer">
        <div v-if="showAssetMenu" class="assetMenu popover">
          <strong>添加参考</strong>
          <button type="button" @click="attachmentInputRef?.click(); showAssetMenu = false"><i-paperclip /><span>上传图片或视频<small>视频发送后自动抽帧</small></span></button>
          <button type="button" @click="openAssetPicker"><i-folder-open /><span>我的素材<small>使用已保存的参考素材</small></span></button>
        </div>
        <aside v-if="showSkillPicker" ref="skillPickerRef" class="skillPicker popover" :style="{ maxHeight: `${skillPickerHeight}px` }" aria-label="选择创作技能">
          <header><strong>创作技能</strong><router-link to="/skills">浏览全部 ↗</router-link></header>
          <div class="skillPickerTop"><div class="skillTabs"><button type="button" :class="{ active: skillTab === 'general' }" @click="skillTab = 'general'">通用</button><button type="button" :class="{ active: skillTab === 'mine' }" @click="skillTab = 'mine'">我的</button></div><input v-model="skillKeyword" type="search" placeholder="搜索技能" aria-label="搜索技能" /></div>
          <p v-if="skillsLoading" class="skillEmpty">正在读取技能…</p><p v-else-if="!filteredSkills.length" class="skillEmpty">暂无技能，可去技能库添加。</p>
          <div v-else class="skillList"><button v-for="skill in filteredSkills" :key="skill.path" type="button" class="skillOption" :class="{ selected: selectedSkills.includes(skill.path) }" @click="toggleSkill(skill.path)"><span class="skillGlyph">{{ skill.emoji }}</span><span class="skillCopy"><strong>{{ skill.name }}</strong><small>{{ skill.desc }}</small></span><span class="skillOfficial">{{ selectedSkills.includes(skill.path) ? '✓' : '+' }}</span></button></div>
          <button v-if="selectedSkills.length" type="button" class="clearSkills" @click="clearSelectedSkills">清空已选技能</button>
        </aside>
        <div v-if="composerAttachments.length || activeSkillOptions.length" class="editorSkills">
          <button v-for="file in composerAttachments" :key="file.id" type="button" :disabled="status !== 'idle'" :title="`移除 ${file.name}`" @click="removeComposerAttachment(file.id)"><img v-if="file.type.startsWith('image/')" :src="file.dataUrl" alt="" /><i-video v-else /><span>{{ file.name }}</span><i-close /></button>
          <button v-for="skill in activeSkillOptions" :key="skill.path" type="button" :disabled="status !== 'idle'" :title="`移除 ${skill.name}`" @click="toggleSkill(skill.path)"><span>{{ skill.emoji }} {{ skill.name }}</span><i-close /></button>
        </div>
        <textarea ref="taRef" v-model="inputValue" rows="3" :disabled="status !== 'idle'" :placeholder="visibleMessages.length ? '继续聊，或告诉我哪里需要调整…' : '描述你的想法，或上传一段想参考的影像…'" aria-label="创作需求" @keydown.tab="handleSkillTab" @keydown.enter.exact.prevent="handleSend" @input="autogrowTextarea"></textarea>
        <div v-if="hasVideoAttachment" class="referenceHint">发送后自动抽取参考画面 · 不读取音轨</div>
        <div class="composerBottom">
          <div class="toolbarLeft">
            <input ref="attachmentInputRef" hidden type="file" multiple accept="image/*,video/*" @change="onComposerFilesSelected" />
            <button type="button" class="assetTrigger" :disabled="status !== 'idle'" aria-label="添加参考" :aria-expanded="showAssetMenu" @click.stop="toggleAssetMenu"><i-paperclip /><span>参考</span></button>
            <button ref="skillButtonRef" type="button" class="skillButton" :disabled="status !== 'idle'" :class="{ active: selectedSkills.length }" :aria-expanded="showSkillPicker" @click="toggleSkillPicker"><i-toolkit /><span>技能</span><span v-if="selectedSkills.length" class="skillCount">{{ selectedSkills.length }}</span></button>
          </div>
          <div class="toolbarRight">
            <fieldset class="modelSlot" aria-label="对话模型" :disabled="status !== 'idle'"><modelSelect v-model="selectedModelValue" v-model:label="selectedModelLabel" type="text" size="small" placeholder="选择模型" :disabled="status !== 'idle'" @change="onPickModel" /></fieldset>
            <button type="button" class="costToggle" :aria-expanded="showBillingGuide" aria-label="查看对话费用" @click="showBillingGuide = !showBillingGuide">用量</button>
            <button v-if="status === 'idle'" type="button" class="sendButton" :disabled="!inputValue.trim() && !composerAttachments.length" aria-label="发送" @click="handleSend"><span>发送</span><span aria-hidden="true">↑</span></button>
            <button v-else type="button" class="stopButton" aria-label="停止" @click="handleStop"><span aria-hidden="true">■</span>停止</button>
          </div>
        </div>
        <div v-if="showBillingGuide" class="billingGuide" role="status"><ModelCostHint :model="selectedModelName || defaultTextModel" type="text" :input-length="inputValue.length" /><small>对话按模型实际用量结算；视频分析包含工具规划、看图和整理回复。图片与视频生成在画布中单独确认。</small></div>
      </footer>

      <section v-if="!visibleMessages.length" class="taskStarters" aria-label="从一个创作任务开始">
        <button type="button" @click="attachmentInputRef?.click()"><span class="starterIcon">▣</span><strong>拆解参考</strong><small>看懂画面与镜头语言</small><span class="starterArrow">↗</span></button>
        <button type="button" @click="pickPrompt('帮我设计一段60秒短片的分镜。先聊清楚故事、风格和想传达的情绪。')"><span class="starterIcon">▦</span><strong>打磨分镜</strong><small>把故事变成镜头方案</small><span class="starterArrow">↗</span></button>
        <button type="button" @click="pickPrompt('帮我策划一支产品短片。先确认产品、目标人群和核心卖点，再一起确定创意方向。')"><span class="starterIcon">✧</span><strong>策划短片</strong><small>找到创意与表达方向</small><span class="starterArrow">↗</span></button>
      </section>
      <p class="composerFootnote">{{ visibleMessages.length ? '方案可以继续修改，准备好后再制作。' : '先聊清楚，再让作品发生。' }}</p>
    </div>
    <Teleport to="body"><div v-if="showAssetPicker" class="assetPickerOverlay" role="dialog" aria-modal="true" aria-label="选择我的素材" @click.self="closeAssetPicker"><div class="assetPickerDialog"><button type="button" class="pickerClose" aria-label="关闭素材库" @click="closeAssetPicker"><i-close /></button><iframe :key="assetPickerKey" class="assetPickerFrame" :src="assetPickerSrc" title="创作素材库"></iframe></div></div></Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { MessagePlugin } from "tdesign-vue-next";
import axios from "@/utils/axios";
import settingStore from "@/stores/setting";
import { showPointsToast } from "@/utils/pointsToast";
import { prepareReferenceImages, type ReferenceImage } from "@/utils/referenceImages";
import { extractAnalysisFrames, formatFrameTime, type AnalysisVideo } from "@/utils/videoFrames";
// Miora IP 身躯贴图 · 736×737 PNG 经 Vite ESM-import 解析为运行期 hashed URL，
// 注入下方 <image :href=:xlink:href> 以还原本仓此前无法解码的那张外图真貌。
import ipBodyUrl from "@/assets/ip_body.png";
import inspirationCyber from "@/assets/visual-presets/cyber-3d.png";
import inspirationGuofeng from "@/assets/visual-presets/style-guofeng-cyber.png";
import inspirationUrban from "@/assets/visual-presets/urban-romance.png";
import inspirationAnime from "@/assets/visual-presets/style-urban-romance-anime.png";
import inspirationCinematic from "@/assets/visual-presets/style-real-urban-cinematic.png";
import inspirationGuochao from "@/assets/visual-presets/style-guochao-2d.png";
import inspirationClay from "@/assets/visual-presets/style-clay-stopmotion.png";
import inspirationFantasy from "@/assets/visual-presets/guochao-fantasy.png";
// 全局 UI 偏好·承载 aiAssistant 页「暂请显露外围工作台 chrome 以便横向跳转兄弟模块」一道应急开关；
// 与 layouts/WorkbenchLayout.isImmersive 共享同源布尔令内外两层同步联动杜绝脱节(详见 @/stores/uiPrefs.ts)。
import uiPrefsStore from "@/stores/uiPrefs";
import userStore from "@/stores/user";
import modelSelect from "@/components/modelSelect.vue";
import ModelCostHint from "@/components/ModelCostHint.vue";
const { baseUrl } = storeToRefs(settingStore());
// Pinia 同 id 单例：此处拿到的 uiPrefs 与 WorkbenchLayout 内读到的指向同一份 reactive state，
// 任一处翻 toggle 都会让本地伪工具条显隐与外层 topMenu 显隐成对联动。
const uiPrefs = uiPrefsStore();
const { userId } = storeToRefs(userStore());
const route = useRoute();
const router = useRouter();
const inspirationMode = computed(() => route.query.mode === "inspiration");

const activeCategory = ref("branding");
const creationCategories = [
  { key: "branding", label: "品牌设计", icon: "◉" },
  { key: "video", label: "影视创意", icon: "▦" },
  { key: "commerce", label: "电商广告", icon: "▣" },
  { key: "gaming", label: "互动游戏", icon: "⌘" },
  { key: "web", label: "网页应用", icon: "▱" },
];
async function openCanvasWithPrompt(preset = inputValue.value.trim(), reportOnly = false) {
  if (status.value !== "idle") return;
  const prompt = preset.trim();
  // 报告交接不捎带正在编辑的草稿附件，失败的视频也不会阻挡成功方案。
  const handoffAttachments = reportOnly ? [] : composerAttachments.value;
  if (handoffAttachments.reduce((sum, asset) => sum + asset.size, 0) > 4 * 1024 * 1024) {
    MessagePlugin.warning("进入画布的附件总大小需在 4MB 内；大视频可先分析，再移除原视频并带入分析方案");
    return;
  }
  try {
    const assets = await Promise.all(handoffAttachments.map(async (asset) => ({
      id: asset.id, name: asset.name, type: asset.type, size: asset.size,
      dataUrl: asset.file ? await fileDataUrl(asset.file) : asset.dataUrl,
    })));
    localStorage.setItem("xoi_canvas_handoff_v1", JSON.stringify({
      prompt,
      category: activeCategory.value,
      skills: activeSkillOptions.value.map((skill) => ({ path: skill.path, name: skill.name, group: skill.group })),
      image: { size: imageSize.value, quality: imageQuality.value },
      video: { size: videoSize.value, quality: videoQuality.value },
      model: selectedModelValue.value || "",
      reasoning: reasoningEnabled.value,
      assets,
      source: "aiAssistant",
      createdAt: Date.now(),
    }));
  } catch {
    MessagePlugin.warning("画布入口数据暂时无法保存，请重试");
    return;
  }
  rememberConversation();
  router.push("/canvas?source=xoi&handoff=1");
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "pending" | "streaming" | "complete" | "error";
  toolStatus?: string;
  video?: AnalysisVideo;
  images?: ReferenceImage[];
}
interface Conversation {
  id: number;
  title: string;
  messages: Message[];
}
interface SkillOption { path: string; name: string; group: string; desc: string; emoji: string; source: "general" | "mine" }
const showSkillPicker = ref(false);
const showAssetMenu = ref(false);
const showAssetPicker = ref(false);
const assetPickerKey = ref(0);
const assetPickerSrc = computed(() => `/atelier-canvas/index.html?view=asset-picker&locale=zh-CN&picker=${assetPickerKey.value}`);
const composerRef = ref<HTMLElement | null>(null);
const skillTab = ref<"general" | "mine">("general");
const skillPickerRef = ref<HTMLElement | null>(null);
const skillButtonRef = ref<HTMLButtonElement | null>(null);
const skillPickerHeight = ref(420);
const skillKeyword = ref("");
const skillsLoading = ref(false);
const skillOptions = ref<SkillOption[]>([]);
const selectedSkills = ref<string[]>([]);
const selectedSkillsKey = computed(() => `xo_assistant_selected_skills_v1:${userId.value || 'anonymous'}:creative`);
const installedSkillsKey = computed(() => `xoi_installed_creative_skills_v1:${userId.value || 'anonymous'}`);
const skillEmoji = ["🎬", "✦", "🎨", "🧩", "✍️", "🎞️", "💡", "🪄"];
const generalSkills: SkillOption[] = [
  { path: "builtin-ecommerce", name: "电商视觉", group: "视觉风格", desc: "商品主图、详情页、促销海报与统一系列视觉", emoji: "🔧", source: "general" },
  { path: "builtin-xhs", name: "小红书内容", group: "视觉风格", desc: "封面、种草图文、生活方式场景与系列内容", emoji: "🔧", source: "general" },
  { path: "builtin-comic", name: "漫剧制作", group: "短剧工作流", desc: "角色设定、分镜网格、场景一致性与镜头节奏", emoji: "🔧", source: "general" },
  { path: "builtin-film", name: "影视分镜", group: "导演叙事", desc: "景别、机位、运镜、光线、声音和转场设计", emoji: "🔧", source: "general" },
  { path: "builtin-storyboard", name: "品牌故事板", group: "短剧工作流", desc: "品牌、产品、网站与项目宣传片完整创作流程", emoji: "🔧", source: "general" },
];
const normalizeSkillName = (path: string) => path.split("/").pop()?.replace(/\.md$/i, "").replace(/[_-]+/g, " ") || path;
const skillName = (path: string) => skillOptions.value.find((item) => item.path === path)?.name || normalizeSkillName(path);
const activeSkillOptions = computed(() => selectedSkills.value.map((path) => skillOptions.value.find((item) => item.path === path)).filter((item): item is SkillOption => Boolean(item)));
const completionSuggestion = computed(() => {
  const skill = activeSkillOptions.value.at(-1);
  if (!skill) return "";
  const suggestions: Record<string, string> = {
    "短剧工作流": `使用「${skill.name}」从创意梳理到可执行成片方案，先向我确认缺失的关键信息。`,
    "文学写作": `根据我的描述完成${skill.name}，强化人物目标、冲突升级与情绪节奏。`,
    "导演叙事": `根据我的故事使用${skill.name}设计镜头语言、调度、节奏与情绪表达。`,
    "视觉风格": `根据我的描述使用${skill.name}建立统一的构图、色彩、光影与材质风格。`,
  };
  return suggestions[skill.group] || `根据我的描述使用「${skill.name}」完成创作，并给出可直接使用的结果。`;
});
const cyclePrompt = computed(() => "为我设计一段60秒电影感短片分镜，先确认故事和风格。");
const filteredSkills = computed(() => {
  const keyword = skillKeyword.value.trim().toLowerCase();
  const sourceItems = skillOptions.value.filter((item) => item.source === skillTab.value);
  return keyword ? sourceItems.filter((item) => `${item.name} ${item.group} ${item.desc}`.toLowerCase().includes(keyword)) : sourceItems;
});
function readSavedSkills(): string[] {
  try {
    const prefix = `xo_assistant_selected_skills_v1:${userId.value || 'anonymous'}`;
    const legacy = localStorage.getItem(`${prefix}:analysis`) || localStorage.getItem(`${prefix}:canvas`) || localStorage.getItem(prefix);
    const saved = JSON.parse(localStorage.getItem(selectedSkillsKey.value) || legacy || "[]");
    return Array.isArray(saved) ? saved.filter((path) => skillOptions.value.some((skill) => skill.path === path)).slice(0, 4) : [];
  } catch { return []; }
}
function persistSelectedSkills() { try { localStorage.setItem(selectedSkillsKey.value, JSON.stringify(selectedSkills.value)); } catch {} }
function toggleSkill(path: string) {
  const removing = selectedSkills.value.includes(path);
  selectedSkills.value = removing ? selectedSkills.value.filter((item) => item !== path) : [...selectedSkills.value, path].slice(-4);
  persistSelectedSkills();
  if (!removing) {
    showSkillPicker.value = false;
    nextTick(() => taRef.value?.focus());
  }
}
function clearSelectedSkills() { selectedSkills.value = []; persistSelectedSkills(); }
function updateSkillPickerHeight() {
  const triggerTop = skillButtonRef.value?.getBoundingClientRect().top ?? window.innerHeight;
  skillPickerHeight.value = Math.min(520, Math.max(160, Math.floor(triggerTop - 24)));
}
function toggleSkillPicker() {
  if (showSkillPicker.value) {
    showSkillPicker.value = false;
    return;
  }
  showAssetMenu.value = false;
  openSetting.value = null;
  updateSkillPickerHeight();
  showSkillPicker.value = true;
}
function toggleAssetMenu() {
  const nextOpen = !showAssetMenu.value;
  showSkillPicker.value = false;
  openSetting.value = null;
  showAssetMenu.value = nextOpen;
}
async function loadSkills() {
  skillsLoading.value = true;
  try {
    const [{ data }, market, catalogResponse] = await Promise.all([
      axios.post<string[]>("/setting/skillManagement/getSkillList"),
      axios.get<{ items: any[]; installedIds: string[] }>("/skills?tab=market").catch(() => null),
      fetch("/skill-market/catalog.json", { cache: "no-store" }).catch(() => null),
    ]);
    const files = Array.isArray(data) ? data : [];
    const installed = JSON.parse(localStorage.getItem(installedSkillsKey.value) || "[]");
    const installedMeta = Array.isArray(installed) ? [...installed] : [];
    const catalog = catalogResponse?.ok ? await catalogResponse.json().catch(() => ({ data: [] })) : { data: [] };
    const sources = [...(market?.data?.items ?? []), ...(Array.isArray(catalog?.data) ? catalog.data : [])];
    for (const id of market?.data?.installedIds ?? []) {
      const path = `community/${id}.md`;
      if (!files.includes(path) || installedMeta.some((item: any) => item?.path === path)) continue;
      const source = sources.find((item: any) => String(item?.id ?? item?.skill_id) === id);
      installedMeta.push({ id, path, name: String(source?.name ?? normalizeSkillName(path)), kind: "市场技能", desc: String(source?.description ?? "来自 Skill 市场的创作技能"), emoji: "🧩" });
    }
    localStorage.setItem(installedSkillsKey.value, JSON.stringify(installedMeta));
    const installedMap = new Map<string, any>(installedMeta.map((item: any) => [item.path, item]));
    const installedPaths = new Set(installedMap.keys());
    const uniqueNames = new Set<string>();
    const mine = files.filter((path) => {
      const meta = installedMap.get(path);
      const name = meta?.name || normalizeSkillName(path);
      if (!installedPaths.has(path) || !/\.md$/i.test(path) || uniqueNames.has(name)) return false;
      uniqueNames.add(name);
      return true;
    }).slice(0, 60).map((path, index): SkillOption => { const meta = installedMap.get(path); const group = meta?.kind || (path.includes("/") ? path.split("/")[0].replace(/[_-]+/g, " ") : "通用创作"); return { path, name: meta?.name || normalizeSkillName(path), group, desc: meta?.desc || `${group}创作工作流，可在当前对话中搭配使用`, emoji: meta?.emoji || skillEmoji[index % skillEmoji.length], source: "mine" }; });
    skillOptions.value = [...generalSkills, ...mine];
    if (!selectedSkills.value.length) selectedSkills.value = readSavedSkills();
  } catch { skillOptions.value = [...generalSkills]; } finally { skillsLoading.value = false; }
}
loadSkills().then(() => { if (route.query.skills === "1") showSkillPicker.value = true; });
watch(userId, () => {
  resetAssistantWorkspace();
  selectedSkills.value = [];
  skillOptions.value = [];
  void loadSkills();
});
function closeSkillPickerOnOutside(event: PointerEvent) {
  const target = event.target as Node | null;
  if (!target) return;
  if (showSkillPicker.value && !skillPickerRef.value?.contains(target) && !skillButtonRef.value?.contains(target)) showSkillPicker.value = false;
  const element = target instanceof Element ? target : null;
  if (showAssetMenu.value && !element?.closest(".assetMenu,.assetTrigger")) showAssetMenu.value = false;
  if (openSetting.value && !element?.closest(".settingMenu,.settingPill")) openSetting.value = null;
}
onMounted(() => document.addEventListener("pointerdown", closeSkillPickerOnOutside));
onMounted(() => window.addEventListener("message", handleAssetPickerMessage));
onMounted(() => window.addEventListener("resize", updateSkillPickerHeight));
onBeforeUnmount(() => document.removeEventListener("pointerdown", closeSkillPickerOnOutside));
onBeforeUnmount(() => window.removeEventListener("message", handleAssetPickerMessage));
onBeforeUnmount(() => window.removeEventListener("resize", updateSkillPickerHeight));
// ----- 会话内存态 -----
const messages = ref<Message[]>([]);
const visibleMessages = computed(() => messages.value);
const conversations = ref<Conversation[]>([]);
const activeId = ref<number | null>(null);
const seqCounter = ref(0);
// Page N 徽章标号·静态装饰(R6 多 tab 隔离与跨次持久化属 C 方案边界本期不做真实联动)
const pageNumber = ref(1);
function genTitle(seed?: string) {
  return seed?.slice(0, 20)?.replace(/\s+/gim, "") ?? "";
}
const activeSessionTitle = computed(() => {
  if (!messages.value.length) {
    return "新的创作";
  }
  return (
    conversations.value.find((c) => c.id === activeId.value)?.title ||
    messages.value.find((m) => m.role === "user")?.content.slice(0, 22) ||
    "进行中的对话"
  );
});

// ----- 浅档历史 · 本地 localStorage 兜底(R6 内存态升级版:同设备跨刷新保 · 换号靠 JWT uid 分桶隔离互不可见)-----
// 协议守稳(R3):0 后端改动、chat.ts handler 一行不动;sessions 仅在前端给既有内存 ref[] 叠一份序列化镜像存入浏览器。
const SESSIONS_BASE_KEY = "xo_assistant_sessions_v1";
const SESSION_MAX_KEEP = 20;              // 容量上限超则弃最旧条防长期累积撑破 5MB localStorage 配额
const SESSION_PERSIST_DEBOUNCE_MS = 320;  // debounce 窗口合并高频流式增量追加避免逐字触发写盘抖动

interface PersistedMessageLite {           // 仅留三核字段 strip 掉 streaming/pending/error transient 态防恢复后现假性进行中气泡
  id?: string;
  role: "assistant" | "user";
  content: string;
  status?: "complete" | "error";
}
interface PersistedSessionLite {
  id: number;
  title: string;
  msgs: PersistedMessageLite[];
}

// 从本仓 token 解 JWT payload 取 uid 作命名空间后缀实现「换号互不可见」语义;
// token 缺失/格式破损/chat.ts auth-optional 匿名场景降级共享 anon 桶不阻断聊天主线。
function sessionBucketKey(): string {
  let uid = userId.value ? String(userId.value) : "anon";
  try {
    const tk = typeof localStorage !== "undefined" ? localStorage.getItem("token") || "" : "";
    const seg = tk.split(".")[1];
    if (!userId.value && seg && /^[A-Za-z0-9_-]+$/.test(seg)) {
      // base64url → base64 → 正确 UTF-8 文本(payload 含中文 name 不能裸用 atob 否则乱码但不影响取数字 id 此处仍走严谨解码保险)
      const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
      const jsonStr = decodeURIComponent(
        escape(atob(b64)) /* legacy byte-string bridge 仍广泛支持且兼容旧版 Safari */
      );
      const pld = JSON.parse(jsonStr);
      if (pld?.id != null) uid = String(pld.id);
    }
  } catch {/* decode 失败静默降级 anon */}
  return `${SESSIONS_BASE_KEY}:${uid}`;
}

let __persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(): void {
  if (__persistTimer != null) clearTimeout(__persistTimer);
  __persistTimer = setTimeout(() => {
    __persistTimer = null;
    persistSessionsNow();
  }, SESSION_PERSIST_DEBOUNCE_MS);
}
function persistSessionsNow(): void {
    try {
      const liteArr: PersistedSessionLite[] =
        [...conversations.value]
          .slice(-SESSION_MAX_KEEP)
          .map((c) => ({
            id: c.id,
            title: c.title || "",
            msgs: c.messages.map<PersistedMessageLite>((m) => ({
              id: m.id,
              role: m.role,
              status: m.status && m.status !== "complete" ? "error" : "complete",
              content: m.content || (m.role === "assistant" && m.status !== "complete" ? "回复尚未完成，请重试。" : ""),
            })),
          }));
      localStorage.setItem(sessionBucketKey(), JSON.stringify(liteArr));
    } catch {/* quota-exceeded / 序列化失败 静默放弃此次落盘 UI 主线不受损 */}
}
function rememberConversation() {
  try {
    if (activeId.value == null) sessionStorage.removeItem(`${sessionBucketKey()}:active`);
    else sessionStorage.setItem(`${sessionBucketKey()}:active`, String(activeId.value));
  } catch {}
  try { sessionStorage.setItem(`${sessionBucketKey()}:draft`, inputValue.value); } catch {}
  syncCurrentIntoActiveConv(savedSnapshotOfMessages());
  persistSessionsNow();
}

function restorePersistedSessions(): void {
  try {
    const raw =
      typeof localStorage !== "undefined" ? localStorage.getItem(sessionBucketKey()) || "" : "";
    if (!raw) return;
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return;
    const restored: Conversation[] = [];
    for (const s of arr as Array<Record<string, unknown>>) {
      if (!s || typeof s !== "object") continue;
      const sid = typeof s["id"] === "number" ? (s["id"] as number) : ++seqCounter.value;
      const srcMsgs = Array.isArray(s["msgs"]) ? (s["msgs"] as Array<Record<string, unknown>>) : [];
      const msgs: Message[] = srcMsgs.map((m) => ({
        id: m?.["id"] != null ? String(m["id"]) : String(Math.random()),
        role: m?.["role"] === "assistant" ? ("assistant" as const) : ("user" as const),
        content: String(m?.["content"] ?? ""),
        status: m?.["status"] === "error" ? "error" : "complete", // 保留失败状态；旧版历史降为完成态
      }));
      restored.push({
        id: sid,
        title: s["title"] ? String(s["title"]) : "(无标题)",
        messages: msgs,
      });
    }
    if (!restored.length) return;
    conversations.value = restored;
    const active = restored.find((cv) => String(cv.id) === sessionStorage.getItem(`${sessionBucketKey()}:active`));
    if (active) { activeId.value = active.id; messages.value = active.messages.map((m) => ({ ...m })); }
    // ⚠️ 显式 NOT 推进 seqCounter ——[index.vue L386] 新 Conversation 的 id 实际取自 Date.now()
    //   而 non-dependent 于 ++seqCounter,故此处无需调整它;
    //   若按早前设想跑 Math.max(restored.map(c=>c.id)) 会把 Date.now 量级的十万亿级大整数灌进
    //   seqCounter,经下方 activeSessionTitle 渲染出「第 178691500xxxxx 个空白画布」这种荒谬长串。
    //   seqCounter 维持自身小计数量纲供标题文案正常即可。
    // 画布返回、页面刷新和历史选择都继续使用同一段文字上下文。
  } catch {/* 数据损坏/schema 漂移反序列化失败 静默退化为空白画布默认态 */}
}
restorePersistedSessions();

// ----- 编辑器/SSE 流式核心(沿用原 handler,协议字段零变动)-----
const inputValue = ref(sessionStorage.getItem(`${sessionBucketKey()}:draft`) || "");
type ComposerAttachment = { id: string; name: string; type: string; size: number; dataUrl: string; file?: File };
const attachmentInputRef = ref<HTMLInputElement | null>(null);
const composerAttachments = ref<ComposerAttachment[]>([]);
function releaseWorkspaceAttachments() {
  for (const asset of composerAttachments.value) {
    if (asset.file && asset.dataUrl.startsWith("blob:")) URL.revokeObjectURL(asset.dataUrl);
  }
}
function resetAssistantWorkspace() {
  abortController?.abort();
  releaseWorkspaceAttachments();
  requestEpoch += 1;
  status.value = "idle";
  showSkillPicker.value = false;
  showAssetMenu.value = false;
  closeAssetPicker();
  composerAttachments.value = [];
  inputValue.value = "";
  messages.value = [];
  activeId.value = null;
  conversations.value = [];
  showHistory.value = false;
  if (__persistTimer != null) { clearTimeout(__persistTimer); __persistTimer = null; }
  restorePersistedSessions();
  inputValue.value = sessionStorage.getItem(`${sessionBucketKey()}:draft`) || "";
}
const hasVideoAttachment = computed(() => composerAttachments.value.some((file) => file.type.startsWith("video/")));

function fileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function readComposerFile(file: File): Promise<ComposerAttachment> {
  if (file.type.startsWith("video/")) {
    return Promise.resolve({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name, type: file.type, size: file.size, dataUrl: URL.createObjectURL(file), file });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

async function onComposerFilesSelected(event: Event) {
  if (status.value !== "idle") return;
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = "";
  if (!files.length) return;
  const allowed = files.filter((file) => /^(image|video)\//.test(file.type));
  const total = [...composerAttachments.value, ...allowed].filter((file) => !file.type.startsWith("video/")).reduce((sum, file) => sum + file.size, 0);
  if (total > 4 * 1024 * 1024 || allowed.some((file) => file.size > 100 * 1024 * 1024) || composerAttachments.value.length + allowed.length > 4) {
    MessagePlugin.warning("最多 4 个附件；单个视频不超过 100MB，其他素材总大小不超过 4MB");
    return;
  }
  try {
    composerAttachments.value.push(...await Promise.all(allowed.map(readComposerFile)));
    if (allowed.length !== files.length) MessagePlugin.info("当前支持图片和视频参考");
  } catch {
    MessagePlugin.error("附件读取失败，请重新选择");
  }
}

function removeComposerAttachment(id: string) {
  const asset = composerAttachments.value.find((file) => file.id === id);
  if (asset?.file && asset.dataUrl.startsWith("blob:")) URL.revokeObjectURL(asset.dataUrl);
  composerAttachments.value = composerAttachments.value.filter((file) => file.id !== id);
}

function openAssetPicker() {
  showAssetMenu.value = false;
  assetPickerKey.value += 1;
  showAssetPicker.value = true;
}

function closeAssetPicker() {
  showAssetPicker.value = false;
}

function handleAssetPickerMessage(event: MessageEvent) {
  if (status.value !== "idle" || !showAssetPicker.value || event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "xoi:asset-picker-close") {
    closeAssetPicker();
    return;
  }
  if (data.type !== "xoi:asset-picker-insert" || !data.payload) return;
  const payload = data.payload as { kind?: string; title?: string; content?: string; dataUrl?: string; url?: string };
  if (payload.kind === "text" && payload.content) {
    inputValue.value = inputValue.value ? `${inputValue.value}\n${payload.content}` : payload.content;
  } else if (payload.kind === "image" && payload.dataUrl) {
    composerAttachments.value = [...composerAttachments.value, {
      id: `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: payload.title || "画布图片素材",
      type: "image/*",
      size: 0,
      dataUrl: payload.dataUrl,
    }].slice(-4);
  } else if (payload.kind === "video" && payload.url) {
    composerAttachments.value = [...composerAttachments.value, {
      id: `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: payload.title || "画布视频素材",
      type: "video/*",
      size: 0,
      dataUrl: payload.url,
    }].slice(-4);
  }
  closeAssetPicker();
  nextTick(() => taRef.value?.focus());
}

function applyDraftFromRoute() {
  const draft = route.query.draft;
  if (typeof draft === "string") inputValue.value = draft;
}

applyDraftFromRoute();
watch(() => route.query.draft, applyDraftFromRoute);
const status = ref<"idle" | "pending" | "streaming">("idle");
const taRef = ref<HTMLTextAreaElement | null>(null);
const messagesRef = ref<HTMLElement | null>(null);
const mainRef = ref<HTMLElement | null>(null);
let abortController: AbortController | null = null;
let requestEpoch = 0;
onMounted(scrollToBottom);
onBeforeUnmount(() => {
  rememberConversation();
  requestEpoch += 1;
  abortController?.abort();
  if (__persistTimer != null) clearTimeout(__persistTimer);
  releaseWorkspaceAttachments();
});

const savedSnapshotOfMessages = (): Message[] => messages.value.map(({ video, images, ...message }) => ({ ...message }));

function pickPrompt(text: string) {
  inputValue.value = text;
  nextTick(() => taRef.value?.focus());
}

// 滚动到底部(mainScroll 与 messageList 共享滚动容器,统一操作 mainRef)
function scrollToBottom() {
  nextTick(() => {
    if (mainRef.value) mainRef.value.scrollTop = mainRef.value.scrollHeight;
  });
}

// Markdown 简易格式化(同原件 verbatim)
function formatMessage(content: string): string {
  if (!content) return "";
  return content.trim()
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

// 复制助手回复·所见即所得纯文本优先(md 星号会污染普通粘贴场景),
// DOM 缺失时退回原始 md 源兜底;navigator.clipboard 不可用时降级 execCommand('copy') 兼容 http / 受限环境(devConfig.vue 同款套路)
function writeClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackExec(text));
  }
  return Promise.resolve(fallbackExec(text));
}
function fallbackExec(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.setAttribute("readonly", "");
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
async function handleMsgCopy(msg: Message, e: MouseEvent) {
  // 从当前气泡内取已渲染的可见文本(br/pre 自然映射成换行·保留分段结构),保证贴出去干净不夹 md 符号
  const node = (e.currentTarget as HTMLElement)?.closest(".messageBubble")?.querySelector<HTMLElement>(".messageContent");
  const text = (node?.innerText ?? msg.content ?? "").trim();
  if (!text) return;
  const ok = await writeClipboard(text);
  copiedId.value = ok ? msg.id : null;
  MessagePlugin.info({ content: ok ? "已复制本条回复" : "复制失败·请手动选取", duration: 1500 });
  window.setTimeout(() => {
    if (copiedId.value === msg.id) copiedId.value = null;
  }, 1800);
}

// 发送(HTTP SSE 流式)— 原 endpoint/body 字段契约完全保留
async function handleSend() {
  if ((!inputValue.value.trim() && !composerAttachments.value.length) || status.value !== "idle") return;
  const attachments = [...composerAttachments.value];
  const model = selectedModelValue.value || undefined;
  const skills = activeSkillOptions.value.map((skill) => skill.path);
  const videos = attachments.filter((asset) => asset.type.startsWith("video/"));
  if (videos.length > 1) { MessagePlugin.warning("一次请分析一个视频，先移除多余视频"); return; }
  if (attachments.some((asset) => !/^(image|video)\//.test(asset.type))) {
    MessagePlugin.warning("请使用图片或视频参考"); return;
  }
  const content = inputValue.value.trim() || (videos.length ? "分析这段参考的画面、叙事和镜头语言，整理可用于创作的方案。" : "分析这些参考图片的构图、色彩和风格，给出创作建议。");
  const historyMessages = messages.value.filter((message) => message.role === "user" || message.status === "complete").slice(-10).map((message) => ({ role: message.role, content: message.content }));
  const tsBase = Date.now();
  const userMessage: Message = { id: String(tsBase), role: "user", content: content + attachments.map((asset) => `\n[参考：${asset.name}]`).join(""), status: "complete" };
  const assistantMessage: Message = { id: String(tsBase + 1), role: "assistant", content: "", status: "pending" };

  messages.value.push(userMessage);
  scrollToBottom();
  messages.value.push(assistantMessage);
  scrollToBottom();

  inputValue.value = "";

  // 若尚未归档本轮为新 Conversation 则即时登记一条用于后续历史回看
  if (activeId.value == null) {
    seqCounter.value += 1;
    const nid = Date.now();
    conversations.value.push({
      id: nid,
      title: genTitle(content.slice(0, 32)),
      messages: [],
    });
    activeId.value = nid;
  }

  status.value = "pending";
  const epoch = ++requestEpoch;
  rememberConversation();
  abortController?.abort();
  abortController = new AbortController();
  const controller = abortController;

  try {
    const analysisImages = await prepareReferenceImages(attachments.filter((asset) => asset.type.startsWith("image/")), controller.signal);
    if (epoch !== requestEpoch) return;
    if (analysisImages.length) messages.value[messages.value.length - 2].images = analysisImages;
    let analysisVideo: AnalysisVideo | undefined;
    if (videos[0]) {
      const current = messages.value[messages.value.length - 1];
      current.toolStatus = "正在读取视频并抽帧";
      analysisVideo = await extractAnalysisFrames({ name: videos[0].name, source: videos[0].file || videos[0].dataUrl }, controller.signal, (progress) => { current.toolStatus = progress; });
      current.video = analysisVideo;
      current.toolStatus = `已抽取 ${analysisVideo.frames.length} 帧，正在提交分析`;
      scrollToBottom();
    }
    const response = await fetch(
      `${baseUrl.value.replace("/api", "")}/api/aiAssistant/chat/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: localStorage.getItem("token") || "" },
        body: JSON.stringify({ content, messages: historyMessages, skills, model, agentMode: "analysis", analysisVideo, analysisImages: analysisImages.length ? analysisImages : undefined }),
        signal: controller.signal,
      },
    );

    if (epoch !== requestEpoch) { await response.body?.cancel(); return; }
    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errData = await response.json();
        errorMsg = errData.message || errData.error || errorMsg;
      } catch {}
      // 裸 fetch 绕过了 axios 拦截器：401（登录过期/无效）在这里兜底强制登出，
      // 否则报错体会被当成 Agent 回复显示成一团 JSON，用户不知道该重新登录
      if (response.status === 401) {
        localStorage.removeItem("token");
        MessagePlugin.error(window.$t("common.sessionExpired"));
        router.push({ path: "/login", query: { expired: "1" } });
        status.value = "idle";
        return;
      }
      throw new Error(errorMsg);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("无法读取响应流");

    const decoder = new TextDecoder();
    const lastMessage = messages.value[messages.value.length - 1];
    lastMessage.status = "streaming";

    let buffer = "";
    let streamError = "";
    let sawDone = false;
    while (true) {
      const { done, value } = await reader.read();
      if (epoch !== requestEpoch) { await reader.cancel(); return; }
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "data: [DONE]") { sawDone = true; continue; }
        if (trimmed === "") continue;
        if (trimmed.startsWith("data: ")) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.error) streamError = String(data.error);
            if (data.tool?.message) {
              messages.value[messages.value.length - 1].toolStatus = String(data.tool.message);
            }
            if (data.pointsDeducted) showPointsToast(data.pointsDeducted, data.balance);
            if (data.content && lastMessage) {
              // 展开重建而非原地 mutate,确保 Vue 响应式稳定刷新(git HEAD 原版验证过的写法,R3 行为保真)
              const idx = messages.value.length - 1;
              messages.value[idx] = {
                ...messages.value[idx],
                content: messages.value[idx].content + data.content,
                status: "streaming",
              };
              scrollToBottom();
            }
          } catch {}
        }
      }
    }
    if (streamError) throw new Error(streamError);
    if (!sawDone) throw new Error("响应连接提前结束，请重试");
    for (const asset of attachments) removeComposerAttachment(asset.id);
    // 流式过程每个 chunk 以 {...spread} 整体重建末位对象保响应式(git HEAD 验证过的写法);
    // 故此处绝不可复用上方缓存的 lastMessage——那引用早被 spread 弃置成脱队游魂,
    // 给它盖章不会落到 DOM 实际渲染所读的现行对象头上·须现场重取数组末位才是承载数据的真身,
    // 否则 status 永驻 'streaming' 连带依赖 status==='complete' 才渲染的 UI(回复尾部复制钮)终生不出形
    const finishedMessage = messages.value[messages.value.length - 1];
    if (finishedMessage) finishedMessage.status = "complete";

    // 完成:同步归档快照进入对应 Conversation 用于历史回看
    syncCurrentIntoActiveConv(savedSnapshotOfMessages());
  } catch (e: any) {
    if (epoch !== requestEpoch) return;
    if (e.name === "AbortError") {
      const lm = messages.value[messages.value.length - 1];
      if (lm) { lm.status = "error"; lm.content += "\n\n已停止本次回复"; lm.toolStatus = "已停止"; }
    } else {
      console.error("[aiAssistant] 发送失败:", e);
      const lm = messages.value[messages.value.length - 1];
      if (lm) {
        lm.toolStatus = "本次回复未完成";
        lm.content = `${lm.content ? lm.content + "\n\n" : ""}请求失败: ${e.message}`;
        lm.status = "error";
      }
    }
  } finally {
    if (epoch !== requestEpoch) return;
    status.value = "idle";
    syncCurrentIntoActiveConv(savedSnapshotOfMessages());
  }
}

function handleStop() {
  abortController?.abort();
}

function syncCurrentIntoActiveConv(snapshot: Message[]) {
  if (activeId.value == null) return;
  const cv = conversations.value.find((x) => x.id === activeId.value);
  if (cv) {
    cv.messages = snapshot;
    // 任一活跃对话内容更替后即刻排程落盘(debounce 合并连续流式追加单次写盘节流);
    // 与下方 clearConversations 内显式 removeItem 双出口共同覆盖所有 mutation 路径达成同设备跨刷新保留语义。
    schedulePersist();
  }
}

// ----- 会话管理动作 -----
function newConversation() {
  if (status.value !== "idle") { MessagePlugin.info("请先停止当前回复，再新建对话"); return; }
  // 当前若有完整完成的消息则先把它们归档好(便于稍后从历史里看回来),然后开启新的一张空白
  if (activeId.value != null) {
    syncCurrentIntoActiveConv(savedSnapshotOfMessages());
  }
  messages.value = [];
  activeId.value = null;
  showHistory.value = false;
  rememberConversation();
  nextTick(() => taRef.value?.focus());
}

function switchConversation(id: number) {
  if (status.value !== "idle") { MessagePlugin.info("请先停止当前回复，再切换对话"); return; }
  const cv = conversations.value.find((x) => x.id === id);
  if (!cv) return;
  // 保存当前对话后恢复所选对话；后续请求携带恢复后的上下文。
  syncCurrentIntoActiveConv(savedSnapshotOfMessages());
  activeId.value = id;
  messages.value = JSON.parse(JSON.stringify(cv.messages));
  rememberConversation();
  showHistory.value = false;
  scrollToBottom();
}

function clearConversations() {
  if (status.value !== "idle") { MessagePlugin.info("请先停止当前回复，再清空历史"); return; }
  conversations.value = [];
  activeId.value = null;
  messages.value = [];
  // 同步清掉浅档历史 localStorage 桶避免刷新后又冒出来与刚清空的内存态不一致
  try { localStorage.removeItem(sessionBucketKey()); sessionStorage.removeItem(`${sessionBucketKey()}:active`); if (__persistTimer != null) clearTimeout(__persistTimer); } catch {}
  MessagePlugin.success("已清空历史会话");
}

// ----- 执行模式 Pill · 「询问 ⇄ 自动」localStorage 记忆(handler ignore 待二代真分支 system prompt)-----
type ExecMode = "询问" | "自动";
const EXEC_KEY = "xo_assistant_exec_mode";
const initExecRaw =
  typeof localStorage !== "undefined" ? localStorage.getItem(EXEC_KEY) : null;
const execMode = ref<ExecMode>((initExecRaw === "询问" || initExecRaw === "自动") ? initExecRaw : "自动");
const imageSizes = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"];
const imageQualities = ["自动", "高", "中", "低"];
const videoQualities = ["720p", "480p", "1080p"];
const videoSizeOptions = [
  { value: "横屏", label: "1280x720", shape: "wide" }, { value: "竖屏", label: "720x1280", shape: "tall" }, { value: "方形", label: "960x960", shape: "square" },
  { value: "标准横屏", label: "1112x834", shape: "standard-wide" }, { value: "标准竖屏", label: "834x1112", shape: "standard-tall" }, { value: "宽银幕", label: "1470x630", shape: "cinema" },
];
const imageSize = ref("1:1");
const imageQuality = ref("自动");
const videoSize = ref("横屏");
const videoQuality = ref("720p");
const alignImageSize = ref(true);
const qualityPixels: Record<string, number> = { 自动: 1024, 高: 2048, 中: 1024, 低: 512 };
const imageDimensions = computed(() => {
  const [rw, rh] = imageSize.value.split(":").map(Number);
  const base = qualityPixels[imageQuality.value] || 1024;
  let width = rw >= rh ? base : Math.round(base * rw / rh);
  let height = rh >= rw ? base : Math.round(base * rh / rw);
  if (alignImageSize.value) { width = Math.max(16, Math.round(width / 16) * 16); height = Math.max(16, Math.round(height / 16) * 16); }
  return { width, height };
});
const videoDimensions = computed(() => {
  const option = videoSizeOptions.find((item) => item.value === videoSize.value) || videoSizeOptions[0];
  let [width, height] = option.label.split("x").map(Number);
  if (videoQuality.value === "480p") { const scale = 480 / Math.min(width, height); width = Math.round(width * scale); height = Math.round(height * scale); }
  if (videoQuality.value === "1080p") { const scale = 1080 / Math.min(width, height); width = Math.round(width * scale); height = Math.round(height * scale); }
  return { width, height };
});
function ratioPreviewStyle(value: string) {
  const [width, height] = value.split(":").map(Number);
  return { aspectRatio: `${width}/${height}` };
}
const reasoningEnabled = ref(false);
const openSetting = ref<"image" | "video" | null>(null);
function openComposerSetting(kind: "image" | "video") {
  showAssetMenu.value = false;
  showSkillPicker.value = false;
  openSetting.value = openSetting.value === kind ? null : kind;
}
function toggleExecMode() {
  execMode.value = execMode.value === "询问" ? "自动" : "询问";
  try { localStorage.setItem(EXEC_KEY, execMode.value); } catch {}
  MessagePlugin.info(`已切到${execMode.value}模式`);
}

// ----- 模型 Pill · 复用 ModelSelect 选完即显本地存储(label=value pair)-----
const MODEL_VAL_KEY = "xo_assistant_model_value";
const MODEL_LBL_KEY = "xo_assistant_model_label";
const selectedModelValue = ref<string>(
  typeof localStorage !== "undefined" ? localStorage.getItem(MODEL_VAL_KEY) || "" : "",
);
const selectedModelLabel = ref<string>(
  typeof localStorage !== "undefined" ? localStorage.getItem(MODEL_LBL_KEY) || "" : "",
);
const selectedModelName = computed(() => String(selectedModelValue.value || "").split(/:(.+)/)[1] || String(selectedModelValue.value || ""));
const defaultTextModel = ref("");
const defaultImageModel = ref("");
const defaultVideoModel = ref("");
const showBillingGuide = ref(false);

async function loadCreationDefaults() {
  try {
    const response = await fetch("/api/config", { headers: { Authorization: localStorage.getItem("token") || "" } });
    if (!response.ok) return;
    const config = await response.json();
    defaultTextModel.value = String(config?.chat_model || config?.chat_models?.[0] || "");
    defaultImageModel.value = String(config?.image_model || config?.image_models?.[0] || "");
    defaultVideoModel.value = String(config?.video_model || config?.video_models?.[0] || "");
    if (!selectedModelValue.value && defaultTextModel.value) {
      selectedModelValue.value = `newapi:${defaultTextModel.value}`;
      selectedModelLabel.value = defaultTextModel.value;
      onPickModel(selectedModelValue.value);
    }
  } catch {
    // 默认模型读取失败不阻断创作，模型选择器仍可单独加载。
  }
}
onMounted(loadCreationDefaults);
function onPickModel(value: string /* , _detail?: any */) {
  try {
    localStorage.setItem(MODEL_VAL_KEY, value);
    localStorage.setItem(MODEL_LBL_KEY, String(selectedModelLabel.value || ""));
  } catch {}
  // 注:B 方案下选中值只作客户端偏好,body 不附 modelHint 以彻底保全 chat.ts 向后兼容性;
  // 未来欲真生效仅需在此追加 axios.post('/setting/agentDeploy/updateAgentModel',{key:'universalAi-test',modelName:value}) 走测试位
}

// ----- 杂项 UI state/action -----
const showHistory = ref(false);
/*
 * focusMode 由全局 uiPrefs.aiAssistantChromeVisible 反向派生而非独立 ref，
 * 使 layouts/WorkbenchLayout.topMenu 与本地面板伪工具条共享同一份 reactive state 同步联动：
 *   chromeVisible=false ⇨ focusMode=true ⇨ 进入即是纯净沉浸(panelHeader 收起 & 外层 topMenu 隐藏)
 *   chromeVisible=true  ⇨ focusMode=false ⇨ 双层 chrome 回归便于跳转 项目列表/画布/定价等兄弟模块。
 * 写入经 setter 统一走 store.toggleAiAssistantChrome()，杜绝旧版那种「切换钮藏在会被自己关掉的 header 子树里、
 * 进了沉浸就再也点不到它」的自陷死锁缺陷（退出动作改由底部恒驻 ExitBtn 承担，详见 composerToolbar meta 底行）。
 */
const focusMode = computed({
  get: () => !uiPrefs.aiAssistantChromeVisible,
  set: () => uiPrefs.toggleAiAssistantChrome(),
});
const copiedId = ref<string | null>(null);

function toastRoadmap(featureName: string, extraNote = "") {
  const suffix = extraNote ? `\n${extraNote}` : "";
  MessagePlugin.info({
    content: `${featureName} 即将开放敬请期待${suffix}`,
    duration: 2200,
  });
}

function autogrowTextarea() {
  const el = taRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}
function focusComposer() {
  if (status.value === "pending" || status.value === "streaming") return;
  const editor = taRef.value;
  editor?.focus();
  // 空输入时，视觉上的 Tab 提示占据前缀位置；真实输入仍从第一个字符开始。
  if (editor && !inputValue.value) editor.setSelectionRange(0, 0);
}
function acceptSkillCompletion() {
  if (!completionSuggestion.value || inputValue.value) return;
  inputValue.value = completionSuggestion.value;
  nextTick(() => { autogrowTextarea(); taRef.value?.focus(); });
}
function acceptCyclePrompt() {
  if (completionSuggestion.value) return acceptSkillCompletion();
  inputValue.value = cyclePrompt.value;
  nextTick(() => { autogrowTextarea(); taRef.value?.focus(); });
}
function handleSkillTab(event: KeyboardEvent) {
  if (!inputValue.value && completionSuggestion.value) {
    event.preventDefault();
    acceptSkillCompletion();
  } else if (!inputValue.value) {
    event.preventDefault();
    acceptCyclePrompt();
  }
}
function handleComposerBackspace(event: KeyboardEvent) {
  const textarea = event.currentTarget as HTMLTextAreaElement;
  if (textarea.selectionStart !== 0 || textarea.selectionEnd !== 0) return;
  if (composerAttachments.value.length) {
    event.preventDefault();
    removeComposerAttachment(composerAttachments.value.at(-1)!.id);
    return;
  }
  if (!selectedSkills.value.length) return;
  event.preventDefault();
  toggleSkill(selectedSkills.value[selectedSkills.value.length - 1]);
}
function handleComposerDelete(event: KeyboardEvent) {
  const textarea = event.currentTarget as HTMLTextAreaElement;
  if (textarea.selectionStart !== textarea.selectionEnd || textarea.selectionStart !== textarea.value.length) return;
  if (composerAttachments.value.length) {
    event.preventDefault();
    removeComposerAttachment(composerAttachments.value.at(-1)!.id);
    return;
  }
  if (selectedSkills.value.length) {
    event.preventDefault();
    toggleSkill(selectedSkills.value[selectedSkills.value.length - 1]);
  }
}

const defaultPromptCards = [
  { title: "帮我写剧本开头", desc: "三幕式开场范例·人物地点冲突一句话立起来", prompt: "帮我把一部都市情感短剧的开场戏写得有张力,要求第一镜出现钩子。" },
  { title: "脑暴故事灵感", desc: "同一题材给出三种截然不同的展开走向供挑选", prompt: "围绕\"深夜便利店相遇\",为我提供三条差异化的剧情发展方向简述各自看点。" },
  { title: "生成角色设定", desc: "性别年龄职业性格背景欲望弧光一套档案", prompt: "为一部校园悬疑短剧的主角设计一份详尽的角色设定卡片包含外貌内在矛盾成长弧光。" },
] as const;
const inspirationPromptCards = [
  { title: "反常规人物关系", desc: "让最不可能并肩的人被迫共同完成一件事", prompt: "设计一个反常规的双主角关系：两人立场完全对立，却必须在24小时内共同完成同一目标。给出人物、冲突和三次关系反转。" },
  { title: "一分钟高能开场", desc: "用一个视觉奇观和一个秘密立刻抓住观众", prompt: "为一部悬疑短剧写60秒高能开场：前10秒出现视觉钩子，30秒揭露一个秘密，结尾留下必须点下一集的悬念。" },
  { title: "东方奇幻世界观", desc: "从一条独特规则长出完整故事世界", prompt: "以“人的影子会替主人保守秘密”为核心规则，设计一个东方奇幻世界观，包括社会秩序、职业、禁忌与主线冲突。" },
  { title: "品牌微电影", desc: "把产品价值藏进人物选择，而不是硬广", prompt: "为一个年轻化生活方式品牌构思3分钟微电影，产品只作为人物行动中的关键道具出现，主题关于重新出发。" },
  { title: "角色视觉设定", desc: "从性格、经历推导服装、色彩与标志物", prompt: "为一个表面温柔、实际极有控制欲的女性角色做视觉设定：轮廓、服装、材质、配色、发型、标志物和镜头表现。" },
  { title: "同题三种风格", desc: "电影感、轻喜剧、赛博寓言一次比较", prompt: "围绕“凌晨三点收到来自未来的外卖”这个命题，分别用电影感悬疑、都市轻喜剧、赛博寓言写三个故事梗概。" },
] as const;
const promptCards = computed(() => inspirationMode.value ? inspirationPromptCards : defaultPromptCards);
type InspirationItem = { title:string; category:string; image:string; prompt:string; detailIndex:number };
const inspirationPool: InspirationItem[] = [
  { title:"城市电影感",category:"影视与分镜",image:inspirationCinematic,detailIndex:5,prompt:"为雨夜城市题材微短剧设计一段电影感开场，用霓虹、倒影和人物动作推进情绪，输出分镜表。" },
  { title:"都市心动故事",category:"摄影短片",image:inspirationUrban,detailIndex:6,prompt:"构思一部成熟都市情感短剧，用暖色摄影和人物空间距离表现关系变化，给出角色与前3集钩子。" },
  { title:"青春窗边",category:"摄影短片",image:inspirationAnime,detailIndex:3,prompt:"策划一支窗边自然光风格的青春短片，使用日系胶片质感，给出60秒剧情和逐镜头拍摄方案。" },
  { title:"新国潮品牌视觉",category:"品牌与广告",image:inspirationGuochao,detailIndex:11,prompt:"为年轻消费品牌设计新国潮视觉系统，把东方符号转成现代二维语言，输出 Logo、色彩、图形和海报方向。" },
  { title:"黏土奇遇记",category:"影视与分镜",image:inspirationClay,detailIndex:8,prompt:"策划一支黏土定格动画短片，突出手作纹理和微缩布景，输出故事梗概、角色和12镜分镜。" },
  { title:"月下国潮幻想",category:"东方美学",image:inspirationFantasy,detailIndex:4,prompt:"设计一张月下国潮幻想海报，把传统纹样、神兽和超现实空间结合，给出构图、配色、材质和生成提示词。" },
  { title:"赛博国风世界",category:"东方美学",image:inspirationGuofeng,detailIndex:13,prompt:"搭建一个赛博国风短剧世界，将古典建筑、数字霓虹和机械角色融合，输出世界观、角色和首集分镜。" },
  { title:"三维动画角色",category:"角色与 IP",image:inspirationCyber,detailIndex:9,prompt:"设计一个适合商业动画的3D角色 IP，给出体块语言、配色、表情、动作和衍生品方向。" },
];
const inspirationItems = ref<InspirationItem[]>([]);
function shuffleInspirations() {
  const shuffled = [...inspirationPool];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  inspirationItems.value = shuffled;
}
shuffleInspirations();
function useInspiration(prompt: string) {
  inputValue.value = prompt;
  nextTick(() => { autogrowTextarea(); taRef.value?.focus(); taRef.value?.scrollIntoView({ behavior: "smooth", block: "center" }); });
}

// 注:baseUrl 经 storeToRefs 解构后用于 handleSend 的 SSE URL `${baseUrl.value.replace("/api","")}/api/aiAssistant/chat/stream`,
//    不需要额外 void 占位语句(会引入 unused 表达式告警)。
</script>

<style lang="scss" scoped>
.creativeWorkspace {
  --surface: var(--td-bg-color-container, #fff); --ink: var(--td-text-color-primary, #242321); --muted: var(--td-text-color-secondary, #8b8883); --line: var(--td-component-border, #ebe9e5); --accent: #e66b35;
  color:var(--ink);background:var(--td-bg-color-page,#faf9f6);height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;font-family:inherit;
  button {font-family:inherit;cursor:pointer;color:inherit;} button:disabled{opacity:.4;cursor:not-allowed;} a{color:inherit;text-decoration:none;} button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px;}
}
.workspaceHeader{height:76px;flex-shrink:0;padding:0 36px;display:flex;align-items:center;gap:30px;border-bottom:1px solid var(--line);background:var(--surface);}
.workspaceBrand{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:650;white-space:nowrap;} .workspaceBrand img{width:27px;height:27px;object-fit:contain;}
.workspaceNav{display:flex;align-items:center;gap:24px;font-size:13px;color:var(--muted);height:100%;}.workspaceNav>*{height:100%;display:flex;align-items:center;position:relative;}.workspaceNav .current{color:var(--ink);font-weight:600;}.workspaceNav .current:after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;background:var(--ink);border-radius:2px;}.workspaceNav a:hover{color:var(--accent);}
.sessionActions{margin-left:auto;display:flex;gap:8px;}.sessionActions button{border:0;background:none;padding:8px 10px;border-radius:8px;font-size:12px;display:flex;align-items:center;gap:6px;color:var(--muted);}.sessionActions button:hover{background:var(--td-bg-color-secondarycontainer,#f4f3f0);color:var(--ink);}.sessionActions button:last-child{border:1px solid var(--line);color:var(--ink);}
.assistantPanel{width:min(840px,calc(100% - 64px));margin:0 auto;display:flex;flex-direction:column;flex:1;min-height:0;padding:20px 0 14px;}.emptyMode .assistantPanel{justify-content:center;padding-bottom:8vh;}.mainScrollArea{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;}.emptyMode .mainScrollArea{flex:0 0 auto;overflow:visible;}
.welcome{padding:0 0 30px;text-align:center;}.welcomeMark{display:block;color:var(--accent);font-size:31px;margin-bottom:18px;}.welcome h1{font-size:clamp(26px,2.7vw,36px);font-weight:650;letter-spacing:-1px;line-height:1.5;margin:0 0 12px;}.welcome p{font-size:14px;color:var(--muted);line-height:1.8;margin:0;}
.composerToolbar{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 20px 14px;box-shadow:0 8px 30px #24201806;flex-shrink:0;transition:border-color .2s,box-shadow .2s;}.composerToolbar:focus-within{border-color:#d5c2b2;box-shadow:0 8px 35px #24201809;}.composerToolbar textarea{width:100%;display:block;box-sizing:border-box;background:none;border:none;outline:none;color:var(--ink);font:inherit;font-size:15px;line-height:1.8;resize:none;min-height:64px;max-height:150px;padding:0 2px 12px;}.emptyMode textarea{min-height:106px;}.composerToolbar textarea::placeholder{color:var(--muted);opacity:.85;}
.composerBottom{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:8px;}.toolbarLeft,.toolbarRight{display:flex;align-items:center;gap:8px;min-width:0;}.toolbarLeft button,.costToggle{background:none;border:none;border-radius:8px;padding:7px 9px;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);}.toolbarLeft button:hover,.costToggle:hover,.toolbarLeft .active{background:var(--td-bg-color-secondarycontainer,#f4f3f0);color:var(--ink);}.skillCount{font-size:10px;background:#f6e6db;color:#bd693f;padding:0 5px;border-radius:4px;}
.modelSlot{width:176px;min-width:0;margin:0;padding:0;border:0;}.modelSlot:disabled{pointer-events:none;opacity:.6;}.modelSlot :deep(.modelCostHint){display:none;}.modelSlot :deep(.t-input){background:transparent;border:0;box-shadow:none;height:30px;font-size:12px;color:var(--muted);}.modelSlot :deep(.t-input__inner){font-size:12px;color:var(--muted);}.modelSlot :deep(.t-input__suffix){color:var(--muted);}.sendButton,.stopButton{border:0;border-radius:10px;background:var(--ink);color:var(--surface)!important;min-height:36px;padding:0 13px;font-size:12px;display:flex;align-items:center;gap:13px;}.sendButton:disabled{background:var(--td-bg-color-secondarycontainer,#efeeea);color:var(--muted)!important;opacity:.6;}.stopButton{gap:8px;}.sendButton:hover:not(:disabled){background:#48423c;}.referenceHint{font-size:11px;color:var(--muted);padding-bottom:8px;}
.editorSkills{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px;}.editorSkills button{display:flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--td-bg-color-page,#faf9f6);border-radius:8px;font-size:12px;padding:5px 8px;max-width:230px;}.editorSkills img{width:28px;height:28px;object-fit:cover;border-radius:4px;}.editorSkills button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.editorSkills svg{flex-shrink:0;}
.billingGuide{border-top:1px solid var(--line);margin-top:10px;padding-top:12px;display:flex;gap:12px;flex-direction:column;font-size:12px;}.billingGuide small{color:var(--muted);line-height:1.8;}
.taskStarters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:20px;}.taskStarters button{display:grid;grid-template-columns:30px 1fr 12px;grid-template-rows:22px 20px;gap:0 8px;align-items:center;text-align:left;padding:16px 12px;background:transparent;border:1px solid transparent;border-radius:12px;}.taskStarters button:hover{background:var(--surface);border-color:var(--line);}.starterIcon{grid-row:1/3;font-size:21px;color:#a48973;}.taskStarters strong{font-size:13px;font-weight:550;}.taskStarters small{grid-column:2;font-size:11px;color:var(--muted);}.starterArrow{grid-column:3;grid-row:1/3;color:var(--muted);}.composerFootnote{margin:14px 0 0;text-align:center;font-size:11px;color:var(--muted);}
.conversationTitle{color:var(--muted);font-size:12px;text-align:center;margin:8px 0 28px;}.messageList{padding:0 10px 24px;}.messageWrapper{display:flex;gap:14px;align-items:flex-start;margin-bottom:30px;}.messageWrapper.user{justify-content:flex-end;}.messageAvatar{color:var(--accent);font-size:22px;flex-shrink:0;width:25px;padding-top:3px;}.messageBubble{min-width:0;max-width:calc(100% - 42px);font-size:14px;line-height:1.9;}.messageBubble.user{border-radius:16px 16px 4px 16px;background:var(--td-bg-color-secondarycontainer,#efede8);padding:12px 18px;}.messageContent{overflow-wrap:anywhere;}.messageContent :deep(pre){white-space:pre-wrap;padding:14px;background:var(--td-bg-color-secondarycontainer,#efede8);border-radius:10px;}.messageContent :deep(code){font-size:12px;}.replyActions{display:flex;align-items:center;gap:14px;margin-top:18px;}.replyActions button{display:flex;align-items:center;gap:6px;font-size:12px;border:0;background:transparent;color:var(--muted);padding:6px 0;}.replyActions .analysisHandoff{border:1px solid var(--line);padding:7px 10px;border-radius:8px;color:var(--ink);}.replyActions .analysisHandoff:hover:not(:disabled){border-color:#c7b5a8;background:var(--surface);}.referenceImages{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}.referenceImages img{max-width:160px;height:100px;object-fit:contain;border-radius:8px;}
.agentPendingState{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;padding-top:4px;}.progressDot{width:6px;height:6px;border-radius:50%;background:var(--accent);animation:pulse 1.5s ease infinite;}.analysisToolStatus{font-size:12px;color:var(--muted);}.videoAnalysisPreview{margin-top:14px;font-size:12px;max-width:100%;border:1px solid var(--line);border-radius:10px;padding:10px 12px;}.videoAnalysisPreview summary{cursor:pointer;overflow-wrap:anywhere;}.videoAnalysisPreview summary span{color:var(--muted);margin-left:8px;}.videoAnalysisPreview small{color:var(--muted);display:block;margin-top:6px;font-size:11px;}.analysisFrameStrip{display:flex;gap:8px;overflow:auto;margin-top:10px;padding-bottom:6px;}.analysisFrameStrip figure{flex:0 0 110px;margin:0;}.analysisFrameStrip img{width:110px;height:72px;object-fit:contain;background:#252525;border-radius:5px;}.analysisFrameStrip figcaption{font-size:10px;text-align:center;color:var(--muted);}
.popover{position:absolute;bottom:calc(100% + 10px);left:0;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;box-shadow:0 10px 50px #00000016;z-index:30;}.assetMenu{width:240px;}.assetMenu>strong{display:block;font-size:13px;margin-bottom:10px;}.assetMenu button{border:none;background:none;width:100%;text-align:left;display:flex;gap:10px;align-items:center;padding:10px 4px;border-radius:8px;font-size:13px;}.assetMenu button:hover{background:var(--td-bg-color-page,#faf9f6);}.assetMenu small{display:block;font-size:11px;color:var(--muted);margin-top:3px;}
.skillPicker{width:min(460px,calc(100vw - 70px));display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;}.skillPicker header{display:flex;justify-content:space-between;font-size:13px;margin-bottom:14px;}.skillPicker header a{font-size:11px;color:var(--muted);}.skillPickerTop{display:flex;justify-content:space-between;gap:12px;padding-bottom:12px;}.skillTabs{display:flex;gap:4px;}.skillTabs button{border:0;border-radius:6px;background:none;padding:5px 9px;font-size:12px;color:var(--muted);}.skillTabs .active{background:var(--td-bg-color-secondarycontainer,#f4f3f0);color:var(--ink);}.skillPickerTop input{min-width:0;width:160px;border:1px solid var(--line);border-radius:6px;background:transparent;padding:6px 9px;font:inherit;font-size:12px;color:var(--ink);}.skillList{overflow:auto;min-height:0;}.skillOption{width:100%;display:flex;align-items:center;gap:10px;text-align:left;background:none;border:0;border-radius:8px;padding:10px 7px;}.skillOption:hover,.skillOption.selected{background:var(--td-bg-color-secondarycontainer,#f4f3f0);}.skillGlyph{width:24px;flex-shrink:0;}.skillCopy{flex:1;min-width:0;}.skillCopy strong{display:block;font-size:12px;font-weight:550;}.skillCopy small{display:block;font-size:11px;color:var(--muted);line-height:1.6;margin-top:3px;}.skillOfficial{color:var(--muted);}.clearSkills{margin-top:10px;border:0;background:none;color:var(--muted)!important;font-size:11px!important;}.skillEmpty{color:var(--muted);font-size:12px;}
.historyDrawer{position:absolute;right:24px;top:68px;width:310px;max-height:calc(100% - 90px);z-index:40;padding:18px;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 45px #00000018;display:flex;flex-direction:column;box-sizing:border-box;}.historyDrawer header{display:flex;align-items:center;justify-content:space-between;font-size:14px;margin-bottom:14px;}.historyDrawer header button{border:0;background:none;padding:4px;}.conversationList{overflow:auto;}.conversationList button{display:flex;flex-direction:column;text-align:left;gap:5px;width:100%;border:0;padding:12px 8px;border-radius:8px;background:none;}.conversationList button:hover,.conversationList button.active{background:var(--td-bg-color-secondarycontainer,#f4f3f0);}.conversationList strong{font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;}.conversationList small,.emptyHint{color:var(--muted);font-size:11px;}.clearAllBtn{border:0;border-top:1px solid var(--line);background:none;text-align:left;margin-top:12px;padding:14px 8px 0;font-size:11px!important;color:var(--muted)!important;}
.assetPickerOverlay{position:fixed;inset:0;z-index:5000;display:grid;place-items:center;background:#0006;padding:24px;}.assetPickerDialog{position:relative;width:min(1040px,95vw);height:min(720px,90vh);background:var(--td-bg-color-container,#fff);border-radius:16px;overflow:hidden;}.assetPickerFrame{width:100%;height:100%;border:0;}.pickerClose{position:absolute;top:12px;right:12px;z-index:1;border:1px solid #ddd;border-radius:8px;padding:8px;cursor:pointer;}
@keyframes pulse{50%{opacity:.3;}}
@media(max-width:700px){.workspaceHeader{padding:0 18px;gap:20px;height:62px;}.workspaceNav{gap:16px;font-size:12px;}.sessionActions{gap:1px;}.sessionActions button{padding:7px;}.sessionActions button > span:nth-child(2){display:none!important;}.assistantPanel{width:calc(100% - 32px);padding-top:16px;}.emptyMode .assistantPanel{padding-bottom:4vh;}.welcome{padding-bottom:24px;}.welcome h1{font-size:26px;letter-spacing:-.5px;}.welcome p{max-width:280px;margin:auto;font-size:12px;}.welcomeMark{margin-bottom:12px;}.composerToolbar{padding:16px 14px 12px;border-radius:16px;}.composerToolbar textarea{font-size:14px;}.composerBottom{gap:4px;flex-wrap:wrap;}.toolbarLeft{gap:2px;}.toolbarRight{gap:2px;margin-left:auto;}.toolbarLeft button{padding:7px 5px;}.modelSlot{width:128px;}.costToggle{padding:7px 5px;font-size:11px;}.sendButton{gap:6px;padding:0 10px;}.taskStarters{gap:2px;margin-top:14px;}.taskStarters button{padding:10px 4px;grid-template-columns:1fr;grid-template-rows:26px 23px;text-align:center;gap:0;}.starterIcon{grid-row:1;}.taskStarters strong{font-size:12px;}.taskStarters small,.starterArrow{display:none;}.messageList{padding-left:0;padding-right:0;}.messageWrapper{gap:8px;}.messageBubble{max-width:calc(100% - 30px);font-size:13px;}.messageAvatar{width:22px;}.historyDrawer{right:12px;width:min(310px,calc(100vw - 24px));top:58px;}.skillPicker{width:min(460px,calc(100vw - 32px));}.composerFootnote{font-size:10px;}}
@media(max-width:700px){
  :global(.main:has(.creativeWorkspace) > .menu){display:none!important;}
  :global(.main:has(.creativeWorkspace.navOpen) > .menu){display:flex!important;}
}
@media(prefers-reduced-motion:reduce){.progressDot{animation:none;}}
</style>
