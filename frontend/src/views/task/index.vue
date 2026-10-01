<template>
  <div class="task">
    <div class="header taskHero">
      <div class="headerInfo fc">
        <span class="taskEyebrow">XOi CREATIVE OPERATIONS</span>
        <span class="title">{{ $t("workbench.task.title") }}</span>
        <span class="sub">{{ $t("workbench.task.subtitle") }}</span>
        <div class="taskMeta"><span><strong>{{ pagination.total }}</strong> 全部任务</span><span><strong>{{ runningCount }}</strong> 进行中</span></div>
      </div>
      <t-button class="refreshBtn" @click="getTaskList">
        <template #icon>
          <i-redo :size="20" />
        </template>
        {{ $t("workbench.task.refresh") }}
      </t-button>
      <div class="taskHeroArt" aria-hidden="true"><i>QUEUE</i><b>{{ String(pagination.total).padStart(2, '0') }}</b></div>
    </div>
    <div class="list">
      <div class="search f">
        <t-select :label="$t('workbench.task.project')" v-model="projectId" :options="projectData" @change="onFilterChange" />
        <t-select
          :label="$t('workbench.task.categoryLabel')"
          v-model="taskClass"
          :options="categoryOptions"
          @change="onFilterChange"
          style="margin-left: 20px" />
        <t-select
          :label="$t('workbench.task.stateLabel')"
          v-model="taskState"
          :options="stateOptions"
          @change="onFilterChange"
          style="margin-left: 20px" />
      </div>
      <div class="content">
        <t-table :data="taskList" :columns="columns" row-key="id" :loading="pagination.loading" hover stripe>
          <template #state="{ row }">
            <t-tooltip v-if="row.state === '生成失败'" :content="row.reason || $t('workbench.task.noFailReason')" placement="top">
              <span class="stateText stateFail">{{ row.state }}</span>
            </t-tooltip>
            <span v-else class="stateText" :class="row.state === '进行中' ? 'stateRunning' : 'stateSuccess'">
              {{ row.state }}
            </span>
          </template>
          <template #startTime="{ row }">
            <span>{{ dayjs(row.startTime).format("YYYY-MM-DD HH:mm:ss") }}</span>
          </template>
        </t-table>
        <t-pagination
          class="paginationWrap"
          v-model:current="pagination.page"
          v-model:pageSize="pagination.limit"
          show-sizer
          :total="pagination.total"
          @page-size-change="getTaskList"
          @current-change="getTaskList" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import dayjs from "dayjs";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";

const { project } = storeToRefs(projectStore());

interface TaskItem {
  id: number;
  taskClass: string;
  relatedObjects: string;
  model: string;
  projectName: string;
  episode: string;
  state: string;
  startTime: number;
  describe?: string;
  reason?: string;
}

const columns = [
  { colKey: "taskClass", title: $t("workbench.task.col.taskClass"), width: 120, ellipsis: true },
  { colKey: "relatedObjects", title: $t("workbench.task.col.relatedObjects"), width: 120, ellipsis: true },
  { colKey: "model", title: $t("workbench.task.col.model"), width: 280, ellipsis: true },
  { colKey: "describe", title: $t("workbench.task.col.describe"), ellipsis: true },
  { colKey: "reason", title: $t("workbench.task.col.reason"), ellipsis: true },
  { colKey: "state", title: $t("workbench.task.col.state"), width: 100, cell: "state" },
  { colKey: "startTime", title: $t("workbench.task.col.startTime"), width: 200, cell: "startTime" },
];

const stateOptions = [
  { label: $t("workbench.task.stateAll"), value: "" },
  { label: $t("workbench.task.stateRunning"), value: "进行中" },
  { label: $t("workbench.task.stateCompleted"), value: "已完成" },
  { label: $t("workbench.task.stateFailed"), value: "生成失败" },
];

const pagination = ref({ page: 1, limit: 10, total: 0, loading: false });
const categoryOptions = ref<{ label: string; value: string }[]>([]);
const projectData = ref<{ label: string; value: string }[]>([]);
const taskClass = ref("");
const taskState = ref("");
const projectId = ref("");
const taskList = ref<TaskItem[]>([]);
const runningCount = computed(() => taskList.value.filter((item) => item.state === "进行中").length);

onMounted(() => {
  getTaskList();
  getCategories();
  getProject();
});

function onFilterChange() {
  pagination.value.page = 1;
  getTaskList();
}

async function getCategories() {
  const { data } = await axios.post("/task/getTaskCategories").catch(() => ({ data: [] }));
  categoryOptions.value = [
    { label: $t("workbench.task.stateAll"), value: "" },
    ...data.map((i: any) => ({ label: i.taskClass, value: i.taskClass })),
  ];
}

async function getProject() {
  const { data } = await axios.post("/task/getProject").catch(() => ({ data: [] }));
  projectData.value = [{ label: $t("workbench.task.stateAll"), value: "" }, ...data.map((i: any) => ({ label: i.name, value: i.id }))];
}

async function getTaskList() {
  pagination.value.loading = true;
  try {
    const { data } = await axios.post("/task/getTaskApi", {
      page: pagination.value.page,
      limit: pagination.value.limit,
      taskClass: taskClass.value,
      state: taskState.value,
      projectId: projectId.value || project.value?.id,
    });
    taskList.value = data.data;
    pagination.value.total = data.total;
  } catch {
    window.$message.error($t("workbench.task.fetchFailed"));
  } finally {
    pagination.value.loading = false;
  }
}
</script>

<style lang="scss" scoped>
.task {
  padding: 0 32px;

  .header {
    padding-top: 32px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;

    .title {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .sub {
      opacity: 0.5;
      font-size: 14px;
      margin-left: 12px;
    }
  }

  /* 筛选器区域 */
  .search {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
    padding: 16px 20px;
    background: var(--material-thin);
    backdrop-filter: var(--blur-light);
    -webkit-backdrop-filter: var(--blur-light);
    border: 1px solid var(--material-border-light);
    border-radius: 16px;
  }

  /* 表格容器 */
  .content {
    background: var(--material-regular);
    backdrop-filter: var(--blur-medium);
    -webkit-backdrop-filter: var(--blur-medium);
    border: 1px solid var(--material-border-medium);
    border-top: 1px solid var(--material-border-heavy);
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 280px);
  }

  /* 状态标签 */
  .stateText {
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .stateFail {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.2);
    cursor: pointer;

    &:hover {
      background: rgba(239, 68, 68, 0.15);
    }
  }

  .stateRunning {
    background: rgba(59, 130, 246, 0.1);
    color: #3b82f6;
    border: 1px solid rgba(59, 130, 246, 0.2);
    animation: pulse-blue 2s ease-in-out infinite;
  }

  .stateSuccess {
    background: rgba(16, 185, 129, 0.1);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.2);
  }

  @keyframes pulse-blue {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .paginationWrap {
    padding: 16px 20px;
    display: flex;
    justify-content: flex-end;
  }
}

/* TDesign 表格样式覆盖 */
:deep(.t-table) {
  background: transparent;
  border: none;
  flex: 1;
  overflow: hidden;
}

:deep(.t-table__content) {
  overflow-y: auto !important;
  max-height: calc(100vh - 350px);

  /* 苹果风格滚动条 */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.12);
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.2);
  }
}

:deep(.t-table__header) {
  position: sticky;
  top: 0;
  z-index: 10;

  tr {
    border-bottom: none;
  }

  th {
    padding: 16px 18px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-bottom: 2px solid var(--material-border-light);
  }
}

:deep(.t-table__body) {
  tr {
    transition: all 0.15s ease;

    &:hover {
      background: rgba(99, 102, 241, 0.05);
    }

    &:not(:last-child) {
      border-bottom: 1px solid rgba(0, 0, 0, 0.04);
    }
  }

  td {
    padding: 16px 18px;
    font-size: 14px;
    color: var(--text-primary);
  }
}

/* 去掉斑马纹 */
:deep(.t-table--stripe) .t-table__body tr:nth-child(even) {
  background: transparent;
}

:deep(.t-table--stripe) .t-table__body tr:nth-child(even):hover {
  background: rgba(99, 102, 241, 0.05);
}

/* 分页器样式 */
:deep(.t-pagination) {
  background: transparent;
}

:deep(.t-pagination__btn) {
  background: var(--material-thin);
  border: 1px solid var(--material-border-light);
  border-radius: 10px;
  transition: all 0.2s ease;

  &:hover {
    background: var(--material-regular);
    border-color: var(--accent-primary);
  }
}

:deep(.t-pagination__number) {
  border-radius: 10px;
  transition: all 0.2s ease;

  &.t-is-current {
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
    border: none;
  }
}

/* 下拉选择器样式 */
:deep(.t-select) {
  .t-input {
    background: var(--material-thin);
    backdrop-filter: var(--blur-light);
    -webkit-backdrop-filter: var(--blur-light);
    border: 1px solid var(--material-border-light);
    border-radius: 12px;
    transition: all 0.2s ease;

    &:hover {
      border-color: var(--accent-primary);
    }

    &:focus-within {
      border-color: var(--accent-primary);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }
  }
}

/* 刷新按钮 */
:deep(.t-button--theme-default) {
  background: var(--material-thin);
  backdrop-filter: var(--blur-light);
  -webkit-backdrop-filter: var(--blur-light);
  border: 1px solid var(--material-border-light);
  border-radius: 12px;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    background: var(--material-regular);
    border-color: var(--accent-primary);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  &:active {
    transform: translateY(0);
  }
}
</style>

<style lang="scss">
.task {
  box-sizing:border-box;height:100%;overflow-y:auto;padding:24px clamp(24px,3.5vw,50px) 42px!important;
  background:radial-gradient(circle at 92% 0,rgba(255,174,119,.16),transparent 23%),linear-gradient(180deg,#faf9fb,#f5f5f7);
  color:#292833;
  .taskHero{position:relative;min-height:174px;margin:0 0 16px!important;padding:29px 34px!important;overflow:hidden;border:1px solid rgba(89,76,148,.11);border-radius:25px;background:radial-gradient(circle at 86% 10%,rgba(255,151,91,.27),transparent 25%),radial-gradient(circle at 68% 110%,rgba(125,109,225,.16),transparent 36%),linear-gradient(132deg,#fff,#f6f2ff 58%,#fff3ea);box-shadow:0 17px 42px rgba(58,49,99,.075)}
  .headerInfo{position:relative;z-index:2;align-items:flex-start!important}.taskEyebrow{color:#e76c2d;font-size:10px;font-weight:750;letter-spacing:.17em}.taskHero .title{margin-top:9px;color:#292733;font-size:36px!important;line-height:1.08;letter-spacing:-.045em}.taskHero .sub{margin:7px 0 0!important;color:#777482;font-size:13px!important;opacity:1!important}
  .taskMeta{display:flex;gap:8px;margin-top:17px}.taskMeta span{padding:6px 10px;border:1px solid rgba(103,94,143,.11);border-radius:999px;background:rgba(255,255,255,.64);color:#74717f;font-size:11px}.taskMeta strong{color:#302d39;font-size:13px}
  .refreshBtn{position:absolute;right:33px;bottom:25px;z-index:3;border-color:transparent!important;border-radius:11px!important;background:linear-gradient(135deg,#ff8847,#f26432)!important;color:#fff!important;box-shadow:0 8px 18px rgba(239,100,48,.21)!important}.refreshBtn .t-button__text,.refreshBtn .t-icon,.refreshBtn svg{color:#fff!important}
  .taskHeroArt{position:absolute;top:18px;right:5%;display:flex;flex-direction:column;justify-content:space-between;width:102px;height:112px;padding:14px;border-radius:18px;transform:rotate(7deg);background:linear-gradient(145deg,#8d7ce8,#5c50b7);color:#fff;box-shadow:0 16px 32px rgba(66,53,108,.16)}.taskHeroArt i{font-size:9px;font-style:normal;letter-spacing:.14em}.taskHeroArt b{font-size:30px;letter-spacing:-.06em}
  .search{margin-bottom:14px!important;padding:13px 15px!important;border:1px solid #e8e7ec!important;border-radius:16px!important;background:rgba(255,255,255,.88)!important;box-shadow:0 8px 22px rgba(42,39,58,.045)!important}.search .t-select{min-width:190px}.search .t-input{height:39px;border-color:#e3e1e6!important;border-radius:11px!important;background:#f8f8fa!important}.search .t-input:hover,.search .t-input:focus-within{border-color:#ee986f!important;box-shadow:0 0 0 3px rgba(242,107,53,.08)!important}
  .content{max-height:none!important;border:1px solid #e8e7ec!important;border-radius:19px!important;background:#fff!important;box-shadow:0 12px 30px rgba(40,37,54,.055)!important}.t-table__header th{padding:14px 16px!important;border-bottom:1px solid #ecebf0!important;background:#f8f8fa!important;color:#55525f!important;font-size:12px!important}.t-table__body td{padding:14px 16px!important;color:#393741!important}.t-table__body tr:hover{background:#fff9f5!important}
  .stateText{border:0!important}.stateRunning{background:#fff3e8!important;color:#dc651f!important}.stateSuccess{background:#eaf8ef!important;color:#278450!important}.stateFail{background:#fff0ef!important;color:#c64238!important}
  .paginationWrap{padding:12px 16px!important;border-top:1px solid #ecebf0;background:#fff}.t-pagination__number.t-is-current{border:0!important;background:#f26b35!important;color:#fff!important}.t-pagination__number.t-is-current *{color:#fff!important}
}
@media(max-width:800px){.task{padding:16px!important}.task .taskHeroArt{right:-45px;opacity:.4}.task .taskHero .headerInfo{max-width:68%}.task .search{flex-wrap:wrap}.task .search .t-select{margin-left:0!important;min-width:calc(50% - 8px)}}
</style>
