import { Clapperboard, FileText, ImagePlus, Images, Maximize2, MessageCircle, Video } from "lucide-react";

// XOi 适配：模型/供应商由宿主管理员统一配置，画布内不再暴露"配置"页入口
export const navigationTools = [
    {
        slug: "aiAssistant",
        icon: MessageCircle,
        external: true,
    },
    {
        slug: "canvas",
        icon: Maximize2,
        external: false,
    },
    {
        slug: "director",
        icon: Clapperboard,
        external: false,
    },
    {
        slug: "image",
        icon: ImagePlus,
        external: false,
    },
    {
        slug: "video",
        icon: Video,
        external: false,
    },
    {
        slug: "prompts",
        icon: FileText,
        external: false,
    },
    {
        slug: "assets",
        icon: Images,
        external: false,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
