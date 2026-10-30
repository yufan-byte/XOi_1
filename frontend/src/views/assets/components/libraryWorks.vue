<template>
  <div class="libWorks">
    <section class="collectionIntro">
      <div>
        <span class="collectionEyebrow">MY WORKS</span>
        <h2>{{ projectId ? '本项目生成结果' : '我的作品' }}</h2>
        <p>{{ projectId ? '本作品的分镜图片、视频与导出成片，保留生成历史供你预览和下载。' : '所有项目生成结果的个人收藏。卡片会标明来源项目，便于查找和复用。' }}</p>
      </div>
      <div class="collectionCount"><strong>{{ works.length }}</strong><span>件作品</span></div>
    </section>
    <div class="libToolbar">
      <div class="libChips">
        <button v-for="k in kindChips" :key="k.value" type="button" :class="{ on: kindFilter === k.value }" @click="kindFilter = k.value">{{ k.label }}<em v-if="kindCount(k.value)">{{ kindCount(k.value) }}</em></button>
      </div>
      <t-select v-if="!projectId && projectOptions.length > 1" v-model="projectFilter" size="small" clearable placeholder="全部项目" style="width: 220px">
        <t-option v-for="p in projectOptions" :key="String(p.value)" :value="p.value" :label="p.label" />
      </t-select>
      <t-select v-model="sortMode" size="small" style="width: 122px">
        <t-option value="newest" label="最新优先" />
        <t-option value="oldest" label="最早优先" />
      </t-select>
      <t-input v-model="searchText" placeholder="搜索作品（标题/描述）" clearable style="width: 220px" />
      <div class="libToolbarRight">
        <span class="libCount">共 {{ filteredWorks.length }} 件</span>
        <t-button theme="default" variant="outline" size="small" @click="load">
          <template #icon><t-icon name="refresh" /></template>
          刷新
        </t-button>
      </div>
    </div>

    <div v-if="loading" class="libState"><t-loading size="small" text="读取生成历史…" /></div>
    <div v-else-if="loadError" class="libState" role="alert"><p>{{ loadError }}</p><t-button @click="load">重新读取</t-button></div>

    <div v-else-if="!filteredWorks.length" class="libState libEmpty">
      <t-icon name="user-circle" size="34px" />
      <p>{{ works.length ? "没有匹配的作品，换个筛选或关键词试试" : "还没有生成作品。在项目里生成角色图 / 分镜图 / 视频后会自动出现在这里" }}</p>
    </div>

    <div v-else class="libGrid">
      <div class="libCard" v-for="w in pagedWorks" :key="w.id">
        <div class="libThumb" @click="openPreview(w)">
          <img v-if="w.cover_url && w.cover_kind !== 'video'" :src="thumbUrl(w.cover_url, 480)" loading="lazy" alt="" />
          <template v-else-if="w.cover_url">
            <img v-if="w.poster_url" :src="thumbUrl(w.poster_url, 480)" loading="lazy" alt="分镜参考封面" />
            <div v-else class="libTextThumb">视频已生成</div>
            <span class="videoPreviewLabel">▶ 预览视频</span>
          </template>
          <div v-else class="libTextThumb">{{ w.description || w.title || "（无封面）" }}</div>
          <span class="libKindBadge">{{ typeLabel(w) }}</span>
        </div>
        <div class="libMeta">
          <strong :title="w.title">{{ w.title || "未命名作品" }}</strong>
          <span>{{ shortDate(w.created_at) || "—" }}</span>
        </div>
        <div v-if="w.project_id" class="libSource">来自项目 · {{ projectLabel(w.project_id) }}</div>
        <div class="libOps">
          <t-button v-if="w.cover_kind !== 'video'" size="small" variant="text" theme="primary" @click="onSendToCanvas(w)">发送到画布</t-button>
          <t-button size="small" variant="text" @click="onDownload(w)">下载</t-button>
        </div>
      </div>
    </div>
    <Pager v-if="!loading && !loadError" v-model:page="workPage" :total="filteredWorks.length" :page-size="WORK_PAGE_SIZE" unit="件作品" />

    <!-- 预览 -->
    <t-dialog v-model:visible="previewVisible" :header="previewWork?.title || '作品预览'" width="720px" :footer="false">
      <div class="libPreviewBody">
        <img v-if="previewWork?.cover_url && previewWork?.cover_kind !== 'video'" :src="previewWork.cover_url" />
        <video v-else-if="previewWork?.cover_url && previewWork?.cover_kind === 'video'" :src="previewWork.cover_url" :poster="previewWork.poster_url" controls autoplay preload="metadata" playsinline />
        <div v-else class="libTextThumb" style="min-height: 120px">{{ previewWork?.description || "（无预览）" }}</div>
        <div class="libPreviewNote" v-if="previewWork?.description">{{ previewWork.description }}</div>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 项目资产库 · Tab2「我的作品」（造物 dashboard 模式）。
 *
 * 数据源：`GET /api/works/history`（backend/src/routes/works/history.ts）——
 * 按当前用户的**项目**聚合已有生成记录（o_image / o_storyboard / o_video），只读、零埋点。
 * 为什么不写 mc_works：生成产物本来就已落库，额外埋 5~8 个登记钩子只会新增故障面；
 * 造物那边同样是「渲染层合并本地 + 任务历史」，不另建作品表。
 * mc_works（/api/works?scope=mine）留给「发布到灵感广场」，不在此 Tab。
 */
import { ref, computed, watch } from "vue";
import Pager from "@/components/Pager.vue";
import axios from "@/utils/axios";
import { thumbUrl } from "@/utils/mediaUrl";
import { storeToRefs } from "pinia";
import projectStore from "@/stores/project";
import { downloadUrl, shortDate } from "./libraryShared";
import { sendToCanvas } from "@/utils/sendToCanvas";

interface WorkRow {
  id: string;
  work_type: "image" | "video";
  source: "asset" | "storyboard" | "video" | "output";
  title: string;
  description: string;
  cover_url: string;
  cover_kind: "image" | "video";
  poster_url?: string;
  status: string;
  created_at?: number;
  project_id?: number;
}

const { allProject } = storeToRefs(projectStore());
const props = defineProps<{ projectId?: number }>();
let loadVersion = 0;

const loading = ref(true);
const loadError = ref("");
const works = ref<WorkRow[]>([]);
const searchText = ref("");
const previewWork = ref<WorkRow | null>(null);
const previewVisible = ref(false);

/** 筛选维度：内容类型（用户语言：资产图/分镜图/分镜视频/成片）+ 来源项目 + 时间排序，全部前端过滤 */
type KindFilter = "all" | "asset" | "storyboard" | "storyboardVideo" | "output";
const kindFilter = ref<KindFilter>("all");
const projectFilter = ref<number | undefined>(undefined);
const sortMode = ref<"newest" | "oldest">("newest");

const kindChips = [
  { value: "all", label: "全部" },
  { value: "asset", label: "资产图" },
  { value: "storyboard", label: "分镜图" },
  { value: "storyboardVideo", label: "分镜视频" },
  { value: "output", label: "成片" },
] as const;

/** 作品的内容类型（与角标同一口径）：成片 > 视频 > 分镜图 > 资产图 */
function kindOf(w: WorkRow): Exclude<KindFilter, "all"> {
  if (w.source === "output") return "output";
  if (w.work_type === "video") return "storyboardVideo";
  return w.source === "storyboard" ? "storyboard" : "asset";
}
function kindCount(kind: KindFilter) {
  return kind === "all" ? works.value.length : works.value.filter((w) => kindOf(w) === kind).length;
}

/** 来源项目下拉：只列出确实有作品的项目，并带数量，避免面对一整列空项目 */
const projectOptions = computed(() => {
  const counts = new Map<number, number>();
  works.value.forEach((w) => {
    if (w.project_id) counts.set(w.project_id, (counts.get(w.project_id) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([id, count]) => {
      const item = (allProject.value as any[]).find((candidate) => Number(candidate?.id) === id);
      return { value: id, label: `${item?.name || `项目 #${id}`}（${count}）` };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "zh"));
});

async function load() {
  const version = ++loadVersion;
  works.value = [];
  loading.value = true;
  loadError.value = "";
  try {
    const res: any = await axios.get("/works/history", { params: { type: "all", projectId: props.projectId, limit: 120, _t: Date.now() } });
    if (version !== loadVersion) return;
    const items = res?.data?.items ?? res?.data?.data?.items ?? [];
    works.value = Array.isArray(items) ? items : [];
  } catch (e) {
    if (version !== loadVersion) return;
    console.error("[libraryWorks] 读取生成历史失败:", e);
    loadError.value = "作品读取失败，已有作品未被删除，请重试。";
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

const filteredWorks = computed(() => {
  const kw = searchText.value.trim().toLowerCase();
  const pid = projectFilter.value;
  const list = works.value.filter((w) => {
    if (kindFilter.value !== "all" && kindOf(w) !== kindFilter.value) return false;
    if (pid != null && w.project_id !== pid) return false;
    if (!kw) return true;
    return `${w.title || ""} ${w.description || ""}`.toLowerCase().includes(kw);
  });
  return list.sort((a, b) => (sortMode.value === "newest" ? (b.created_at ?? 0) - (a.created_at ?? 0) : (a.created_at ?? 0) - (b.created_at ?? 0)));
});

/** 作品库分页：图墙 4 列，每页 12 件（3 行）刚好一屏；筛选/搜索/排序变化时回到第一页。 */
const WORK_PAGE_SIZE = 12;
const workPage = ref(1);
const pagedWorks = computed(() => {
  const start = (workPage.value - 1) * WORK_PAGE_SIZE;
  return filteredWorks.value.slice(start, start + WORK_PAGE_SIZE);
});
watch([searchText, kindFilter, projectFilter, sortMode], () => { workPage.value = 1; });

/** 角标：来源优先（分镜图/分镜视频需要和资产图区分开） */
function typeLabel(w: WorkRow) {
  if (w.source === "output") return "成片";
  if (w.work_type === "video") return "分镜视频";
  return w.source === "storyboard" ? "分镜图" : "资产图";
}

function openPreview(w: WorkRow) {
  previewWork.value = w;
  previewVisible.value = true;
}

function projectLabel(id: number) {
  const item = (allProject.value as any[]).find((candidate) => Number(candidate?.id) === Number(id));
  return item?.name || `项目 #${id}`;
}

function onSendToCanvas(w: WorkRow) {
  if (!w.cover_url) return;
  sendToCanvas([{ src: w.cover_url, name: w.title || "我的作品" }], { from: "assets" });
}

function onDownload(w: WorkRow) {
  if (!w.cover_url) return;
  const ext = w.cover_kind === "video" ? ".mp4" : ".png";
  void downloadUrl(w.cover_url, `${w.title || "work"}${ext}`);
}

watch(() => props.projectId, () => {
  projectFilter.value = undefined;
  load();
}, { immediate: true });
</script>

<style lang="scss" scoped>
.videoPreviewLabel { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#fff; font-size:13px; background:linear-gradient(transparent,#0002); text-shadow:0 1px 5px #000; pointer-events:none; }
.libWorks {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.collectionIntro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 112px;
  padding: 22px 26px;
  border: 1px solid #ecdfd4;
  border-radius: 22px;
  background: radial-gradient(circle at 92% 18%, rgba(255, 159, 106, .22), transparent 28%), linear-gradient(115deg, #fff 0%, #fdf8f3 54%, #fff4ec 100%);
  box-shadow: 0 14px 34px rgba(74, 56, 42, .06);
}
.collectionEyebrow { display: block; margin-bottom: 7px; color: #e86b32; font-size: 10px; font-weight: 800; letter-spacing: .18em; }
.collectionIntro h2 { margin: 0 0 6px; color: #292733; font-size: 26px; letter-spacing: -.04em; }
.collectionIntro p { margin: 0; color: #7f7a8c; font-size: 13px; line-height: 1.6; }
.collectionCount { flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 102px; min-height: 76px; border-radius: 18px; background: rgba(255, 255, 255, .68); color: #8b849b; }
.collectionCount strong { color: #e86b32; font-size: 30px; line-height: 1; }
.collectionCount span { margin-top: 6px; font-size: 12px; }
.libToolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 16px;
  border: 1px solid #e8e7ec;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 8px 22px rgba(42, 39, 58, 0.045);
}
.libChips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  button {
    height: 30px;
    padding: 0 13px;
    border: 1px solid #e3e2e8;
    border-radius: 999px;
    background: #fff;
    color: #55525f;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.18s ease;
    em { font-style: normal; margin-left: 5px; font-size: 11px; opacity: .72; font-variant-numeric: tabular-nums; }
    &:hover { border-color: #f1a27e; color: #df5f29; }
    &.on { border-color: transparent; background: #fff2ea; color: #e9632b; font-weight: 600; }
  }
}
.libToolbarRight {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.libCount { color: #9b968d; font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.libState {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 320px;
  color: #8b8798;
  p { margin: 0; font-size: 14px; }
}
.libGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(252px, 1fr));
  align-items: stretch;
  gap: 22px;
  padding: 0 0 10px;
}
.libCard {
  overflow: hidden;
  border: 1px solid #e8e7ec;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 22px rgba(42, 39, 58, 0.045);
  transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
  &:hover {
    transform: translateY(-3px);
    border-color: #f3c6ae;
    box-shadow: 0 14px 30px rgba(42, 39, 58, .11);
  }
}
.libThumb {
  position: relative;
  display: grid;
  place-items: center;
  /* 4:3 + contain：整图可见不被裁切，点击可放大看细节 */
  aspect-ratio: 4 / 3;
  background: #f7f2ec;
  cursor: pointer;
  overflow: hidden;
  img, video { width: 100%; height: 100%; object-fit: contain; transition: transform .24s ease; }
  &:hover img, &:hover video { transform: scale(1.025); }
  .libKindBadge {
    position: absolute;
    left: 8px;
    top: 8px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(23, 21, 30, 0.55);
    color: #fff;
    font-size: 11px;
    line-height: 1.4;
  }
  .libStatusBadge {
    position: absolute;
    right: 8px;
    top: 8px;
    padding: 2px 8px;
    border-radius: 999px;
    color: #fff;
    font-size: 11px;
    line-height: 1.4;
    &.is-pending { background: rgba(242, 107, 53, 0.85); }
    &.is-rejected { background: rgba(213, 63, 63, 0.85); }
  }
}
.libTextThumb {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  padding: 12px;
  overflow: hidden;
  color: #55525f;
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
  background: #fbfafd;
}
.libMeta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 4px;
  strong {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    color: #242321;
  }
  span { flex: none; color: #9b968d; font-size: 11.5px; }
}
.libSource { padding: 1px 14px 0; color: #a3765a; font-size: 11.5px; }
.libOps {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  padding: 3px 10px 10px;
}
.libPreviewBody {
  display: flex;
  flex-direction: column;
  gap: 12px;
  img, video { max-width: 100%; max-height: 56vh; border-radius: 12px; align-self: center; }
}
.libPreviewNote { color: #6f6b64; font-size: 12.5px; line-height: 1.6; white-space: pre-wrap; }
@media (max-width: 850px) {
  .collectionIntro { align-items: flex-start; padding: 18px; }
  .collectionCount { min-width: 78px; }
  .collectionIntro p { max-width: 48vw; }
  .libToolbar { flex-wrap: wrap; }
  .libToolbar .t-input { flex: 1; min-width: 180px; }
  .libToolbarRight { margin-left: 0; }
  .libGrid { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
}
</style>
