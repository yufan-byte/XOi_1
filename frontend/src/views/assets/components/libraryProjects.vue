<template>
  <section class="projectLibrary">
    <header class="libraryHero">
      <div>
        <span>XOi PROJECT ASSET LIBRARY</span>
        <h1>项目资产库</h1>
        <p>资产按项目隔离管理。先选择项目，再查看该项目里的角色、场景、道具和剧本归属。</p>
      </div>
      <div class="heroStats">
        <strong>{{ projects.length }}</strong>
        <span>个创作项目</span>
      </div>
    </header>

    <div class="libraryToolbar">
      <div>
        <strong>选择项目</strong>
        <span>不同项目的资产不会混在一起</span>
      </div>
      <t-input v-model="searchText" clearable placeholder="搜索项目名称" style="width: 260px">
        <template #prefix><t-icon name="search" /></template>
      </t-input>
    </div>

    <div v-if="loading" class="libraryState">
      <t-loading size="small" text="正在读取项目资产…" />
    </div>

    <div v-else-if="filteredProjects.length" class="projectGrid">
      <button v-for="(item, index) in filteredProjects" :key="item.id" type="button" class="projectAssetCard" @click="openProject(item)">
        <div class="cardVisual" :class="item.projectType === 'novel' ? 'novel' : 'script'">
          <span>{{ item.projectType === "novel" ? "NOVEL PROJECT" : "SCRIPT PROJECT" }}</span>
          <strong>{{ String(index + 1).padStart(2, "0") }}</strong>
        </div>
        <div class="cardTitleRow">
          <strong>{{ item.name || "未命名项目" }}</strong>
          <t-tag size="small" variant="light">{{ item.projectType === "novel" ? "小说改编" : "剧本创作" }}</t-tag>
        </div>
        <p>{{ item.intro || "暂无项目简介" }}</p>
        <div class="assetProgress">
          <div>
            <span>项目资产</span>
            <b>{{ assetDone(item) }} / {{ assetTotal(item) }}</b>
          </div>
          <div class="progressTrack"><i :style="{ width: assetPercent(item) + '%' }"></i></div>
        </div>
        <footer>
          <span><t-icon name="time" />{{ formatDate(item.updatedAt || item.createTime) }}</span>
          <b>进入资产库 <t-icon name="arrow-right" /></b>
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
.projectLibrary { min-height: 100%; padding: 24px 32px 40px; background: radial-gradient(circle at 94% 0, rgba(255,174,119,.15), transparent 24%), linear-gradient(180deg,#faf9fb,#f5f5f7); }
.libraryHero { min-height: 150px; display: flex; align-items: center; justify-content: space-between; gap: 28px; padding: 28px 34px; border: 1px solid rgba(89,76,148,.11); border-radius: 24px; background: radial-gradient(circle at 86% 10%,rgba(255,151,91,.27),transparent 25%),linear-gradient(132deg,#fff,#f6f2ff 58%,#fff3ea); box-shadow: 0 15px 38px rgba(58,49,99,.07); }
.libraryHero > div:first-child > span { color:#e76c2d; font-size:10px; font-weight:750; letter-spacing:.17em; }
.libraryHero h1 { margin:9px 0 7px; color:#292733; font-size:34px; line-height:1.05; letter-spacing:-.04em; }
.libraryHero p { margin:0; color:#777482; font-size:14px; }
.heroStats { min-width: 142px; padding: 20px 24px; border: 1px solid rgba(233,99,43,.16); border-radius: 20px; background: rgba(255,255,255,.7); text-align:center; }
.heroStats strong { display:block; color:#ee6a34; font-size:34px; line-height:1; }.heroStats span { display:block; margin-top:8px; color:#777482; font-size:12px; }
.libraryToolbar { display:flex; align-items:center; justify-content:space-between; gap:18px; margin:16px 0; padding:14px 18px; border:1px solid #e8e7ec; border-radius:16px; background:rgba(255,255,255,.9); }
.libraryToolbar > div { display:flex; flex-direction:column; gap:3px; }.libraryToolbar strong { color:#2d2a37; font-size:15px; }.libraryToolbar span { color:#8a8791; font-size:12px; }
.projectGrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(315px,1fr)); gap:18px; }
.projectAssetCard { padding:0; overflow:hidden; border:1px solid #e7e5eb; border-radius:20px; background:#fff; box-shadow:0 10px 28px rgba(40,37,54,.055); color:inherit; font:inherit; text-align:left; cursor:pointer; transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease; }
.projectAssetCard:hover { transform:translateY(-3px); border-color:rgba(239,100,48,.35); box-shadow:0 18px 38px rgba(40,37,54,.1); }
.cardVisual { height:88px; display:flex; align-items:flex-end; justify-content:space-between; padding:16px 20px; color:#fff; background:linear-gradient(135deg,#3f3b48,#27242f); }.cardVisual.novel { background:linear-gradient(135deg,#3e3a48,#25232d); }.cardVisual.script { background:linear-gradient(135deg,#7062cf,#5146a7); }
.cardVisual span { align-self:flex-start; font-size:10px; letter-spacing:.16em; }.cardVisual strong { font-size:32px; font-weight:500; opacity:.86; }
.cardTitleRow { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:18px 20px 8px; }.cardTitleRow > strong { overflow:hidden; color:#282631; font-size:18px; text-overflow:ellipsis; white-space:nowrap; }
.projectAssetCard > p { min-height:38px; margin:0; padding:0 20px; overflow:hidden; color:#7b7883; font-size:13px; line-height:19px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.assetProgress { margin:16px 20px 0; padding:12px 14px; border-radius:12px; background:#f8f7fa; }.assetProgress > div:first-child { display:flex; justify-content:space-between; color:#777482; font-size:12px; }.assetProgress b { color:#35323e; }.progressTrack { height:5px; margin-top:9px; overflow:hidden; border-radius:999px; background:#e6e3e9; }.progressTrack i { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#ff8847,#f26432); }
.projectAssetCard footer { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:16px; padding:14px 20px; border-top:1px solid #efedf1; color:#9a969f; font-size:12px; }.projectAssetCard footer span,.projectAssetCard footer b { display:flex; align-items:center; gap:5px; }.projectAssetCard footer b { color:#e9632b; font-size:13px; }
.libraryState { min-height:280px; display:grid; place-items:center; }.emptyState { align-content:center; gap:10px; color:#8a8791; }.emptyState strong { color:#35323e; font-size:18px; }.emptyState span { font-size:13px; }
@media(max-width:760px){.projectLibrary{padding:16px}.libraryHero{align-items:flex-start;padding:24px}.heroStats{display:none}.libraryToolbar{align-items:stretch;flex-direction:column}.libraryToolbar :deep(.t-input){width:100%!important}.projectGrid{grid-template-columns:1fr}}
</style>
