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

    <!-- 详情弹窗 -->
    <Teleport to="body">
      <Transition name="sq-fade">
        <div v-if="detail" class="sq-mask" @click.self="detail = null">
          <section class="sq-dialog">
            <button class="sq-close" @click="detail = null">✕</button>
            <div class="sq-detail-media">
              <video v-if="detail.k === 'video' || detail.mk === 'video'" :src="detail.u" controls autoplay muted loop playsinline @error="onCoverError" />
              <img v-else :src="detail.u" :alt="detail.t" @error="onCoverError" />
            </div>
            <div class="sq-detail-body">
              <h2>{{ detail.t || "未命名" }}</h2>
              <div class="sq-detail-meta">
                <span>作者 {{ detail.n }}</span>
                <span v-if="detail.src === 'canvas'">{{ detail.nc }} 个节点</span>
                <span>{{ detail.r }} 推荐 · {{ detail.v }} 浏览</span>
              </div>
              <p v-if="detail.d" class="sq-detail-desc">{{ detail.d }}</p>
              <!-- 直通动作按「作品种类」（src=来源页签）分流，不能用 k（那是封面素材类型）：
                   画布作品 → 还原完整 nodes+edges 工作流，直接进画布可改可替换；
                   图片/视频作品 → 提示词交给对话页 / 画布 Agent，并把封面作为参考图带过去。 -->
              <div class="sq-detail-actions">
                <button v-if="detail.src === 'canvas'" class="sq-primary" :disabled="replicating" @click="replicate()">
                  {{ replicating ? "正在复刻…" : "◈ 在画布中打开（" + detail.nc + " 节点）" }}
                </button>
                <button v-else class="sq-primary" @click="chatWithPrompt">✦ 用提示词对话</button>
                <button v-if="detail.src !== 'canvas'" class="sq-ghost" @click="canvasWithPrompt">◈ 带到画布生成</button>
                <button class="sq-ghost" @click="copyDesc">{{ copied ? "已复制 ✓" : "复制提示词" }}</button>
                <a class="sq-ghost" :href="detail.u" :download="`${detail.id}`" target="_blank" rel="noopener">下载封面</a>
              </div>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { MessagePlugin } from "tdesign-vue-next";

/** 广场静态快照条目（square-data/*.json 的 items，字段是造物压缩过的单字母）
 *  k / mk = 素材真实媒体类型（由 external-media-map 的上游后缀 / content-type 判定后写回数据文件），
 *  **它描述的是封面素材、不是作品种类**：canvas.json 里同样是 image/video（27 图 + 10 视频）。
 *  所以「是不是画布作品」只能看它来自哪个页签（src），用 k 判会把画布作品误判成图片/视频。
 *  src = 装载来源页签，load() 时逐条打上 */
interface SqItem {
  id: string; t: string; d: string; u: string; k: "image" | "video";
  mk?: "image" | "video";
  /** pr = 造物的完整提示词（视频作品基本都有；图片作品大多是描述 d） */
  pr?: string;
  c: string; n: string; pk: "official" | "user"; a?: string; pid?: string;
  r: number; l: number; v: number; at: string; ref: string[]; nc: number;
  /** 作品种类 = 来源页签（canvas / image / video） */
  src: "canvas" | "image" | "video";
}
// categories 是造物原版的元组格式 [slug, 中文名][]（不是对象数组），与 xx.json 对齐
interface SquareSnapshot { categories: [string, string][]; hot: string[]; new: string[]; items: Record<string, SqItem> }

const TYPES = [
  { key: "canvas", label: "画布" },
  { key: "image", label: "图片" },
  { key: "video", label: "视频" },
] as const;
type SqType = (typeof TYPES)[number]["key"];

const router = useRouter();
const type = ref<SqType>("canvas");
const sort = ref<"hot" | "new">("hot");
const category = ref("");
const loading = ref(false);
const snapshot = ref<SquareSnapshot | null>(null);
const visibleCount = ref(30);
const detail = ref<SqItem | null>(null);
const copied = ref(false);
const replicating = ref(false);

const LIKES_KEY = "xoi_square_likes_v1";
const likedSet = ref(new Set<string>(JSON.parse(localStorage.getItem(LIKES_KEY) || "[]")));
const persistLikes = () => localStorage.setItem(LIKES_KEY, JSON.stringify([...likedSet.value]));

/** 宿主 ↔ 画布的既有约定键：handoff=提示词交接（画布建项目后交给 Agent 面板）；graph=整图复刻载荷 */
const CANVAS_HANDOFF_KEY = "xoi_canvas_handoff_v1";
const CANVAS_GRAPH_KEY = "xoi_canvas_graph_v1";

/** 作品提示词口径与造物一致：优先完整提示词 pr，退回描述 d，最后退标题 t */
const promptOf = (w: SqItem) => (w.pr || w.d || w.t || "").trim();

const categories = computed(() => snapshot.value?.categories ?? []);
const filtered = computed(() => {
  const snap = snapshot.value;
  if (!snap) return [];
  const order = sort.value === "hot" ? snap.hot : snap.new;
  return order.map((id) => snap.items[id]).filter((w): w is SqItem => !!w && (!category.value || w.c === category.value));
});
const visible = computed(() => filtered.value.slice(0, visibleCount.value));
const countOf = (key: string) => (key === type.value ? filtered.value.length : "");

async function load() {
  visibleCount.value = 30;
  loading.value = true;
  try {
    // 静态快照必须走站点根直取（与 /announcements.json 同口径）：
    // axios 实例的 baseURL 是 /api，用它拼会变成 /api/square-data/xxx.json → 404；
    // 且其响应拦截器已 return response.data，再解一层 data 会拿到 undefined。
    const res = await fetch(`/square-data/${type.value}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const snap = (await res.json()) as SquareSnapshot;
    // 作品种类只能由「来自哪个页签」决定：快照里的 k 是封面素材类型（canvas.json 同样是 image/video），
    // 拿它判种类会把 37 个画布作品全部误判成图片/视频 → 只带提示词、复刻不出工作流。
    const kind = type.value;
    for (const item of Object.values(snap.items || {})) item.src = kind;
    snapshot.value = snap;
  } catch {
    snapshot.value = null;
    MessagePlugin.error("广场数据加载失败");
  } finally {
    loading.value = false;
  }
}
load();

function toggleLike(w: SqItem) {
  const s = new Set(likedSet.value);
  if (s.has(w.id)) s.delete(w.id); else s.add(w.id);
  likedSet.value = s;
  persistLikes();
}

function open(w: SqItem) { detail.value = w; copied.value = false; }

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

async function copyDesc() {
  const text = detail.value?.d || detail.value?.t || "";
  if (!text) { MessagePlugin.warning("该作品没有描述"); return; }
  try { await navigator.clipboard.writeText(text); copied.value = true; setTimeout(() => (copied.value = false), 2000); }
  catch { MessagePlugin.error("复制失败"); }
}

/** 「用提示词对话」：走宿主对话页已内置的 ?draft= 预填通道，输入框直接带上该作品的提示词 */
function chatWithPrompt() {
  const w = detail.value;
  if (!w) return;
  const p = promptOf(w);
  if (!p) { MessagePlugin.warning("该作品没有可用的提示词"); return; }
  detail.value = null;
  router.push({ path: "/aiAssistant", query: { draft: p } });
}

/** 「带到画布生成」：把提示词交给画布 Agent 面板，并把封面/源视频一起带成画布上的媒体节点，
 *  否则画布落地是个空项目、看起来像「没带过去」。t= nonce 保证已停在画布页也能重挂载外壳。 */
function canvasWithPrompt() {
  const w = detail.value;
  if (!w) return;
  const p = promptOf(w);
  if (!p) { MessagePlugin.warning("该作品没有可用的提示词"); return; }
  // 媒体节点只挂站内媒体地址，不做 base64（会撞 localStorage 5MB 上限）
  const isVideo = w.mk === "video";
  const media = w.u ? [w.u] : [];
  try {
    localStorage.setItem(CANVAS_HANDOFF_KEY, JSON.stringify({
      prompt: p,
      assetUrls: isVideo ? [] : media,
      videoUrls: isVideo ? media : [],
      source: "square",
      createdAt: Date.now(),
    }));
  } catch {
    MessagePlugin.error("画布入口数据暂时无法保存，请重试");
    return;
  }
  detail.value = null;
  router.push({ path: "/canvas", query: { source: "xoi", handoff: "1", from: "square", t: String(Date.now()) } });
}

/** 画布作品复刻（整图）：把 canvas-previews 里该作品的完整 nodes+edges 交给画布侧还原工作流骨架，
 *  打开就是一张可编辑、可替换的完整画布。卡片上的「一键复刻」直接传 w，详情弹窗内不传则取 detail。
 *  载荷走 localStorage（单条预览仅十几 KB，避免 700KB 全量文件被二次拉取），提示词一并带上。 */
async function replicate(target?: SqItem) {
  const w = target || detail.value;
  if (!w) return;
  replicating.value = true;
  try {
    const res = await fetch("/square-data/canvas-previews.json", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as Record<string, { name?: string; nodes?: unknown[]; edges?: unknown[] }>;
    const preview = data[w.id];
    if (!preview?.nodes?.length) { MessagePlugin.warning("该作品暂无可复刻的工作流"); return; }
    localStorage.setItem(CANVAS_GRAPH_KEY, JSON.stringify({
      workId: w.id,
      title: w.t || preview.name || "复刻画布",
      prompt: promptOf(w),
      nodes: preview.nodes,
      edges: preview.edges || [],
    }));
    detail.value = null;
    router.push({ path: "/canvas", query: { source: "xoi", graph: "1", from: "square", t: String(Date.now()) } });
  } catch {
    MessagePlugin.error("复刻失败，请稍后再试");
  } finally {
    replicating.value = false;
  }
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
.sq-mask { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: 24px; background: rgba(12,12,14,.55); backdrop-filter: blur(10px); }
.sq-dialog { position: relative; display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(280px, 1fr); gap: 0; width: min(1040px, 100%); max-height: min(86vh, 720px); overflow: hidden; border-radius: 20px; background: #fff; }
.sq-detail-media { position: relative; display: grid; place-items: center; min-height: 300px; background: #101013; }
.sq-detail-media.is-cover-failed::after {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #5d5d66; font-size: 13px;
  content: "封面不可用";
}
.sq-detail-media img, .sq-detail-media video { max-width: 100%; max-height: min(86vh, 720px); object-fit: contain; }
.sq-detail-body { display: flex; flex-direction: column; gap: 12px; padding: 26px 26px 24px; overflow-y: auto; }
.sq-detail-body h2 { margin: 0; font-size: 19px; font-weight: 720; color: #1c1c1e; }
.sq-detail-meta { display: flex; flex-wrap: wrap; gap: 12px; color: #8b8b90; font-size: 12.5px; }
.sq-detail-desc { margin: 0; color: #4c4c50; font-size: 13.5px; line-height: 1.75; white-space: pre-wrap; }
.sq-detail-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: auto; padding-top: 14px; }
.sq-primary { padding: 11px 22px; border: 0; border-radius: 12px; background: linear-gradient(135deg, #ff8a1f, #f57400); color: #fff; font-size: 13.5px; font-weight: 650; cursor: pointer; }
.sq-primary:disabled { opacity: .6; }
.sq-ghost { padding: 11px 18px; border: 1px solid #e2e2e6; border-radius: 12px; background: #fff; color: #333; font-size: 13px; text-decoration: none; cursor: pointer; }
.sq-close { position: absolute; right: 14px; top: 14px; z-index: 2; display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 10px; background: rgba(255,255,255,.16); color: #fff; font-size: 15px; cursor: pointer; }
.sq-fade-enter-active, .sq-fade-leave-active { transition: opacity .2s; }
.sq-fade-enter-from, .sq-fade-leave-to { opacity: 0; }
@media (max-width: 900px) {
  .sq-dialog { grid-template-columns: 1fr; max-height: 92vh; overflow-y: auto; }
}
</style>
