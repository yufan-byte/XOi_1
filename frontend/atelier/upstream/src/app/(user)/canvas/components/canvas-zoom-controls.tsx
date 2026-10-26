import type { ReactNode } from "react";
import { ChevronDown, Compass, Focus, Hand, HelpCircle, Minus, MousePointer2, Plus, Redo2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Modal, Popover, Tooltip } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type CanvasZoomControlsProps = {
    scale: number;
    onScaleChange: (scale: number) => void;
    onReset: () => void;
    isMiniMapOpen: boolean;
    onToggleMiniMap: () => void;
    canvasTool: "select" | "pan";
    onCanvasToolChange: (tool: "select" | "pan") => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
};

export function CanvasZoomControls({ scale, onScaleChange, onReset, isMiniMapOpen, onToggleMiniMap, canvasTool, onCanvasToolChange, canUndo, canRedo, onUndo, onRedo }: CanvasZoomControlsProps) {
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [zoomOpen, setZoomOpen] = useState(false);
    const [percentDraft, setPercentDraft] = useState(String(Math.round(scale * 100)));
    useEffect(() => setPercentDraft(String(Math.round(scale * 100))), [scale]);
    const commitPercent = () => {
        const value = Number(percentDraft);
        if (Number.isFinite(value) && percentDraft.trim()) {
            const next = Math.min(5, Math.max(0.05, value / 100));
            setPercentDraft(String(Math.round(next * 100)));
            onScaleChange(next);
        }
        else setPercentDraft(String(Math.round(scale * 100)));
    };
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const dockStyle = { background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, boxShadow: "0 4px 20px rgba(20,25,35,.05)" };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };

    return (
        <div className="absolute bottom-5 left-5 z-50" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex h-11 max-w-[calc(100vw-210px)] items-center gap-0.5 rounded-xl border px-1.5 backdrop-blur-xl" style={dockStyle}>
                <Tooltip title={canvasTool === "select" ? "选择工具 · 点击切换移动" : "移动工具 · 点击切换选择"}>
                    <Button type="text" className="!h-8 !w-8 !min-w-8 !p-0" style={activeStyle} aria-label="切换选择与移动" aria-pressed={canvasTool === "select"} icon={canvasTool === "select" ? <MousePointer2 className="size-4" /> : <Hand className="size-4" />} onClick={() => onCanvasToolChange(canvasTool === "select" ? "pan" : "select")} />
                </Tooltip>
                <span className="mx-1 h-4 w-px" style={{ background: theme.toolbar.border }} />
                <Tooltip title={isMiniMapOpen ? "关闭小地图" : "打开小地图"}>
                    <Button
                        type="text"
                        className="!h-8 !w-8 !min-w-8 !p-0"
                        style={isMiniMapOpen ? activeStyle : { color: theme.toolbar.item }}
                        icon={<Compass className="size-4" />}
                        onClick={onToggleMiniMap}
                        aria-label={isMiniMapOpen ? "关闭小地图" : "打开小地图"}
                    />
                </Tooltip>
                <Tooltip title="重置视图">
                    <Button type="text" className="!h-8 !w-8 !min-w-8 !p-0" style={{ color: theme.toolbar.item }} icon={<Focus className="size-4" />} onClick={onReset} aria-label="重置视图" />
                </Tooltip>
                <Button type="text" className="!h-8 !w-7 !min-w-7 !p-0" style={{ color: theme.toolbar.item }} icon={<Minus className="size-4" />} disabled={scale <= 0.05} onClick={() => onScaleChange(Math.max(0.05, scale / 1.25))} aria-label="缩小画布" />
                <Popover trigger="click" placement="top" arrow={false} open={zoomOpen} onOpenChange={setZoomOpen}
                    styles={{ container: { padding: 14, background: theme.node.panel, color: theme.node.text, border: `1px solid ${theme.node.stroke}` } }}
                    content={<div style={{ width: 232 }} onKeyDown={event => { if (event.key === "Escape") setZoomOpen(false); }}>
                        <div className="mb-3 flex items-center justify-between gap-3"><span className="text-xs">缩放比例</span><label className="flex items-center gap-1 text-xs"><input type="number" min="5" max="500" step="5" value={percentDraft} onChange={event => setPercentDraft(event.target.value)} onBlur={commitPercent} onKeyDown={event => { if (event.key === "Enter") { commitPercent(); event.currentTarget.blur(); } }} aria-label="缩放百分比" style={{ width: 64, border: `1px solid ${theme.node.stroke}`, borderRadius: 6, padding: '4px 6px', color: theme.node.text, background: theme.node.fill }} />%</label></div>
                        <input type="range" min="5" max="500" step="1" value={Math.round(scale * 100)} onChange={event => onScaleChange(Number(event.target.value) / 100)} aria-label="精细调整缩放" aria-valuetext={`${Math.round(scale * 100)}%`} style={{ width: '100%', accentColor: theme.node.activeStroke }} />
                        <div className="mt-3 grid grid-cols-4 gap-1">{[25, 50, 75, 100, 150, 200, 300, 500].map(value => <Button key={value} size="small" type="text" aria-pressed={Math.round(scale * 100) === value} style={{ color: theme.node.text, background: Math.round(scale * 100) === value ? theme.toolbar.activeBg : undefined }} onClick={() => onScaleChange(value / 100)}>{value}%</Button>)}</div>
                        <p className="mb-0 mt-3 text-[11px]" style={{ color: theme.node.muted }}>滚轮快速缩放 · 按鼠标位置定位</p>
                    </div>}
                >
                    <Button type="text" className="!h-8 !min-w-[60px] !px-1.5 tabular-nums" style={{ color: theme.node.text }} aria-label="选择缩放比例" aria-expanded={zoomOpen}><span>{Math.round(scale * 100)}%</span><ChevronDown className="size-3" /></Button>
                </Popover>
                <Button type="text" className="!h-8 !w-7 !min-w-7 !p-0" style={{ color: theme.toolbar.item }} icon={<Plus className="size-4" />} disabled={scale >= 5} onClick={() => onScaleChange(Math.min(5, scale * 1.25))} aria-label="放大画布" />
                <Tooltip title="快捷键">
                    <Button type="text" className="!h-8 !w-8 !min-w-8 !p-0" style={shortcutsOpen ? activeStyle : { color: theme.toolbar.item }} icon={<HelpCircle className="size-4" />} onClick={() => setShortcutsOpen(true)} aria-label="快捷键" />
                </Tooltip>
                <span className="mx-1 hidden h-4 w-px sm:block" style={{ background: theme.toolbar.border }} />
                <div className="hidden items-center sm:flex">
                    <Tooltip title="撤销"><Button type="text" className="!h-8 !w-8 !min-w-8 !p-0" style={{ color: theme.toolbar.item }} disabled={!canUndo} aria-label="撤销" icon={<Undo2 className="size-4" />} onClick={onUndo} /></Tooltip>
                    <Tooltip title="重做"><Button type="text" className="!h-8 !w-8 !min-w-8 !p-0" style={{ color: theme.toolbar.item }} disabled={!canRedo} aria-label="重做" icon={<Redo2 className="size-4" />} onClick={onRedo} /></Tooltip>
                </div>
            </div>
            <Modal title="快捷键" open={shortcutsOpen} onCancel={() => setShortcutsOpen(false)} footer={null} centered>
                <div className="space-y-3 border-t pt-4 text-sm" style={{ borderColor: theme.node.stroke }}>
                    <Shortcut label="Space + 拖动" value="临时反转选择/移动工具" />
                    <Shortcut label="滚轮" value="缩放画布" />
                    <Shortcut label="拖动" value="使用当前工具操作画布" />
                    <Shortcut label="Shift / Ctrl / Cmd + 点击" value="追加选择节点" />
                    <Shortcut label="Ctrl / Cmd + G" value="创建组" />
                    <Shortcut label="Ctrl / Cmd + C / V" value="复制 / 粘贴节点" />
                    <Shortcut label="Delete / Backspace" value="删除选中" />
                </div>
            </Modal>
        </div>
    );
}

function Shortcut({ label, value }: { label: ReactNode; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-base font-medium">{label}</span>
            <span className="opacity-60">{value}</span>
        </div>
    );
}
