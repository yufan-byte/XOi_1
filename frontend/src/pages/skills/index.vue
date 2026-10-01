<template>
  <div class="skills-page">
    <header class="skills-header">
      <h1>Skills</h1>
      <t-input class="skills-search" v-model="keyword" clearable placeholder="搜索 Skill"><template #prefix><t-icon name="search" /></template></t-input>
    </header>
    <div class="skills-toolbar"><nav class="skills-tabs"><button v-for="tab in tabs" :key="tab.id" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">{{ tab.label }}<small>{{ categoryCount(tab.id) }}</small></button></nav><div class="skills-actions"><button type="button" class="action-secondary" disabled title="暂未开放上传功能"><i-upload />上传 Skill</button><button type="button" class="action-primary" @click="$router.push('/aiAssistant')"><i-send />前往创作对话</button></div></div>
    <section v-if="activeTab === 'all' && filteredInstalledSkills.length" class="skill-section"><h2>已安装 <span>{{ filteredInstalledSkills.length }}</span></h2><div class="skill-grid"><article v-for="skill in filteredInstalledSkills" :key="skill.path" class="skill-card"><div class="skill-art" :class="skill.tone">{{ skill.emoji }}</div><div class="skill-info"><div><strong>{{ skill.name }}</strong><span>{{ skill.version }}</span></div><p :title="skill.desc">{{ skill.desc }}</p><small>{{ skill.kind }}</small></div><button class="skill-toggle on" title="停用" @click="toggleInstalled(skill)"><span></span></button></article></div></section>
    <section class="skill-section"><h2>{{ sectionTitle }} <span>{{ marketSkills.length }}</span></h2><div class="skill-grid"><article v-for="skill in marketSkills" :key="skill.path" class="skill-card"><div class="skill-art" :class="skill.tone">{{ skill.emoji }}</div><div class="skill-info"><div><strong>{{ skill.name }}</strong><span>{{ skill.version }}</span></div><p :title="skill.desc">{{ skill.desc }}</p><small>{{ skill.kind }}</small></div><button v-if="installedPaths.has(skill.path)" class="skill-toggle on" title="停用" @click="toggleInstalled(skill)"><span></span></button><button v-else class="install-btn" title="安装" @click="installSkill(skill)">+</button></article></div></section>
    <div v-if="!marketSkills.length && !(activeTab === 'all' && filteredInstalledSkills.length)" class="skills-empty">没有匹配的 Skill</div>
  </div>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import userStore from "@/stores/user";
type Skill = { path: string; name: string; desc: string; version: string; kind: string; emoji: string; tone: string };
const keyword = ref("");
const activeTab = ref("all");
const tabs = [{ id: "all", label: "全部" }, { id: "installed", label: "已安装" }, { id: "workflow", label: "短剧工作流" }, { id: "writing", label: "文学写作" }, { id: "director", label: "导演叙事" }, { id: "visual", label: "视觉风格" }];
const { userId } = storeToRefs(userStore());
const installedSkillsKey = computed(() => `xoi_installed_creative_skills_v1:${userId.value || 'anonymous'}`);
const installedSkills = ref<Skill[]>([]);
const catalog = ref<Skill[]>([]);
const filteredInstalledSkills = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  return installedSkills.value.filter(s => !q || `${s.name} ${s.desc} ${s.kind}`.toLowerCase().includes(q));
});
const installedPaths = computed(() => new Set(installedSkills.value.map((s) => s.path)));
const marketSkills = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  let list = activeTab.value === "installed" ? catalog.value.filter((s) => installedPaths.value.has(s.path)) : activeTab.value === "all" ? catalog.value.filter((s) => !installedPaths.value.has(s.path)) : catalog.value.filter((s) => s.kind === ({ workflow: "短剧工作流", writing: "文学写作", director: "导演叙事", visual: "视觉风格" } as Record<string, string>)[activeTab.value]);
  return q ? list.filter((s) => `${s.name} ${s.desc} ${s.kind}`.toLowerCase().includes(q)) : list;
});
const sectionTitle = computed(() => ({ all: "未安装", installed: "我的 Skills", workflow: "短剧工作流", writing: "文学写作", director: "导演叙事", visual: "视觉风格" } as Record<string, string>)[activeTab.value]);
function categoryCount(id: string) { if (id === "all") return catalog.value.length; if (id === "installed") return installedSkills.value.length; const kind = ({ workflow: "短剧工作流", writing: "文学写作", director: "导演叙事", visual: "视觉风格" } as Record<string, string>)[id]; return catalog.value.filter((s) => s.kind === kind).length; }
const emoji = ["🎬", "✦", "🎨", "🧩", "✍️", "🎞️", "💡", "🪄"];
const communitySkillNames: Record<string, string> = {
  "short-drama": "短剧创作总控",
  "short-drama-novel-analyze": "长篇原著分析",
  "short-drama-develop": "故事开发与分集规划",
  "short-drama-write": "短剧剧本创作",
  "short-drama-assets": "角色场景与道具设定",
  "short-drama-image-prompts": "图片提示词创作",
  "short-drama-storyboard": "导演分镜设计",
  "short-drama-video-prompts": "视频提示词创作",
  "short-drama-produce": "媒体生产执行",
  "short-drama-review": "短剧项目审查",
};
function makeSkill(path: string, index: number, kind: string, name?: string, desc?: string): Skill {
  const clean = path.split("/").pop()?.replace(/\.md$/, "") || path;
  return { path, name: name || clean.replace(/[_-]+/g, " "), desc: desc || `${kind}创作工作流，可在对话与项目中搭配使用`, version: "1.0.0", kind, emoji: emoji[index % emoji.length], tone: ["orange", "violet", "blue", "green"][index % 4] };
}
function parseSkillFrontmatter(raw: string): { name?: string; description?: string } {
  const frontmatter = raw.match(/^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1] || "";
  const name = frontmatter.match(/^name:\s*["']?(.+?)["']?\s*$/m)?.[1];
  const lines = frontmatter.split(/\r?\n/);
  const descriptionLine = lines.findIndex((line) => /^description:\s*/.test(line));
  if (descriptionLine < 0) return { name };
  const first = lines[descriptionLine].replace(/^description:\s*/, "").replace(/^[>|][-+]?\d*\s*$/, "").replace(/^["']|["']$/g, "").trim();
  const continuation: string[] = [];
  for (let i = descriptionLine + 1; i < lines.length && (/^\s+/.test(lines[i]) || !lines[i].trim()); i++) continuation.push(lines[i].trim());
  return { name, description: [first, ...continuation].filter(Boolean).join(" ") };
}
async function loadSkills() {
  try {
    const [{ data: files }, { data: visuals }, { data: directors }] = await Promise.all([
      axios.post<string[]>("/setting/skillManagement/getSkillList"), axios.post<any[]>("/project/getVisualManual"), axios.post<any[]>("/project/queryDirectorManual"),
    ]);
    const writingNames: Record<string, [string, string]> = { "script_execution_adaptation.md": ["小说改编策划", "把小说内容提炼为适合短剧表达的改编方案"], "script_execution_skeleton.md": ["故事骨架设计", "梳理人物目标、冲突升级与完整故事结构"], "script_execution_script.md": ["短剧剧本写作", "按场次生成可拍摄、可继续修改的规范剧本"], "storyboard_prompt_techniques.md": ["分镜提示词编写", "将文字剧情转成稳定、清晰的镜头提示词"], "storyboard_table_techniques.md": ["分镜表规划", "组织景别、运镜、时长、对白与画面信息"] };
    const raw = (files || []).filter((p) => writingNames[p.split("/").pop() || ""]);
    const base = raw.map((p, i) => { const meta = writingNames[p.split("/").pop() || ""]; return makeSkill(p, i, "文学写作", meta[0], meta[1]); });
    const communityPaths = (files || []).filter((p) => /^community\/drama-skills\/[^/]+\/SKILL\.md$/i.test(p));
    const communitySkills = await Promise.all(communityPaths.map(async (path, i) => {
      try {
        const { data } = await axios.post<string>("/setting/skillManagement/getSkillContent", { path });
        const meta = parseSkillFrontmatter(data || "");
        const displayName = communitySkillNames[meta.name || ""] || meta.name;
        return { ...makeSkill(path, i + 2, "短剧工作流", displayName, meta.description), version: "0.6.5" };
      } catch { return makeSkill(path, i + 2, "短剧工作流"); }
    }));
    const visualSkills = (visuals || []).slice(0, 12).map((v, i) => makeSkill(`art_skills/${v.stylePath}/README.md`, i, "视觉风格", v.name?.replace(/^#\s*/, ""), "锁定画面质感、色彩体系与整体美术方向"));
    const directorSkills = (directors || []).slice(0, 10).map((v, i) => makeSkill(`story_skills/${v.directorManual}/README.md`, i + 3, "导演叙事", v.name?.replace(/^#\s*/, ""), "选择叙事节奏、镜头语言与情绪基调"));
    catalog.value = [...communitySkills, ...base, ...directorSkills, ...visualSkills].filter((s, i, arr) => arr.findIndex((x) => x.name.trim().toLowerCase() === s.name.trim().toLowerCase()) === i);
    const saved = JSON.parse(localStorage.getItem(installedSkillsKey.value) || "[]");
    installedSkills.value = Array.isArray(saved) ? saved.filter((s: Skill) => catalog.value.some((item) => item.path === s.path)) : [];
  } catch { catalog.value = []; }
}
function persistInstalled() { localStorage.setItem(installedSkillsKey.value, JSON.stringify(installedSkills.value)); }
function installSkill(skill: Skill) { if (!installedPaths.value.has(skill.path)) { installedSkills.value = [...installedSkills.value, skill]; persistInstalled(); window.$message.success(`已安装 ${skill.name}，可在创作对话中调用`); } }
function toggleInstalled(skill: Skill) { installedSkills.value = installedSkills.value.filter((s) => s.path !== skill.path); persistInstalled(); }
onMounted(loadSkills);
</script>

<style scoped>
.skills-page{box-sizing:border-box;height:100%;overflow-y:auto;padding:28px 30px 64px;background:#fafafa;color:#292929;font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif;scrollbar-gutter:stable}
.skills-header{display:flex;align-items:center;gap:36px;margin-bottom:34px}
.skills-header h1{margin:0;font-size:26px;font-weight:600;letter-spacing:-.6px}
.skills-search{width:min(340px,65%)}
.skills-search :deep(.t-input){border-color:transparent;background:transparent;box-shadow:none;font-size:17px}
.skills-search :deep(.t-input:hover),.skills-search :deep(.t-input--focused){border-color:#dedede;background:#fff}
.skills-search :deep(.t-input__prefix){color:#aaa;margin-right:10px}
.skills-toolbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:20px;margin-bottom:32px}
.skills-tabs{display:flex;flex-wrap:wrap;gap:10px}
.skills-tabs button{border:0;border-radius:17px;background:#f0f0f0;color:#777;padding:13px 17px;font:inherit;font-size:14px;cursor:pointer;transition:background .16s}
.skills-tabs button:hover{background:#e7e7e7}
.skills-tabs button.active{background:#ff8010;color:#fff}
.skills-tabs small{margin-left:7px;opacity:.65;font-size:11px}
.skills-actions{display:flex;align-items:center;gap:10px}
.skills-actions button{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;height:42px;padding:0 16px;border-radius:15px;font:inherit;font-size:14px;cursor:pointer}
.action-secondary{background:#fff;color:#333;border:1px solid #d9d9d9}
.action-primary{background:#252525;color:#fff;border:1px solid #252525}
.skills-actions button:disabled{opacity:.45;cursor:not-allowed}
.skill-section{margin-top:30px}
.skill-section h2{display:flex;align-items:center;gap:10px;margin:0 0 24px;font-size:18px;font-weight:600}
.skill-section h2 span{font-size:12px;font-weight:400;color:#999}
.skill-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.skill-card{position:relative;display:flex;align-items:center;gap:14px;min-width:0;min-height:140px;box-sizing:border-box;padding:22px;border-radius:24px;background:#f0f0f0;transition:background .18s,box-shadow .18s}
.skill-card:hover{background:#ebebeb;box-shadow:0 4px 16px #00000005}
.skill-art{display:grid;place-items:center;flex:none;width:82px;height:82px;overflow:hidden;border-radius:12px;font-size:38px}
.skill-art.orange{background:#ffdbad;color:#b9520f}
.skill-art.violet{background:#ded5fc;color:#7548b8}
.skill-art.blue{background:#c4e6ff;color:#146799}
.skill-art.green{background:#bfe5d4;color:#11694b}
.skill-info{flex:1;min-width:0;align-self:center}
.skill-info>div{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 9px;padding-right:40px}
.skill-info strong{font-size:17px;font-weight:600;line-height:1.45;overflow-wrap:anywhere}
.skill-info span{font-size:13px;color:#929292}
.skill-info p{margin:8px 0 5px;color:#787878;font-size:14px;line-height:1.7;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.skill-info small{font-size:11px;color:#aaa}
.skill-toggle,.install-btn{position:absolute;right:21px;top:25px;display:grid;place-items:center;border:0;cursor:pointer}
.skill-toggle{width:36px;height:19px;border-radius:20px;background:#ffa15c}
.skill-toggle span{width:15px;height:15px;border-radius:50%;background:#fff;margin-left:15px}
.install-btn{width:33px;height:33px;border-radius:9px;background:#ddd;color:#666;font-size:27px;font-weight:300;line-height:1}
.install-btn:hover{background:#ff8010;color:#fff}
button:focus-visible{outline:2px solid #ff8010;outline-offset:3px}
.skills-empty{text-align:center;padding:64px 20px;color:#999}
@media(min-width:1800px){.skill-card{min-height:160px;padding:26px}.skill-art{width:96px;height:96px}.skill-info strong{font-size:19px}.skill-info p{font-size:16px}}
@media(max-width:1350px){.skill-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:850px){.skills-page{padding:24px 20px 48px}.skills-toolbar{align-items:flex-start}.skills-actions{flex-wrap:wrap}.skill-card{padding:18px;gap:12px}.skill-art{width:64px;height:64px}.skill-info strong{font-size:15px}}
@media(max-width:640px){.skill-grid{grid-template-columns:1fr}.skills-header{gap:18px;margin-bottom:24px}.skills-tabs{gap:7px}.skills-tabs button{padding:10px 12px;font-size:13px}.skill-section h2{margin-bottom:16px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
