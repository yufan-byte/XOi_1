"use client";
import * as Sw from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";
export function Switch({ id, checked, onCheckedChange, className }: { id?: string; checked: boolean; onCheckedChange: (v: boolean) => void; className?: string }) {
  return (
    <Sw.Root id={id} checked={checked} onCheckedChange={onCheckedChange} className={cn("relative h-5 w-9 rounded-full bg-muted-foreground/30 transition-colors data-[state=checked]:bg-primary", className)}>
      <Sw.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </Sw.Root>
  );
}
