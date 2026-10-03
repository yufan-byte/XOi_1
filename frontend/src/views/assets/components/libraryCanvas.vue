<template>
  <div class="libCanvas">
    <div class="libToolbar">
      <div class="libChips">
        <button v-for="k in kindChips" :key="k.value" type="button" :class="{ on: kindFilter === k.value }" @click="kindFilter = k.value">{{ k.label }}</button>
      </div>
      <t-input v-model="searchText" placeholder="搜索画布素材（名称/标签/备注）" clearable style="width: 250px" />
      <div class="libToolbarRight">
        <t-button theme="default" variant="outline" size="small" @click="refresh">
          <template #icon><t-icon name="refresh" /></template>
          刷新
        </t-button>
        <t-button theme="primary" size="small" @click="goCanvas">打开画布</t-button>
      </div>
    </div>

    <div v-if="loading" class="libState"><t-loading size="small" text="读取画布素材…" /></div>

    <div v-else-if="!filteredAssets.length" class="libState libEmpty">
      <t-icon name="layers" size="34px" />
      <p>{{ assets.length ? "没有匹配的画布素材" : "画布里还没有素材" }}</p>
      <t-button v-if="!assets.length" theme="primary" @click="goCanvas">去画布创作</t-button>
    </div>

    <div v-else class="libGrid">
      <div class="libCard" v-for="a in filteredAssets" :key="a.id">
        <div class="libThumb" @click="openPreview(a)">
          <img v-if="a.kind === 'image'" :src="urlOf(a)" loading="lazy" alt="" />
          <video v-else-if="a.kind === 'video'" :src="urlOf(a)" muted preload="metadata" />
          <div v-else class="libTextThumb">{{ textExcerpt(a) }}</div>
          <span class="libKindBadge">{{ kindLabel(a.kind) }}</span>
        </div>
        <div class="libMeta">
          <strong :title="a.title">{{ a.title || "未命名素材" }}</strong>
          <span>{{ shortDate(a.updatedAt || a.createdAt) }}</span>
        </div>
        <div class="libOps">
          <t-tooltip content="保存为当前项目的素材，供分镜/生图引用">
            <t-button size="small" variant="text" theme="primary" :loading="savingId === a.id" @click="onSaveToProject(a)">存入项目素材</t-button>
          </t-tooltip>
          <t-button v-if="a.kind === 'image' && isStableUrl(urlOf(a))" size="small" variant="text" theme="primary" @click="onSendToCanvas(a)">发送到画布</t-button>
          <t-button v-if="a.kind !== 'text' && urlOf(a)" size="small" variant="text" @click="onDownload(a)">下载</t-button>
          <t-popconfirm theme="danger" content="删除后画布里也不可恢复，确定？" @confirm="onRemove(a)">
            <t-button size="small" variant="text" theme="danger">删除</t-button>
          </t-popconfirm>
        </div>
      </div>
    </div>

    <!-- 预览 -->
    <t-dialog v-model:visible="previewVisible" :header="previewAsset?.title || '素材预览'" width="720px" :footer="false">
      <div class="libPreviewBody">
        <img v-if="previewAsset?.kind === 'image'" :src="previewAsset && urlOf(previewAsset)" />
        <video v-else-if="previewAsset?.kind === 'video'" :src="previewAsset && urlOf(previewAsset)" controls autoplay />
        <pre v-else>{{ previewAsset?.data?.content || "（无文本内容）" }}</pre>
        <div class="libPreviewNote" v-if="previewAsset?.note">{{ previewAsset.note }}</div>
        <div class="libPreviewTags" v-if="previewAsset?.tags?.length">
          <span v-for="tag in previewAsset.tags" :key="tag">{{ tag }}</span>
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 项目资产库 · Tab3「画布素材」。
 *
 * 数据源：atelier（React 画布）的 zustand persist → IndexedDB（同源可直接读）：
 *   - 库：`xoi-atelier-u<uid>:state`，store：`app_state`
 *   - 键：`infinite-canvas:asset_store:u` + ownerTag（ownerTag = `u<uid>`，注意键里是 `:u` + `u<uid>` 拼接）
 *   - 二进制：远端在 /oss/canvas-files/（storageKey 即 URL）；legacy 兜底 blob 在
 *     `xoi-atelier-u<uid>:files` 的 image_files / media_files 两个 store，读出来转 objectURL。
 * ⚠️ 与 frontend/atelier/src/xoi/owner.ts 的分桶约定强耦合，改动需双侧同步。
 * Vue 侧只读 + 删除回写；新增/编辑仍在画布内进行。
 */
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import localforage from "localforage";
import { MessagePlugin } from "tdesign-vue-next";
import projectStore from "@/stores/project";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { saveAssetToProject, downloadUrl, shortDate } from "./libraryShared";
import { sendToCanvas } from "@/utils/sendToCanvas";

interface CanvasAsset {
  id: string;
  kind: "text" | "image" | "video";
  title: string;
  coverUrl: string;
  tags: string[];
  source?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  data: any;
}

const { project } = storeToRefs(projectStore());
const router = useRouter();

const loading = ref(true);
const assets = ref<CanvasAsset[]>([]);
const searchText = ref("");
const kindFilter = ref<"all" | "image" | "video" | "text">("all");
const savingId = ref("");
const previewAsset = ref<CanvasAsset | null>(null);
const previewVisible = ref(false);
const objectUrls = ref<Record<string, string>>({});

const kindChips = [
  { value: "all", label: "全部" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "text", label: "文本" },
] as const;

/** atelier owner 分桶（见 frontend/atelier/src/xoi/owner.ts） */
function ownerTag(): string {
  const uid = localStorage.getItem("userId") || "";
  return uid ? `u${uid}` : "anon";
}
function stateStore() {
  return localforage.createInstance({ name: `xoi-atelier-${ownerTag()}:state`, storeName: "app_state" });
}
function filesStore(storeName: "image_files" | "media_files") {
  return localforage.createInstance({ name: `xoi-atelier-${ownerTag()}:files`, storeName });
}
/** zustand persist 键（ownerKey 拼法：base + ":u" + ownerTag，ownerTag 自带 u 前缀） */
function assetStoreKey(): string {
  return `infinite-canvas:asset_store:u${ownerTag()}`;
}

const isRemoteKey = (key?: string) => !!key && (/^(\/|https?:|data:|blob:)/i.test(key));

function isStableUrl(url?: string) {
  return !!url && /^(https?:\/\/|\/)/.test(url) && !url.startsWith("blob:");
}

async function loadAssets() {
  loading.value = true;
  try {
    const raw = await stateStore().getItem<string>(assetStoreKey());
    if (!raw) {
      assets.value = [];
      return;
    }
    const parsed = JSON.parse(raw);
    const list: CanvasAsset[] = parsed?.state?.assets ?? [];
    assets.value = Array.isArray(list) ? list : [];
    await resolveUrls();
  } catch (e) {
    console.error("[libraryCanvas] 读取画布素材失败:", e);
    assets.value = [];
  } finally {
    loading.value = false;
  }
}

/** 给每条素材解析出可在本页展示的 URL（远端直接用；legacy 本地 blob 转 objectURL） */
async function resolveUrls() {
  const map: Record<string, string> = {};
  for (const a of assets.value) {
    if (a.kind === "image") {
      const key: string = a.data?.storageKey || "";
      if (isRemoteKey(key)) map[a.id] = key;
      else if (typeof a.data?.dataUrl === "string" && a.data.dataUrl.startsWith("data:image/")) map[a.id] = a.data.dataUrl;
      else if (key) map[a.id] = await blobUrl(filesStore("image_files"), key);
      else if (typeof a.coverUrl === "string" && isRemoteKey(a.coverUrl)) map[a.id] = a.coverUrl;
    } else if (a.kind === "video") {
      const url: string = a.data?.url || a.coverUrl || "";
      const key: string = a.data?.storageKey || "";
      if (isRemoteKey(url)) map[a.id] = url;
      else if (isRemoteKey(key)) map[a.id] = key;
      else if (key) map[a.id] = await blobUrl(filesStore("media_files"), key);
    }
  }
  objectUrls.value = map;
}

async function blobUrl(store: ReturnType<typeof localforage.createInstance>, key: string): Promise<string> {
  try {
    const blob: any = await store.getItem(key);
    if (!blob) return "";
    return URL.createObjectURL(blob);
  } catch {
    return "";
  }
}

function urlOf(a: CanvasAsset): string {
  return objectUrls.value[a.id] || (a.kind === "image" ? a.coverUrl : a.data?.url) || "";
}

const filteredAssets = computed(() => {
  const kw = searchText.value.trim().toLowerCase();
  return assets.value
    .filter((a) => (kindFilter.value === "all" ? true : a.kind === kindFilter.value))
    .filter((a) => {
      if (!kw) return true;
      const hay = [a.title, a.source, a.note, ...(a.tags || []), a.data?.content].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(kw);
    })
    .sort((x, y) => String(y.updatedAt || "").localeCompare(String(x.updatedAt || "")));
});

const kindLabel = (kind: string) => (kind === "image" ? "图片" : kind === "video" ? "视频" : "文本");
const textExcerpt = (a: CanvasAsset) => (a.data?.content || "").slice(0, 120) || "（空文本）";

function requireProjectId(): number | null {
  const id = Number((project.value as any)?.id);
  if (!Number.isFinite(id) || id <= 0) {
    MessagePlugin.warning("请先打开一个项目，再把素材存进它的素材库");
    return null;
  }
  return id;
}

async function onSaveToProject(a: CanvasAsset) {
  const projectId = requireProjectId();
  if (!projectId) return;
  const url = urlOf(a);
  if (!url) {
    MessagePlugin.error("该素材没有可入库的资源地址");
    return;
  }
  savingId.value = a.id;
  try {
    await saveAssetToProject(projectId, url, a.title || "画布素材", "clip");
  } catch (e: any) {
    MessagePlugin.error(e?.message || "存入失败");
  } finally {
    savingId.value = "";
  }
}

function onSendToCanvas(a: CanvasAsset) {
  sendToCanvas([{ src: urlOf(a), name: a.title || "画布素材" }], { from: "assets" });
}

function onDownload(a: CanvasAsset) {
  const url = urlOf(a);
  if (!url) return;
  const ext = a.kind === "video" ? ".mp4" : ".png";
  void downloadUrl(url, `${a.title || "canvas-asset"}${ext}`);
}

async function onRemove(a: CanvasAsset) {
  try {
    const raw = await stateStore().getItem<string>(assetStoreKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const list: CanvasAsset[] = parsed?.state?.assets ?? [];
    const next = list.filter((x) => x.id !== a.id);
    if (next.length === list.length) return;
    parsed.state.assets = next;
    await stateStore().setItem(assetStoreKey(), JSON.stringify(parsed));
    assets.value = next;
    MessagePlugin.success("已删除（画布内同步生效）");
  } catch (e) {
    console.error("[libraryCanvas] 删除失败:", e);
    MessagePlugin.error("删除失败");
  }
}

function goCanvas() {
  router.push("/canvas");
}
function refresh() {
  void loadAssets();
}
function openPreview(a: CanvasAsset) {
  previewAsset.value = a;
  previewVisible.value = true;
}

onMounted(loadAssets);
onBeforeUnmount(() => {
  Object.values(objectUrls.value).forEach((u) => u.startsWith("blob:") && URL.revokeObjectURL(u));
});

defineExpose({ openPreview });
</script>

<style lang="scss" scoped>
.libCanvas {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.libToolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid #e8e7ec;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 8px 22px rgba(42, 39, 58, 0.045);
}
.libChips {
  display: flex;
  gap: 6px;
  button {
    height: 30px;
    padding: 0 14px;
    border: 1px solid #e3e2e8;
    border-radius: 999px;
    background: #fff;
    color: #55525f;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.18s ease;
    &:hover { border-color: #f1a27e; color: #df5f29; }
    &.on { border-color: transparent; background: #fff2ea; color: #e9632b; font-weight: 600; }
  }
}
.libToolbarRight {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
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
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}
.libCard {
  overflow: hidden;
  border: 1px solid #e8e7ec;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 22px rgba(42, 39, 58, 0.045);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 28px rgba(42, 39, 58, 0.09);
  }
}
.libThumb {
  position: relative;
  display: grid;
  place-items: center;
  height: 130px;
  background: #f6f6f8;
  cursor: pointer;
  overflow: hidden;
  img, video { width: 100%; height: 100%; object-fit: cover; }
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
}
.libTextThumb {
  padding: 12px;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #55525f;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  background: #fbfafd;
}
.libMeta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px 4px;
  strong {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13.5px;
    color: #242321;
  }
  span { flex: none; color: #9b968d; font-size: 11.5px; }
}
.libOps {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  padding: 2px 8px 8px;
}
.libPreviewBody {
  display: flex;
  flex-direction: column;
  gap: 12px;
  img, video { max-width: 100%; max-height: 56vh; border-radius: 12px; align-self: center; }
  pre {
    margin: 0;
    padding: 14px;
    max-height: 56vh;
    overflow: auto;
    border-radius: 12px;
    background: #f6f6f8;
    color: #33312d;
    font-size: 13px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
  }
}
.libPreviewNote { color: #6f6b64; font-size: 12.5px; line-height: 1.6; }
.libPreviewTags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  span {
    padding: 2px 10px;
    border-radius: 999px;
    background: #f4f2ee;
    color: #55525f;
    font-size: 11.5px;
  }
}
</style>
