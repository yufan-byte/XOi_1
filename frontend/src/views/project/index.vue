<template>
  <div class="project director-projects">
    <div class="header project-hero">
      <div class="hero-copy">
        <span class="project-eyebrow">XOi STORY STUDIO</span>
        <span class="title">影视创作项目</span>
        <span class="sub">从故事、剧本到镜头与成片，在同一条创作链路中持续推进。</span>
        <div class="project-stats" aria-label="项目概览">
          <span><strong>{{ doingCount }}</strong>进行中</span>
          <span><strong>{{ doneCount }}</strong>已有成片</span>
          <span><strong>{{ allProject.length }}</strong>全部项目</span>
        </div>
      </div>
      <div class="header-actions">
        <t-button class="addBtn" @click="editProjectData = null; dialogShow = true">
          <template #icon><i-plus class="addIcon" :size="20" /></template>
          {{ $t("workbench.project.newProject") }}
        </t-button>
      </div>
      <div class="project-hero-art" aria-hidden="true">
        <span class="film-frame frame-one"><i>STORY</i><b>01</b></span>
        <span class="film-frame frame-two"><i>DIRECT</i><b>XOi</b></span>
        <span class="hero-disc"></span>
      </div>
    </div>
    <div class="toolbar">
      <div class="tabs">
        <span class="tab" :class="{ active: activeTab === 'all' }" @click="activeTab = 'all'">全部项目</span>
        <span class="tab" :class="{ active: activeTab === 'recent' }" @click="activeTab = 'recent'">最近创建</span>
      </div>
      <t-input v-model="searchQuery" class="search" placeholder="搜索项目" clearable>
        <template #prefix><t-icon name="search" /></template>
      </t-input>
    </div>
    <!-- 骨架屏 -->
    <div v-if="loading" class="list">
      <div class="card-skeleton" v-for="i in 6" :key="i">
        <div class="sk-head">
          <div class="sk-line sk-w-60"></div>
          <div class="sk-line sk-w-20"></div>
        </div>
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
      <t-card hoverShadow class="card" v-for="(project, index) in filteredProjects" :key="project.id" :class="`card-${project.projectType}`" @click="openProject(project.id)">
        <div class="projectSlate">
          <div class="slateClapper" aria-hidden="true"></div>
          <div class="slateHeading"><span>导演制作档案 <small>PRODUCTION FILE</small></span><b>#{{ String(project.id).slice(-6) }}</b></div>
          <div class="slateFields"><span><small>创作方式</small>{{ project.projectType === 'novel' ? '小说改编' : '剧本创作' }}</span><span><small>画幅</small>{{ project.videoRatio || '待设置' }}</span><span :class="`slateState-${progressState(project)}`"><small>制作状态</small>{{ progressState(project) === 'done' ? '已有成片' : progressState(project) === 'doing' ? '进行中' : '待开始' }}</span></div>
        </div>
        <div class="cardHead">
          <div class="title">
            {{ project.name }}
          </div>
          <div class="typeTag">
            <component :is="project.projectType == 'novel' ? 'i-notebook' : 'i-edit'" class="typeIcon" />
            <span>{{ project.projectType == "novel" ? $t(`workbench.project.type.novel`) : $t(`workbench.project.type.script`) }}</span>
          </div>
        </div>
        <t-tag shape="round" v-if="project.artStyle" style="align-self: flex-start">{{ project.artStyle }}</t-tag>
        <div class="intro">
          {{ project.intro }}
        </div>
        <!-- 流水线进度：一眼看出这个项目卡在哪一步 -->
        <PipelineProgress class="cardProgress" :progress="project.progress" :project-type="project.projectType" compact />
        <div class="bottomMenu">
          <div class="time">
            <t-icon name="time" size="14px" />
            <span>{{ dayjs(project?.createTime).format("YYYY-MM-DD HH:mm") }}</span>
          </div>
          <div class="actionBtns">
            <div class="editBtn" @click.stop="openEdit(project)">
              <i-edit :size="16" />
            </div>
            <div class="removeBtn" @click.stop="delProjcer(project.id)">
              <i-delete :size="16" />
            </div>
            <span class="open-label">打开项目 <t-icon name="arrow-right" /></span>
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
import projectDialog from "./components/projectDialog.vue";
import dayjs from "dayjs";
import axios from "@/utils/axios";
import projectStore, { type ProjectProgress } from "@/stores/project";
import imageListCacheStore from "@/stores/imageListCache";
import PipelineProgress from "@/components/pipeline/PipelineProgress.vue";

const { clearProjectCache } = imageListCacheStore();
const { allProject, project } = storeToRefs(projectStore());

const dialogShow = ref(false);
const dialogClosing = ref(false);
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

  // Project viewing must not depend on generation provider availability.
  project.value = item;
  await router.push({ path: item.projectType === "novel" ? "/novel" : "/script", query: { projectId: String(item.id) } });
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
.project {
  min-height: 100%;
  padding: 0 40px 40px;

  /* 旧版 creation-hero / creation-entry / orb / visual-card / resource-strip 一套样式
     已无对应模板（现用 project-hero / toolbar / list），整体删除 —— 它们也是页面里
     最后的紫色字面量来源。 */

  .header {
    padding-top: 36px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;

    .title {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .sub {
      display: block;
      margin: 8px 0 0;
      color: var(--text-tertiary);
      font-size: 14px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .project-count {
      color: var(--text-tertiary);
      font-size: 13px;
    }
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 20px;
    padding: 12px 0;
    border-bottom: 1px solid var(--border-primary);

    .tabs { display: flex; gap: 24px; }
    .tab { color: var(--text-tertiary); font-size: 13px; cursor: pointer; padding: 8px 0; }
    .tab.active { color: var(--td-brand-color); font-weight: 600; border-bottom: 2px solid var(--td-brand-color); }
    .search { width: 220px; }
  }

  :deep(.addBtn) {
    border-radius: 10px;
    padding-inline: 18px;
    box-shadow: 0 6px 14px rgba(37, 99, 235, 0.16);
  }

  // 骨架屏卡片
  .card-skeleton {
    border-radius: 20px;
    padding: 24px;
    background: var(--material-regular);
    border: 1px solid var(--material-border-light);
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: hidden;

    .sk-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 4px;
    }

    .sk-bottom {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
    }

    .sk-line {
      height: 16px;
      border-radius: 6px;
      background: linear-gradient(90deg, rgba(0, 0, 0, 0.06) 25%, rgba(0, 0, 0, 0.12) 50%, rgba(0, 0, 0, 0.06) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
    }

    .sk-w-60 { width: 60%; }
    .sk-w-35 { width: 35%; }
    .sk-w-20 { width: 20%; }
    .sk-w-15 { width: 15%; }
    .sk-w-40 { width: 40%; }
    .sk-w-80 { width: 80%; }
    .sk-w-full { width: 100%; }
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  // 空态
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 0;
    color: var(--text-tertiary);

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }

    .empty-desc {
      font-size: 14px;
      margin-bottom: 24px;
    }
  }

  .list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;

    .quick-create {
      min-height: 220px;
      border: 1px dashed rgba(242, 100, 50, 0.34);
      border-radius: 14px;
      background: linear-gradient(145deg, rgba(255, 244, 235, 0.75), rgba(252, 250, 248, 0.8));
      color: var(--td-brand-color);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.25s ease;

      &:hover {
        border-color: #f26432;
        background: linear-gradient(145deg, rgba(255, 236, 222, 0.9), rgba(252, 250, 248, 0.95));
        transform: translateY(-2px);
      }

      .quick-create-icon {
        width: 42px;
        height: 42px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        background: rgba(242, 100, 50, 0.12);
        color: #c25a22;
      }

      .quick-create-title { font-size: 15px; font-weight: 600; }
      .quick-create-desc { font-size: 12px; color: var(--text-tertiary); }
    }

      .card {
      width: 100%;
      height: 100%;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: var(--material-regular);
      backdrop-filter: var(--blur-light);
      -webkit-backdrop-filter: var(--blur-light);
      border: 1px solid var(--material-border-light);
      border-top: 1px solid var(--material-border-medium);
      border-radius: 14px;
      padding: 22px;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
      overflow: hidden;

      &::before {
        content: '';
        position: absolute;
        inset: 0 0 auto;
        height: 3px;
        background: linear-gradient(90deg, #ff8847, #f26432);
        opacity: 0.85;
      }

      &.card-script::before { background: linear-gradient(90deg, #0ea5e9, #38bdf8); }

      &:hover {
        transform: translateY(-3px);
        box-shadow: 0 12px 28px rgba(30, 41, 59, 0.10);
        border-color: rgba(242, 100, 50, 0.30);
      }

      &:active {
        transform: translateY(-1px);
      }

      .cardHead {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;

        .title {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .typeTag {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-shrink: 0;
          padding: 4px 10px;
          border-radius: 999px;
          background: var(--td-brand-color-light);
          color: var(--td-brand-color);
          font-size: 12px;
          font-weight: 500;

          .typeIcon {
            font-size: 14px;
          }
        }
      }

      .intro {
        height: 100%;
        margin-top: 8px;
        font-size: 13px;
        color: var(--text-secondary);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.5;
      }

      /* 流水线进度条：卡片里一眼看出卡在第几步 */
      .cardProgress {
        margin-top: 12px;
      }

      .bottomMenu {
        margin-top: 18px;
        padding-top: 16px;
        border-top: 1px solid rgba(0, 0, 0, 0.05);

        .time {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--text-tertiary);
        }

        .actionBtns {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .open-label { margin-left: auto; color: var(--td-brand-color); font-size: 12px; font-weight: 500; display: flex; align-items: center; gap: 2px; }

        .editBtn,
        .removeBtn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
          color: var(--text-secondary);
        }

        .editBtn {
          &:hover {
            background: rgba(245, 116, 0, 0.10);
            color: #c25a22;
          }
        }

        .removeBtn {
          &:hover {
            background: rgba(239, 68, 68, 0.1);
            color: #ef4444;
          }
        }
      }
    }
  }

@media (max-width: 900px) {
  .project {
    padding: 0 24px 32px;
    .header { align-items: flex-start; gap: 16px; .title { font-size: 24px; } .project-count { display: none; } }
    .toolbar { align-items: flex-start; flex-direction: column; .search { width: 100%; } }
  }
}

@media (max-width: 640px) {
  .project {
    padding-inline: 16px;
    .header { flex-direction: column; }
    .header-actions, :deep(.addBtn) { width: 100%; }
    :deep(.addBtn) { justify-content: center; }
    .list { grid-template-columns: 1fr; }
  }
}

  .empty {
    min-height: 300px;
    border: 1px dashed var(--border-primary);
    border-radius: 16px;
    background: rgba(248, 250, 252, 0.55);
  }
}

:deep(.t-col) {
  height: auto !important;
}

:deep(.t-card__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 0;
}

:deep(.t-card--shadow-hover:hover) {
  box-shadow: none;
}

:deep(.t-tag) {
  background: rgba(245, 116, 0, 0.08);
  color: #c25a22;
  border: 1px solid rgba(245, 116, 0, 0.18);
  border-radius: 8px;
  font-size: 12px;
  padding: 2px 10px;
}
.project{font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif;padding:0 clamp(28px,4vw,58px) 54px;background:linear-gradient(180deg,#fbfbfc,#f6f7fa)}.project .header{padding-top:46px;margin-bottom:28px}.project .header .title{font-size:36px;font-weight:750;letter-spacing:-.045em;color:#292b36}.project .header .sub{font-size:15px;color:#858894}.project .toolbar{padding:0 0 15px;margin-bottom:26px}.project .tabs{gap:30px}.project .tab{font-size:14px}.project :deep(.addBtn){height:44px;border-radius:13px;background:#222329;border-color:#222329;box-shadow:0 9px 20px rgba(25,26,31,.14)}.project .list{gap:18px}.project :deep(.t-card.card){border-radius:22px;background:#fff;border:1px solid #ebecef;box-shadow:0 10px 28px rgba(40,45,65,.06);transition:.22s ease}.project :deep(.t-card.card:hover){transform:translateY(-4px);box-shadow:0 20px 42px rgba(40,45,65,.1)}
</style>

<style lang="scss" scoped>
.project {
  box-sizing: border-box;
  height: 100%;
  overflow-y: auto;
  padding: 28px clamp(24px, 3.5vw, 54px) 64px;
  background:
    radial-gradient(circle at 88% 3%, rgba(255, 178, 128, .18), transparent 25%),
    linear-gradient(180deg, #faf9fb 0%, #f5f5f7 100%);
  color: #272631;

  .project-hero {
    position: relative;
    min-height: 218px;
    margin: 0 0 18px;
    padding: 34px 38px;
    overflow: hidden;
    border: 1px solid rgba(120, 92, 62, .14);
    border-radius: 28px;
    background:
      radial-gradient(circle at 86% 12%, rgba(255, 150, 90, .30), transparent 25%),
      radial-gradient(circle at 68% 100%, rgba(255, 168, 110, .22), transparent 34%),
      linear-gradient(132deg, #fff 0%, #fff7f0 54%, #fff4eb 100%);
    box-shadow: 0 20px 48px rgba(84, 60, 40, .08);
  }

  .hero-copy { position: relative; z-index: 2; max-width: 610px; }
  .project-eyebrow { color: #e96827; font-size: 11px; font-weight: 750; letter-spacing: .18em; }
  .project-hero .title { display: block; margin-top: 11px; font-size: clamp(30px, 3vw, 43px); font-weight: 760; line-height: 1.08; letter-spacing: -.045em; }
  .project-hero .sub { max-width: 560px; margin-top: 11px; color: #777483; font-size: 14px; line-height: 1.65; }
  .project-stats { display: flex; gap: 9px; margin-top: 20px; }
  .project-stats span { display: inline-flex; align-items: center; gap: 6px; padding: 7px 11px; border: 1px solid rgba(122, 102, 80, .16); border-radius: 999px; background: rgba(255,255,255,.6); color: #777483; font-size: 11px; backdrop-filter: blur(8px); }
  .project-stats strong { color: #34313f; font-size: 14px; }
  .project-hero .header-actions { position: absolute; right: 37px; bottom: 31px; z-index: 4; }
  :deep(.project-hero .addBtn) { height: 44px; padding-inline: 20px; border: 0 !important; border-radius: 14px; background: linear-gradient(135deg, #ff8847, #f26432) !important; color: #fff !important; box-shadow: 0 10px 24px rgba(239, 100, 48, .24); font-weight: 650; }
  :deep(.project-hero .addBtn .t-button__text), :deep(.project-hero .addBtn .addIcon) { color: #fff; }

  .project-hero-art { position: absolute; top: 0; right: 0; width: 39%; height: 100%; pointer-events: none; }
  .film-frame { position: absolute; display: flex; flex-direction: column; justify-content: space-between; width: 118px; height: 146px; padding: 15px; border: 1px solid rgba(255,255,255,.75); border-radius: 20px; color: #fff; box-shadow: 0 18px 36px rgba(67, 54, 110, .16); }
  .film-frame i { font-size: 8px; font-style: normal; letter-spacing: .15em; }
  .film-frame b { font-size: 30px; letter-spacing: -.06em; }
  .frame-one { top: 28px; right: 154px; transform: rotate(-8deg); background: linear-gradient(145deg, #4a4553, #2a2831); }
  .frame-two { top: 21px; right: 35px; transform: rotate(8deg); background: linear-gradient(145deg, #ff9d62, #e75f42); }
  .hero-disc { position: absolute; right: 260px; bottom: -54px; width: 144px; height: 144px; border-radius: 50%; background: rgba(255,255,255,.5); box-shadow: inset 0 0 0 28px rgba(255,255,255,.22); }

  .toolbar { margin-bottom: 18px; padding: 10px 4px 13px; }
  .toolbar .tabs { gap: 8px; }
  .toolbar .tab { padding: 9px 14px; border: 0; border-radius: 10px; font-weight: 550; }
  .toolbar .tab.active { border: 0; background: #27262d; color: #fff; }
  .toolbar .search { width: min(290px, 32vw); }
  .toolbar :deep(.t-input) { border-radius: 12px; background: rgba(255,255,255,.78); }

  .list { grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 18px; }
  .list .card { min-height: 282px; padding: 0 20px 19px; border: 1px solid rgba(65, 61, 82, .08); border-radius: 20px; background: rgba(255,255,255,.82); box-shadow: 0 8px 24px rgba(42, 39, 58, .045); }
  .list .card::before { display: none; }
  .list .card:hover { transform: translateY(-4px); border-color: rgba(242, 100, 50, .28); box-shadow: 0 18px 38px rgba(74, 56, 42, .12); }
  /* 卡片封面：与首屏两枚胶片框同一套色（墨黑 / 暖橙），不再有紫色 */
  .card-visual { position: relative; height: 82px; margin: 0 -20px 18px; overflow: hidden; padding: 16px 18px; border-radius: 19px 19px 13px 13px; background: radial-gradient(circle at 78% 18%, rgba(255,255,255,.20), transparent 26%), linear-gradient(130deg, #3a3743, #232129); color: #f5f3f7; }
  .card-script .card-visual { background: radial-gradient(circle at 78% 18%, rgba(255,255,255,.34), transparent 26%), linear-gradient(130deg, #ff9d62, #e75f42); color: #fff; }
  .card-visual span { font-size: 9px; font-weight: 750; letter-spacing: .16em; }
  .card-visual strong { position: absolute; right: 17px; bottom: 4px; font-size: 44px; line-height: 1; letter-spacing: -.08em; opacity: .65; }
  .list .quick-create { min-height: 282px; border-radius: 20px; border-color: rgba(242, 100, 50, .34); background: rgba(255,255,255,.42); }

  &::-webkit-scrollbar { width: 8px; }
  &::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: rgba(83,82,94,.24); background-clip: padding-box; }
}

@media (max-width: 980px) {
  .project {
    .project-hero-art { opacity: .45; right: -55px; }
    .project-hero .header-actions { right: 28px; }
    .hero-copy { max-width: 58%; }
  }
}

@media (max-width: 700px) {
  .project {
    padding: 18px 16px 48px;
    .project-hero { min-height: 282px; padding: 28px 24px; }
    .hero-copy { max-width: 100%; }
    .project-hero-art { display: none; }
    .project-hero .header-actions { left: 24px; right: auto; bottom: 24px; }
    .project-stats span { padding: 6px 9px; }
    .project-stats span:nth-child(n+3) { display: none; }
    .toolbar { align-items: stretch; flex-direction: column; }
    .toolbar .search { width: 100%; }
  }
}
</style>

<style lang="scss" scoped>
.director-projects {
  // Keep the director slate distinct; page chrome inherits the shared creation palette.
  padding:20px 24px 24px; background:var(--xoi-workspace-bg,#faf8f6);
  .toolbar { margin:0 0 16px; padding:10px 12px; border:1px solid var(--xoi-workspace-border,#eee7e2); border-radius:14px; background:#fff; }
  .toolbar .tabs { gap:6px; }
  .toolbar .tab.active { background:linear-gradient(135deg,#ff8847,#f26432); color:#fff; }
  .list { grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:18px; }
  .list :deep(.t-card.card) { padding:0 20px 18px; border-radius:12px; border:1px solid var(--xoi-workspace-border,#eee7e2); background:#fff; box-shadow:0 3px 12px #302b2806; }
  .list :deep(.t-card.card:hover) { transform:translateY(-2px); border-color:#d7bfae; box-shadow:0 10px 24px #302b2812; }
  .projectSlate { overflow:hidden; margin:0 -20px 18px; border-radius:11px 11px 0 0; background:linear-gradient(145deg,#2c333d,#1d232b); color:#eef1f5; }
  .slateClapper { height:14px; border-bottom:2px solid #141a20; background:repeating-linear-gradient(135deg,#424c59 0 19px,#ced4da 19px 38px); }
  .slateHeading { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:18px 18px 15px; }
  .slateHeading span { display:flex; flex-direction:column; gap:7px; font-size:14px; font-weight:600; }
  .slateHeading small { color:#9aa7b6; font-size:8px; letter-spacing:.18em; }
  .slateHeading b { color:#e5bd71; font:500 17px ui-monospace,monospace; }
  .slateFields { display:grid; grid-template-columns:1fr 1fr 1fr; margin:0 18px 18px; border-top:1px solid #46505d; padding-top:12px; }
  .slateFields span { display:flex; flex-direction:column; gap:6px; padding-left:10px; border-left:1px solid #46505d; font-size:11px; }
  .slateFields span:first-child { padding-left:0; border:0; }
  .slateFields small { color:#96a3b3; font-size:9px; }
  .slateFields .slateState-done { color:#a9ceba; }
  .slateFields .slateState-doing { color:#e5bd71; }
  .list .quick-create { min-height:320px; border:1px dashed #efd9c8; border-radius:12px; background:#fffbf7; }
  .list .quick-create:hover { border-color:#e6bd9e; background:#fff8f1; }
  .list .quick-create .quick-create-icon { color:var(--xoi-workspace-accent,#f57438); background:var(--xoi-workspace-tint,#fff1e7); border-radius:8px; }
  .list .quick-create .quick-create-title { color:var(--xoi-workspace-text,#302b28); }
  .list .quick-create .quick-create-desc { color:var(--xoi-workspace-muted,#7c7169); }
  .list .card .cardHead .typeTag { color:#bc764e; background:var(--xoi-workspace-tint,#fff1e7); border-radius:5px; }
  .list .card .bottomMenu .open-label { color:#bc764e; }
  :deep(.addBtn) { border-color:var(--xoi-workspace-accent,#f57438); background:var(--xoi-workspace-accent,#f57438); color:#fff; border-radius:10px; box-shadow:none; }
  @media(max-width:700px) { padding:14px; .list { grid-template-columns:minmax(0,1fr); } }
}
</style>
