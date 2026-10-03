import personas from "@/data/personas.json";

export interface Persona { id: string; modality: string; name: string; intro: string; avatar: string; tags: string[]; system_prompt: string; official: boolean; uses: number }
export const PERSONAS: Persona[] = ((personas as unknown as { data: Persona[] }).data ?? []);

/** 侧栏智能体面板里子入口的图标底色（与参考站 accent 色一致） */
export type PanelTone = "primary" | "cyan" | "gold" | "emerald" | "rose";
/** 子入口：icon 为 lucide 图标名（kebab-case），由 AgentsPanel 映射成组件 */
export interface PanelSub { label: string; href: string; icon: string; title?: string; tone?: PanelTone; soon?: boolean }
export interface PanelGroup { label: string; icon: string; items: PanelSub[] }
/** 侧栏「智能体」面板条目：order 决定顺序；name / desc 缺省时沿用 FeaturedAgent 的 name / desc */
export interface PanelEntry {
  id: string; order: number; name?: string; desc?: string;
  image?: string; icon?: string;
  /** 简单子入口（AI漫剧） */
  subs?: PanelSub[];
  /** 电商全能：置顶入口 + 可折叠分组 */
  pinned?: PanelSub; groups?: PanelGroup[];
}

export interface FeaturedAgent { slug: string; name: string; desc: string; long: string; uses: string; color: string; icon: string; badge?: string; category: "image" | "video" | "audio" | "doc" | "all"; href?: string; panel?: PanelEntry }

// XOi: 本子应用挂在 /console/ 下，public 素材必须带 BASE_URL 前缀（造物在站点根，写死 `/agents/...` 没事）。
// 注意区分：下面 href/EC 里的 `/agents/xxx` 是**页面路由**，不带 base；只有 image 是**静态素材**，必须带。
const A = `${import.meta.env.BASE_URL}agents/`;

const EC = "/agents/ecommerce?fn=";
export const FEATURED: FeaturedAgent[] = [
  { slug: "canvas-v2", href: "/agents/canvas-v2", name: "无限画布-V2", desc: "无限延展的 AI 创意空间，自由画布图文混排，所想即所得", long: "把模型、素材、提示词放在同一张无限画布上，节点式串联文生图、图生图、图生视频，随时回溯每一次生成。", uses: "26.8k", color: "from-[#3b6cff] to-[#7c5cff]", icon: "∞", badge: "多模态", category: "image",
    panel: { id: "infinite-canvas", order: 2, desc: "无限延展的AI创意空间，自由画布图文混排，所想即所得", image: `${A}Infinite-Canvas.png` } },
  { slug: "ecommerce-v3", href: "/agents/ecommerce", name: "电商全能-V2", desc: "导入 SKU、对标图和自有商品图，批量生成主图、细节图、场景图和视频素材。", long: "AI 原创商拍、爆款复刻、AI 原创设计、爆款种草四大分组 13 个功能，从模特试穿到种草视频一站上新。", uses: "22.5k", color: "from-[#ff6a8b] to-[#ff9d5c]", icon: "🛍", badge: "多模态", category: "image",
    panel: {
      id: "ecommerce-suite", order: 3, image: `${A}E-commerce.png`,
      pinned: { label: "我的看板", href: "/agents/ecommerce/board", icon: "layout-grid", tone: "primary", title: "把常用功能挑出来自己排序，点一下直达" },
      groups: [
        { label: "AI 原创商拍", icon: "camera", items: [
          { label: "AI 模特", href: `${EC}ai-model`, icon: "user", tone: "cyan", title: "生成模特 · 模特库 · 一致出图" },
          { label: "AI 商拍", href: `${EC}model-suite`, icon: "user-round-cog", tone: "primary", title: "试穿 · 换模特 · 换场景 · 姿势 · 穿戴" },
          { label: "商品图", href: `${EC}product-suite`, icon: "camera", tone: "gold", title: "品类大片 · 渠道主图 · 详情长图" },
          { label: "AI 精修", href: `${EC}image-edit`, icon: "wand-sparkles", tone: "primary", title: "抠图 · 换色 · 换背景 · 局部重绘 · 消除 · 翻译 · 印花提取" },
          { label: "批量工坊", href: `${EC}batch-suite`, icon: "mountain", tone: "emerald", title: "批量上新 · 换背景 · 换色" },
          { label: "素材中心", href: `${EC}assets`, icon: "folder-open", tone: "cyan", title: "商品 · 模特 · 对标 · 历史" },
        ] },
        { label: "爆款复刻", icon: "flame", items: [
          { label: "爆款复刻", href: `${EC}baokuan-replicate`, icon: "film", tone: "gold", title: "拆对标视频 → 文字分镜 → 故事板 → 成片" },
          { label: "爆款视频反推", href: `${EC}baokuan-reverse-prompt`, icon: "scan-text", tone: "cyan", title: "上传爆款视频，一键反推视频提示词，快速复刻热门风格" },
          { label: "深度动作捕捉", href: `${EC}depth-motion-capture`, icon: "scan-text", tone: "primary", title: "提取视频空间层次与动作，生成可复用的灰度深度参考" },
          { label: "图片复刻", href: `${EC}image-replicate`, icon: "copy", tone: "rose", title: "对标爆款图 + 我的产品 → 复刻同款" },
        ] },
        { label: "AI 原创设计", icon: "palette", items: [
          { label: "AI 设计", href: `${EC}design-suite`, icon: "palette", tone: "primary", title: "服装设计 · 印花 · 贴合 · 海报" },
        ] },
        { label: "爆款种草", icon: "sprout", items: [
          { label: "种草视频", href: `${EC}video-replicate`, icon: "video", tone: "gold", title: "主图转视频 + 黄金3秒脚本" },
        ] },
        { label: "AI 运营助手", icon: "bot", items: [
          { label: "AI 运营助手", href: `${EC}operations`, icon: "bot", tone: "cyan", title: "选款趋势 · 客服话术 · 出海文案" },
        ] },
      ],
    } },
  { slug: "doc-qa", href: "/agents/doc-qa", name: "文档问答", desc: "上传 PDF / Word / 表格，围绕文档内容精准问答与总结", long: "支持 PDF、Word、Excel、TXT，自动切分向量化，回答附带原文引用。", uses: "11.7k", color: "from-[#6a46ff] to-[#b18cff]", icon: "📄", badge: "多模态", category: "doc" },
  { slug: "comic", href: "/agents/comic", name: "AI漫剧-V2", desc: "专为多场景打造的高级智能视频，多场景生成社交漫剧", long: "剧本 → 分镜 → 角色定妆 → 逐镜生成 → 配音合成，一条流水线做完一集漫剧。", uses: "18.2k", color: "from-[#7c5cff] to-[#ff7ab6]", icon: "AI", badge: "多模态", category: "video",
    panel: { id: "ai-comic", order: 1, image: `${A}AI-Manga-Series.png`, subs: [
      { label: "渐进式工作台", href: "/agents/comic", icon: "layout-grid" },
      { label: "资产库", href: "/agents/comic/assets", icon: "boxes" },
      { label: "发布管理", href: "", icon: "send", soon: true, title: "作品分发，待接入" },
    ] } },
  { slug: "ecommerce", href: "/agents/ecommerce-v3", name: "一键电商", desc: "四大模块直达：商品套图、A+详情、服饰穿戴、爆款图复刻", long: "面向跨境电商与国内平台的套图生产线，一次上传，多尺寸多场景输出。", uses: "9.4k", color: "from-[#ff8a5c] to-[#ffc46b]", icon: "🛒", badge: "多模态", category: "image",
    panel: { id: "ecommerce-suite-v3", order: 4, desc: "四大模块直达：商品套图、A+详情、服饰穿戴、爆款图复刻。", icon: "shopping-bag" } },
  { slug: "clip", href: "/clip", name: "AI 智能剪辑", desc: "一句话说需求，素材全丢进来，AI 自动分析、剪辑、配乐", long: "浏览器内基于 WebCodecs 的剪辑引擎，无需上传即可拼接、变速、加字幕与配乐。", uses: "7.9k", color: "from-[#16a34a] to-[#7ee2a8]", icon: "✂", badge: "多模态", category: "video",
    panel: { id: "ai-clip", order: 5, desc: "一句话说需求, 素材全丢进来, AI 自动分析归类、剪出成片; 预览即成片, 浏览器里实时合成, 改多少次都免费", icon: "clapperboard" } },
  { slug: "multiframe", href: "/agents/multiframe", name: "AI 短片", desc: "多帧连贯短片：一键接镜、末帧续拍、统一人物画风", long: "自动把上一段的末帧作为下一段首帧，连续剧情不断档。", uses: "6.1k", color: "from-[#0ea5e9] to-[#7c5cff]", icon: "🎬", category: "video",
    panel: { id: "smart-multiframe", order: 7, name: "AI短片", desc: "上传多个参考图和描述，选择时长，自动生成视频样片的长视频", image: `${A}Smart-Multi-Frame.png` } },
  { slug: "ppt", href: "/agents/ppt", name: "AI PPT", desc: "输入主题或文档，生成结构化演示文稿并可导出", long: "大纲 → 页面 → 配图 → 导出 PPTX，支持模板与品牌色。", uses: "5.3k", color: "from-[#f59e0b] to-[#ff7ab6]", icon: "▦", category: "doc",
    panel: { id: "ai-ppt", order: 6, name: "AI PPT 生成", desc: "输入主题或大纲, AI 生成可编辑幻灯片, 一键导出 PowerPoint (.pptx)", image: `${A}AI-PPT.png` } },
  { slug: "visual-identity", href: "/agents/visual-identity", name: "视觉身份工作台", desc: "上传全身照，生成正面肖像、生活方式裁切与主页封面，输出个人视觉方案", long: "AI 诊断、身份锚点、改造方案与三组视觉产出，一套流程完成个人品牌视觉。", uses: "4.8k", color: "from-[#7c5cff] to-[#22d3ee]", icon: "◉", category: "image" },
  { slug: "web-analyst", href: "/agents/web-analyst", name: "网页分析师", desc: "输入网址，抓取并分析页面结构、内容与 SEO 建议", long: "抓取网页正文、结构化摘要、竞品对比与改写建议。", uses: "3.9k", color: "from-[#334155] to-[#7c5cff]", icon: "🌐", category: "doc" },
  { slug: "vibeapp", href: "/vibeapp", name: "应用广场 VibeApp", desc: "一句话生成可运行的网页小应用，发布到广场供他人使用", long: "描述需求 → 生成单文件 HTML 应用 → 沙箱预览 → 编辑发布。", uses: "3.2k", color: "from-[#7c5cff] to-[#22c55e]", icon: "⚡", badge: "新", category: "all" },
  { slug: "super-agent", href: "/agents/chat", name: "超级智能体", desc: "自主规划、调用工具并完成多模态任务", long: "把目标说清楚，它自己拆解步骤、调用生图 / 生视频 / 抓网页 / 写文档等工具，直接给出成果。", uses: "31.4k", color: "from-[#14141f] to-[#4c2fd6]", icon: "✦", badge: "HOT", category: "all" },
  { slug: "customer-service", href: "/agents/ecommerce?fn=operations&mode=service", name: "AI 客服工作台", desc: "售前 / 售后 / 差评回复 / 催付，多场景客服话术一键生成", long: "输入商品信息与场景，生成可直接发送的客服话术。", uses: "2.9k", color: "from-[#22c55e] to-[#0ea5e9]", icon: "💬", category: "doc" },
  { slug: "quick-image", href: "/image", name: "通用一键生图", desc: "文生图、图编辑、多图融合，聚合主流图像模型", long: "一句话出图，支持参考图编辑与多图融合。", uses: "40.1k", color: "from-[#f97316] to-[#ec4899]", icon: "🎨", category: "image" },
  { slug: "voice-studio", name: "声音工作室", desc: "声音克隆、音色设计与多角色配音", long: "上传 10~300 秒参考音频完成克隆，或用文字描述设计一个全新音色。", uses: "2.7k", color: "from-[#ec4899] to-[#f97316]", icon: "♪", category: "audio", href: "/audio" },
];

/** 侧栏「智能体」面板的条目（按 panel.order 排序） */
export const PANEL_AGENTS: (FeaturedAgent & { panel: PanelEntry })[] = FEATURED
  .filter((a): a is FeaturedAgent & { panel: PanelEntry } => !!a.panel)
  .sort((a, b) => a.panel.order - b.panel.order);
