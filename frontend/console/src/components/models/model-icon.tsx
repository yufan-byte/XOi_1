import type { CatalogModel } from "@/lib/models";
import { cn } from "@/lib/utils";

// 这些厂商图标是白色单色 SVG，需要深色底
// sculpted 立体图标自带明暗，统一放浅色底；只有纯白线条的平面图标才需要深色底
const DARK = /^(?!.*\/sculpted\/).*(\/(openai|midjourney|vidu|xai|alibaba)\.svg$|\/external\/)/;

export function ModelIcon({ model, size = 40, className }: { model: Pick<CatalogModel, "icon" | "name">; size?: number; className?: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-2xl border shadow-soft", model.icon && DARK.test(model.icon) ? "bg-[#14141f] border-transparent" : "bg-card", className)} style={{ width: size, height: size }}>
      {model.icon ? <img src={model.icon} alt="" width={size * 0.55} height={size * 0.55} /> : <span className="text-base font-bold text-muted-foreground">{model.name.slice(0, 1)}</span>}
    </span>
  );
}
