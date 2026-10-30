<template>
  <section class="projectLibrary">
    <header class="libraryHero">
      <div class="heroCopy">
        <span class="heroEyebrow"><i></i>PROJECT ASSET LIBRARY</span>
        <h1>项目资产库</h1>
        <p>每个创作项目独立保存角色、场景、道具与素材，进入项目即可继续工作。</p>
        <div class="heroNotes"><span><t-icon name="check-circle" />项目之间相互隔离</span><span><t-icon name="time" />最近编辑优先</span></div>
      </div>
      <div class="heroVisual" aria-hidden="true">
        <!-- 拍立得画框：白边卡住整幅插画（实底图），与暖橙横幅用白框隔离；项目数做成叠角小徽章 -->
        <div class="heroArt"><img :src="libraryArt" alt="" /></div>
        <div class="heroStats"><strong>{{ String(projects.length).padStart(2, "0") }}</strong><span>个创作项目</span></div>
      </div>
    </header>

    <div class="libraryToolbar">
      <div class="toolbarTitle">
        <span>YOUR PROJECTS</span>
        <strong>选择一个项目</strong>
        <small>打开后只显示该项目自己的资产</small>
      </div>
      <t-input v-model="searchText" clearable placeholder="搜索项目名称" class="projectSearch">
        <template #prefix><t-icon name="search" /></template>
      </t-input>
    </div>

    <div v-if="loading" class="libraryState">
      <t-loading size="small" text="正在读取项目资产…" />
    </div>

    <div v-else-if="filteredProjects.length" class="projectGrid">
      <button v-for="(item, index) in pagedProjects" :key="item.id" type="button" class="projectAssetCard" @click="openProject(item)">
        <div class="cardVisual" :class="item.projectType === 'novel' ? 'novel' : 'script'">
          <div v-if="coverThumbs(item).length" class="thumbWall" aria-hidden="true">
            <img v-for="(img, i) in coverThumbs(item)" :key="i" :src="thumbUrl(img, 400)" alt="" loading="lazy" />
          </div>
          <div class="visualShade" aria-hidden="true"></div>
          <div class="visualMeta">
            <span>{{ item.projectType === "novel" ? "NOVEL PROJECT" : "SCRIPT PROJECT" }}</span>
            <b>{{ creativePreferenceLabel(item.artStyle) }}</b>
          </div>
          <strong>{{ String((safePage - 1) * PAGE_SIZE + index + 1).padStart(2, "0") }}</strong>
        </div>
        <div class="cardTitleRow">
          <strong>{{ item.name || "未命名项目" }}</strong>
          <t-icon name="arrow-up-right" class="cardArrow" />
        </div>
        <p>{{ item.intro || "暂无项目简介，进入项目开始整理你的创作资产。" }}</p>
        <div class="assetProgress">
          <div>
            <span>资产准备度</span>
            <b>{{ assetDone(item) }} / {{ assetTotal(item) }}</b>
          </div>
          <div class="progressTrack"><i :style="{ width: assetPercent(item) + '%' }"></i></div>
        </div>
        <footer>
          <span><t-icon name="time" />最后编辑 {{ formatDate(item.updatedAt || item.createTime) }}</span>
          <b>打开项目 <t-icon name="arrow-right" /></b>
        </footer>
      </button>
    </div>
    <Pager v-if="!loading" v-model:page="page" :total="filteredProjects.length" :page-size="PAGE_SIZE" unit="个项目" />

    <div v-else class="libraryState emptyState">
      <t-icon name="folder-open" size="42px" />
      <strong>{{ searchText ? "没有找到匹配项目" : "还没有创作项目" }}</strong>
      <span>{{ searchText ? "换个关键词试试" : "先创建项目，再沉淀该项目的角色、场景和道具" }}</span>
      <t-button v-if="!searchText" theme="primary" @click="router.push('/project')">去创建项目</t-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import dayjs from "dayjs";
import axios from "@/utils/axios";
import { thumbUrl } from "@/utils/mediaUrl";
import projectStore from "@/stores/project";
import libraryArt from "@/assets/hero/library-art.webp";
import { creativePreferenceLabel } from '../../../../../shared/creativePreference';
import Pager from "@/components/Pager.vue";
interface AssetProject {
  id: string | number;
  name: string;
  intro?: string;
  projectType?: string;
  artStyle?: string | null;
  createTime?: number;
  updatedAt?: number;
  progress?: { asset?: { done?: number; total?: number } };
  [key: string]: any;
}

const router = useRouter();
const { allProject, project } = storeToRefs(projectStore());
const loading = ref(true);
const searchText = ref("");
const projects = computed(() => allProject.value as unknown as AssetProject[]);
const filteredProjects = computed(() => {
  const keyword = searchText.value.trim().toLowerCase();
  if (!keyword) return projects.value;
  return projects.value.filter((item) => `${item.name} ${item.intro || ""} ${item.artStyle || ""}`.toLowerCase().includes(keyword));
});

function assetTotal(item: AssetProject) {
  return Number(item.progress?.asset?.total || 0);
}

/** 项目库分页：3 列卡片每页 9 个，翻页后卡片编号接着全局序号往下排。 */
const PAGE_SIZE = 9;
const page = ref(1);
const safePage = computed(() => Math.min(Math.max(1, page.value), Math.max(1, Math.ceil(filteredProjects.value.length / PAGE_SIZE))));
const pagedProjects = computed(() => {
  const start = (safePage.value - 1) * PAGE_SIZE;
  return filteredProjects.value.slice(start, start + PAGE_SIZE);
});
watch(searchText, () => { page.value = 1; });
watch(() => filteredProjects.value.length, () => { page.value = 1; });

/** 后端 getProject 附带的资产缩略图（最多 4 张），有出图项目直接铺图墙 */
function coverThumbs(item: AssetProject): string[] {
  return (item.assetPreviews ?? []).slice(0, 4);
}

function assetDone(item: AssetProject) {
  return Number(item.progress?.asset?.done || 0);
}

function assetPercent(item: AssetProject) {
  const total = assetTotal(item);
  return total ? Math.min(100, Math.round((assetDone(item) / total) * 100)) : 0;
}

function formatDate(value?: number) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "尚未编辑";
}

async function loadProjects() {
  loading.value = true;
  try {
    const { data } = await axios.post("/project/getProject");
    allProject.value = Array.isArray(data) ? data : [];
  } catch (error: any) {
    window.$message?.error(error?.message || "项目列表加载失败");
    allProject.value = [];
  } finally {
    loading.value = false;
  }
}

function openProject(item: AssetProject) {
  project.value = item as any;
  router.push({ path: "/assets", query: { projectId: String(item.id) } });
}

onMounted(loadProjects);
</script>

<style scoped lang="scss">
.projectLibrary { min-height:100%; padding:18px 34px 42px; background:var(--xoi-workspace-bg,#faf8f6); }
.libraryHero { position:relative; min-height:150px; display:flex; align-items:center; justify-content:space-between; overflow:hidden; gap:28px; padding:28px 34px; border:1px solid #ecdfd4; border-radius:20px; background:radial-gradient(circle at 88% 0%,rgba(255,166,107,.18),transparent 30%),linear-gradient(118deg,#fffaf4,#fff5ea 60%,#fdeedd); box-shadow:0 14px 34px rgba(74,56,42,.06); }
.libraryHero:after { position:absolute; right:-90px; bottom:-145px; width:430px; height:280px; border:1px solid rgba(238,111,63,.14); border-radius:50%; box-shadow:0 0 0 24px rgba(238,111,63,.04),0 0 0 48px rgba(238,111,63,.025); content:""; }
.heroCopy { position:relative; z-index:1; }.heroEyebrow { display:flex; align-items:center; gap:8px; color:#b06a3d; font-size:10px; font-weight:750; letter-spacing:.16em; }.heroEyebrow i { width:7px; height:7px; border-radius:50%; background:#f16d37; box-shadow:0 0 0 4px rgba(241,109,55,.13); }
.libraryHero h1 { margin:10px 0 7px; color:#33291f; font-size:32px; line-height:1.05; letter-spacing:-.05em; }.libraryHero p { max-width:650px; margin:0; color:#8a7a6c; font-size:13.5px; line-height:1.6; }.heroNotes { display:flex; gap:18px; margin-top:16px; color:#93826f; font-size:12px; }.heroNotes span { display:inline-flex; align-items:center; gap:5px; }.heroNotes .t-icon { color:#e87949; }
.heroVisual { position:relative; z-index:1; width:250px; height:140px; margin-right:14px; flex:none; }
.heroArt { width:100%; height:100%; padding:7px; border:1px solid #f0e3d6; border-radius:14px; background:#fff; box-shadow:0 14px 30px rgba(86,56,32,.16),0 3px 8px rgba(86,56,32,.08); transform:rotate(2.4deg); }
.heroArt img { width:100%; height:100%; border-radius:9px; object-fit:cover; object-position:26% center; display:block; }
.heroStats { position:absolute; left:-26px; bottom:-12px; z-index:2; min-width:104px; padding:12px 14px 10px; border:1px solid rgba(233,99,43,.16); border-radius:14px; background:rgba(255,255,255,.9); text-align:center; box-shadow:0 10px 22px rgba(86,63,53,.12); transform:rotate(-2deg); }
.heroStats strong { display:block; color:#ee6a34; font-size:26px; font-weight:650; line-height:1; }.heroStats span { display:block; margin-top:6px; color:#777482; font-size:11px; }
.libraryToolbar { display:flex; align-items:center; justify-content:space-between; gap:18px; margin:18px 0; padding:14px 20px; border:1px solid #eee7e2; border-radius:14px; background:#fff; }.toolbarTitle { display:flex; flex-direction:column; gap:3px; }.toolbarTitle span { color:#b3a79c; font-size:9px; font-weight:750; letter-spacing:.16em; }.toolbarTitle strong { color:#302b28; font-size:17px; }.toolbarTitle small { color:#8d8177; font-size:12px; }.projectSearch { width:280px; }.projectSearch :deep(.t-input) { height:38px; border-radius:10px; background:#fffdfb; border-color:#eee0d5; }
.projectGrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); align-items:stretch; gap:18px; }.projectAssetCard { padding:0; overflow:hidden; border:1px solid #eee7e2; border-radius:16px; background:#fff; box-shadow:0 3px 12px rgba(48,43,40,.05); color:inherit; font:inherit; text-align:left; cursor:pointer; transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease; }.projectAssetCard:hover { transform:translateY(-3px); border-color:#e6c3ab; box-shadow:0 12px 28px rgba(48,43,40,.1); }
.cardVisual { position:relative; height:110px; display:flex; align-items:flex-end; justify-content:space-between; padding:16px 20px; color:#fff; background:linear-gradient(135deg,#3f3b48,#27242f); overflow:hidden; }
.cardVisual.novel { background:linear-gradient(135deg,#6b4a35,#452e21); }
.cardVisual.script { background:linear-gradient(135deg,#f78a4e,#e0641f); }
.cardVisual .thumbWall { position:absolute; inset:0; display:grid; grid-template-columns:repeat(4,1fr); }
.cardVisual .thumbWall img { width:100%; height:100%; object-fit:cover; }
.cardVisual .thumbWall img:first-child:last-child { grid-column:1/-1; }
.cardVisual .visualShade { position:absolute; inset:0; background:linear-gradient(180deg,rgba(28,20,14,.08),rgba(28,20,14,.55)); }
.cardVisual .visualMeta { position:relative; z-index:1; display:flex; flex-direction:column; gap:8px; }
.cardVisual span { font-size:10px; letter-spacing:.16em; opacity:.86; }
.cardVisual b { max-width:200px; overflow:hidden; color:rgba(255,255,255,.78); font-size:11px; font-weight:400; text-overflow:ellipsis; white-space:nowrap; }
.cardVisual strong { position:relative; z-index:1; font-size:36px; font-weight:500; opacity:.82; }
.cardTitleRow { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 20px 8px; }.cardTitleRow > strong { overflow:hidden; color:#302b28; font-size:18px; text-overflow:ellipsis; white-space:nowrap; }.cardArrow { color:#e76a36; font-size:18px; }.projectAssetCard > p { min-height:40px; margin:0; padding:0 20px; overflow:hidden; color:#7c7169; font-size:13px; line-height:20px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }.assetProgress { margin:16px 20px 0; padding:12px 14px; border-radius:12px; background:#faf6f1; }.assetProgress > div:first-child { display:flex; justify-content:space-between; color:#8d8177; font-size:12px; }.assetProgress b { color:#302b28; }.progressTrack { height:5px; margin-top:9px; overflow:hidden; border-radius:999px; background:#efe6db; }.progressTrack i { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#ff8847,#f26432); }.projectAssetCard footer { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:16px; padding:14px 20px; border-top:1px solid #f4ece4; color:#a3988d; font-size:11px; }.projectAssetCard footer span,.projectAssetCard footer b { display:flex; align-items:center; gap:5px; }.projectAssetCard footer b { color:#e9632b; font-size:12px; }.libraryState { min-height:280px; display:grid; place-items:center; }.emptyState { align-content:center; gap:10px; color:#8d8177; }.emptyState strong { color:#4c433d; font-size:18px; }.emptyState span { font-size:13px; }
@media(max-width:760px){.projectLibrary{padding:16px}.libraryHero{align-items:flex-start;padding:24px}.heroVisual{display:none}.heroNotes{flex-direction:column;gap:8px}.libraryToolbar{align-items:stretch;flex-direction:column}.projectSearch{width:100%}.projectGrid{grid-template-columns:1fr}}
</style>
