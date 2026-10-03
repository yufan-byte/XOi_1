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
        <div class="visualRing ringOne"></div><div class="visualRing ringTwo"></div>
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
      <button v-for="(item, index) in filteredProjects" :key="item.id" type="button" class="projectAssetCard" @click="openProject(item)">
        <div class="cardVisual" :class="item.projectType === 'novel' ? 'novel' : 'script'">
          <div><span>{{ item.projectType === "novel" ? "NOVEL PROJECT" : "SCRIPT PROJECT" }}</span><b>{{ item.artStyle || "XOi Studio" }}</b></div>
          <strong>{{ String(index + 1).padStart(2, "0") }}</strong>
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
import projectStore from "@/stores/project";

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
.projectLibrary { min-height: 100%; padding: 18px 34px 42px; background: radial-gradient(circle at 90% 0, rgba(255,174,119,.12), transparent 22%), linear-gradient(180deg,#fbfafc,#f5f4f7); }
.libraryHero { position:relative; min-height:176px; display:flex; align-items:center; justify-content:space-between; overflow:hidden; gap:28px; padding:30px 36px; border:1px solid rgba(89,76,148,.11); border-radius:24px; background:linear-gradient(112deg,#fff 0%,#faf8ff 58%,#fff1e8 100%); box-shadow:0 14px 34px rgba(58,49,99,.055); }
.libraryHero:after { position:absolute; right:-90px; bottom:-145px; width:430px; height:280px; border:1px solid rgba(238,111,63,.14); border-radius:50%; box-shadow:0 0 0 24px rgba(238,111,63,.04),0 0 0 48px rgba(238,111,63,.025); content:""; }
.heroCopy { position:relative; z-index:1; }.heroEyebrow { display:flex; align-items:center; gap:8px; color:#e76c2d; font-size:10px; font-weight:750; letter-spacing:.16em; }.heroEyebrow i { width:7px; height:7px; border-radius:50%; background:#f16d37; box-shadow:0 0 0 4px rgba(241,109,55,.13); }
.libraryHero h1 { margin:10px 0 7px; color:#292733; font-size:36px; line-height:1.05; letter-spacing:-.05em; }.libraryHero p { max-width:650px; margin:0; color:#777482; font-size:14px; line-height:1.6; }.heroNotes { display:flex; gap:18px; margin-top:18px; color:#96919c; font-size:12px; }.heroNotes span { display:inline-flex; align-items:center; gap:5px; }.heroNotes .t-icon { color:#e87949; }
.heroVisual { position:relative; z-index:1; width:190px; height:126px; margin-right:25px; }.heroStats { position:absolute; right:10px; top:5px; z-index:2; min-width:116px; padding:18px 18px 15px; border:1px solid rgba(233,99,43,.16); border-radius:18px; background:rgba(255,255,255,.78); text-align:center; box-shadow:0 10px 25px rgba(86,63,53,.06); }.heroStats strong { display:block; color:#ee6a34; font-size:36px; font-weight:650; line-height:1; }.heroStats span { display:block; margin-top:8px; color:#777482; font-size:12px; }.visualRing { position:absolute; border:1px solid rgba(229,102,57,.2); border-radius:50%; }.ringOne { right:-5px; top:-10px; width:146px; height:146px; }.ringTwo { right:19px; top:14px; width:98px; height:98px; border-color:rgba(110,93,185,.18); }
.libraryToolbar { display:flex; align-items:center; justify-content:space-between; gap:18px; margin:18px 0; padding:16px 20px; border:1px solid #e8e6ec; border-radius:16px; background:rgba(255,255,255,.82); }.toolbarTitle { display:flex; flex-direction:column; gap:3px; }.toolbarTitle span { color:#aaa5af; font-size:9px; font-weight:750; letter-spacing:.16em; }.toolbarTitle strong { color:#2d2a37; font-size:18px; }.toolbarTitle small { color:#8a8791; font-size:12px; }.projectSearch { width:280px; }.projectSearch :deep(.t-input) { height:40px; border-radius:11px; background:#faf9fb; }
.projectGrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,410px)); align-items:start; gap:18px; }.projectAssetCard { padding:0; overflow:hidden; border:1px solid #e7e5eb; border-radius:18px; background:#fff; box-shadow:0 9px 24px rgba(40,37,54,.05); color:inherit; font:inherit; text-align:left; cursor:pointer; transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease; }.projectAssetCard:hover { transform:translateY(-3px); border-color:rgba(239,100,48,.35); box-shadow:0 16px 34px rgba(40,37,54,.1); }
.cardVisual { height:98px; display:flex; align-items:flex-end; justify-content:space-between; padding:16px 20px; color:#fff; background:linear-gradient(135deg,#3f3b48,#27242f); }.cardVisual.novel { background:linear-gradient(135deg,#3e3a48,#25232d); }.cardVisual.script { background:linear-gradient(135deg,#7164c9,#4e439d); }.cardVisual > div { display:flex; flex-direction:column; gap:8px; }.cardVisual span { font-size:10px; letter-spacing:.16em; opacity:.86; }.cardVisual b { max-width:200px; overflow:hidden; color:rgba(255,255,255,.72); font-size:11px; font-weight:400; text-overflow:ellipsis; white-space:nowrap; }.cardVisual strong { font-size:36px; font-weight:500; opacity:.82; }
.cardTitleRow { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:18px 20px 8px; }.cardTitleRow > strong { overflow:hidden; color:#282631; font-size:19px; text-overflow:ellipsis; white-space:nowrap; }.cardArrow { color:#e76a36; font-size:18px; }.projectAssetCard > p { min-height:40px; margin:0; padding:0 20px; overflow:hidden; color:#7b7883; font-size:13px; line-height:20px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }.assetProgress { margin:16px 20px 0; padding:12px 14px; border-radius:12px; background:#f8f7fa; }.assetProgress > div:first-child { display:flex; justify-content:space-between; color:#777482; font-size:12px; }.assetProgress b { color:#35323e; }.progressTrack { height:5px; margin-top:9px; overflow:hidden; border-radius:999px; background:#e6e3e9; }.progressTrack i { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#ff8847,#f26432); }.projectAssetCard footer { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:16px; padding:14px 20px; border-top:1px solid #efedf1; color:#9a969f; font-size:11px; }.projectAssetCard footer span,.projectAssetCard footer b { display:flex; align-items:center; gap:5px; }.projectAssetCard footer b { color:#e9632b; font-size:12px; }.libraryState { min-height:280px; display:grid; place-items:center; }.emptyState { align-content:center; gap:10px; color:#8a8791; }.emptyState strong { color:#35323e; font-size:18px; }.emptyState span { font-size:13px; }
@media(max-width:760px){.projectLibrary{padding:16px}.libraryHero{align-items:flex-start;padding:24px}.heroVisual{display:none}.heroNotes{flex-direction:column;gap:8px}.libraryToolbar{align-items:stretch;flex-direction:column}.projectSearch{width:100%}.projectGrid{grid-template-columns:1fr}}
</style>
