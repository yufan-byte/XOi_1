import { useEffect, useRef, useState } from "react";
import { Maximize2, Move } from "lucide-react";
import { SYSTEM, Viewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";

type Props = { src?: string; alt: string; immersive?: boolean; onOpen?: () => void; onMoveStart?: (event: React.MouseEvent<HTMLButtonElement>) => void };
type Entry = { setActive: (active: boolean) => void };
const MAX_ACTIVE = 4;
const activeEntries: Entry[] = [];

function activate(entry: Entry) {
    const index = activeEntries.indexOf(entry);
    if (index >= 0) activeEntries.splice(index, 1);
    activeEntries.push(entry);
    entry.setActive(true);
    if (activeEntries.length > MAX_ACTIVE) activeEntries.shift()?.setActive(false);
}

function release(entry: Entry) {
    const index = activeEntries.indexOf(entry);
    if (index >= 0) activeEntries.splice(index, 1);
}

function Sphere({ src, entry }: { src: string; entry: Entry }) {
    const ref = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    useEffect(() => {
        const container = ref.current;
        if (!container || !activeEntries.includes(entry)) return;
        let viewer: Viewer | null = null;
        const ready = () => setStatus("ready");
        const failed = () => { setStatus("error"); release(entry); };
        try {
            SYSTEM.load();
            viewer = new Viewer({ container, panorama: src, navbar: false, mousewheel: true, mousemove: true, touchmoveTwoFingers: false, moveInertia: false, defaultZoomLvl: 50, minFov: 25, maxFov: 110 });
            viewer.addEventListener("ready", ready);
            viewer.addEventListener("panorama-error", failed);
        } catch { setStatus("error"); release(entry); }
        return () => { viewer?.removeEventListener("ready", ready); viewer?.removeEventListener("panorama-error", failed); viewer?.destroy(); release(entry); };
    }, [entry, src]);
    return <div className="relative h-full w-full"><div ref={ref} className="absolute inset-0" style={{ opacity: status === "ready" ? 1 : 0 }} />{status === "loading" ? <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-xs text-white/80">正在加载全景图...</div> : null}{status === "error" ? <div className="absolute inset-0 flex items-center justify-center bg-black text-xs text-white/80">全景图加载失败</div> : null}</div>;
}

export function CanvasPanoramaViewer({ src, alt, immersive = false, onOpen, onMoveStart }: Props) {
    const [active, setActive] = useState<boolean | null>(null);
    const entryRef = useRef<Entry>({ setActive });
    useEffect(() => { const entry = entryRef.current; activate(entry); return () => release(entry); }, []);
    if (!src) return <div className="flex h-full w-full items-center justify-center text-xs text-white/60">暂无全景图</div>;
    const surface = active === false ? <img src={src} alt={alt} draggable={false} className="h-full w-full object-contain" /> : <Sphere src={src} entry={entryRef.current} />;
    return <div className={`relative h-full w-full overflow-hidden ${immersive ? "bg-black" : ""}`} data-canvas-no-zoom onPointerEnter={() => activate(entryRef.current)} onPointerDown={(event) => { activate(entryRef.current); event.stopPropagation(); }} onClick={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
        {surface}
        {!immersive && onMoveStart ? <button type="button" title="拖动节点" aria-label="拖动节点" className="absolute left-2 top-2 z-20 flex size-7 items-center justify-center rounded-md bg-black/50 text-white/80" onMouseDown={(event) => { event.preventDefault(); onMoveStart(event); }}><Move className="size-3.5" /></button> : null}
        {!immersive && onOpen ? <button type="button" title="沉浸式查看" aria-label="沉浸式查看" className="absolute bottom-2 left-2 z-20 flex size-7 items-center justify-center rounded-md bg-black/55 text-white/85" onClick={(event) => { event.stopPropagation(); onOpen(); }}><Maximize2 className="size-3.5" /></button> : null}
    </div>;
}

export default CanvasPanoramaViewer;
