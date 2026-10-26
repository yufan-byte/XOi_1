<template>
  <main class="sq-page">
    <!-- 页头 -->
    <header class="sq-head">
      <div>
        <h1>灵感广场</h1>
        <p>来自社区的画布工作流、图片与视频灵感，支持一键复刻到你的画布。</p>
      </div>
      <div class="sq-sort">
        <button :class="{ active: sort === 'hot' }" @click="sort = 'hot'; load()">最热</button>
        <button :class="{ active: sort === 'new' }" @click="sort = 'new'; load()">最新</button>
      </div>
    </header>

    <!-- 类型页签 + 分类胶囊 -->
    <div class="sq-tabs">
      <button v-for="t in TYPES" :key="t.key" class="sq-tab" :class="{ active: type === t.key }" @click="type = t.key; load()">
        {{ t.label }}<span class="sq-tab-count">{{ countOf(t.key) }}</span>
      </button>
    </div>
    <div class="sq-pills">
      <button class="sq-pill" :class="{ active: category === '' }" @click="category = ''">全部</button>
      <button v-for="c in categories" :key="c[0]" class="sq-pill" :class="{ active: category === c[0] }" @click="category = c[0]">{{ c[1] }}</button>
    </div>

    <!-- 瀑布流 -->
    <div v-if="!loading" class="sq-masonry">
      <article v-for="w in visible" :key="w.id" class="sq-card" @click="open(w)">
        <div class="sq-cover" :style="{ aspectRatio: w.mk === 'video' ? '16/10' : undefined }">
          <!-- mk 是素材真实类型（站内媒体路由回源后判定的 content-type）：画布页签里混着 mp4 封面，
               用 <img> 一定加载失败，必须按类型换 <video>。preload=metadata 只取首帧，不拉整段。 -->
          <video v-if="w.mk === 'video'" :src="w.u" muted playsinline preload="metadata" @error="onCoverError" />
          <img v-else :src="w.u" :alt="w.t" loading="lazy" decoding="async" @error="onCoverError" />
          <span v-if="w.mk === 'video'" class="sq-badge-video">▶ 视频</span>
          <span v-if="w.src === 'canvas'" class="sq-badge-canvas">◈ 画布 · {{ w.nc }} 节点</span>
          <!-- 画布作品的一键直通：不弹详情、直接建项目并还原完整工作流 -->
          <button
            v-if="w.src === 'canvas'"
            class="sq-quick"
            :disabled="replicating"
            @click.stop="replicate(w)"
          >◈ 一键复刻到画布</button>
        </div>
        <div class="sq-card-body">
          <strong>{{ w.t || "未命名" }}</strong>
          <div class="sq-card-meta">
            <span class="sq-author">{{ w.n }}</span>
            <span class="sq-nums">{{ w.r }} 推荐 · {{ w.v }} 浏览</span>
            <button class="sq-like" :class="{ liked: likedSet.has(w.id) }" @click.stop="toggleLike(w)">
              {{ likedSet.has(w.id) ? "♥" : "♡" }} {{ w.l + (likedSet.has(w.id) ? 1 : 0) }}
            </button>
          </div>
        </div>
      </article>
    </div>
    <div v-else class="sq-loading">加载中…</div>
    <div v-if="!loading && visible.length === 0" class="sq-empty">该分类暂无内容</div>
    <button v-if="!loading && filtered.length > visible.length" class="sq-more" @click="visibleCount += 30">加载更多</button>

    <SquareWorkDialog v-if="detail" :work="detail" :items="visible" origin="square" @close="closeDetail" @navigate="open" @use-prompt="chatWithPrompt" />
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { loadSquareSnapshot, isSquareType, type SquareItem as SqItem, type SquareSnapshot, type SquareType as SqType } from "@/utils/square";
import { MessagePlugin } from "tdesign-vue-next";
import SquareWorkDialog from "@/components/square/SquareWorkDialog.vue";
import { useSquareActions } from "@/utils/squareActions";

const TYPES = [
  { key: "canvas", label: "画布" },
  { key: "image", label: "图片" },
  { key: "video", label: "视频" },
] as const;

const router = useRouter();
const route = useRoute();
const type = ref<SqType>(isSquareType(route.query.type) ? route.query.type : "canvas");
const sort = ref<"hot" | "new">("hot");
const category = ref("");
const loading = ref(false);
const snapshot = ref<SquareSnapshot | null>(null);
const visibleCount = ref(30);
const detail = ref<SqItem | null>(null);
const { replicating, replicate } = useSquareActions("square");

const LIKES_KEY = "xoi_square_likes_v1";
const likedSet = ref(new Set<string>(JSON.parse(localStorage.getItem(LIKES_KEY) || "[]")));
const persistLikes = () => localStorage.setItem(LIKES_KEY, JSON.stringify([...likedSet.value]));

const categories = computed(() => snapshot.value?.categories ?? []);
const filtered = computed(() => {
  const snap = snapshot.value;
  if (!snap) return [];
  const order = sort.value === "hot" ? snap.hot : snap.new;
  return order.map((id) => snap.items[id]).filter((w): w is SqItem => !!w && (!category.value || w.c === category.value));
});
const visible = computed(() => filtered.value.slice(0, visibleCount.value));
const countOf = (key: string) => (key === type.value ? filtered.value.length : "");

let loadVersion = 0;
let openedWorkQuery = "";
async function load() {
  const version = ++loadVersion;
  const kind = type.value;
  visibleCount.value = 30;
  loading.value = true;
  try {
    const snap = await loadSquareSnapshot(kind);
    if (version !== loadVersion) return;
    snapshot.value = snap;
    if (route.query.work && (!route.query.type || route.query.type === kind) && openedWorkQuery !== `${kind}:${route.query.work}`) {
      const work = snap.items[String(route.query.work)];
      if (work) { open(work); openedWorkQuery = `${kind}:${route.query.work}`; }
    }
  } catch {
    if (version !== loadVersion) return;
    snapshot.value = null;
    MessagePlugin.error("广场数据加载失败");
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}
watch(() => [route.query.type, route.query.work], ([kind, work], [previousKind, previousWork]) => {
  if (kind !== previousKind && isSquareType(kind)) {
    type.value = kind;
    detail.value = null;
    openedWorkQuery = "";
    void load();
  } else if (work !== previousWork) {
    detail.value = snapshot.value?.items[String(work)] || null;
    openedWorkQuery = work ? `${type.value}:${work}` : "";
  }
});
void load();

function toggleLike(w: SqItem) {
  const s = new Set(likedSet.value);
  if (s.has(w.id)) s.delete(w.id); else s.add(w.id);
  likedSet.value = s;
  persistLikes();
}

function open(w: SqItem) { detail.value = w; }
function closeDetail() {
  detail.value = null;
  if (route.query.work) {
    const { work: _work, ...query } = route.query;
    void router.replace({ path: route.path, query });
  }
}

/**
 * 封面加载失败处理，分两级：
 *  1) 站内媒体通道的冷启动失败（一屏 30 张图同时回源，上游 CDN 会限流，且失败不入缓存）
 *     → 换一个查询参数重试一次，命中别人的缓存就是秒开；
 *  2) 重试后仍失败（真的死链）→ 隐藏媒体元素，让 .sq-cover 的浅灰底兜住，
 *     由 CSS 的 ::after 显示「封面不可用」，避免瀑布流里出现浏览器破图小图标。
 */
function onCoverError(e: Event) {
  const el = e.target as HTMLImageElement | HTMLVideoElement | null;
  if (!el) return;
  const src = el.getAttribute("src") || "";
  if (src.startsWith("/api/media/") && el.dataset.retried !== "1") {
    el.dataset.retried = "1";
    el.setAttribute("src", `${src}${src.includes("?") ? "&" : "?"}_r=1`);
    if (el instanceof HTMLVideoElement) el.load();
    return;
  }
  el.style.visibility = "hidden";
  (el.closest(".sq-cover, .sq-detail-media") as HTMLElement | null)?.classList.add("is-cover-failed");
}

function chatWithPrompt(prompt: string) {
  detail.value = null;
  void router.push({ path: "/aiAssistant", query: { draft: prompt } });
}

watch(category, () => (visibleCount.value = 30));
</script>

<style lang="scss" scoped>
.sq-page { max-width: 1280px; margin: 0 auto; padding: 30px 28px 60px; }
.sq-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.sq-head h1 { margin: 0; font-size: 26px; font-weight: 750; letter-spacing: -.02em; color: #1d1d1f; }
.sq-head p { margin: 6px 0 0; color: #7c7c80; font-size: 13px; }
.sq-sort { display: flex; gap: 6px; padding: 4px; border: 1px solid #e5e5ea; border-radius: 12px; background: #fff; }
.sq-sort button { padding: 6px 16px; border: 0; border-radius: 9px; background: transparent; color: #555; font-size: 13px; font-weight: 600; cursor: pointer; }
.sq-sort button.active { background: #1d1d1f; color: #fff; }
.sq-tabs { display: flex; gap: 10px; margin-top: 24px; }
.sq-tab { display: inline-flex; align-items: center; gap: 7px; padding: 9px 20px; border: 1px solid #e5e5ea; border-radius: 13px; background: #fff; color: #333; font-size: 14px; font-weight: 600; cursor: pointer; transition: all .18s; }
.sq-tab.active { border-color: #1d1d1f; background: #1d1d1f; color: #fff; }
.sq-tab-count { color: inherit; opacity: .55; font-size: 12px; }
.sq-pills { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.sq-pill { padding: 5px 14px; border: 1px solid #e8e8ec; border-radius: 99px; background: #fff; color: #555; font-size: 12.5px; cursor: pointer; }
.sq-pill.active { border-color: #f57400; color: #f57400; font-weight: 600; }
.sq-masonry { columns: 4 250px; column-gap: 16px; margin-top: 20px; }
.sq-card { break-inside: avoid; margin-bottom: 16px; overflow: hidden; border: 1px solid #ececf0; border-radius: 16px; background: #fff; cursor: pointer; transition: transform .18s, box-shadow .18s; }
.sq-card:hover { transform: translateY(-3px); box-shadow: 0 14px 34px rgba(0,0,0,.09); }
.sq-cover { position: relative; background: #f4f4f6; min-height: 120px; }
/* 封面失效时的兜底（隐藏破图后显示文案），避免瀑布流里出现浏览器破图小图标 */
.sq-cover.is-cover-failed::after {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #c2c2c9; font-size: 12px;
  content: "封面不可用";
}
.sq-cover img { display: block; width: 100%; height: auto; }
.sq-cover video { display: block; width: 100%; height: 100%; object-fit: cover; background: #101013; }
.sq-badge-video, .sq-badge-canvas { position: absolute; left: 10px; top: 10px; padding: 3px 10px; border-radius: 99px; background: rgba(0,0,0,.62); color: #fff; font-size: 11px; backdrop-filter: blur(6px); }
/* 画布作品的一键直通：平时藏起来，悬停封面才出现，不占视觉噪音 */
.sq-quick { position: absolute; right: 10px; bottom: 10px; padding: 7px 14px; border: 0; border-radius: 10px; background: rgba(255,255,255,.94); color: #1d1d1f; font-size: 12px; font-weight: 700; cursor: pointer; opacity: 0; transform: translateY(4px); transition: opacity .18s, transform .18s; box-shadow: 0 4px 14px rgba(0,0,0,.18); }
.sq-card:hover .sq-quick { opacity: 1; transform: translateY(0); }
.sq-quick:disabled { opacity: .6; cursor: default; }
.sq-card-body { padding: 11px 13px 12px; }
.sq-card-body strong { display: block; overflow: hidden; color: #222; font-size: 13.5px; text-overflow: ellipsis; white-space: nowrap; }
.sq-card-meta { display: flex; align-items: center; gap: 8px; margin-top: 7px; color: #8b8b90; font-size: 11.5px; }
.sq-author { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sq-like { padding: 2px 4px; border: 0; background: transparent; color: #8b8b90; font-size: 12px; cursor: pointer; }
.sq-like.liked { color: #ff4d6a; }
.sq-loading, .sq-empty { padding: 90px 0; text-align: center; color: #999; font-size: 14px; }
.sq-more { display: block; margin: 18px auto 0; padding: 10px 34px; border: 1px solid #e0e0e4; border-radius: 12px; background: #fff; color: #444; font-size: 13px; cursor: pointer; }
.sq-more:hover { border-color: #1d1d1f; }
</style>
