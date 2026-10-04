<template>
  <div class="libCanvas">
    <section class="collectionIntro">
      <div>
        <span class="collectionEyebrow">CANVAS COLLECTION</span>
        <h2>画布素材</h2>
        <p>你的全局创作收藏。素材不会自动归入任何项目，项目资产请在对应项目内管理。</p>
      </div>
      <div class="collectionCount"><strong>{{ assets.length }}</strong><span>件素材</span></div>
    </section>
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
          <audio v-else-if="a.kind === 'audio'" :src="urlOf(a)" controls preload="metadata" />
          <div v-else class="libTextThumb">{{ textExcerpt(a) }}</div>
          <span class="libKindBadge">{{ kindLabel(a.kind) }}</span>
        </div>
        <div class="libMeta">
          <strong :title="a.title">{{ a.title || "未命名素材" }}</strong>
          <span>{{ shortDate(a.updatedAt || a.createdAt) }}</span>
        </div>
        <div class="libOps">
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
        <audio v-else-if="previewAsset?.kind === 'audio'" :src="previewAsset && urlOf(previewAsset)" controls autoplay />
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
import { useRouter } from "vue-router";
import { downloadUrl, shortDate } from "./libraryShared";
import { sendToCanvas } from "@/utils/sendToCanvas";

interface CanvasAsset {
  id: string;
  kind: "text" | "image" | "video" | "audio";
  title: string;
  coverUrl: string;
  tags: string[];
  source?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  data: any;
}

const router = useRouter();

const loading = ref(true);
const assets = ref<CanvasAsset[]>([]);
const searchText = ref("");
const kindFilter = ref<"all" | "image" | "video" | "audio" | "text">("all");
const previewAsset = ref<CanvasAsset | null>(null);
const previewVisible = ref(false);
const objectUrls = ref<Record<string, string>>({});

const kindChips = [
  { value: "all", label: "全部" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
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
function legacyStateStore() {
  return localforage.createInstance({ name: "infinite-canvas", storeName: "app_state" });
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
    // 新版按用户分桶；老用户若尚未打开过新版画布，临时读取旧仓并回写新版。
    let raw = await stateStore().getItem<string>(assetStoreKey());
    if (!raw) {
      raw = await legacyStateStore().getItem<string>("infinite-canvas:asset_store");
      if (raw) await stateStore().setItem(assetStoreKey(), raw);
    }
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
      else if (key) {
        map[a.id] = await blobUrl(filesStore("image_files"), key);
        if (!map[a.id]) map[a.id] = await blobUrl(localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" }), key);
      }
      if (!map[a.id] && typeof a.data?.dataUrl === "string" && isRemoteKey(a.data.dataUrl)) map[a.id] = a.data.dataUrl;
      if (!map[a.id] && typeof a.coverUrl === "string" && isRemoteKey(a.coverUrl)) map[a.id] = a.coverUrl;
    } else if (a.kind === "video" || a.kind === "audio") {
      const url: string = a.data?.url || a.coverUrl || "";
      const key: string = a.data?.storageKey || "";
      if (isRemoteKey(url)) map[a.id] = url;
      else if (isRemoteKey(key)) map[a.id] = key;
      else if (key) {
        map[a.id] = await blobUrl(filesStore("media_files"), key);
        if (!map[a.id]) map[a.id] = await blobUrl(localforage.createInstance({ name: "infinite-canvas", storeName: "media_files" }), key);
      }
      if (!map[a.id] && isRemoteKey(a.coverUrl)) map[a.id] = a.coverUrl;
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

const kindLabel = (kind: string) => (kind === "image" ? "图片" : kind === "video" ? "视频" : kind === "audio" ? "音频" : "文本");
const textExcerpt = (a: CanvasAsset) => (a.data?.content || "").slice(0, 120) || "（空文本）";

function onSendToCanvas(a: CanvasAsset) {
  sendToCanvas([{ src: urlOf(a), name: a.title || "画布素材" }], { from: "assets" });
}

function onDownload(a: CanvasAsset) {
  const url = urlOf(a);
  if (!url) return;
  const ext = a.kind === "video" ? ".mp4" : a.kind === "audio" ? ".mp3" : ".png";
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

onMounted(() => {
  void loadAssets();
  // IndexedDB 不会触发 storage 事件；回到资产页或切回窗口时主动重读，
  // 让“画布保存 → 资产库查看”不需要用户手动刷新浏览器。
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
});
onBeforeUnmount(() => {
  window.removeEventListener("focus", refresh);
  document.removeEventListener("visibilitychange", refresh);
  Object.values(objectUrls.value).forEach((u) => u.startsWith("blob:") && URL.revokeObjectURL(u));
});

defineExpose({ openPreview });
</script>

<style lang="scss" scoped>
.libCanvas {
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
  border: 1px solid rgba(119, 96, 182, 0.12);
  border-radius: 22px;
  background:
    radial-gradient(circle at 92% 18%, rgba(255, 159, 106, 0.22), transparent 28%),
    linear-gradient(115deg, #fff 0%, #f8f5ff 54%, #fff4ec 100%);
  box-shadow: 0 14px 34px rgba(58, 49, 99, 0.06);
}
.collectionEyebrow {
  display: block;
  margin-bottom: 7px;
  color: #e86b32;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .18em;
}
.collectionIntro h2 { margin: 0 0 6px; color: #292733; font-size: 26px; letter-spacing: -.04em; }
.collectionIntro p { margin: 0; color: #7f7a8c; font-size: 13px; line-height: 1.6; }
.collectionCount {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 102px;
  min-height: 76px;
  border-radius: 18px;
  background: rgba(255, 255, 255, .68);
  color: #8b849b;
}
.collectionCount strong { color: #e86b32; font-size: 30px; line-height: 1; }
.collectionCount span { margin-top: 6px; font-size: 12px; }
.libToolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border: 1px solid #ebe9ef;
  border-radius: 17px;
  background: rgba(255, 255, 255, .92);
  box-shadow: 0 7px 20px rgba(42, 39, 58, .04);
}
.libChips {
  display: flex;
  gap: 6px;
  button {
    height: 31px;
    padding: 0 14px;
    border: 1px solid #e4e1e9;
    border-radius: 999px;
    background: #fff;
    color: #615d6c;
    font-size: 13px;
    cursor: pointer;
    transition: all .18s ease;
    &:hover { border-color: #f1a27e; color: #df5f29; }
    &.on { border-color: transparent; background: #fff1e9; color: #e9632b; font-weight: 650; }
  }
}
.libToolbarRight { margin-left: auto; display: flex; gap: 8px; }
.libState {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 300px;
  color: #8b8798;
  p { margin: 0; font-size: 14px; }
}
.libGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 300px));
  align-items: start;
  gap: 18px;
}
.libCard {
  overflow: hidden;
  border: 1px solid #e9e6ee;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(42, 39, 58, .055);
  transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
  &:hover { transform: translateY(-3px); border-color: #f3c6ae; box-shadow: 0 14px 30px rgba(42, 39, 58, .11); }
}
.libThumb {
  position: relative;
  display: grid;
  place-items: center;
  height: 172px;
  overflow: hidden;
  background: #f4f3f6;
  cursor: pointer;
  img, video { width: 100%; height: 100%; object-fit: cover; transition: transform .24s ease; }
  &:hover img, &:hover video { transform: scale(1.025); }
  .libKindBadge {
    position: absolute;
    left: 10px;
    top: 10px;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(25, 23, 32, .62);
    color: #fff;
    font-size: 11px;
    line-height: 1.4;
  }
}
.libTextThumb {
  width: 100%;
  height: 100%;
  padding: 16px;
  overflow: hidden;
  color: #5d5868;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  background: linear-gradient(145deg, #fbf9ff, #fff5ef);
}
.libMeta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 4px;
  strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #292733; font-size: 14px; }
  span { flex: none; color: #a19cab; font-size: 11.5px; }
}
.libOps { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; padding: 3px 10px 10px; }
.libPreviewBody {
  display: flex;
  flex-direction: column;
  gap: 12px;
  img, video { max-width: 100%; max-height: 56vh; border-radius: 12px; align-self: center; }
  pre { margin: 0; padding: 14px; max-height: 56vh; overflow: auto; border-radius: 12px; background: #f6f6f8; color: #33312d; font-size: 13px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
}
.libPreviewNote { color: #6f6b64; font-size: 12.5px; line-height: 1.6; }
.libPreviewTags { display: flex; flex-wrap: wrap; gap: 6px; span { padding: 2px 10px; border-radius: 999px; background: #f4f2ee; color: #55525f; font-size: 11.5px; } }
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
