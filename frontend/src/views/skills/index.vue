<template>
  <main class="sk-page">
    <header class="sk-head">
      <div>
        <h1>Skill 市场</h1>
        <p>228 个内置创作技能 + 社区分享；安装后即可在 Agent 智能创作的技能选择器中使用。</p>
      </div>
      <div class="sk-head-actions">
        <button class="sk-btn" @click="showImport = true">导入 Skill</button>
        <button class="sk-btn dark" @click="showCreate = true">＋ 创建 Skill</button>
      </div>
    </header>

    <div class="sk-tabs">
      <button v-for="t in TABS" :key="t.key" class="sk-tab" :class="{ active: tab === t.key }" @click="tab = t.key">{{ t.label }}</button>
      <input v-model="keyword" class="sk-search" type="search" placeholder="搜索名称 / 描述…" />
    </div>

    <div class="sk-pills">
      <button class="sk-pill" :class="{ active: categoryId === '' }" @click="categoryId = ''">全部分类</button>
      <button v-for="c in categories" :key="c.id" class="sk-pill" :class="{ active: categoryId === c.id }" @click="categoryId = c.id">{{ c.label }}</button>
    </div>

    <div v-if="!loading" class="sk-grid">
      <article v-for="s in visible" :key="s.id" class="sk-card" @click="open(s)">
        <div class="sk-cover">
          <!-- 228 个内置封面里有 2 个是 mp4，用 <img> 必裂，按后缀换 <video>（preload=metadata 只取首帧） -->
          <video v-if="isVideo(s.cover)" :src="s.cover" muted playsinline preload="metadata" @error="onCoverError" />
          <img v-else :src="s.cover" :alt="s.name" loading="lazy" decoding="async" @error="onCoverError" />
        </div>
        <div class="sk-card-body">
          <strong>{{ s.name }}</strong>
          <p>{{ s.description }}</p>
          <div class="sk-card-meta">
            <span>{{ s.author || "官方" }}</span>
            <span v-if="installedSet.has(s.id)" class="sk-installed">已安装</span>
            <button v-if="installedSet.has(s.id)" class="sk-remove" :disabled="removingId === s.id" @click.stop="uninstall(s)">{{ removingId === s.id ? "移除中" : "移除" }}</button>
            <button class="sk-save" :class="{ on: savedIds.has(s.id) }" @click.stop="toggleSave(s)">{{ savedIds.has(s.id) ? "★" : "☆" }}</button>
          </div>
        </div>
      </article>
    </div>
    <div v-else class="sk-loading">加载中…</div>
    <div v-if="!loading && visible.length === 0" class="sk-empty">{{ tab === "market" ? "没有匹配的 Skill" : "这里还空空的" }}</div>

    <!-- 详情 -->
    <Teleport to="body">
      <Transition name="sk-fade">
        <div v-if="detail" class="sk-mask" @click.self="detail = null">
          <section class="sk-dialog">
            <button class="sk-close" @click="detail = null">✕</button>
            <div class="sk-dialog-head">
              <video v-if="isVideo(detail.cover)" class="sk-dialog-cover" :src="detail.cover" controls autoplay muted loop playsinline @error="onCoverError" />
              <img v-else class="sk-dialog-cover" :src="detail.cover" :alt="detail.name" @error="onCoverError" />
              <div class="sk-dialog-info">
                <h2>{{ detail.name }}</h2>
                <p>{{ detail.description }}</p>
                <div class="sk-dialog-meta"><span>{{ detail.author || "官方" }}</span><span v-if="detail.categoryLabel">{{ detail.categoryLabel }}</span></div>
                <div class="sk-dialog-actions">
                  <button class="sk-primary" :class="{ remove: installedSet.has(detail.id) }" :disabled="installing || removingId === detail.id" @click="installedSet.has(detail.id) ? uninstall(detail) : install(detail)">
                    {{ installedSet.has(detail.id) ? (removingId === detail.id ? "移除中…" : "从智能体移除") : installing ? "安装中…" : "安装到智能体" }}
                  </button>
                  <span class="sk-install-note">{{ installedSet.has(detail.id) ? "收藏与市场原件会保留" : "安装后可在对话中按需启用" }}</span>
                </div>
              </div>
            </div>
            <div class="sk-dialog-body">
              <div v-if="bodyLoading" class="sk-loading">加载正文…</div>
              <MdPreview v-else-if="detailBody" :model-value="detailBody" theme="light" preview-theme="github" code-theme="github" />
              <p v-else class="sk-empty">暂无正文</p>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>

    <!-- 导入 -->
    <Teleport to="body">
      <Transition name="sk-fade">
        <div v-if="showImport" class="sk-mask" @click.self="showImport = false">
          <section class="sk-mini">
            <h2>导入 Skill</h2>
            <p>输入别人分享给你的 8 位分享码，导入后自动进入「我的创建」。</p>
            <input v-model="importCode" class="sk-input" placeholder="例如 A3K7M2QP" maxlength="12" />
            <div class="sk-mini-actions">
              <button class="sk-btn" @click="showImport = false">取消</button>
              <button class="sk-btn dark" :disabled="importing || !importCode.trim()" @click="doImport">{{ importing ? "导入中…" : "导入" }}</button>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>

    <!-- 创建 -->
    <Teleport to="body">
      <Transition name="sk-fade">
        <div v-if="showCreate" class="sk-mask" @click.self="showCreate = false">
          <section class="sk-mini wide">
            <h2>创建 Skill</h2>
            <div class="sk-form">
              <label>名称<input v-model="form.name" class="sk-input" placeholder="给技能起个名字" maxlength="40" /></label>
              <label>简介<input v-model="form.description" class="sk-input" placeholder="一句话说明它能做什么" maxlength="120" /></label>
              <label>正文（Markdown 工作流说明）<textarea v-model="form.body" rows="10" placeholder="写清这个技能的执行步骤、输入输出与注意事项…" /></label>
            </div>
            <div class="sk-mini-actions">
              <button class="sk-btn" @click="showCreate = false">取消</button>
              <button class="sk-btn dark" :disabled="creating || !form.name.trim() || !form.body.trim()" @click="doCreate">{{ creating ? "保存中…" : "保存" }}</button>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </main>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import { MdPreview } from "@/utils/markdown";
import "md-editor-v3/lib/preview.css";
import { computed, ref, watch } from "vue";
import { MessagePlugin } from "tdesign-vue-next";
import { storeToRefs } from "pinia";
import userStore from "@/stores/user";

/** 归一化后的市场条目（内置 catalog 的 skill_id 口径 + 服务端 SkillRow 的 id 口径合并） */
interface SkItem { id: string; name: string; description: string; cover: string; author?: string; categoryId: string; categoryLabel?: string; body?: string }

/** 封面/正文是视频的按后缀判定：内置素材里有 mp4 封面，用 <img> 会 404 渲染失败 */
const isVideo = (u: string) => /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(String(u || ""));

/** 封面失效兜底：站内媒体通道冷启动偶发失败先换参重试一次，仍失败则隐藏破图 */
function onCoverError(e: Event) {
  const el = e.target as HTMLImageElement | HTMLVideoElement | null;
  if (!el) return;
  const src = el.getAttribute("src") || "";
  if ((src.startsWith("/api/media/") || src.startsWith("/skills/covers/")) && el.dataset.retried !== "1") {
    el.dataset.retried = "1";
    el.setAttribute("src", `${src}${src.includes("?") ? "&" : "?"}_r=1`);
    if (el instanceof HTMLVideoElement) el.load();
    return;
  }
  el.style.visibility = "hidden";
}

const TABS = [
  { key: "market", label: "市场" },
  { key: "installed", label: "已安装" },
  { key: "mine", label: "我的创建" },
  { key: "saved", label: "我的保存" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const tab = ref<Tab>("market");
const keyword = ref("");
const categoryId = ref("");
const loading = ref(false);
const items = ref<SkItem[]>([]);
const categories = ref<{ id: string; label: string }[]>([]);
const visibleCount = ref(30);
const savedIds = ref(new Set<string>());
const { userId } = storeToRefs(userStore());
const installedMetaKey = computed(() => `xoi_installed_creative_skills_v1:${userId.value || "anonymous"}`);
const installedIdsKey = computed(() => `xoi_market_installed_v2:${userId.value || "anonymous"}`);
const selectedSkillsKey = computed(() => `xo_assistant_selected_skills_v1:${userId.value || "anonymous"}`);
const readJsonArray = (key: string): any[] => {
  try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
};
const idFromPath = (path: string) => path.split("/").pop()?.replace(/\.md$/i, "") || "";
const legacyInstalled = readJsonArray("xoi_market_installed_v1").map(String);
const installedSet = ref(new Set<string>([...legacyInstalled, ...readJsonArray(installedIdsKey.value).map(String)]));

const detail = ref<SkItem | null>(null);
const detailBody = ref("");
const bodyLoading = ref(false);
const installing = ref(false);
const removingId = ref("");
const showImport = ref(false);
const importCode = ref("");
const importing = ref(false);
const showCreate = ref(false);
const creating = ref(false);
const form = ref({ name: "", description: "", body: "" });

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return items.value.filter((s) => (!kw || s.name.toLowerCase().includes(kw) || s.description.toLowerCase().includes(kw)) && (!categoryId.value || s.categoryId === categoryId.value));
});
const visible = computed(() => filtered.value.slice(0, visibleCount.value));

/** 内置条目 cover_url 已是 /skills/covers/...；服务端条目没有封面时用占位渐变 */
function normalize(raw: any, fromServer: boolean): SkItem {
  const id = String(fromServer ? raw.id : raw.skill_id);
  return {
    id,
    name: String(raw.name ?? "未命名"),
    description: String(raw.description ?? ""),
    cover: String(raw.cover_url || "") || `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='400' height='250'><rect width='100%' height='100%' fill='%23f2f2f4'/><text x='50%' y='50%' text-anchor='middle' fill='%23b9b9c0' font-size='22' font-family='sans-serif'>Skill</text></svg>`)}`,
    author: typeof raw.author === "string" ? raw.author.replace(/[{}']|user_no: \d+, name:/g, "").trim() || undefined : undefined,
    categoryId: String(raw.category_id ?? "other"),
    body: fromServer ? String(raw.body ?? "") : undefined,
  };
}

/**
 * 静态内置 catalog（228 条）——站点根直取。
 * ① axios 实例 baseURL = /api，拼出来是 /api/skill-market/... → 404；
 * ② 其响应拦截器已 return response.data，再解一层会拿到 undefined。
 */
async function loadCatalog(): Promise<{ items: SkItem[]; cats: { id: string; label: string }[] }> {
  const [catalogRes, catsRes] = await Promise.all([
    fetch("/skill-market/catalog.json", { cache: "no-store" }),
    fetch("/skill-market/categories.json", { cache: "no-store" }),
  ]);
  if (!catalogRes.ok) throw new Error("catalog unavailable");
  const catalog = (await catalogRes.json()) as { data?: any[] };
  const cats = catsRes.ok ? ((await catsRes.json()) as { data?: any[] }) : { data: [] };
  const list = (cats.data ?? []).map((c) => ({ id: String(c.id ?? c.category_id), label: String(c.label ?? c.name ?? c.id) }));
  const labelOf = new Map(list.map((c) => [c.id, c.label]));
  return {
    items: (catalog.data ?? []).map((x) => ({ ...normalize(x, false), categoryLabel: labelOf.get(String(x.category_id)) })),
    cats: list,
  };
}

async function load() {
  loading.value = true;
  visibleCount.value = 30;
  try {
    if (tab.value === "market" || tab.value === "installed") {
      const [{ items: list, cats }, marketRes] = await Promise.all([
        loadCatalog(),
        axios.get<{ items: any[]; ids: string[]; installedIds: string[] }>("/skills?tab=market").catch(() => null),
      ]);
      categories.value = cats;
      const community = (marketRes?.data?.items ?? []).map((x) => normalize(x, true));
      const merged = [...list, ...community.filter((x) => !list.some((builtIn) => builtIn.id === x.id))];
      savedIds.value = new Set(marketRes?.data?.ids ?? []);
      const localIds = [
        ...readJsonArray(installedIdsKey.value).map(String),
        ...readJsonArray(installedMetaKey.value).map((item) => idFromPath(String(item?.path || ""))).filter(Boolean),
      ];
      installedSet.value = new Set([...(marketRes?.data?.installedIds ?? []), ...localIds, ...legacyInstalled]);
      localStorage.setItem(installedIdsKey.value, JSON.stringify([...installedSet.value]));
      items.value = tab.value === "installed" ? merged.filter((item) => installedSet.value.has(item.id)) : merged;
    } else if (tab.value === "saved") {
      // 收藏要合并两处来源：库内自建技能（后端只回这些 rows）+ 静态内置技能。
      // 内置 228 条根本不在 mc_skills 表里，只靠后端 items 会永远空。
      const [dbRes, cat] = await Promise.all([
        axios.get<{ items: any[] }>("/skills?tab=saved").catch(() => null),
        loadCatalog().catch(() => null),
      ]);
      let ids = new Set<string>();
      try {
        const m = await axios.get<{ ids: string[] }>("/skills?tab=market");
        ids = new Set(m.data?.ids ?? []);
      } catch { /* 未登录：本地无收藏可合并 */ }
      const fromDb = (dbRes?.data?.items ?? []).map((x) => normalize(x, true));
      const fromCatalog = (cat?.items ?? []).filter((it) => ids.has(it.id));
      items.value = [...fromCatalog, ...fromDb];
      savedIds.value = ids;
      if (cat) categories.value = cat.cats;
    } else {
      const res = await axios.get<{ items: any[] }>(`/skills?tab=${tab.value}`);
      items.value = (res.data?.items ?? []).map((x) => normalize(x, true));
    }
  } catch {
    items.value = [];
    MessagePlugin.error("加载失败，请稍后再试");
  } finally {
    loading.value = false;
  }
}
load();
watch(tab, load);
watch(keyword, () => (visibleCount.value = 30));
watch(categoryId, () => (visibleCount.value = 30));
watch(userId, () => {
  installedSet.value = new Set(readJsonArray(installedIdsKey.value).map(String));
  void load();
});

async function open(s: SkItem) {
  detail.value = s;
  detailBody.value = "";
  if (s.body) { detailBody.value = s.body; return; }
  bodyLoading.value = true;
  try {
    // 正文同为站点根静态 md（/skills 静态挂载只放行图片，正文走 /skill-market/bodies/）
    const res = await fetch(`/skill-market/bodies/${encodeURIComponent(s.id)}.md`, { cache: "no-store" });
    detailBody.value = res.ok ? await res.text() : "";
  } catch {
    detailBody.value = "";
  } finally {
    bodyLoading.value = false;
  }
}

/** 安装 = 服务端记录当前用户 + 落盘共享执行缓存；前端保存展示元数据。 */
async function install(s: SkItem) {
  installing.value = true;
  try {
    const res = await axios.post<{ path: string; name: string }>(`/skills/${s.id}/install`);
    const path = res.data?.path;
    if (!path) throw new Error("no path");
    const list = readJsonArray(installedMetaKey.value);
    if (!list.some((x: any) => x.path === path)) list.push({ id: s.id, path, name: s.name, kind: "市场技能", desc: s.description || "来自 Skill 市场的创作技能", emoji: "🧩" });
    localStorage.setItem(installedMetaKey.value, JSON.stringify(list));
    installedSet.value = new Set([...installedSet.value, s.id]);
    localStorage.setItem(installedIdsKey.value, JSON.stringify([...installedSet.value]));
    MessagePlugin.success("已安装，去 Agent 智能创作的技能选择器里启用吧");
  } catch (e: any) {
    MessagePlugin.error(e?.response?.data?.message || "安装失败（需要登录）");
  } finally {
    installing.value = false;
  }
}

/** 移除只撤销当前用户的安装和对话选择，收藏、作者原件与市场条目均保留。 */
async function uninstall(s: SkItem) {
  removingId.value = s.id;
  try {
    await axios.delete(`/skills/${s.id}/install`);
    const current = readJsonArray(installedMetaKey.value);
    const removedPaths = new Set(current.filter((item) => item?.id === s.id || idFromPath(String(item?.path || "")) === s.id).map((item) => String(item.path)));
    const remainingMeta = current.filter((item) => item?.id !== s.id && idFromPath(String(item?.path || "")) !== s.id);
    localStorage.setItem(installedMetaKey.value, JSON.stringify(remainingMeta));
    const selected = readJsonArray(selectedSkillsKey.value).filter((path) => !removedPaths.has(String(path)));
    localStorage.setItem(selectedSkillsKey.value, JSON.stringify(selected));
    const next = new Set(installedSet.value);
    next.delete(s.id);
    installedSet.value = next;
    localStorage.setItem(installedIdsKey.value, JSON.stringify([...next]));
    if (tab.value === "installed") items.value = items.value.filter((item) => item.id !== s.id);
    MessagePlugin.success("已从智能体移除；收藏和市场原件仍保留");
  } catch (e: any) {
    MessagePlugin.error(e?.response?.data?.message || "移除失败");
  } finally {
    removingId.value = "";
  }
}

async function toggleSave(s: SkItem) {
  const on = !savedIds.value.has(s.id);
  const next = new Set(savedIds.value);
  if (on) next.add(s.id); else next.delete(s.id);
  savedIds.value = next;
  try {
    await axios.post("/skills/save", { skillId: s.id, on });
  } catch {
    savedIds.value = savedIds.value; // 回滚太复杂，失败时静默（下次打开会刷新）
    MessagePlugin.error("收藏失败（需要登录）");
    const back = new Set(savedIds.value);
    if (on) back.delete(s.id); else back.add(s.id);
    savedIds.value = back;
  }
}

async function doImport() {
  importing.value = true;
  try {
    const res = await axios.post<{ name?: string }>("/skills/import", { code: importCode.value.trim() });
    showImport.value = false;
    importCode.value = "";
    MessagePlugin.success(`已导入「${res.data?.name ?? "Skill"}」`);
    if (tab.value === "mine") load();
  } catch (e: any) {
    MessagePlugin.error(e?.response?.data?.message || "导入失败");
  } finally {
    importing.value = false;
  }
}

async function doCreate() {
  creating.value = true;
  try {
    await axios.post("/skills", { name: form.value.name.trim(), description: form.value.description.trim(), body: form.value.body, agentScope: "chat", categoryId: "other", visible: true });
    showCreate.value = false;
    form.value = { name: "", description: "", body: "" };
    MessagePlugin.success("已保存到我的创建");
    if (tab.value === "mine") load();
  } catch (e: any) {
    MessagePlugin.error(e?.response?.data?.message || "保存失败");
  } finally {
    creating.value = false;
  }
}
</script>

<style lang="scss" scoped>
.sk-page { max-width: 1280px; margin: 0 auto; padding: 30px 28px 60px; }
.sk-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.sk-head h1 { margin: 0; font-size: 26px; font-weight: 750; letter-spacing: -.02em; color: #1d1d1f; }
.sk-head p { margin: 6px 0 0; color: #7c7c80; font-size: 13px; }
.sk-head-actions { display: flex; gap: 10px; }
.sk-btn { padding: 10px 18px; border: 1px solid #e0e0e4; border-radius: 12px; background: #fff; color: #333; font-size: 13px; font-weight: 600; cursor: pointer; }
.sk-btn.dark { border-color: #1d1d1f; background: #1d1d1f; color: #fff; }
.sk-btn:disabled { opacity: .55; cursor: default; }
.sk-tabs { display: flex; align-items: center; gap: 10px; margin-top: 24px; }
.sk-tab { padding: 9px 20px; border: 1px solid #e5e5ea; border-radius: 13px; background: #fff; color: #333; font-size: 14px; font-weight: 600; cursor: pointer; }
.sk-tab.active { border-color: #1d1d1f; background: #1d1d1f; color: #fff; }
.sk-search { flex: 1; max-width: 300px; margin-left: auto; padding: 9px 14px; border: 1px solid #e5e5ea; border-radius: 13px; background: #fff; font-size: 13px; outline: none; }
.sk-search:focus { border-color: #1d1d1f; }
.sk-pills { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.sk-pill { padding: 5px 14px; border: 1px solid #e8e8ec; border-radius: 99px; background: #fff; color: #555; font-size: 12.5px; cursor: pointer; }
.sk-pill.active { border-color: #f57400; color: #f57400; font-weight: 600; }
.sk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; margin-top: 20px; }
.sk-card { overflow: hidden; border: 1px solid #ececf0; border-radius: 16px; background: #fff; cursor: pointer; transition: transform .18s, box-shadow .18s; }
.sk-card:hover { transform: translateY(-3px); box-shadow: 0 14px 34px rgba(0,0,0,.09); }
.sk-cover { aspect-ratio: 16/10; background: #f4f4f6; }
.sk-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sk-cover video { width: 100%; height: 100%; object-fit: cover; display: block; background: #101013; }
.sk-card-body { padding: 11px 13px 12px; }
.sk-card-body strong { display: block; overflow: hidden; color: #222; font-size: 13.5px; text-overflow: ellipsis; white-space: nowrap; }
.sk-card-body p { display: -webkit-box; margin: 5px 0 0; color: #8b8b90; font-size: 12px; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.sk-card-meta { display: flex; align-items: center; gap: 8px; margin-top: 8px; color: #9a9aa0; font-size: 11.5px; }
.sk-card-meta span:first-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sk-installed { color: #12a150; font-weight: 600; }
.sk-remove { padding: 2px 7px; border: 0; border-radius: 7px; background: #f3f3f5; color: #777; font-size: 11px; cursor: pointer; }
.sk-remove:hover { background: #fff0eb; color: #c94722; }
.sk-remove:disabled { opacity: .55; cursor: default; }
.sk-save { border: 0; background: transparent; color: #b9b9c0; font-size: 15px; cursor: pointer; }
.sk-save.on { color: #f7b500; }
.sk-loading, .sk-empty { padding: 80px 0; text-align: center; color: #999; font-size: 14px; }
.sk-mask { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: 24px; background: rgba(12,12,14,.55); backdrop-filter: blur(10px); }
.sk-dialog { position: relative; display: flex; flex-direction: column; width: min(860px, 100%); max-height: 88vh; overflow: hidden; border-radius: 20px; background: #fff; }
.sk-dialog-head { display: flex; gap: 18px; padding: 24px 26px 18px; border-bottom: 1px solid #f0f0f2; }
.sk-dialog-cover { width: 190px; height: 118px; flex: none; border-radius: 12px; object-fit: cover; background: #f4f4f6; }
.sk-dialog-info { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.sk-dialog-info h2 { margin: 0; font-size: 19px; font-weight: 720; color: #1c1c1e; }
.sk-dialog-info p { display: -webkit-box; margin: 0; color: #6f6f75; font-size: 13px; line-height: 1.6; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.sk-dialog-meta { display: flex; gap: 12px; color: #9a9aa0; font-size: 12px; }
.sk-dialog-actions { display: flex; align-items: center; gap: 12px; margin-top: auto; }
.sk-primary { padding: 10px 20px; border: 0; border-radius: 12px; background: linear-gradient(135deg, #ff8a1f, #f57400); color: #fff; font-size: 13.5px; font-weight: 650; cursor: pointer; }
.sk-primary.remove { border: 1px solid #e2e2e6; background: #fff; color: #555; }
.sk-primary.remove:hover { border-color: #f1b6a7; background: #fff7f4; color: #bd3f20; }
.sk-primary:disabled { opacity: .6; cursor: default; }
.sk-install-note { color: #999; font-size: 11.5px; }
.sk-dialog-body { flex: 1; overflow-y: auto; padding: 6px 26px 24px; }
.sk-mini { position: relative; width: min(420px, 100%); padding: 26px; border-radius: 20px; background: #fff; }
.sk-mini.wide { width: min(560px, 100%); max-height: 88vh; overflow-y: auto; }
.sk-mini h2 { margin: 0 0 6px; font-size: 18px; font-weight: 720; color: #1c1c1e; }
.sk-mini > p { margin: 0 0 16px; color: #7c7c80; font-size: 13px; }
.sk-input { width: 100%; margin-bottom: 12px; padding: 10px 13px; border: 1px solid #e2e2e6; border-radius: 11px; font-size: 13.5px; outline: none; box-sizing: border-box; }
.sk-input:focus { border-color: #1d1d1f; }
.sk-form label { display: block; margin-bottom: 12px; color: #444; font-size: 13px; font-weight: 600; }
.sk-form textarea { width: 100%; padding: 10px 13px; border: 1px solid #e2e2e6; border-radius: 11px; font: 13px/1.6 ui-monospace, monospace; outline: none; resize: vertical; box-sizing: border-box; }
.sk-form textarea:focus, .sk-form .sk-input:focus { border-color: #1d1d1f; }
.sk-mini-actions { display: flex; justify-content: flex-end; gap: 10px; }
.sk-close { position: absolute; right: 14px; top: 14px; z-index: 2; display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 10px; background: rgba(180,180,186,.18); color: #555; font-size: 15px; cursor: pointer; }
.sk-fade-enter-active, .sk-fade-leave-active { transition: opacity .2s; }
.sk-fade-enter-from, .sk-fade-leave-to { opacity: 0; }
</style>
