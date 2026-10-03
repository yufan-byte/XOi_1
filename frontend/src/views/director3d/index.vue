<template>
  <main v-if="isLibrary" class="director3d-library">
    <section class="director-library-hero">
      <div class="director-library-grid" aria-hidden="true"></div>
      <div class="director-library-copy">
        <span class="director-library-eyebrow">XOi / 3D PREVIS</span>
        <h1>3D 导演台</h1>
        <p>搭建场景、安排人物走位、设计镜头与关键帧，把导演想法变成可预演的分镜。</p>
        <div class="director-library-actions">
          <button class="director-library-primary" type="button" @click="createProject">＋ 新建导演台</button>
          <button class="director-library-secondary" type="button" @click="openLatestProject">打开导演台 <span>→</span></button>
        </div>
      </div>
      <div class="director-library-visual" aria-hidden="true">
        <img :src="directorLibraryHero" alt="" />
      </div>
    </section>

    <section class="director-library-workspace">
      <div class="director-library-heading">
        <div>
          <span>导演台库</span>
          <h2>继续创作</h2>
        </div>
        <button class="director-library-text-action" type="button" @click="createProject">新建导演台 ＋</button>
      </div>
      <div class="director-project-library-grid">
        <article v-for="project in sortedProjects" :key="project.id" class="director-project-library-card" role="button" tabindex="0" @click="openProject(project.id)" @keydown.enter="openProject(project.id)">
          <button class="director-project-card-delete" type="button" :disabled="projects.length === 1" @click.stop="openDeleteProject(project.id)">删除</button>
          <span class="director-project-card-scene">3D</span>
          <span class="director-project-card-preview">
            <img :src="directorProjectPreview" alt="" loading="lazy" decoding="async" />
          </span>
          <strong>{{ project.name }}</strong>
          <small>{{ getProjectSummary(project.id) }}</small>
          <time>{{ formatProjectDate(project.updatedAt || project.createdAt) }}</time>
          <span class="director-project-card-open">打开 →</span>
        </article>
        <button class="director-project-library-card director-project-library-new" type="button" @click="createProject">
          <span>＋</span>
          <strong>新建导演台</strong>
          <small>从一个空白场景开始</small>
        </button>
      </div>
    </section>

    <div v-if="projectAction === 'delete'" class="director-library-delete-mask">
      <section class="director-library-delete-dialog" role="alertdialog" aria-modal="true">
        <span>删除导演台</span>
        <h2>确定删除“{{ deleteProjectTarget?.name }}”吗？</h2>
        <p>该导演台中的模型、镜头、相机和关键帧都会被删除，且无法恢复。</p>
        <div>
          <button type="button" @click="projectAction = null">保留导演台</button>
          <button class="danger" type="button" @click="confirmDeleteProject">确认删除</button>
        </div>
      </section>
    </div>
  </main>

  <div v-else class="director3d-container">
    <div class="project-bar" :style="projectBarMetrics">
      <button class="project-trigger" type="button" @click="projectPanelVisible = true">
        <span class="project-eyebrow">导演台</span>
        <strong>{{ currentProject?.name || "未命名场景" }}</strong>
      </button>
      <button class="project-create" type="button" title="新建场景" @click="createProject">
        <span>＋</span>
      </button>
    </div>
    <iframe
      ref="iframeRef"
      :key="activeProjectId"
      :src="iframeSrc"
      frameborder="0"
      allowfullscreen
      :allow="iframeAllow"
      class="director3d-iframe"
      @load="onIframeLoad"
    ></iframe>
    <div v-if="loading" class="loading-overlay">
      <t-loading size="large" />
      <p class="loading-text">正在加载 3D 导演台...</p>
    </div>

    <!-- monoform 导出产物卡片（postMessage {source:'monoform',type:'export'}） -->
    <transition name="export-fade">
      <div v-if="exportCard" class="export-card">
        <div class="export-preview">
          <img
            v-if="exportCard.kind === 'image'"
            :src="exportCard.objectUrl"
            alt="导演台截图预览"
          />
          <video v-else :src="exportCard.objectUrl" controls></video>
        </div>
        <div class="export-body">
          <p class="export-title">
            {{ exportCard.kind === "image" ? "收到导演台截图" : "收到导演台录像" }}
          </p>
          <p class="export-meta">{{ exportCard.metaLabel }}</p>
          <div class="export-actions">
            <t-button size="small" variant="outline" @click="downloadExport">
              下载到本地
            </t-button>
            <t-tooltip
              :content="sendBlockedHint"
              :disabled="exportCard.kind === 'image'"
            >
              <t-button
                size="small"
                theme="primary"
                :disabled="exportCard.kind !== 'image'"
                @click="sendExportToCanvas"
              >
                发送到画布
              </t-button>
            </t-tooltip>
            <t-button size="small" variant="text" @click="dismissExport">
              关闭
            </t-button>
          </div>
        </div>
      </div>
    </transition>

    <div v-if="projectPanelVisible" class="project-dialog-mask" @click.self="projectPanelVisible = false">
      <section class="project-dialog" role="dialog" aria-modal="true" aria-label="导演台场景管理">
        <header class="project-dialog-header">
          <div>
            <span>导演台文件</span>
            <h2>选择要继续制作的场景</h2>
            <p>每个场景独立保存模型、镜头、相机和关键帧。</p>
          </div>
          <button class="dialog-close" type="button" aria-label="关闭" @click="projectPanelVisible = false">×</button>
        </header>
        <div class="project-grid">
          <button
            v-for="(project, index) in projects"
            :key="project.id"
            class="project-card"
            :class="{ active: project.id === activeProjectId }"
            type="button"
            @click="switchProject(project.id)"
          >
            <span class="project-card-index">{{ String(index + 1).padStart(2, "0") }}</span>
            <strong>{{ project.name }}</strong>
            <small>{{ project.id === activeProjectId ? "当前正在编辑" : "点击切换到此场景" }}</small>
            <i v-if="project.id === activeProjectId">当前</i>
          </button>
          <button class="project-card project-card-new" type="button" @click="createProject">
            <span>＋</span>
            <strong>新建场景</strong>
            <small>从空白场景开始制作</small>
          </button>
        </div>
        <footer class="project-dialog-footer">
          <button class="project-footer-button" type="button" @click="goToLibrary">返回导演台库</button>
          <button class="project-footer-button" type="button" @click="openRenameProject">重命名当前场景</button>
          <button class="project-footer-button danger" type="button" :disabled="projects.length === 1" @click="() => openDeleteProject()">删除当前场景</button>
        </footer>

        <div v-if="projectAction" class="project-action-mask">
          <form v-if="projectAction === 'rename'" class="project-action-panel" @submit.prevent="confirmRenameProject">
            <span class="project-action-kicker">重命名场景</span>
            <h3>给场景换个容易识别的名字</h3>
            <input v-model="projectNameDraft" class="project-name-input" maxlength="40" autofocus />
            <div class="project-action-footer">
              <button type="button" class="project-footer-button" @click="projectAction = null">取消</button>
              <button type="submit" class="project-action-primary">保存名称</button>
            </div>
          </form>
          <section v-else class="project-action-panel project-delete-panel" role="alertdialog" aria-modal="true">
            <span class="project-action-kicker danger">删除场景</span>
            <h3>确定删除“{{ deleteProjectTarget?.name }}”吗？</h3>
            <p>场景内的模型、镜头、相机和关键帧都会被删除，且无法恢复。</p>
            <div class="project-action-footer">
              <button type="button" class="project-footer-button" @click="projectAction = null">保留场景</button>
              <button type="button" class="project-action-primary danger" @click="confirmDeleteProject">确认删除</button>
            </div>
          </section>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import directorLibraryHero from "@/assets/director3d/director-library-hero.png";
import directorProjectPreview from "@/assets/director3d/director-project-preview.png";

interface MonoformExport {
  kind: "image" | "video";
  blob: Blob;
  width?: number;
  height?: number;
  objectUrl: string;
  fileName: string;
  metaLabel: string;
}

const iframeRef = ref<HTMLIFrameElement | null>(null);
const loading = ref(true);
const exportCard = ref<MonoformExport | null>(null);

type DirectorProject = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
};

const PROJECTS_STORAGE_KEY = "director3d-projects-v1";
const ACTIVE_PROJECT_STORAGE_KEY = "director3d-active-project-v1";
const LEGACY_PROJECT_ID = "director3d-main";
const route = useRoute();
const router = useRouter();

function getInitialProjects(): DirectorProject[] {
  try {
    const stored = JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) || "[]");
    if (Array.isArray(stored) && stored.length) {
      return stored.filter((item): item is DirectorProject => typeof item?.id === "string" && typeof item?.name === "string");
    }
  } catch {
    // 使用下面的迁移默认值
  }
  // 迁移既有独立导演台，让此前的创作内容成为第一个可见文件。
  return [{ id: LEGACY_PROJECT_ID, name: "1号场景", createdAt: Date.now() }];
}

const projects = ref<DirectorProject[]>(getInitialProjects());
const activeProjectId = ref(localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY) || projects.value[0].id);
const projectPanelVisible = ref(false);
const emptyOnFirstLoad = new Set<string>();
const projectAction = ref<"rename" | "delete" | null>(null);
const projectActionTargetId = ref<string | null>(null);
const projectNameDraft = ref("");
const projectBarMetrics = ref({ width: "192px", height: "56px" });
const isLibrary = computed(() => !route.query.scene);
const sortedProjects = computed(() => [...projects.value].sort((a, b) => a.createdAt - b.createdAt));

if (!projects.value.some((project) => project.id === activeProjectId.value)) {
  activeProjectId.value = projects.value[0].id;
}

const currentProject = computed(() => projects.value.find((project) => project.id === activeProjectId.value));
const deleteProjectTarget = computed(() => {
  const id = projectAction.value === "delete" ? projectActionTargetId.value : null;
  return projects.value.find((project) => project.id === id);
});

watch(
  () => route.query.scene,
  (scene) => {
    const id = Array.isArray(scene) ? scene[0] : scene;
    if (!id || !projects.value.some((project) => project.id === id) || id === activeProjectId.value) return;
    activeProjectId.value = id;
    loading.value = true;
    persistProjectState();
  },
  { immediate: true },
);

function persistProjectState() {
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects.value));
  localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, activeProjectId.value);
}

function openProject(id: string) {
  const project = projects.value.find((item) => item.id === id);
  if (!project) return;
  project.updatedAt = Date.now();
  activeProjectId.value = id;
  loading.value = true;
  persistProjectState();
  void router.push({ path: "/director3d", query: { scene: id } });
}

function openLatestProject() {
  const project = sortedProjects.value[0];
  if (project) openProject(project.id);
}

function goToLibrary() {
  projectPanelVisible.value = false;
  projectAction.value = null;
  void router.push({ path: "/director3d" });
}

function getProjectSummary(id: string) {
  try {
    const raw = localStorage.getItem(`monoform-project-${id}`);
    const project = raw ? JSON.parse(raw) : null;
    const shots = Array.isArray(project?.shots) ? project.shots.length : 0;
    const objects = Array.isArray(project?.objects) ? project.objects.length : 0;
    return `${shots} 个镜头 · ${objects} 个物体`;
  } catch {
    return "0 个镜头 · 0 个物体";
  }
}

function formatProjectDate(timestamp: number) {
  return `更新于 ${new Date(timestamp).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
}

function createProject() {
  const nextNumber = projects.value.length + 1;
  const id = `director3d-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  projects.value.push({ id, name: `${nextNumber}号场景`, createdAt: Date.now(), updatedAt: Date.now() });
  emptyOnFirstLoad.add(id);
  activeProjectId.value = id;
  loading.value = true;
  projectPanelVisible.value = false;
  persistProjectState();
  void router.push({ path: "/director3d", query: { scene: id } });
}

function switchProject(id: string) {
  if (id === activeProjectId.value) {
    projectPanelVisible.value = false;
    return;
  }
  activeProjectId.value = id;
  loading.value = true;
  projectPanelVisible.value = false;
  persistProjectState();
  void router.replace({ path: "/director3d", query: { scene: id } });
}

function openRenameProject() {
  const project = currentProject.value;
  if (!project) return;
  projectNameDraft.value = project.name;
  projectActionTargetId.value = project.id;
  projectAction.value = "rename";
}

function confirmRenameProject() {
  const project = currentProject.value;
  const name = projectNameDraft.value.trim();
  if (!project || !name) return;
  project.name = name;
  projectActionTargetId.value = null;
  projectAction.value = null;
  persistProjectState();
}

function openDeleteProject(id = currentProject.value?.id) {
  if (!id || !projects.value.some((project) => project.id === id) || projects.value.length <= 1) return;
  projectActionTargetId.value = id;
  projectAction.value = "delete";
}

function confirmDeleteProject() {
  const project = deleteProjectTarget.value;
  if (!project || projects.value.length <= 1) return;
  localStorage.removeItem(`monoform-project-${project.id}`);
  localStorage.removeItem(`monoform-custom-poses-${project.id}`);
  const currentIndex = projects.value.findIndex((item) => item.id === project.id);
  projects.value.splice(currentIndex, 1);
  if (activeProjectId.value === project.id) {
    activeProjectId.value = projects.value[Math.max(0, currentIndex - 1)].id;
  }
  loading.value = true;
  projectActionTargetId.value = null;
  projectAction.value = null;
  projectPanelVisible.value = false;
  persistProjectState();
  if (!isLibrary.value) {
    void router.replace({ path: "/director3d", query: { scene: activeProjectId.value } });
  }
}

function hideMonoformBrand() {
  const iframeDocument = iframeRef.value?.contentDocument;
  if (!iframeDocument) return;
  const topbar = iframeDocument.querySelector<HTMLElement>(".topbar");
  const brandMark = iframeDocument.querySelector<HTMLElement>(".brand-mark");
  if (!topbar || !brandMark) return;

  let style = iframeDocument.getElementById("xoi-director-project-style") as HTMLStyleElement | null;
  if (!style) {
    style = iframeDocument.createElement("style");
    style.id = "xoi-director-project-style";
    style.textContent = ".brand-mark { visibility: hidden !important; pointer-events: none !important; }";
    iframeDocument.head.appendChild(style);
  }

  const brandRect = brandMark.getBoundingClientRect();
  const topbarRect = topbar.getBoundingClientRect();
  if (brandRect.width && topbarRect.height) {
    projectBarMetrics.value = {
      width: `${Math.ceil(brandRect.width)}px`,
      height: `${Math.ceil(topbarRect.height)}px`,
    };
  }
}

// 每个文件传自己的 key。MONOFORM 会据此隔离项目、动作预设等本地数据。
const iframeSrc = computed(() => `${import.meta.env.BASE_URL}monoform/index.html?key=${encodeURIComponent(activeProjectId.value)}`);
const iframeAllow = "camera; microphone; clipboard-write; download; fullscreen";

function onIframeLoad() {
  hideMonoformBrand();
  window.setTimeout(hideMonoformBrand, 50);
  const projectId = activeProjectId.value;
  if (!emptyOnFirstLoad.has(projectId)) {
    loading.value = false;
    return;
  }

  // MONOFORM 本身首开会放入示例人物。对刚创建的文件自动点一次其内部“新建”，
  // 复用它已有的初始化逻辑，得到真正没有物体和关键帧的空场景。
  let attempts = 0;
  const initializeEmptyScene = () => {
    const buttons = iframeRef.value?.contentDocument?.querySelectorAll<HTMLButtonElement>(".top-actions button");
    const newButton = buttons && Array.from(buttons).find((button) => button.textContent?.trim() === "新建");
    if (!newButton && attempts++ < 40) {
      window.setTimeout(initializeEmptyScene, 50);
      return;
    }
    newButton?.click();
    emptyOnFirstLoad.delete(projectId);
    loading.value = false;
  };
  initializeEmptyScene();
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

// MONOFORM 出站协议仅两条：{source:'monoform', type:'export', kind:'image'|'video', blob, width?, height?}
async function handleMessage(event: MessageEvent) {
  const data = event.data;
  if (!data || data.source !== "monoform" || data.type !== "export" || !data.blob) {
    return;
  }
  if (data.kind !== "image" && data.kind !== "video") return;

  const blob = data.blob as Blob;
  const ext = data.kind === "image" ? "png" : "mp4";
  const stamp = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fileName = `monoform-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(
    stamp.getDate(),
  )}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.${ext}`;

  const dims =
    data.kind === "image" && data.width && data.height
      ? ` · ${data.width}×${data.height}`
      : "";

  dismissExport();
  exportCard.value = {
    kind: data.kind,
    blob,
    width: data.width,
    height: data.height,
    objectUrl: URL.createObjectURL(blob),
    fileName,
    metaLabel: `${fileName} · ${formatBytes(blob.size)}${dims}`,
  };
}

function dismissExport() {
  if (exportCard.value) {
    URL.revokeObjectURL(exportCard.value.objectUrl);
    exportCard.value = null;
  }
}

function downloadExport() {
  const card = exportCard.value;
  if (!card) return;
  const a = document.createElement("a");
  a.href = card.objectUrl;
  a.download = card.fileName;
  a.click();
}

const sendBlockedHint = "视频请下载后从画布节点上传导入";

// 走与 sendToCanvas.ts 相同的 import 协议：?import=<encodedJSON>&source=xoi&from=<page>
// dataURL 由画布侧统一经上传接口转成后端 URL
async function sendExportToCanvas() {
  const card = exportCard.value;
  if (!card || card.kind !== "image") return;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(card.blob);
  });
  const importData = encodeURIComponent(
    JSON.stringify([{ src: dataUrl, name: card.fileName }]),
  );
  window.location.href = `/#/canvas?import=${importData}&source=xoi&from=director3d`;
}

onMounted(() => {
  window.addEventListener("message", handleMessage);
});

onUnmounted(() => {
  window.removeEventListener("message", handleMessage);
  dismissExport();
});
</script>

<style scoped lang="scss">
.director3d-library {
  --director-accent: #f57442;
  --director-accent-bright: #ff8a57;
  --director-accent-soft: #ffb09a;
  --director-accent-rgb: 245, 116, 66;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  color: #1d2028;
  background: linear-gradient(135deg, #fbfbfd 0%, #f4f0ff 58%, #fff1e9 100%);
}

.director-library-hero {
  position: relative;
  min-height: 500px;
  overflow: hidden;
  color: #f7f8ff;
  background: linear-gradient(112deg, #ffffff 0%, #f5f1ff 56%, #ffece3 100%);
  color: #272b3b;
}

.director-library-grid {
  position: absolute;
  inset: 0;
  opacity: 0.2;
  background-image: linear-gradient(rgba(119, 104, 198, 0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(119, 104, 198, 0.09) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(90deg, black, transparent 92%);
}

.director-library-copy {
  position: relative;
  z-index: 1;
  width: min(720px, calc(100% - 48px));
  padding: 108px 0 86px max(8vw, 48px);
}

.director-library-eyebrow,
.director-library-heading > div > span {
  color: #ffb36b;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.director-library-copy h1 {
  margin: 15px 0 20px;
  font-size: clamp(52px, 7vw, 94px);
  letter-spacing: -0.08em;
  line-height: 0.95;
  color: #292d3d;
}

.director-library-copy p {
  max-width: 570px;
  margin: 0;
  color: #73788b;
  font-size: 16px;
  line-height: 1.8;
}

.director-library-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 30px;
}

.director-library-primary,
.director-library-secondary,
.director-library-text-action {
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.director-library-primary {
  padding: 13px 18px;
  color: #fff;
  background: linear-gradient(135deg, var(--director-accent-bright), var(--director-accent));
  border: 0;
  border-radius: 9px;
  box-shadow: 0 8px 22px rgba(var(--director-accent-rgb), 0.28);
}

.director-library-secondary {
  padding: 12px 17px;
  color: #5f58a2;
  background: rgba(255, 255, 255, 0.58);
  border: 1px solid rgba(112, 101, 196, 0.2);
  border-radius: 9px;
}

.director-library-secondary span {
  margin-left: 7px;
  font-size: 18px;
}

.director-library-visual {
  position: absolute;
  right: 0;
  bottom: 0;
  width: min(64vw, 1120px);
  height: 100%;
  border-radius: 0;
  overflow: hidden;
  opacity: .98;
  mask-image: linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, .18) 30%, rgba(0, 0, 0, .72) 52%, #000 72%, #000 100%);
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, .18) 30%, rgba(0, 0, 0, .72) 52%, #000 72%, #000 100%);
}

.director-library-visual img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: right center;
}

.director-library-workspace {
  max-width: 1320px;
  padding: 58px max(6vw, 32px) 72px;
  margin: 0 auto;
}

.director-library-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}

.director-library-heading h2 {
  margin: 6px 0 0;
  font-size: 30px;
  letter-spacing: -0.05em;
}

.director-library-text-action {
  padding: 8px 0;
  color: var(--director-accent);
  background: transparent;
  border: 0;
}

.director-project-library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 14px;
}

.director-project-library-card {
  position: relative;
  display: flex;
  min-height: 238px;
  padding: 17px;
  overflow: hidden;
  color: #252a36;
  text-align: left;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  background: #fff;
  border: 1px solid #e0e3ec;
  border-radius: 14px;
  box-shadow: 0 7px 20px rgba(27, 31, 43, 0.04);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.director-project-library-card:hover {
  border-color: #ffc28e;
  box-shadow: 0 14px 30px rgba(var(--director-accent-rgb), 0.13);
  transform: translateY(-3px);
}

.director-project-card-scene {
  position: absolute;
  top: 15px;
  left: 15px;
  color: var(--director-accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.director-project-card-delete {
  position: absolute;
  z-index: 2;
  top: 12px;
  right: 12px;
  padding: 4px 7px;
  color: #bd6570;
  font: inherit;
  font-size: 11px;
  background: rgba(225, 97, 110, 0.08);
  border: 1px solid rgba(225, 97, 110, 0.18);
  border-radius: 6px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.18s ease, background 0.18s ease;
}

.director-project-library-card:hover .director-project-card-delete,
.director-project-card-delete:focus-visible {
  opacity: 1;
}

.director-project-card-delete:hover:not(:disabled) {
  color: #fff;
  background: #cf5d68;
}

.director-project-card-delete:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.director-project-card-preview {
  position: absolute;
  inset: 45px 18px auto;
  height: 74px;
  overflow: hidden;
  background: #eeeaff;
  border-radius: 8px;
}

.director-project-card-preview img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; }

.director-project-library-card strong { max-width: 100%; overflow: hidden; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
.director-project-library-card small { margin-top: 5px; color: #7d8492; font-size: 12px; }
.director-project-library-card time { margin-top: 14px; color: #a0a6b1; font-size: 11px; }
.director-project-card-open { position: absolute; right: 16px; bottom: 15px; color: var(--director-accent); font-size: 12px; font-weight: 600; }

.director-project-library-new {
  align-items: center;
  justify-content: center;
  color: var(--director-accent);
  text-align: center;
  background: rgba(255, 255, 255, 0.46);
  border-style: dashed;
}

.director-project-library-new > span { margin-bottom: 7px; font-size: 28px; line-height: 1; }

.director-library-delete-mask {
  position: fixed;
  z-index: 60;
  display: grid;
  padding: 24px;
  inset: 0;
  place-items: center;
  background: rgba(11, 14, 23, 0.56);
  backdrop-filter: blur(7px);
}

.director-library-delete-dialog {
  width: min(410px, calc(100vw - 48px));
  padding: 27px;
  color: #f9faff;
  background: linear-gradient(150deg, #30394b, #1c212c);
  border: 1px solid rgba(255, 190, 132, 0.2);
  border-radius: 17px;
  box-shadow: 0 22px 66px rgba(0, 0, 0, 0.4);
}

.director-library-delete-dialog > span { color: #ffadb4; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; }
.director-library-delete-dialog h2 { margin: 9px 0 10px; font-size: 20px; line-height: 1.35; }
.director-library-delete-dialog p { margin: 0; color: rgba(255, 255, 255, 0.62); font-size: 13px; line-height: 1.7; }
.director-library-delete-dialog > div { display: flex; justify-content: flex-end; gap: 10px; margin-top: 23px; }
.director-library-delete-dialog button { padding: 9px 12px; color: #fff; font: inherit; font-size: 12px; background: rgba(255, 255, 255, 0.09); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px; cursor: pointer; }
.director-library-delete-dialog button.danger { background: linear-gradient(135deg, #e5707a, #bc4d58); border-color: transparent; }

@media (max-width: 720px) {
  .director-library-copy { padding: 92px 24px 210px; }
  .director-library-visual { right: 0; bottom: 0; width: 100%; height: 250px; opacity: .78; mask-image:linear-gradient(180deg,transparent,#000 30%); -webkit-mask-image:linear-gradient(180deg,transparent,#000 30%); }
  .director-library-visual img { object-position:right bottom; }
  .director-library-workspace { padding: 42px 24px 56px; }
}

.director3d-container {
  --director-accent: #f57400;
  --director-accent-bright: #ff8a1f;
  --director-accent-rgb: 245, 116, 0;
  width: 100%;
  height: 100%;
  position: relative;
  background: #181817;
}

.project-bar {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 4px;
  width: 192px;
  height: 56px;
  padding: 0 8px 0 12px;
  color: #fff;
  background: linear-gradient(110deg, rgba(25, 23, 20, 0.98), rgba(36, 31, 25, 0.96));
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0 0 12px 0;
  box-shadow: 8px 7px 24px rgba(0, 0, 0, 0.2);
}

.project-trigger {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.project-trigger:hover strong {
  color: #ffc38f;
}

.project-eyebrow {
  flex: 0 0 auto;
  padding: 4px 6px;
  color: #ffc38f;
  font-size: 11px;
  letter-spacing: 0.04em;
  background: rgba(var(--director-accent-rgb), 0.16);
  border: 1px solid rgba(255, 177, 108, 0.2);
  border-radius: 5px;
}

.project-trigger strong {
  display: block;
  flex: 1;
  min-width: 0;
  max-width: none;
  margin: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.2s ease;
}

.project-create {
  display: grid;
  width: 30px;
  height: 30px;
  padding: 0;
  color: #fff;
  font-size: 21px;
  line-height: 1;
  place-items: center;
  background: linear-gradient(135deg, var(--director-accent-bright), var(--director-accent));
  border: 0;
  border-radius: 9px;
  box-shadow: 0 4px 12px rgba(var(--director-accent-rgb), 0.38);
  cursor: pointer;
  transition: transform 0.18s ease, filter 0.18s ease;
}

.project-create:hover {
  filter: brightness(1.12);
  transform: translateY(-1px);
}

.project-dialog-mask {
  position: absolute;
  z-index: 50;
  display: grid;
  inset: 0;
  padding: 24px;
  place-items: center;
  background: rgba(8, 10, 16, 0.62);
  backdrop-filter: blur(9px);
}

.project-dialog {
  position: relative;
  width: min(680px, calc(100vw - 48px));
  max-height: min(680px, calc(100vh - 48px));
  overflow: auto;
  color: #f8f9ff;
  background: linear-gradient(155deg, #2d2923, #1b1916 68%);
  border: 1px solid rgba(255, 183, 120, 0.2);
  border-radius: 20px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.48);
}

.project-dialog-header {
  display: flex;
  justify-content: space-between;
  padding: 28px 30px 22px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
}

.project-dialog-header span {
  color: #ffb879;
  font-size: 12px;
  letter-spacing: 0.08em;
}

.project-dialog-header h2 {
  margin: 7px 0 6px;
  font-size: 22px;
  line-height: 1.2;
}

.project-dialog-header p {
  margin: 0;
  color: rgba(255, 255, 255, 0.52);
  font-size: 13px;
}

.dialog-close {
  width: 32px;
  height: 32px;
  padding: 0;
  color: rgba(255, 255, 255, 0.7);
  font-size: 24px;
  line-height: 1;
  background: rgba(255, 255, 255, 0.07);
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

.dialog-close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.14);
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
  gap: 12px;
  padding: 24px 30px 28px;
}

.project-card {
  position: relative;
  display: flex;
  min-height: 138px;
  padding: 17px;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.88);
  text-align: left;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.project-card:hover {
  background: rgba(var(--director-accent-rgb), 0.12);
  border-color: rgba(255, 166, 88, 0.5);
  transform: translateY(-2px);
}

.project-card.active {
  background: linear-gradient(145deg, rgba(var(--director-accent-rgb), 0.34), rgba(153, 70, 0, 0.2));
  border-color: #ff902e;
  box-shadow: inset 0 0 0 1px rgba(255, 205, 160, 0.15);
}

.project-card-index {
  position: absolute;
  top: 12px;
  left: 15px;
  color: rgba(255, 255, 255, 0.27);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.project-card strong {
  max-width: 100%;
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-card small {
  margin-top: 5px;
  color: rgba(255, 255, 255, 0.48);
  font-size: 11px;
}

.project-card i {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 3px 6px;
  color: #fff0e3;
  font-size: 10px;
  font-style: normal;
  background: rgba(var(--director-accent-rgb), 0.28);
  border-radius: 5px;
}

.project-card-new {
  align-items: center;
  justify-content: center;
  text-align: center;
  background: rgba(255, 255, 255, 0.025);
  border-style: dashed;
}

.project-card-new > span {
  margin-bottom: 5px;
  color: #ffb574;
  font-size: 28px;
  line-height: 1;
}

.project-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 30px 22px;
  border-top: 1px solid rgba(255, 255, 255, 0.09);
}

.project-footer-button {
  padding: 8px 12px;
  color: rgba(255, 255, 255, 0.72);
  font: inherit;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
}

.project-footer-button:hover:not(:disabled) {
  color: #fff;
  background: rgba(255, 255, 255, 0.13);
}

.project-footer-button.danger {
  color: #ffb3b3;
}

.project-footer-button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.project-action-mask {
  position: absolute;
  z-index: 2;
  display: grid;
  padding: 24px;
  inset: 0;
  place-items: center;
  background: rgba(10, 12, 18, 0.66);
  backdrop-filter: blur(5px);
}

.project-action-panel {
  width: min(390px, 100%);
  padding: 24px;
  color: #f8f9ff;
  background: linear-gradient(150deg, #393027, #211d19);
  border: 1px solid rgba(255, 184, 122, 0.24);
  border-radius: 16px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.4);
}

.project-action-kicker {
  color: #ffb879;
  font-size: 11px;
  letter-spacing: 0.08em;
}

.project-action-kicker.danger {
  color: #ffadad;
}

.project-action-panel h3 {
  margin: 8px 0 18px;
  font-size: 18px;
  line-height: 1.35;
}

.project-action-panel p {
  margin: -8px 0 20px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 13px;
  line-height: 1.65;
}

.project-name-input {
  width: 100%;
  box-sizing: border-box;
  padding: 11px 12px;
  color: #fff;
  font: inherit;
  font-size: 14px;
  outline: none;
  background: rgba(8, 10, 15, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 9px;
}

.project-name-input:focus {
  border-color: var(--director-accent-bright);
  box-shadow: 0 0 0 3px rgba(var(--director-accent-rgb), 0.16);
}

.project-action-footer {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 20px;
}

.project-action-primary {
  padding: 8px 13px;
  color: #fff;
  font: inherit;
  font-size: 12px;
  background: linear-gradient(135deg, var(--director-accent-bright), var(--director-accent));
  border: 0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(var(--director-accent-rgb), 0.34);
  cursor: pointer;
}

.project-action-primary.danger {
  background: linear-gradient(135deg, #e66f78, #bd4f5a);
  box-shadow: 0 4px 12px rgba(189, 79, 90, 0.3);
}

.director3d-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: rgba(24, 24, 23, 0.92);
  z-index: 10;
}

.loading-text {
  color: #fff;
  margin-top: 16px;
  font-size: 14px;
}

.export-card {
  position: absolute;
  right: 20px;
  bottom: 20px;
  z-index: 20;
  display: flex;
  gap: 12px;
  padding: 12px;
  width: 340px;
  border-radius: 12px;
  background: rgba(24, 24, 23, 0.94);
  border: 1px solid rgba(var(--director-accent-rgb), 0.45);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
}

.export-preview {
  flex-shrink: 0;
  width: 108px;
  height: 108px;
  border-radius: 8px;
  overflow: hidden;
  background: #0d0d0c;
  display: flex;
  align-items: center;
  justify-content: center;

  img,
  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.export-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.export-title {
  margin: 2px 0 4px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.export-meta {
  margin: 0 0 10px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.export-actions {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.export-fade-enter-active,
.export-fade-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.export-fade-enter-from,
.export-fade-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
