<template>
  <main v-if="identityState !== 'ready'" class="director-identity-gate">
    <h1>{{ identityState === 'checking' ? '正在验证账号' : '暂时无法打开白模预演工作台' }}</h1>
    <p>{{ identityState === 'checking' ? '确认登录身份后载入你的场景。' : identityError }}</p>
    <button v-if="identityState === 'error'" type="button" @click="loadDirectorIdentity">重新验证</button>
  </main>
  <main v-else-if="isLibrary || !currentProject" class="director3d-library">
    <section class="director-library-hero">
      <div class="director-library-grid" aria-hidden="true"></div>
      <div class="director-library-copy">
        <span class="director-library-eyebrow">白模预演工作台 · 3D 预演</span>
        <h1>先调度，再开拍</h1>
        <p>在场景里安排演员、机位与时间线，预演镜头节奏，再导出分镜画面或视频。</p>
        <div class="director-library-actions">
          <button class="director-library-primary" type="button" @click="createProject">＋ 新建场景</button>
          <button v-if="projects.length" class="director-library-secondary" type="button" @click="openLatestProject">继续上次创作 <span>→</span></button>
        </div>
        <div class="director-library-flow" aria-label="导演台工作流程">
          <span>01 搭建场景</span><i>›</i><span>02 演员调度</span><i>›</i><span>03 镜头预演</span>
        </div>
      </div>
      <div class="director-library-visual" aria-hidden="true">
        <img :src="directorLibraryHero" alt="" />
      </div>
    </section>

    <section class="director-library-workspace">
      <div class="director-library-heading">
        <div>
          <span>我的场景</span>
          <h2>继续创作 <small>{{ projects.length }} 个场景</small></h2>
        </div>
        <button class="director-library-text-action" type="button" @click="createProject">＋ 新建场景</button>
      </div>
      <p v-if="librarySyncMessage" role="status">{{ librarySyncMessage }} <button type="button" @click="loadDirectorIdentity">重新读取</button></p>
      <div class="director-project-library-grid">
        <article v-for="project in pagedProjects" :key="project.id" class="director-project-library-card" role="button" tabindex="0" @click="openProject(project.id)" @keydown.enter="openProject(project.id)">
          <div class="director-project-card-actions">
            <button type="button" @click.stop="openRenameProject(project.id)">重命名</button>
            <button class="director-project-card-delete" type="button" @click.stop="openDeleteProject(project.id)">删除</button>
          </div>
          <span class="director-project-card-scene">3D</span>
          <span class="director-project-card-preview">
            <img :src="directorProjectPreview" alt="" loading="lazy" decoding="async" />
          </span>
          <strong>{{ project.name }}</strong>
          <small>{{ getProjectSummary(project.id) }}</small>
          <time>{{ formatProjectDate(project.updatedAt || project.createdAt) }}</time>
          <span class="director-project-card-open">打开 →</span>
        </article>
      </div>
      <div v-if="!projects.length" class="director-library-empty">
        <h3>还没有场景</h3>
        <p>新建一个空白场景，开始安排演员、布景和机位。</p>
        <button class="director-library-primary" type="button" @click="createProject">＋ 新建场景</button>
      </div>
      <Pager v-model:page="projectPage" :total="sortedProjects.length" :page-size="PROJECT_PAGE_SIZE" unit="个场景" />
    </section>

    <div v-if="projectAction === 'rename'" class="director-library-delete-mask">
      <form class="director-library-delete-dialog" role="dialog" aria-modal="true" @submit.prevent="confirmRenameProject">
        <span>场景命名</span>
        <h2>重命名场景</h2>
        <input v-model="projectNameDraft" class="project-name-input" maxlength="40" autofocus aria-label="场景名称" />
        <div>
          <button type="button" @click="projectAction = null">取消</button>
          <button class="director-library-save" type="submit">保存名称</button>
        </div>
      </form>
    </div>

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
      <button class="director-exit" type="button" title="关闭导演台，返回主站（Esc）" aria-label="关闭导演台" @click="exitDirector">
        <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 2.5l9 9M11.5 2.5l-9 9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg>
      </button>
      <button class="project-trigger" type="button" @click="projectPanelVisible = true">
        <strong>{{ currentProject?.name || "未命名场景" }}</strong>
      </button>
      <button class="project-create" type="button" title="新建场景" @click="createProject">
        <span>＋</span>
      </button>
    </div>
    <!-- 宿主工具条：XOi 自己的动作都放这里，靠 iframe 让位（而不是浮在 monoform 面板上）。
         之前把按钮绝对定位在 right:16px，会压住右侧属性面板的标题行和眼睛/锁定/复制/删除图标。 -->
    <div class="director-rail" role="toolbar" aria-label="XOi 工具条">
      <button class="rail-btn" type="button" title="把当前镜头带到画布继续制作" @click="sendCurrentShot('image')">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h8M2 8h8M2 12h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none" /><path d="M11 9.4l3.2 2.6L11 14.6z" fill="currentColor" /></svg>
        <span>带到画布</span>
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
          <button class="project-footer-button" type="button" @click="() => openRenameProject()">重命名当前场景</button>
          <button class="project-footer-button danger" type="button" @click="() => openDeleteProject()">删除当前场景</button>
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
import { sessionSignal } from "@/utils/session";
import { useRoute, useRouter } from "vue-router";
import Pager from "@/components/Pager.vue";
import {MessagePlugin} from "tdesign-vue-next";
import {directorShotPackage} from "@/utils/directorHandoff";
import {importDirectorProject} from "@/utils/directorScene";
import {repairLegacyWalkingEndRotations} from "../../../../shared/directorMotion";
import {writeBrowserHandoff} from "../../../../shared/browserHandoff";
import directorLibraryHero from "@/assets/director3d/director-library-hero-v2.png";
import directorProjectPreview from "@/assets/director3d/director-project-preview-v2.png";

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

const route = useRoute();
const router = useRouter();

/**
 * 全屏导演台的出口。
 *
 * 它是顶层路由（不在 /workbench 布局里），所以必须自带退出方式：
 * 左上角 X 与 Esc 都走这里。有浮层时先关浮层，避免"按 Esc 直接把整个工作台关了"。
 */
function exitDirector() {
  if (projectAction.value) {
    projectAction.value = null;
    return;
  }
  if (projectPanelVisible.value) {
    projectPanelVisible.value = false;
    return;
  }
  void router.replace("/aiAssistant");
}

function handleDirectorKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape" || isLibrary.value) return;
  // iframe 内部有自己的焦点，Esc 只会落在宿主文档上；iframe 里的 Esc 由 monoform 自己处理。
  exitDirector();
}
const identityState = ref<"checking" | "ready" | "error">("checking");
const identityError = ref("");
const librarySyncMessage = ref("");
const ownerId = ref("");
const verifiedToken = ref("");
const projectsStorageKey = () => `director3d-projects-v2:u${ownerId.value}`;
const activeProjectStorageKey = () => `director3d-active-project-v2:u${ownerId.value}`;
const isOwnedProjectId = (id: string) => id.startsWith(`director3d-u${ownerId.value}-`);

function getInitialProjects(): DirectorProject[] {
  try {
    const stored = JSON.parse(localStorage.getItem(projectsStorageKey()) || "[]");
    if (Array.isArray(stored) && stored.length) {
      const owned = stored.filter((item): item is DirectorProject => typeof item?.id === "string" && isOwnedProjectId(item.id) && typeof item?.name === "string");
      if (owned.length) return owned;
    }
  } catch {
    // 本账号的新场景从空白开始，旧公共工程归属不明，不自动迁移。
  }
  return [];
}

const projects = ref<DirectorProject[]>([]);
const activeProjectId = ref("");
const projectPanelVisible = ref(false);
const projectAction = ref<"rename" | "delete" | null>(null);
const projectActionTargetId = ref<string | null>(null);
const projectNameDraft = ref("");
const projectBarMetrics = ref({ width: "228px", height: "56px" });
const isLibrary = computed(() => !route.query.scene);
const sortedProjects = computed(() => [...projects.value].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)));

/** 导演台场景库分页：每页 12 个（网格 3–4 列）；新建/删除场景后回到第一页。 */
const PROJECT_PAGE_SIZE = 12;
const projectPage = ref(1);
const pagedProjects = computed(() => {
  const start = (projectPage.value - 1) * PROJECT_PAGE_SIZE;
  return sortedProjects.value.slice(start, start + PROJECT_PAGE_SIZE);
});
watch(() => sortedProjects.value.length, () => { projectPage.value = 1; });

let identityRevision = 0;
async function loadDirectorIdentity() {
  const revision = ++identityRevision;
  identityState.value = "checking";
  try {
    const token = sessionSignal() || "";
    if (!token) throw new Error("请先登录后使用白模预演工作台");
    const response = await fetch("/api/auth/me", { credentials: "same-origin", headers: {"X-Xoi-Expected-User": token.split(":")[0]}, cache: "no-store" });
    if (!response.ok) throw new Error("登录身份验证失败，请重新登录");
    const data = await response.json();
    if (revision !== identityRevision) return;
    const userId = Number(data?.user?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("账号身份无效");
    if (sessionSignal() !== token || String(userId) !== token.split(":")[0]) throw new Error("账号已切换，请重新验证");
    ownerId.value = String(userId);
    verifiedToken.value = token;
    const hadLocal=!!localStorage.getItem(projectsStorageKey());
    projects.value = getInitialProjects();
    librarySyncMessage.value = "";
    try {
      const remote:DirectorProject[]=[];
      for(let offset=0;offset<200;offset+=50){const response=await directorRequest(`/api/director-scenes?offset=${offset}`);if(!response.ok)throw new Error('场景目录暂不可用');const {data:rows}=await response.json();assertDirectorOwner(token);if(!Array.isArray(rows))throw new Error('场景目录格式无效');remote.push(...rows.filter((r:any)=>isOwnedProjectId(r.id)).map((r:any)=>({id:r.id,name:r.title||'导演场景',createdAt:Number(r.updatedAt),updatedAt:Number(r.updatedAt)})));if(rows.length<50)break;}
      if(sessionSignal()!==token)throw new Error('账号已切换');
      const locals: DirectorProject[]=[];
      for(const local of hadLocal?projects.value:[]){
        if(remote.some(row=>row.id===local.id))continue;
        const meta=localStorage.getItem(`xoi-director-cloud-v1:${local.id}`);
        if(meta){const response=await directorRequest(`/api/director-scenes/${encodeURIComponent(local.id)}`);if(response.status===410)continue;if(!response.ok&&response.status!==404)throw new Error('场景状态尚未确认');}
        locals.push(local);
      }
      projects.value=[...remote,...locals];
    }catch{if(revision!==identityRevision)return;librarySyncMessage.value="云端目录暂不可用，当前仅显示本机记录；云端场景仍保留。";}
    assertDirectorOwner(token);
    if (revision !== identityRevision) return;
    const savedId = localStorage.getItem(activeProjectStorageKey());
    activeProjectId.value = projects.value.some((project) => project.id === savedId) ? savedId! : projects.value[0]?.id || "";
    const scene = Array.isArray(route.query.scene) ? route.query.scene[0] : route.query.scene;
    if (scene && !projects.value.some((project) => project.id === scene)) {
      if(isOwnedProjectId(scene)&&localStorage.getItem(`monoform-project-${scene}`)){projects.value.push({id:scene,name:'导演场景',createdAt:Date.now()});activeProjectId.value=scene;}
      else await router.replace({ path: "/director3d" });
    } else if (scene) {
      activeProjectId.value = scene;
    }
    persistProjectState();
    identityState.value = "ready";
  } catch (error) {
    if (revision !== identityRevision) return;
    ownerId.value = "";
    verifiedToken.value = "";
    projects.value = [];
    activeProjectId.value = "";
    identityError.value = error instanceof Error ? error.message : "请检查网络后重试";
    identityState.value = "error";
  }
}

function guardAccountChange() {
  if (identityState.value === "ready" && sessionSignal() !== verifiedToken.value) {
    dismissExport();
    identityState.value = "checking";
    projects.value = [];
    activeProjectId.value = "";
    void loadDirectorIdentity();
  }
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
    if (identityState.value !== "ready" || !id || !projects.value.some((project) => project.id === id) || id === activeProjectId.value) return;
    activeProjectId.value = id;
    loading.value = true;
    persistProjectState();
  },
  { immediate: true },
);

function persistProjectState() {
  if (!ownerId.value) return;
  assertDirectorOwner();
  localStorage.setItem(projectsStorageKey(), JSON.stringify(projects.value));
  if(activeProjectId.value)localStorage.setItem(activeProjectStorageKey(), activeProjectId.value);
  else localStorage.removeItem(activeProjectStorageKey());
}

function assertDirectorOwner(token = verifiedToken.value) {
  if (!token || sessionSignal() !== token || token.split(":")[0] !== ownerId.value) throw new Error("账号已切换，请重新打开导演台");
}
async function directorRequest(path: string, init: RequestInit = {}) {
  const token = verifiedToken.value; assertDirectorOwner(token);
  const headers = new Headers(init.headers); headers.set("X-Xoi-Expected-User", ownerId.value);
  const response = await fetch(path, {...init, headers, credentials: "same-origin", cache: "no-store", signal: init.signal || AbortSignal.timeout(15000)});
  assertDirectorOwner(token); return response;
}

function openProject(id: string) {
  assertDirectorOwner();
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
  if (identityState.value !== "ready") return;
  assertDirectorOwner();
  const nextNumber = projects.value.length + 1;
  const id = `director3d-u${ownerId.value}-${crypto.randomUUID()}`;
  projects.value.push({ id, name: `${nextNumber}号场景`, createdAt: Date.now(), updatedAt: Date.now() });
  activeProjectId.value = id;
  loading.value = true;
  projectPanelVisible.value = false;
  persistProjectState();
  void router.push({ path: "/director3d", query: { scene: id } });
}

function switchProject(id: string) {
  assertDirectorOwner();
  if (!projects.value.some(project => project.id === id)) return;
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

function openRenameProject(id = currentProject.value?.id) {
  const project = projects.value.find((item) => item.id === id);
  if (!project) return;
  projectNameDraft.value = project.name;
  projectActionTargetId.value = project.id;
  projectAction.value = "rename";
}

async function confirmRenameProject() {
  const project = projects.value.find((item) => item.id === projectActionTargetId.value);
  const name = projectNameDraft.value.trim();
  if (!project || !name) return;
  const token = verifiedToken.value;
  try{const response=await directorRequest(`/api/director-scenes/${project.id}`);if(response.ok){const {data}=await response.json();assertDirectorOwner(token);const saved=await directorRequest(`/api/director-scenes/${project.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:data.revision,title:name,payload:data.payload})});if(!saved.ok)throw new Error('场景已更新，请刷新后重试');}else if(response.status!==404)throw new Error('云端场景尚未确认，请重试');assertDirectorOwner(token);}
  catch(e:any){MessagePlugin.warning(e.message);return;}
  project.name = name;
  projectActionTargetId.value = null;
  projectAction.value = null;
  persistProjectState();
}

function openDeleteProject(id = currentProject.value?.id) {
  if (!id || !projects.value.some((project) => project.id === id)) return;
  projectActionTargetId.value = id;
  projectAction.value = "delete";
}

async function confirmDeleteProject() {
  const project = deleteProjectTarget.value;
  if (!project) return;
  const token = verifiedToken.value;
  try{const response=await directorRequest(`/api/director-scenes/${project.id}`);if(response.ok){const {data}=await response.json();assertDirectorOwner(token);const removed=await directorRequest(`/api/director-scenes/${project.id}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:data.revision})});if(!removed.ok)throw new Error('云端删除未确认，请重新核对');}else if(![404,410].includes(response.status))throw new Error('云端场景尚未确认，本机工程保留');assertDirectorOwner(token);}catch(e:any){MessagePlugin.warning(e.message);return;}
  localStorage.removeItem(`monoform-project-${project.id}`);
  localStorage.removeItem(`monoform-custom-poses-${project.id}`);
  const currentIndex = projects.value.findIndex((item) => item.id === project.id);
  projects.value.splice(currentIndex, 1);
  if (activeProjectId.value === project.id) {
    activeProjectId.value = projects.value[Math.max(0, currentIndex - 1)]?.id || "";
  }
  loading.value = true;
  projectActionTargetId.value = null;
  projectAction.value = null;
  projectPanelVisible.value = false;
  persistProjectState();
  if (!isLibrary.value) {
    void router.replace(activeProjectId.value ? { path: "/director3d", query: { scene: activeProjectId.value } } : {path: "/director3d"});
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
      width: `${Math.ceil(brandRect.width) + 36}px`,
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
  // One released walking-track writer reversed the actor only on its arrival key.
  // Repair that narrow signature once the native editor is ready, then import it
  // through the normal editor path so local and cloud state stay in sync.
  let repairAttempts=0;
  const repairLegacyWalk=async()=>{
    if(projectId!==activeProjectId.value || sessionSignal()!==verifiedToken.value)return;
    const raw=localStorage.getItem(`monoform-project-${projectId}`);
    if(!raw&&repairAttempts++<40){window.setTimeout(repairLegacyWalk,100);return;}
    try{
      const project=JSON.parse(raw||'');
      if(repairLegacyWalkingEndRotations(project))await importDirectorProject(iframeRef.value,projectId,ownerId.value,project);
    }catch{if(repairAttempts++<40)window.setTimeout(repairLegacyWalk,100);}
  };
  window.setTimeout(repairLegacyWalk,100);
  loading.value = false;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

// MONOFORM 出站协议仅两条：{source:'monoform', type:'export', kind:'image'|'video', blob, width?, height?}
async function handleMessage(event: MessageEvent) {
  if (identityState.value !== "ready" || sessionSignal()!==verifiedToken.value || event.origin !== window.location.origin || event.source !== iframeRef.value?.contentWindow) return;
  const data = event.data;
  if(data?.source==='monoform'&&data.type==='send-shot'&&data.key===activeProjectId.value){await sendCurrentShot(data.mode==='video'?'video':'image');return;}
  if (!data || data.source !== "monoform" || data.type !== "export" || !data.blob) {
    return;
  }
  // Video handoff only uses the versioned send-shot flow; native MP4 export already downloads locally.
  if (data.kind !== "image") return;

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

let handingOff=false;
async function sendCurrentShot(mode:"image"|"video"="image"){
 if(handingOff)return;handingOff=true;const close=mode==='image'?MessagePlugin.loading({content:'正在保存当前镜头并准备画布…',duration:0}):undefined;
 const token=verifiedToken.value, sceneId=activeProjectId.value;
 try{const {graph}=await directorShotPackage(iframeRef.value,sceneId,ownerId.value,currentProject.value?.name||'导演场景',undefined,{mode});assertDirectorOwner(token);if(sceneId!==activeProjectId.value)throw new Error('场景已切换');writeBrowserHandoff(sessionStorage,token,'canvas-graph',graph);sessionStorage.setItem('xoi_director_return_scene_v1',sceneId);await router.push({path:'/canvas',query:{source:'xoi',graph:'1',from:'director3d'}});}
 catch(e:any){if(e.name==='AbortError')MessagePlugin.info(e.message||'已取消，原场景保留');else MessagePlugin.error(e.message||'带入失败，原场景保留');}
 finally{handingOff=false;if(close)(await close).close();}
}
const sendBlockedHint = "若需绑定当前镜头版本，请使用顶部更多交接方式中的“预演视频带到画布”";

// 走与 sendToCanvas.ts 相同的 import 协议：?import=<encodedJSON>&source=xoi&from=<page>
// dataURL 由画布侧统一经上传接口转成后端 URL
async function sendExportToCanvas() {
  const token=verifiedToken.value; assertDirectorOwner(token);
  const card = exportCard.value;
  if (!card || card.kind !== "image") return;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(card.blob);
  });
  assertDirectorOwner(token);
  const importData = encodeURIComponent(
    JSON.stringify([{ src: dataUrl, name: card.fileName }]),
  );
  window.location.href = `/#/canvas?import=${importData}&source=xoi&from=director3d`;
}

onMounted(() => {
  window.addEventListener("message", handleMessage);
  window.addEventListener("storage", guardAccountChange);
  window.addEventListener("focus", guardAccountChange);
  void loadDirectorIdentity();
});

onUnmounted(() => {
  identityRevision++;
  window.removeEventListener("keydown", handleDirectorKeydown);
  window.removeEventListener("message", handleMessage);
  window.removeEventListener("storage", guardAccountChange);
  window.removeEventListener("focus", guardAccountChange);
  dismissExport();
});
</script>

<style scoped lang="scss">
.director-library-empty { padding: 54px 20px; text-align: center; border: 1px dashed #d8dbe2; border-radius: 16px; background: #fff; }
.director-library-empty p { color: #777; margin: 12px 0 24px; }
.director-identity-gate {
  min-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: #f7f7f6;
  color: #292929;
  text-align: center;

  h1 { margin: 0; font-size: 22px; font-weight: 650; }
  p { margin: 0; color: #777; font-size: 14px; }
  button { margin-top: 8px; padding: 10px 18px; border: 1px solid #ddd; border-radius: 9px; background: #fff; cursor: pointer; }
}

.director3d-library {
  --director-accent: #f57442;
  --director-accent-bright: #ff8a57;
  --director-accent-soft: #ffb09a;
  --director-accent-rgb: 245, 116, 66;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  color: #1d2028;
  padding: 24px clamp(20px, 3vw, 44px) 48px;
  background: #f7f7f8;
}

.director-library-hero {
  position: relative;
  max-width: 1400px;
  min-height: 322px;
  margin: 0 auto;
  overflow: hidden;
  color: #f7f7f7;
  background: linear-gradient(110deg, #252629 0%, #303137 58%, #3b3431 100%);
  border: 1px solid #3f3e3d;
  border-radius: 20px;
}

.director-library-grid {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  background-image: linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(90deg, black, transparent 92%);
}

.director-library-copy {
  position: relative;
  z-index: 1;
  width: min(660px, calc(100% - 48px));
  padding: 42px 0 34px clamp(28px, 4vw, 56px);
}

.director-library-eyebrow,
.director-library-heading > div > span {
  color: #ffae86;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.director-library-copy h1 {
  margin: 12px 0 12px;
  font-size: clamp(34px, 3.8vw, 48px);
  letter-spacing: -0.045em;
  line-height: 1.16;
  color: #fff;
}

.director-library-copy p {
  max-width: 570px;
  margin: 0;
  color: #c8c8c9;
  font-size: 14px;
  line-height: 1.75;
}

.director-library-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 22px;
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
  box-shadow: none;
}

.director-library-secondary {
  padding: 12px 17px;
  color: #f3f3f4;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 9px;
}

.director-library-secondary span {
  margin-left: 7px;
  font-size: 18px;
}

.director-library-flow {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
  color: #c3c1c0;
  font-size: 11px;
  letter-spacing: .02em;
}
.director-library-flow i { color: #f5a17d; font-size: 16px; font-style: normal; }

.director-library-visual {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 0;
  overflow: hidden;
  opacity: .74;
  pointer-events: none;
}

.director-library-visual img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 56%;
  filter: saturate(.86);
}

.director-library-workspace {
  max-width: 1400px;
  padding: 30px 0 72px;
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
  font-size: 24px;
  letter-spacing: -0.05em;
}
.director-library-heading h2 small { margin-left: 8px; color: #898a8e; font-size: 12px; font-weight: 400; letter-spacing: 0; }

.director-library-text-action {
  padding: 8px 0;
  color: var(--director-accent);
  background: transparent;
  border: 0;
}

.director-project-library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
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
  border-radius: 16px;
  box-shadow: 0 4px 18px rgba(27, 31, 43, 0.04);
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

.director-project-card-actions {
  position: absolute;
  z-index: 2;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 5px;
  opacity: 0;
  transition: opacity .18s ease;
}
.director-project-card-actions button {
  padding: 4px 7px;
  color: #55565a;
  font: inherit;
  font-size: 11px;
  background: #fff;
  border: 1px solid #e8e8e7;
  border-radius: 6px;
  cursor: pointer;
}
.director-project-card-actions .director-project-card-delete { color: #bd6570; }
.director-project-library-card:hover .director-project-card-actions,
.director-project-card-actions:focus-within {
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
  background: #33332f;
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
.director-library-delete-dialog input { margin-top: 8px; }
.director-library-delete-dialog button.director-library-save { color: #fff; background: #f57442; border-color: #f57442; }

@media (max-width: 720px) {
  .director3d-library { padding: 14px; }
  .director-library-copy { width: 100%; padding: 32px 24px 146px; }
  .director-library-visual { opacity: .35; }
  .director-library-visual img { object-position:right bottom; }
  .director-library-workspace { padding: 28px 0 56px; }
  .director-library-flow { gap: 6px; font-size: 10px; }
  .director-project-card-actions { opacity: 1; }
}

.director3d-container {
  --director-accent: #f57400;
  --director-accent-bright: #ff8a1f;
  --director-accent-rgb: 245, 116, 0;
  width: 100%;
  height: 100%;
  /* 进入场景后脱离文档流铺满视口，盖住 workbench 的侧栏与头部。
     场景库页（无 ?scene=）走的是 .director3d-library，不受这条影响，仍然带侧栏。 */
  position: fixed;
  inset: 0;
  z-index: 900;
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

.director-rail {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 35;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 64px;
  padding-top: 58px;
  background: #151413;
  border-left: 1px solid #2c2825;
}

.rail-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 52px;
  padding: 9px 0 7px;
  color: #cfc6bb;
  font: 600 10px/1.2 "PingFang SC", sans-serif;
  background: #232120;
  border: 1px solid #3b3531;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.rail-btn svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.rail-btn:hover {
  color: #231a12;
  background: var(--director-accent, #f57400);
  border-color: var(--director-accent, #f57400);
}

.rail-btn:focus-visible {
  outline: 2px solid var(--director-accent-bright, #ff8a1f);
  outline-offset: 1px;
}

.director-exit {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 26px;
  height: 26px;
  margin-right: 3px;
  padding: 0;
  color: #e8e0d6;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.director-exit:hover {
  color: #231a12;
  background: var(--director-accent, #f57400);
  border-color: var(--director-accent, #f57400);
}

.director-exit:focus-visible {
  outline: 2px solid var(--director-accent-bright, #ff8a1f);
  outline-offset: 1px;
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
  /* 右侧让出 64px 给 XOi 工具条：工具条占位而不是盖在 3D 面板上 */
  width: calc(100% - 64px);
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
