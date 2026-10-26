/** Wheel zoom stays anchored under the pointer. Horizontal trackpad gestures pan. */
export function timelineWheel(e: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }, scale: number, min: number, max: number, scroll: number, x: number) {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  if (!e.ctrlKey && !e.metaKey && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))) {
    return { scale, scroll: Math.max(0, scroll + (e.shiftKey ? e.deltaY || e.deltaX : e.deltaX) * unit) };
  }
  const next = Math.max(min, Math.min(max, scale * Math.exp(-Math.max(-200, Math.min(200, e.deltaY * unit)) * 0.006)));
  return { scale: next, scroll: Math.max(0, (scroll + x) * next / scale - x) };
}
