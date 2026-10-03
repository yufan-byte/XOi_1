"use client";
import * as S from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Opt { value: string; label: string; description?: string }
export function PillSelect({ label, value, options, onChange, className, active, ariaLabel }: { label?: string; value: string; options: Opt[]; onChange: (v: string) => void; className?: string; active?: boolean; ariaLabel?: string }) {
  const cur = options.find((o) => o.value === value);
  return (
    <S.Root value={value} onValueChange={onChange}>
      <S.Trigger aria-label={ariaLabel} className={cn("chip h-10 gap-1.5 hover:bg-muted data-[state=open]:border-primary/40", active && "chip-active", className)}>
        {label && <span className="text-muted-foreground">{label}</span>}
        <span className="font-medium">{cur?.label ?? value}</span>
        <ChevronDown size={14} className="text-muted-foreground" />
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={6} className="z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-tile border bg-card p-1.5 shadow-pop animate-in fade-in-0 zoom-in-95">
          <S.Viewport>
            {options.map((o) => (
              <S.Item key={o.value} value={o.value} className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-muted data-[state=checked]:text-accent-foreground">
                <div><S.ItemText>{o.label}</S.ItemText>{o.description && <div className="text-xs text-muted-foreground">{o.description}</div>}</div>
                <S.ItemIndicator><Check size={14} /></S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
