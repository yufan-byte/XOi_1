"use client";
import dynamic from "next/dynamic";
import { useCallback, useRef } from "react";
import type { OrbitBus } from "./orbit-data";
import { cn } from "@/lib/utils";

/** three.js 场景按需加载 */
const OrbitScene = dynamic(() => import("./orbit-scene"), { ssr: false, loading: () => null });

/** 拖拽手感（与参考站一致）：偏航灵敏度略高于俯仰灵敏度，俯仰钳制防止翻转，5px 死区区分点击与拖拽 */
const MOVE_K = 0.005, PITCH_K = 0.004, DEADZONE = 5;

/** 登录页三维模型地球 + 作品展映（3D 模式）；容器承接指针事件（按下捕获 → 增量写入 bus.drag → 场景每帧消费） */
export function Globe({ className, bus, active = true, reduced = false }: { className?: string; bus: React.RefObject<OrbitBus>; active?: boolean; reduced?: boolean }) {
  const st = useRef({ id: -1, x: 0, y: 0, moved: false });
  const down = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!active || e.button !== 0) return;
    const s = st.current; s.id = e.pointerId; s.x = e.clientX; s.y = e.clientY; s.moved = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    const d = bus.current.drag; d.grabbing = true; d.vyaw = 0; d.vpitch = 0;
  }, [active, bus]);
  const move = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const b = bus.current, s = st.current;
    // 未按下时仅更新悬停视差目标（归一化 -0.5..0.5）
    const rect = e.currentTarget.getBoundingClientRect();
    b.hover.tx = (e.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
    b.hover.ty = (e.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
    if (s.id !== e.pointerId) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.moved && Math.hypot(dx, dy) < DEADZONE) return;
    s.moved = true; s.x = e.clientX; s.y = e.clientY;
    const d = b.drag; d.px += dx * MOVE_K; d.py += dy * PITCH_K;
  }, [bus]);
  const up = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const s = st.current; if (s.id !== e.pointerId) return;
    s.id = -1;
    const el = e.currentTarget;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    bus.current.drag.grabbing = false; // 速度由场景在拖拽期间持续估计，松手后按惯性衰减
  }, [bus]);
  const leave = useCallback(() => { const h = bus.current.hover; h.tx = 0; h.ty = 0; }, [bus]);
  return (
    <div className={cn(className, "cursor-grab active:cursor-grabbing")} role="img" aria-label="三维模型地球与作品展映"
      style={{ touchAction: "none" }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={leave}>
      {/* 全端挂载：手机与桌面同一套 3D 舞台（旧版只在 ≥640px 挂载，手机端是渐变糊墙首屏） */}
      <OrbitScene bus={bus} reduced={reduced} />
    </div>
  );
}
