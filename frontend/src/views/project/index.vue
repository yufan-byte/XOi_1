<template>
  <div class="project director-projects">
    <!-- 极扁细条 Hero：一行「标题 + 操作」，右侧插画贴边裁切（MiOra skills-hero 式） -->
    <div class="directorHero">
      <div class="heroInner">
        <div class="heroCopy">
          <span class="vfSlate" aria-hidden="true"><i class="recDot"></i>REC<i class="slateSep"></i>SC 02 · TAKE 3</span>
          <div class="heroRow">
            <h1>短剧工坊</h1>
            <div class="heroActions"><CreationModeSwitcher /><t-button class="addBtn" @click="editProjectData = null; dialogShow = true"><template #icon><i-plus :size="16" /></template>{{ $t("workbench.project.newProject") }}</t-button></div>
          </div>
        </div>
        <div class="heroSide" aria-hidden="true">
          <img class="stripArt" :src="stripArt" alt="" />
        </div>
        <span class="vfCorner tl" aria-hidden="true"></span>
        <span class="vfCorner tr" aria-hidden="true"></span>
        <span class="vfCorner bl" aria-hidden="true"></span>
        <span class="vfCorner br" aria-hidden="true"></span>
      </div>
    </div>
    <div class="toolbar">
      <div class="tabs">
        <span class="tab" :class="{ active: activeTab === 'all' }" @click="activeTab = 'all'">全部项目<em>{{ allProject.length }}</em></span>
        <span class="tab" :class="{ active: activeTab === 'recent' }" @click="activeTab = 'recent'">最近创建</span>
        <span class="tabMeta" title="制作中的项目数"><i class="dot doing"></i>进行中 {{ doingCount }}</span>
        <span class="tabMeta" title="已有成片的项目数"><i class="dot done"></i>已成片 {{ doneCount }}</span>
      </div>
      <t-input v-model="searchQuery" class="search" placeholder="搜索项目" clearable>
        <template #prefix><t-icon name="search" /></template>
      </t-input>
    </div>
    <!-- 骨架屏 -->
    <div v-if="loading" class="list">
      <div class="card-skeleton" v-for="i in 6" :key="i">
        <div class="sk-cover"></div>
        <div class="sk-line sk-w-60"></div>
        <div class="sk-line sk-w-35"></div>
        <div class="sk-line sk-w-full"></div>
        <div class="sk-line sk-w-80"></div>
        <div class="sk-bottom">
          <div class="sk-line sk-w-40"></div>
          <div class="sk-line sk-w-15"></div>
        </div>
      </div>
    </div>
    <div v-else-if="loadError" class="empty" role="alert">
      <div class="empty-title">项目列表暂时无法加载</div>
      <div class="empty-desc">{{ loadError }}，已有项目不会被删除。</div>
      <t-button theme="primary" @click="getAllProject">重新加载</t-button>
    </div>
    <!-- 项目列表 -->
    <div v-else-if="filteredProjects.length > 0" class="list">
      <t-card hoverShadow class="card" v-for="project in filteredProjects" :key="project.id" :class="`card-${project.projectType}`" @click="openProject(project.id)">
        <!-- 封面带：有出图资产的项目直接展示缩略图墙，一眼看到作品质感 -->
        <div class="projectCover" :class="`cover-${project.projectType}`">
          <div v-if="coverPreviews(project).length" class="coverThumbs" aria-hidden="true">
            <img v-for="(img, i) in coverPreviews(project)" :key="i" :src="img" alt="" loading="lazy" />
          </div>
          <div class="coverShade" aria-hidden="true"></div>
          <div class="coverInfo">
            <span class="coverType">
              <component :is="project.projectType == 'novel' ? 'i-notebook' : 'i-edit'" />
              {{ project.projectType == "novel" ? $t(`workbench.project.type.novel`) : $t(`workbench.project.type.script`) }}
            </span>
            <span class="coverState" :class="`state-${progressState(project)}`">
              {{ progressState(project) === 'done' ? '已有成片' : progressState(project) === 'doing' ? '进行中' : '待开始' }}
            </span>
          </div>
          <b class="coverNo" aria-hidden="true">#{{ String(project.id).slice(-6) }}</b>
        </div>
        <div class="cardBody">
          <div class="title" :title="project.name">{{ project.name }}</div>
          <div class="metaRow">
            <span v-if="project.artStyle">{{ creativePreferenceLabel(project.artStyle) }}</span>
            <span v-if="project.videoRatio">{{ project.videoRatio }}</span>
            <span v-if="!project.artStyle && !project.videoRatio">未设置风格偏好</span>
          </div>
          <div class="intro" :class="{ isEmpty: !project.intro }">{{ project.intro || '暂无简介，打开项目后补充创作方向。' }}</div>
          <!-- 流水线进度：一眼看出这个项目卡在哪一步 -->
          <PipelineProgress class="cardProgress" :progress="project.progress" :project-type="project.projectType" compact />
          <div class="bottomMenu">
            <div class="time">
              <t-icon name="time" size="14px" />
              <span>{{ dayjs(project?.createTime).format("YYYY-MM-DD HH:mm") }}</span>
            </div>
            <div class="actionBtns">
              <div class="editBtn" title="项目设置" @click.stop="openEdit(project)">
                <i-edit :size="15" />
              </div>
              <div class="removeBtn" title="删除项目" @click.stop="delProjcer(project.id)">
                <i-delete :size="15" />
              </div>
              <span class="open-label" role="status">{{ openingProjectId === project.id ? "正在打开…" : "打开项目" }} <t-icon name="arrow-right" /></span>
            </div>
          </div>
        </div>
      </t-card>
      <button class="quick-create" type="button" @click="editProjectData = null; dialogShow = true">
        <span class="quick-create-icon"><i-plus :size="22" /></span>
        <span class="quick-create-title">创建新项目</span>
        <span class="quick-create-desc">从一个新的故事开始</span>
      </button>
    </div>
    <!-- 空态 -->
    <div v-else class="empty">
      <div class="empty-icon">🎬</div>
      <div class="empty-title">{{ searchQuery ? '没有找到匹配项目' : '还没有创作项目' }}</div>
      <div class="empty-desc">{{ searchQuery ? '换个关键词试试，或清空搜索查看全部项目' : '创建第一个项目，开启 AI 短剧创作之旅' }}</div>
      <t-button theme="primary" @click="dialogShow = true">
        <template #icon><i-plus :size="18" /></template>
        新建项目
      </t-button>
    </div>
  </div>
  <projectDialog v-if="dialogShow || dialogClosing" v-model="dialogShow" @closed="dialogClosing = false" :projectData="editProjectData" @add="addProjectFn" @edit="editProjectFn" />
</template>

<script setup lang="ts">
import CreationModeSwitcher from "@/components/CreationModeSwitcher.vue";
import stripArt from "@/assets/hero/director-desk.webp";
import { defineAsyncComponent } from "vue";
const projectDialog = defineAsyncComponent(() => import("./components/projectDialog.vue"));
import dayjs from "dayjs";
import { warmPage } from "@/router/pageLoading";
import axios from "@/utils/axios";
import { creativePreferenceLabel } from '../../../../shared/creativePreference';
import projectStore, { type ProjectProgress } from "@/stores/project";
import imageListCacheStore from "@/stores/imageListCache";
import PipelineProgress from "@/components/pipeline/PipelineProgress.vue";

const { clearProjectCache } = imageListCacheStore();
const { allProject, project } = storeToRefs(projectStore());

/** 后端 getProject 附带的资产缩略图（每项目最多 4 张已出图小图），有则用作卡片封面 */
function coverPreviews(item: { id: string }): string[] {
  const row = allProject.value.find((p) => p.id === item.id) as unknown as { assetPreviews?: string[] } | undefined;
  return (row?.assetPreviews ?? []).slice(0, 4);
}

const dialogShow = ref(false);
const dialogClosing = ref(false);
const openingProjectId = ref<string | null>(null);
const loading = ref(true);
const loadError = ref("");
const searchQuery = ref("");
const activeTab = ref<"all" | "recent">("all");

/** 有归档成片只代表已有交付版本，不能据此声称整个多集项目全部完成。 */
function progressState(item: { progress?: ProjectProgress }): "done" | "doing" | "idle" {
  const p = item.progress;
  if (!p) return "idle";
  if ((p.output?.done ?? 0) > 0) return "done";
  const hasAny = [p.material, p.script, p.asset, p.storyboard].some((c) => (c?.done ?? 0) > 0);
  return hasAny ? "doing" : "idle";
}
const doingCount = computed(() => allProject.value.filter((item) => progressState(item) === "doing").length);
const doneCount = computed(() => allProject.value.filter((item) => progressState(item) === "done").length);
const filteredProjects = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase();
  const result = keyword
    ? allProject.value.filter((item) => `${item.name} ${item.intro ?? ""} ${item.artStyle ?? ""}`.toLowerCase().includes(keyword))
    : [...allProject.value];
  if (activeTab.value === "recent") {
    result.sort((a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime());
  }
  return result;
});
const editProjectData = ref<{
  id: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string | null;
  videoRatio: string | null;
  imageModel: string;
  videoModel: string;
  textModel?: string;
  projectType: string;
  imageQuality: "1K" | "2K" | "4K" | "";
  mode: string;
  directorManual: string;
} | null>(null);

function getAllProject() {
  loading.value = true;
  loadError.value = "";
  axios
    .post("/project/getProject")
    .then(({ data }) => {
      allProject.value = data;
    })
    .catch(() => { loadError.value = "请检查网络连接或稍后重试"; })
    .finally(() => {
      loading.value = false;
    });
}

const router = useRouter();
const route = useRoute();

onMounted(() => {
  project.value = null;
  getAllProject();
  if (route.path === '/project/new') dialogShow.value = true;
});

watch(dialogShow, (visible) => {
  dialogClosing.value = !visible;
  if (!visible && route.path === '/project/new') router.replace('/project');
});

async function openProject(projectId: string | undefined) {
  const item = allProject.value.find((p) => p.id === projectId);

  if (!item) return window.$message.error($t("workbench.project.msg.notFound"));

  if (openingProjectId.value) return;
  // 必须配置完（含文本模型）才允许进入项目运作：缺配置时直接打开项目设置补全
  if (!String(item.textModel || "").trim()) {
    window.$message.warning($t("workbench.project.msg.completeConfigBeforeOpen"));
    editProjectData.value = { ...item };
    dialogShow.value = true;
    return;
  }
  openingProjectId.value = projectId || null;
  void warmPage(item.projectType === "novel" ? "/novel" : "/script");
  // Viewing and editing an owned project must work during provider outages.
  // Generation validates the selected model at its own submission boundary.
  try {
    project.value = item;
    if (item.projectType === "novel") await router.push({ path: "/novel", query: { projectId: String(item.id) } });
    else await router.push({ path: "/script", query: { projectId: String(item.id) } });
  } finally {
    openingProjectId.value = null;
  }
}

function openEdit(item: {
  id: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string | null;
  directorManual: string;
  videoRatio: string | null;
  imageModel: string;
  videoModel: string;
  textModel?: string;
  imageQuality: "1K" | "2K" | "4K" | "";
  projectType: string;
  mode: string;
}) {
  editProjectData.value = {
    ...item,
  };
  dialogShow.value = true;
}

function editProjectFn(data: {
  id: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string;
  directorManual: string;
  videoRatio: string;
  imageModel: string;
  videoModel: string;
  textModel: string;
  imageQuality: "1K" | "2K" | "4K" | "";
  mode: string;
}) {
  axios
    .post("/project/editProject", data)
    .then(() => {
      window.$message.success($t("workbench.project.msg.editSuccess"));
      getAllProject();
    })
    .catch((e) => {
      window.$message.error(e.message ?? $t("workbench.project.msg.editFailed"));
    });
}

function addProjectFn(data: {
  projectType: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string;
  directorManual: string;
  videoRatio: string;
  imageModel: string;
  videoModel: string;
  textModel: string;
  imageQuality: string;
  mode: string;
}) {
  axios
    .post("/project/addProject", data)
    .then(() => {
      window.$message.success($t("workbench.project.msg.addSuccess"));
      getAllProject();
    })
    .catch((e) => {
      window.$message.error(e.message ?? $t("workbench.project.msg.addFailed"));
    });
}

function delProjcer(projectId: string | undefined) {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.project.msg.deleteHeader"),
    body: $t("workbench.project.msg.deleteBody"),
    confirmBtn: $t("workbench.project.msg.deleteConfirm"),
    cancelBtn: $t("workbench.project.msg.deleteCancel"),
    onConfirm: () => {
      axios
        .post("/project/delProject", { id: projectId })
        .then(() => {
          clearProjectCache(projectId!);
          window.$message.success($t("workbench.project.msg.deleteSuccess"));
          getAllProject();
        })
        .catch((e) => {
          window.$message.error(e.message ?? $t("workbench.project.msg.deleteFailed"));
        })
        .finally(() => {
          dialog.destroy();
        });
    },
  });
}
</script>

<style lang="scss" scoped>
/* 项目总览页：展示型门面（场记板语言）+ 暖橙工作台 token */
.project.director-projects {
  box-sizing: border-box;
  min-height: 100%;
  padding: 20px clamp(20px, 3.5vw, 48px) 44px;
  background: var(--xoi-workspace-bg, #faf8f6);
  color: #302b28;
  font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;

  .project-mode-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

  /* ---------- 极扁细条 Hero：标题+操作一行；插画右端贴边、上下被条裁切 ---------- */
  .directorHero {
    position: relative;
    flex: none;
    margin: 14px 0 16px;
    border: 1px solid #ecdfd4;
    border-radius: 18px;
    background: #fffdfb;
    box-shadow: 0 10px 26px rgba(74, 56, 42, .08);
    overflow: hidden; /* 裁掉超出条高的插画，形成贴边效果 */

    .heroInner {
      position: relative;
      display: flex; align-items: center;
      gap: 16px;
      min-height: 96px;
      padding-left: 28px;
      background:
        radial-gradient(circle at 86% 130%, rgba(255, 170, 110, .32), transparent 55%),
        linear-gradient(118deg, #fffaf4, #fff5ea 60%, #fdeedd);
    }

    .vfCorner {
      position: absolute; width: 13px; height: 13px; z-index: 3;
      border: 2px solid rgba(224, 100, 31, .32);
      pointer-events: none;
      &.tl { top: 9px; left: 9px; border-right: 0; border-bottom: 0; border-top-left-radius: 5px; }
      &.tr { top: 9px; right: 9px; border-left: 0; border-bottom: 0; border-top-right-radius: 5px; }
      &.bl { bottom: 9px; left: 9px; border-right: 0; border-top: 0; border-bottom-left-radius: 5px; }
      &.br { bottom: 9px; right: 9px; border-left: 0; border-top: 0; border-bottom-right-radius: 5px; }
    }

    /* REC 场记条：挪到左上角，压在「短剧工坊」标题上方，开机即拍摄的仪式感 */
    /* REC 场记条：流内首行，稳稳坐在「短剧工坊」标题上方 */
    .vfSlate {
      position: static; align-self: flex-start; z-index: 3;
      display: inline-flex; align-items: center; gap: 7px;
      padding: 3px 9px; border-radius: 999px;
      background: rgba(45, 38, 32, .78); color: #ffe3cd;
      font: 650 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: .12em;
      backdrop-filter: blur(3px);
      pointer-events: none;
      .recDot {
        width: 6px; height: 6px; border-radius: 50%;
        background: #ff5d3a; box-shadow: 0 0 6px rgba(255, 93, 58, .8);
        animation: recPulse 1.6s ease-in-out infinite;
      }
      .slateSep { width: 1px; height: 8px; background: rgba(255, 227, 205, .35); }
    }

    /* 纵向两行：REC 场记条 + （标题｜操作）行 */
    .heroCopy { position: relative; z-index: 2; flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 12px 0; }
    .heroRow { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
    h1 { margin: 0; font-size: clamp(20px, 1.9vw, 24px); font-weight: 760; letter-spacing: -.04em; color: #33291f; line-height: 1.1; }
    .heroActions { position: relative; z-index: 3; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

    /* 插画：右端顶到条边、上下被裁；左端渐隐融进条底色 */
    .heroSide { position: relative; z-index: 1; flex: none; align-self: stretch; display: flex; align-items: center; margin-left: auto; }
    .stripArt {
      display: block; flex: none;
      width: 360px; height: 134px;
      object-fit: cover; object-position: 38% center;
      -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 30%);
      mask-image: linear-gradient(90deg, transparent 0, #000 30%);
      user-select: none;
      pointer-events: none;
    }
  }

  @keyframes recPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: .35; }
  }

  :deep(.addBtn) {
    height: 34px; padding-inline: 15px;
    border: 0; border-radius: 10px;
    background: linear-gradient(135deg, #f2803f, #e0641f);
    color: #fff; font-weight: 650;
    box-shadow: 0 6px 16px rgba(224, 100, 31, .22);
    &:hover { background: linear-gradient(135deg, #f88746, #e96a26); }
  }

  .toolbar {
    display: flex; align-items: center; gap: 14px;
    margin: 0 0 16px; padding: 10px 14px;
    border: 1px solid var(--xoi-workspace-border, #eee7e2);
    border-radius: 14px; background: #fff;

    .tabs { display: flex; gap: 6px; flex: none; align-items: center; }
    .tab {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 14px; border-radius: 999px;
      color: #7c7169; font-size: 13px; font-weight: 550; cursor: pointer;
      transition: color .2s, background .2s;
      em { font-style: normal; font-size: 11px; color: #b3a79c; font-variant-numeric: tabular-nums; }
      &:hover { color: #4c433d; background: #faf5f0; }
      &.active {
        background: linear-gradient(135deg, #ff8847, #f26432); color: #fff;
        em { color: rgba(255, 255, 255, .78); }
      }
    }
    /* 状态小结：从 Hero 挪过来的「进行中 / 已成片」，贴着标签尾部 */
    .tabMeta {
      display: inline-flex; align-items: center; gap: 6px;
      margin-left: 8px; padding: 6px 12px;
      color: #8d8177; font-size: 12px; font-weight: 550;
      font-variant-numeric: tabular-nums;
      .dot { width: 6px; height: 6px; border-radius: 50%; }
      .dot.doing { background: #f2803f; box-shadow: 0 0 0 3px rgba(242, 128, 63, .16); }
      .dot.done { background: #5da77a; box-shadow: 0 0 0 3px rgba(93, 167, 122, .16); }
    }
    .search { width: min(300px, 34vw); margin-left: auto; }
    :deep(.t-input) { border-radius: 10px; background: #fffdfb; border-color: #eee0d5; }
    :deep(.t-input--focused) { border-color: #f0a580 !important; box-shadow: none !important; }
  }

  .list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
    gap: 18px;
    align-items: stretch;
  }

  :deep(.t-card.card) {
    display: flex; flex-direction: column;
    padding: 0; overflow: hidden;
    border: 1px solid var(--xoi-workspace-border, #eee7e2);
    border-radius: 14px; background: #fff;
    box-shadow: 0 3px 12px #302b2806;
    cursor: pointer;
    transition: transform .25s cubic-bezier(.16, 1, .3, 1), box-shadow .25s, border-color .25s;

    &:hover {
      transform: translateY(-3px);
      border-color: #e6c3ab;
      box-shadow: 0 12px 28px #302b2812;
      .projectCover .coverNo { opacity: .5; }
    }
  }

  /* 封面带：有缩略图铺图墙，否则按项目类型渐变 */
  .projectCover {
    position: relative;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    min-height: 96px; padding: 14px 16px;
    color: #fff;
    background:
      radial-gradient(circle at 84% 10%, rgba(255, 255, 255, .22), transparent 30%),
      linear-gradient(128deg, #f78a4e, #e0641f);
  }
  .card-novel .projectCover {
    background:
      radial-gradient(circle at 84% 10%, rgba(255, 226, 204, .18), transparent 30%),
      linear-gradient(128deg, #6b4a35, #452e21);
  }
  .coverThumbs {
    position: absolute; inset: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    img {
      width: 100%; height: 100%;
      object-fit: cover;
      &:first-child:last-child { grid-column: 1 / -1; }
    }
  }
  .coverShade {
    position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(30, 20, 12, .12), rgba(30, 20, 12, .58));
  }
  .coverInfo { position: relative; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
  .coverType {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 999px;
    background: rgba(255, 255, 255, .18);
    border: 1px solid rgba(255, 255, 255, .3);
    font-size: 11px; font-weight: 650; letter-spacing: .04em;
  }
  .coverState {
    padding: 3px 9px; border-radius: 999px;
    background: rgba(255, 255, 255, .14);
    font-size: 11px;
    &.state-done { background: rgba(255, 255, 255, .92); color: #3f7d5b; font-weight: 650; }
    &.state-doing { background: rgba(43, 26, 16, .28); }
    &.state-idle { opacity: .85; }
  }
  .coverNo {
    position: relative;
    flex: none; margin-left: auto;
    font: 650 15px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: -.04em; opacity: .38;
    transition: opacity .25s;
  }

  :deep(.t-card__body) { display: flex; flex-direction: column; flex: 1; padding: 0; }

  .cardBody {
    display: flex; flex-direction: column; flex: 1;
    padding: 14px 18px 15px;

    .title {
      font-size: 17px; font-weight: 700; color: #302b28; letter-spacing: -.02em;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .metaRow {
      display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px;
      span {
        padding: 2px 8px; border: 1px solid #f0e2d6; border-radius: 6px;
        background: #fff8f2; color: #a3765a; font-size: 11px;
      }
    }

    .intro {
      flex: 1; margin-top: 9px;
      color: #7c7169; font-size: 12.5px; line-height: 1.6;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      overflow: hidden; text-overflow: ellipsis;
      &.isEmpty { color: #b9ada2; }
    }

    .cardProgress { margin-top: 12px; }

    .bottomMenu {
      display: flex; align-items: center; justify-content: space-between;
      margin-top: 13px; padding-top: 12px; border-top: 1px solid #f4ece4;

      .time { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #a3988d; }
      .actionBtns { display: flex; align-items: center; gap: 6px; }

      .editBtn, .removeBtn {
        display: grid; place-items: center; width: 30px; height: 30px;
        border-radius: 8px; cursor: pointer; color: #8d8177;
        transition: background .2s, color .2s;
      }
      .editBtn:hover { background: #fff1e6; color: #d06a33; }
      .removeBtn:hover { background: #fdecea; color: #d5453a; }

      .open-label {
        display: flex; align-items: center; gap: 3px; margin-left: 4px;
        color: #d06a33; font-size: 12px; font-weight: 600;
      }
    }
  }

  .quick-create {
    min-height: 240px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
    border: 1px dashed #efd9c8; border-radius: 14px; background: #fffbf7;
    color: var(--xoi-workspace-accent, #f57438); cursor: pointer;
    transition: border-color .25s, background .25s, transform .25s;

    &:hover { border-color: #e6a97e; background: #fff6ee; transform: translateY(-2px); }

    .quick-create-icon {
      display: grid; place-items: center; width: 44px; height: 44px;
      border-radius: 12px; color: var(--xoi-workspace-accent, #f57438);
      background: var(--xoi-workspace-tint, #fff1e7);
    }
    .quick-create-title { color: #302b28; font-size: 15px; font-weight: 650; }
    .quick-create-desc { color: #7c7169; font-size: 12px; }
  }

  /* 骨架屏 */
  .card-skeleton {
    display: flex; flex-direction: column; gap: 13px;
    padding: 0 0 18px; overflow: hidden;
    border: 1px solid var(--xoi-workspace-border, #eee7e2); border-radius: 14px; background: #fff;

    .sk-cover { height: 96px; border-radius: 13px 13px 0 0; background: linear-gradient(90deg, #f6ede4 25%, #fdf6ef 50%, #f6ede4 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; margin: 0; }
    .sk-bottom { display: flex; justify-content: space-between; margin-top: 6px; }
    .sk-line {
      height: 14px; margin: 0 18px; border-radius: 6px;
      background: linear-gradient(90deg, rgba(48, 43, 40, .06) 25%, rgba(48, 43, 40, .11) 50%, rgba(48, 43, 40, .06) 75%);
      background-size: 200% 100%; animation: shimmer 1.5s infinite;
    }
    .sk-w-60 { width: 60%; } .sk-w-35 { width: 35%; } .sk-w-20 { width: 20%; }
    .sk-w-15 { width: 15%; } .sk-w-40 { width: 40%; } .sk-w-80 { width: 80%; } .sk-w-full { width: 100%; }
  }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  /* 空态 */
  .empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    min-height: 300px; padding: 60px 20px;
    border: 1px dashed #ecdfd4; border-radius: 16px; background: #fffdfb;
    color: #8d8177;

    .empty-icon { font-size: 44px; margin-bottom: 14px; }
    .empty-title { color: #4c433d; font-size: 17px; font-weight: 650; margin-bottom: 8px; }
    .empty-desc { font-size: 13px; margin-bottom: 20px; }
    :deep(.t-button) { border-radius: 10px; }
  }

  @media (max-width: 1150px) {
    .directorHero .stripArt { width: 300px; height: 120px; }
  }
  @media (max-width: 900px) {
    .toolbar { flex-wrap: wrap; }
    .toolbar .search { width: 100%; margin-left: 0; }
    .directorHero .heroSide { display: none; }
  }
  @media (max-width: 760px) {
    /* 窄屏下统计条可能占满整行，REC 场记条让位避免叠字 */
    .directorHero .vfSlate { display: none; }
  }
  @media (max-width: 640px) {
    padding: 14px 14px 32px;
    .list { grid-template-columns: minmax(0, 1fr); }
    .directorHero .heroInner { padding: 18px; }
  }
}
</style>
