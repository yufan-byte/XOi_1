"use client";
import { cn } from "@/lib/utils";

export function Avatar({ name, src, size = 40, className }: { name?: string; src?: string; size?: number; className?: string }) {
  const initial = (name ?? "?").trim().slice(0, 1).toUpperCase();
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-[#ff7ab6] text-white font-semibold", className)} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : initial}
      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-success" />
    </span>
  );
}
