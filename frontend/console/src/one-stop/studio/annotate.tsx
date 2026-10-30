"use client";
import { useEffect, useRef, useState } from "react";
import { Eraser, Highlighter, Undo2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AnnotateResult =
  | { kind: "annotate"; url: string }
  /** 局部重绘：image 为与蒙版同尺寸的原图 PNG，mask 为 PNG 蒙版（涂抹处透明 = 要重绘的区域，其余不透明 = 原样保留） */
  | { kind: "inpaint"; image: string; mask: string };
type Tool = "annotate" | "inpaint";

/** 标注编辑 / 局部重绘：标注 = 在图上圈点涂抹，导出带标注的图作为参考；局部重绘 = 涂抹要改的区域，导出蒙版，只重绘涂抹处 */
export function AnnotateDialog({ open, onOpenChange, src, onDone, initialTool = "annotate" }: { open: boolean; onOpenChange: (v: boolean) => void; src: string | null; onDone: (r: AnnotateResult) => void; initialTool?: Tool }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  /** 画布元素挂上来的那一刻：弹窗内容在 Portal 里、比本组件的首个 effect 晚挂载，只看 ref 的话 effect 跑的时候画布还不在，
   *  原图永远画不上去（2026-10-03 检查：局部重绘打开是一块 300×150 的空白，点「用作重绘蒙版」也没反应） */
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  /** 蒙版层：与画布同尺寸，只在局部重绘模式下作画（白 = 涂抹区） */
  const maskLayer = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<Tool>(initialTool);
  const [color, setColor] = useState("#ff3b5c"); const [size, setSize] = useState(14); const hist = useRef<{ img: ImageData; mask: ImageData | null }[]>([]); const drawing = useRef(false); const [strokes, setStrokes] = useState(0);
  useEffect(() => {
    if (!open || !src || !canvasEl) return; const c = canvasEl; const ctx = c.getContext("2d")!; const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => {
      const s = Math.min(1, 1200 / img.width); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); ctx.drawImage(img, 0, 0, c.width, c.height); hist.current = [];
      const m = document.createElement("canvas"); m.width = c.width; m.height = c.height; maskLayer.current = m; setStrokes(0);
    };
    img.onerror = () => toast.error("这张图读取不了（可能已过期），请换一张作品再试");
    img.src = src;
  }, [open, src, tool, canvasEl]);
  const pos = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return [(e.clientX - r.left) * (canvas.current!.width / r.width), (e.clientY - r.top) * (canvas.current!.height / r.height)] as const; };
  const inpaint = tool === "inpaint";
  const brush = (ctx: CanvasRenderingContext2D, stroke: string) => { ctx.strokeStyle = stroke; ctx.lineWidth = size; ctx.lineCap = "round"; ctx.lineJoin = "round"; };
  const redraw = () => new Promise<void>((res, rej) => { const c = canvas.current!; const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => { c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); res(); }; img.onerror = () => rej(new Error("load")); img.src = src!; });
  const clear = async () => { try { await redraw(); } catch { toast.error("原图读取失败，请关闭后重新打开"); return; } const m = maskLayer.current; if (m) m.getContext("2d")!.clearRect(0, 0, m.width, m.height); hist.current = []; setStrokes(0); };
  const undo = () => { const c = canvas.current!; const h = hist.current.pop(); if (!h) return; c.getContext("2d")!.putImageData(h.img, 0, 0); if (h.mask && maskLayer.current) maskLayer.current.getContext("2d")!.putImageData(h.mask, 0, 0); setStrokes((n) => Math.max(0, n - 1)); };
  const done = async () => {
    const c = canvas.current!;
    if (!inpaint) { onDone({ kind: "annotate", url: c.toDataURL("image/jpeg", 0.92) }); onOpenChange(false); return; }
    const m = maskLayer.current; if (!m || !strokes) { toast.error("请先在图上涂抹要重绘的区域"); return; }
    // 原图 PNG（与蒙版同尺寸；画布上的红色涂抹只是预览，导出前先还原）
    try { await redraw(); } catch { toast.error("原图读取失败，请关闭后重新打开局部重绘"); return; }
    const image = c.toDataURL("image/png");
    // 蒙版：全图不透明黑，涂抹处用 destination-out 打成透明——这是 OpenAI images/edits 的蒙版约定（透明 = 可改）
    const out = document.createElement("canvas"); out.width = m.width; out.height = m.height; const octx = out.getContext("2d")!;
    octx.fillStyle = "#000"; octx.fillRect(0, 0, out.width, out.height); octx.globalCompositeOperation = "destination-out"; octx.drawImage(m, 0, 0);
    onDone({ kind: "inpaint", image, mask: out.toDataURL("image/png") }); onOpenChange(false);
  };
  const tabs: [Tool, string, string][] = [["annotate", "标注", "圈出要改的地方，整图连同标注作为参考"], ["inpaint", "局部重绘", "标出希望修改的区域，模型会参考标记生成"]];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={inpaint ? "局部重绘" : "标注编辑"} description={inpaint ? "涂抹要修改的区域，标记图会作为参考送给模型；模型会尽量保持其他区域，结果不保证像素完全不变" : "用画笔圈出要修改的区域，标注图会作为参考图送入模型，提示词里说明要怎么改"} className="w-[min(94vw,1000px)]">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="编辑方式" className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-card/60 p-0.5">
            {tabs.map(([k, label, desc]) => <button key={k} type="button" role="tab" aria-selected={tool === k} title={desc} onClick={() => setTool(k)} className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors", tool === k ? "bg-primary/15 text-primary shadow-[0_0_0_1px_var(--primary)]" : "text-muted-foreground hover:text-foreground")}>{k === "inpaint" ? <Wand2 size={12} /> : <Highlighter size={12} />}{label}</button>)}
          </div>
          {!inpaint && ["#ff3b5c", "#ffb300", "#22c55e", "#3b82f6", "#ffffff"].map((c) => <button key={c} onClick={() => setColor(c)} className={cn("h-7 w-7 rounded-full border-2", color === c ? "border-foreground" : "border-border")} style={{ background: c }} aria-label={c} />)}
          <input type="range" min={4} max={inpaint ? 120 : 40} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-32 accent-[var(--primary)]" aria-label="画笔大小" />
          <Button size="sm" variant="secondary" onClick={undo}><Undo2 size={14} />撤销</Button>
          <Button size="sm" variant="secondary" onClick={clear}><Eraser size={14} />{inpaint ? "清除涂抹" : "清除标注"}</Button>
          {inpaint && <span className="text-xs text-muted-foreground">{strokes ? `已涂 ${strokes} 笔` : "还没涂抹"}</span>}
        </div>
        <div className="mt-3 max-h-[60vh] overflow-auto rounded-2xl border bg-muted">
          <canvas ref={(el) => { canvas.current = el; setCanvasEl(el); }} className="mx-auto max-w-full cursor-crosshair touch-none"
            onPointerDown={(e) => { const c = canvas.current!; const ctx = c.getContext("2d")!; const m = maskLayer.current; hist.current.push({ img: ctx.getImageData(0, 0, c.width, c.height), mask: inpaint && m ? m.getContext("2d")!.getImageData(0, 0, m.width, m.height) : null }); if (hist.current.length > 20) hist.current.shift(); drawing.current = true; const [x, y] = pos(e); brush(ctx, inpaint ? "rgba(255,59,92,0.55)" : color); ctx.beginPath(); ctx.moveTo(x, y); if (inpaint && m) { const mctx = m.getContext("2d")!; brush(mctx, "#fff"); mctx.beginPath(); mctx.moveTo(x, y); } }}
            onPointerMove={(e) => { if (!drawing.current) return; const ctx = canvas.current!.getContext("2d")!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); const m = maskLayer.current; if (inpaint && m) { const mctx = m.getContext("2d")!; mctx.lineTo(x, y); mctx.stroke(); } }}
            onPointerUp={() => { if (drawing.current && inpaint) setStrokes((n) => n + 1); drawing.current = false; }} onPointerLeave={() => { if (drawing.current && inpaint) setStrokes((n) => n + 1); drawing.current = false; }} />
        </div>
        <div className="mt-3 flex justify-end gap-2"><Button variant="secondary" onClick={() => onOpenChange(false)}>取消</Button><Button onClick={done}>{inpaint ? "用作重绘蒙版" : "用作参考图"}</Button></div>
      </DialogContent>
    </Dialog>
  );
}
