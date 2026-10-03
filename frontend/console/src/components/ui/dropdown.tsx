"use client";
import * as DM from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const Dropdown = DM.Root;
export const DropdownTrigger = DM.Trigger;
export function DropdownContent({ className, children, align = "end" }: { className?: string; children: React.ReactNode; align?: "start" | "end" | "center" }) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={8} className={cn("z-50 min-w-44 rounded-tile border bg-card p-1.5 shadow-pop animate-in fade-in-0 zoom-in-95", className)}>{children}</DM.Content>
    </DM.Portal>
  );
}
export function DropdownItem({ className, ...props }: DM.DropdownMenuItemProps) {
  return <DM.Item className={cn("flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none hover:bg-muted data-[highlighted]:bg-muted", className)} {...props} />;
}
export const DropdownSeparator = () => <DM.Separator className="my-1 h-px bg-border" />;
