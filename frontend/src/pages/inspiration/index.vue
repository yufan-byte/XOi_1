<template>
  <main v-if="selectedIdea" class="inspiration-detail">
    <header class="detail-header">
      <button class="detail-back" type="button" aria-label="返回灵感盒" @click="backToGallery">←</button>
      <div class="detail-author"><span class="author-avatar">X</span><strong>XOi 灵感精选</strong><i></i><span>✦ {{ selectedIdea.views }} 次浏览</span></div>
      <div class="detail-actions"><button class="detail-canvas" type="button" @click.stop="sendIdeaToCanvas(selectedIdea)">发送到画布</button><button class="detail-same top" type="button" @click="useIdea(selectedIdea)">做同款 <b>→</b></button></div>
    </header>
    <section class="detail-stage">
      <aside class="detail-rail" aria-label="作品方案页">
        <button v-for="(frame,index) in detailFrames" :key="`${frame}-${index}`" type="button" :class="{active:activeFrame===index}" @click="activeFrame=index">
          <span>{{ index+1 }}</span><img :src="frame" :alt="`${selectedIdea.title} 方案 ${index+1}`" />
        </button>
      </aside>
      <div class="detail-preview"><img :src="detailFrames[activeFrame]" :alt="selectedIdea.title"/><button class="detail-same floating" type="button" @click="useIdea(selectedIdea)">✦ 做同款</button></div>
    </section>
    <article class="detail-copy">
      <span class="eyebrow">{{ selectedIdea.category }} · CREATIVE CASE</span>
      <h1>{{ selectedIdea.title }}</h1>
      <p>{{ selectedIdea.desc }}。这是一套可继续编辑的创作方向，包含视觉基调、构图语言与叙事氛围。点击“做同款”，XOi 会把该作品的创作方法带入对话，你可以继续更换题材、角色和风格。</p>
      <div><span>视觉方向</span><strong>{{ selectedIdea.category }}</strong><span>创作方式</span><strong>对话 + Skills + 无限画布</strong></div>
    </article>
  </main>
  <main v-else class="inspiration-page">
    <header class="inspiration-header">
      <div><span class="eyebrow">XOi CREATIVE GALLERY</span><h1>灵感盒</h1><p>从成品出发，找到下一次创作的画面、叙事和风格方向。</p></div>
      <label class="inspiration-search"><t-icon name="search"/><input v-model="keyword" placeholder="搜索作品、风格或创作方向" /></label>
    </header>
    <div class="inspiration-toolbar">
      <nav><button v-for="category in categories" :key="category" :class="{active:activeCategory===category}" @click="activeCategory=category">{{ category }}</button></nav>
      <span>{{ filteredItems.length }} 个灵感方向</span>
    </div>
    <section class="inspiration-grid" aria-label="创作灵感作品">
      <article v-for="(item,index) in filteredItems" :key="item.title" class="inspiration-card" @click="openIdea(item)">
        <div class="card-image" :class="item.ratio"><img :src="item.image" :alt="item.title" loading="lazy"/><span>{{ item.category }}</span><button type="button" @click.stop="sendIdeaToCanvas(item)">发送到画布</button></div>
        <div class="card-copy"><h2>{{ item.title }}</h2><p>{{ item.desc }}</p><div><span>XOi 灵感精选</span><small>✦ {{ item.views }}</small></div></div>
      </article>
    </section>
    <div v-if="!filteredItems.length" class="inspiration-empty">没有匹配的灵感，换个关键词试试。</div>
  </main>
</template>

<script setup lang="ts">
import anime90s from "@/assets/visual-presets/anime-90s.png";
import guochaoFantasy from "@/assets/visual-presets/guochao-fantasy.png";
import cyber3d from "@/assets/visual-presets/cyber-3d.png";
import clay from "@/assets/visual-presets/style-clay-stopmotion.png";
import animation3d from "@/assets/visual-presets/style-3d-animation.png";
import realUrban from "@/assets/visual-presets/style-real-urban.png";
import realAncient from "@/assets/visual-presets/style-real-ancient.png";
import flatDesign from "@/assets/visual-presets/style-flat-design.png";
import guofeng3d from "@/assets/visual-presets/style-guofeng-3d.png";
import guochao2d from "@/assets/visual-presets/style-guochao-2d.png";
import cinematic from "@/assets/visual-presets/style-real-urban-cinematic.png";
import romance from "@/assets/visual-presets/style-urban-romance-anime.png";
import japanese from "@/assets/visual-presets/style-90s-japan.png";
import guofengCyber from "@/assets/visual-presets/style-guofeng-cyber.png";
import { sendSingleToCanvas } from "@/utils/sendToCanvas";

type Idea={title:string;desc:string;category:string;image:string;ratio:string;views:string;prompt:string};
const router=useRouter();
const route=useRoute();
const keyword=ref("");
const activeCategory=ref("全部");
const activeFrame=ref(0);
const categories=["全部","角色与IP","影视与分镜","东方美学","摄影短片","品牌与广告","插画"];
const items:Idea[]=[
  {title:"STORM COAST",desc:"海岸风暴中的武士与浪潮，电影感视觉方案",category:"影视与分镜",image:"https://sign.miorausercontent.com/file/723540456720312/2026/09/08/6ukn7vfdnt28ie2gatzwr/video_cover_1788854017556.png?sign=c5cd44149c62380ca4e5cac2aed8df8f&t=1789106593&imageMogr2/quality/85/format/webp",ratio:"wide",views:"169",prompt:"参考 STORM COAST 的视觉方向，创作一组日本武士在暴风海岸的电影感分镜，保留强烈海浪、冷色天空与手绘版画质感。"},
  {title:"纸新娘",desc:"东方志怪人物设定与服装三视图",category:"角色与IP",image:"https://sign.miorausercontent.com/file/721423076613824/2026/09/02/mpjtp5ayc4jdo6yqjhh7w/async-task/xmJa2dDbKjFI3XNZ.png?sign=eab756a1d684507609302f1b9ec67321&t=1789106593&imageMogr2/quality/85/format/webp",ratio:"portrait",views:"678",prompt:"参考纸新娘作品，设计一位东方志怪纸艺新娘，输出正侧背三视图、服装材质、表情、关键道具和统一白底设定板。"},
  {title:"LEAK : THE WITCH OF BALI",desc:"巴厘岛女巫题材的暗黑电影海报",category:"影视与分镜",image:"https://sign.miorausercontent.com/file/721929753884445/2026/09/08/7r4ptpm7mjeiim2zkutzb/1788828436431-h9fu197gxns.png?sign=4082595444561ef090b68a6cf146bb19&t=1789106593&imageMogr2/thumbnail/800x1200%3E/quality/85/format=webp",ratio:"wide",views:"168",prompt:"创作一张巴厘岛女巫题材的暗黑电影海报，红黑主色、神秘面具、强烈中心构图，并给出标题字效和宣传文案。"},
  {title:"ANIME FANTASY BATTLE",desc:"高饱和幻想角色对战海报",category:"插画",image:"https://sign.miorausercontent.com/file/721491387084820/2026/09/02/sy2ll3u4yg5oomu2g4j4t/1788340737542-ncsnwsbnwv.jpg?sign=909b62e0a650434a9fed2045d6539fa9&t=1789106593&imageMogr2/quality/85/format=webp",ratio:"portrait",views:"490",prompt:"设计一张动漫幻想战斗海报，让两位风格对立的角色在同一画面中对峙，加入能量光效、冲突色彩和电影级标题排版。"},
  {title:"纸境新娘",desc:"以留白和服装轮廓完成东方志怪人物设定",category:"角色与IP",image:realAncient,ratio:"portrait",views:"1.8k",prompt:"参考东方志怪人物设定板的方式，为我设计一位纸艺新娘角色，包含正侧背三视图、服装材质、表情和关键道具。"},
  {title:"DARK OCEAN RPG",desc:"深海奇幻角色与环境的电影级概念设计",category:"影视与分镜",image:cyber3d,ratio:"wide",views:"1.3k",prompt:"构思一套深海奇幻 RPG 的电影级概念设计，先给世界规则、主角造型、核心场景和三组关键镜头。"},
  {title:"王朝角色设定板",desc:"人物、配色、饰品和表情集中在一张视觉板",category:"东方美学",image:guofeng3d,ratio:"tall",views:"2.1k",prompt:"为东方王朝题材男主制作综合设定板方案，包括四视图、表情、手部饰品、服装细节、色板和人物档案。"},
  {title:"青春窗边",desc:"自然光、胶片颗粒与克制叙事的青春短片",category:"摄影短片",image:japanese,ratio:"wide",views:"1.7k",prompt:"策划一支窗边自然光风格的青春短片，使用日系胶片质感，给出60秒剧情和逐镜头拍摄方案。"},
  {title:"月下国潮幻想",desc:"传统纹样与超现实空间结合的东方海报",category:"东方美学",image:guochaoFantasy,ratio:"portrait",views:"986",prompt:"设计一张月下国潮幻想海报，把传统纹样、神兽和超现实空间结合，给出构图、配色、材质和生成提示词。"},
  {title:"城市电影感",desc:"雨夜霓虹与人物情绪共同推动微短剧",category:"影视与分镜",image:cinematic,ratio:"wide",views:"1.5k",prompt:"为雨夜城市题材微短剧设计一段电影感开场，用霓虹、倒影和人物动作推进情绪，输出分镜表。"},
  {title:"都市心动故事",desc:"成熟都市关系中的暖色氛围和人物距离",category:"摄影短片",image:romance,ratio:"portrait",views:"824",prompt:"构思一部成熟都市情感短剧，用暖色摄影和人物空间距离表现关系变化，给出角色与前3集钩子。"},
  {title:"90年代动画企划",desc:"复古赛璐璐质感的角色与场景视觉系统",category:"插画",image:anime90s,ratio:"wide",views:"1.2k",prompt:"创建一套90年代赛璐璐动画企划，包括主角设定、代表场景、色彩规范和镜头语言。"},
  {title:"黏土奇遇记",desc:"手作材质、微缩布景与定格动画节奏",category:"影视与分镜",image:clay,ratio:"portrait",views:"679",prompt:"策划一支黏土定格动画短片，突出手作纹理和微缩布景，输出故事梗概、角色和12镜分镜。"},
  {title:"三维动画角色",desc:"明快体块与商业动画感的角色开发",category:"角色与IP",image:animation3d,ratio:"wide",views:"932",prompt:"设计一个适合商业动画的3D角色 IP，给出体块语言、配色、表情、动作和衍生品方向。"},
  {title:"城市纪实肖像",desc:"写实光影下的日常人物与生活切片",category:"摄影短片",image:realUrban,ratio:"portrait",views:"746",prompt:"制作一组城市纪实肖像方案，以普通人的生活切片为主题，给出选景、人物、光线和十张照片脚本。"},
  {title:"新国潮品牌视觉",desc:"二维东方符号转化为年轻品牌语言",category:"品牌与广告",image:guochao2d,ratio:"wide",views:"1.1k",prompt:"为年轻消费品牌设计新国潮视觉系统，把东方符号转成现代二维语言，输出 Logo、色彩、图形和海报方向。"},
  {title:"极简信息插画",desc:"几何图形和有限配色构建清晰叙事",category:"插画",image:flatDesign,ratio:"portrait",views:"583",prompt:"用极简几何插画设计一组信息叙事海报，限定四种颜色，给出视觉规则和三张成品构图。"},
  {title:"赛博国风世界",desc:"古典建筑、数字霓虹和机械角色融合",category:"东方美学",image:guofengCyber,ratio:"wide",views:"1.6k",prompt:"搭建一个赛博国风短剧世界，将古典建筑、数字霓虹和机械角色融合，输出世界观、角色和首集分镜。"},
];
const filteredItems=computed(()=>{const q=keyword.value.trim().toLowerCase();return items.filter(i=>(activeCategory.value==="全部"||i.category===activeCategory.value)&&(!q||`${i.title}${i.desc}${i.category}`.toLowerCase().includes(q)))});
const selectedIdea=computed(()=>{const index=Number(route.params.idea);return Number.isInteger(index)&&index>=0&&index<items.length?items[index]:null});
const detailFrames=computed(()=>{if(!selectedIdea.value)return[];const start=items.indexOf(selectedIdea.value);return Array.from({length:Math.min(6,items.length)},(_,offset)=>items[(start+offset)%items.length].image)});
function openIdea(item:Idea){activeFrame.value=0;router.push(`/inspiration/${items.indexOf(item)}`)}
function backToGallery(){router.push("/inspiration")}
function useIdea(item:Idea){router.push({path:"/aiAssistant",query:{draft:item.prompt}})}
function sendIdeaToCanvas(item:Idea){sendSingleToCanvas(item.image,item.title)}
</script>

<style scoped>
.inspiration-page{box-sizing:border-box;height:100%;overflow-y:auto;padding:34px clamp(26px,4vw,58px) 80px;background:#f8f8f9;color:#29282f;font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif}.inspiration-header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px}.eyebrow{color:#e86a2c;font-size:10px;font-weight:750;letter-spacing:.18em}.inspiration-header h1{margin:9px 0 6px;font-size:40px;letter-spacing:-.05em}.inspiration-header p{margin:0;color:#85818a;font-size:14px}.inspiration-search{display:flex;align-items:center;gap:9px;width:min(360px,36vw);height:44px;padding:0 14px;border:1px solid #e4e2e6;border-radius:14px;background:#fff;box-shadow:0 7px 20px rgba(42,39,58,.04);color:#aaa6ad}.inspiration-search input{width:100%;border:0;outline:0;background:transparent;color:#39363e;font-size:13px}.inspiration-toolbar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:29px 0 24px}.inspiration-toolbar nav{display:flex;gap:8px;flex-wrap:wrap}.inspiration-toolbar button{padding:10px 15px;border:0;border-radius:11px;background:#ededf0;color:#74717a;font-size:12px;cursor:pointer}.inspiration-toolbar button.active{background:#f26b35;color:#fff;box-shadow:0 7px 17px rgba(242,107,53,.2)}.inspiration-toolbar>span{color:#97939b;font-size:11px;white-space:nowrap}.inspiration-grid{columns:4 250px;column-gap:18px}.inspiration-card{display:inline-block;width:100%;margin:0 0 18px;overflow:hidden;border:1px solid #e9e7eb;border-radius:19px;background:#fff;box-shadow:0 8px 24px rgba(42,38,55,.055);cursor:pointer;transition:.22s ease;break-inside:avoid}.inspiration-card:hover{transform:translateY(-4px);box-shadow:0 17px 38px rgba(42,38,55,.11)}.card-image{position:relative;height:220px;overflow:hidden;background:#ebe9ed}.card-image.portrait{height:300px}.card-image.tall{height:370px}.card-image img{width:100%;height:100%;object-fit:cover;transition:transform .5s ease}.inspiration-card:hover img{transform:scale(1.035)}.card-image>span{position:absolute;top:12px;left:12px;padding:5px 9px;border-radius:999px;background:rgba(255,255,255,.8);color:#554f59;font-size:10px;backdrop-filter:blur(8px)}.card-image button{position:absolute;right:12px;bottom:12px;padding:9px 12px;border:0;border-radius:10px;background:rgba(37,35,41,.9);color:#fff;font-size:11px;opacity:0;transform:translateY(5px);transition:.2s ease}.card-image button b{margin-left:7px}.inspiration-card:hover .card-image button{opacity:1;transform:none}.card-copy{padding:15px 16px 16px}.card-copy h2{margin:0;font-size:16px;letter-spacing:-.025em}.card-copy p{margin:7px 0 14px;color:#817d86;font-size:11px;line-height:1.55}.card-copy>div{display:flex;justify-content:space-between;color:#aaa6ad;font-size:10px}.card-copy small{font-size:10px}.inspiration-empty{padding:90px;text-align:center;color:#999}.inspiration-page::-webkit-scrollbar{width:8px}.inspiration-page::-webkit-scrollbar-thumb{border:2px solid transparent;border-radius:99px;background:rgba(80,76,87,.22);background-clip:padding-box}@media(max-width:760px){.inspiration-page{padding:24px 18px 60px}.inspiration-header{align-items:stretch;flex-direction:column}.inspiration-search{width:100%}.inspiration-grid{columns:2 220px}}
.inspiration-detail{box-sizing:border-box;height:100%;overflow-y:auto;padding:0 28px 70px;background:#fafafa;color:#29282f;font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif}.detail-header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:18px;height:76px;background:rgba(250,250,250,.92);backdrop-filter:blur(16px)}.detail-back{width:42px;height:42px;border:1px solid #e3e1e5;border-radius:50%;background:#fff;color:#3d3941;font-size:23px;cursor:pointer}.detail-author{display:flex;align-items:center;gap:10px;color:#77727c;font-size:12px}.detail-author strong{color:#37343a}.detail-author i{width:1px;height:16px;background:#ddd}.author-avatar{display:grid;place-items:center;width:35px;height:35px;border-radius:50%;background:linear-gradient(135deg,#ff8a45,#f35f2f);color:#fff;font-weight:800}.detail-same{border:0;border-radius:13px;background:#242329;color:#fff;font-weight:700;cursor:pointer}.detail-same.top{margin-left:auto;padding:13px 19px}.detail-same b{margin-left:8px}.detail-stage{display:grid;grid-template-columns:176px minmax(0,1fr);gap:20px;min-height:620px;padding:18px;border-radius:24px;background:#eeeeef}.detail-rail{display:flex;flex-direction:column;gap:12px;max-height:620px;overflow-y:auto;padding-right:5px}.detail-rail button{display:grid;grid-template-columns:22px 1fr;align-items:start;gap:6px;padding:8px;border:1px solid transparent;border-radius:14px;background:transparent;color:#817d86;cursor:pointer}.detail-rail button.active{border-color:#d7d3d9;background:#fff;box-shadow:0 7px 20px rgba(41,37,49,.08)}.detail-rail img{width:100%;height:86px;border-radius:9px;object-fit:cover}.detail-preview{position:relative;display:grid;place-items:center;overflow:hidden;border-radius:17px;background:#e5e4e6}.detail-preview>img{width:100%;height:100%;max-height:620px;object-fit:contain}.detail-same.floating{position:absolute;right:18px;bottom:18px;padding:13px 18px;background:rgba(255,255,255,.94);color:#29262d;box-shadow:0 8px 24px rgba(37,33,42,.12)}.detail-copy{max-width:900px;padding:40px 8px 0}.detail-copy h1{margin:10px 0 16px;font-size:34px;letter-spacing:-.04em}.detail-copy>p{margin:0;color:#716c76;font-size:14px;line-height:1.9}.detail-copy>div{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:10px 22px;margin-top:26px;padding-top:24px;border-top:1px solid #e6e3e7;font-size:12px}.detail-copy>div span{color:#9a959e}.detail-copy>div strong{color:#444048}@media(max-width:800px){.inspiration-detail{padding:0 14px 50px}.detail-author span:last-child{display:none}.detail-stage{grid-template-columns:1fr;min-height:auto}.detail-rail{order:2;display:grid;grid-template-columns:repeat(3,1fr);max-height:none}.detail-rail button{grid-template-columns:1fr}.detail-rail button span{display:none}.detail-preview{min-height:380px}.detail-copy>div{grid-template-columns:auto 1fr}}
 .detail-actions{display:flex;align-items:center;gap:10px;margin-left:auto}.detail-canvas{padding:12px 16px;border:1px solid #ff7b22;border-radius:13px;background:#fff;color:#ef6b18;font-weight:700;cursor:pointer}
</style>
