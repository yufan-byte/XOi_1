export function modelPickerLayout(
  anchor: { left: number; top: number; bottom: number },
  viewport: { width: number; height: number; left?: number; top?: number },
  preferredHeight = 540,
  preferredWidth = 520,
) {
  const margin = 12,
    gap = 8;
  const vx = viewport.left || 0,
    vy = viewport.top || 0;
  const width = Math.max(0, Math.min(preferredWidth, viewport.width - margin * 2));
  const usableHeight = Math.max(0, viewport.height - margin * 2);
  const below = Math.max(0, vy + viewport.height - margin - anchor.bottom - gap);
  const above = Math.max(0, anchor.top - gap - vy - margin);
  const side = below >= Math.min(preferredHeight, 320) || below >= above ? "bottom" : "top";
  const space = side === "bottom" ? below : above;
  // If neither side can hold the fixed tools, use the viewport as a compact floating sheet.
  const sheet = space < Math.min(260, usableHeight);
  const height = Math.min(preferredHeight, usableHeight, sheet ? usableHeight : space);
  const top = sheet ? vy + margin : side === "bottom" ? anchor.bottom + gap : anchor.top - gap - height;
  return {
    left: Math.max(vx + margin, Math.min(anchor.left, vx + viewport.width - margin - width)),
    top: Math.max(vy + margin, Math.min(top, vy + viewport.height - margin - height)),
    width,
    height,
  };
}
