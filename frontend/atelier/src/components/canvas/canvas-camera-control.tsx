import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Camera, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button, Switch, Tooltip } from "antd";

import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { APERTURES, APERTURE_META, applyCameraPrompt, CAMERA_PROFILES, FOCAL_LENGTHS, FOCAL_LENGTH_META, LENS_PROFILES, type CameraProfile, type LensProfile } from "@/lib/canvas/canvas-camera";
import type { CameraControlOptions } from "@/types/canvas";

const DEFAULT_CAMERA_CONTROL: CameraControlOptions = { enabled: false, camera: CAMERA_PROFILES[0].id, lens: LENS_PROFILES[0].id, focalLength: 50, aperture: 4 };

export const buildCameraPrompt = applyCameraPrompt;

export function CanvasCameraControl({ value, onChange, buttonClassName }: { value?: CameraControlOptions; onChange: (value: CameraControlOptions) => void; buttonClassName?: string }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const control = value || DEFAULT_CAMERA_CONTROL;
    const camera = CAMERA_PROFILES.find((item) => item.id === control.camera) || CAMERA_PROFILES[0];
    const lens = LENS_PROFILES.find((item) => item.id === control.lens) || LENS_PROFILES[0];
    const update = (patch: Partial<CameraControlOptions>) => onChange({ ...control, ...patch });
    useEffect(() => {
        if (!open) return;
        const sync = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const close = (event: PointerEvent) => { const target = event.target; if (!(target instanceof Node) || buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return; setOpen(false); };
        sync(); window.addEventListener("resize", sync); window.addEventListener("scroll", sync, true); window.addEventListener("pointerdown", close, true);
        return () => { window.removeEventListener("resize", sync); window.removeEventListener("scroll", sync, true); window.removeEventListener("pointerdown", close, true); };
    }, [open]);
    const style = buttonRect ? { position: "fixed" as const, zIndex: 1200, width: 900, left: buttonRect.left + buttonRect.width / 2, bottom: window.innerHeight - buttonRect.top + 8, transform: "translateX(-50%) scale(0.75)", transformOrigin: "center bottom", background: theme.toolbar.panel, border: `1px solid ${theme.toolbar.border}`, borderRadius: 18, boxShadow: "0 18px 54px rgba(28,25,23,.16)", color: theme.node.text } : undefined;
    const shift = <T,>(values: readonly T[], value: T, direction: -1 | 1) => values[Math.min(Math.max(values.indexOf(value) + direction, 0), values.length - 1)];
    return <>
        <span ref={buttonRef} className="inline-flex min-w-0" onPointerDown={(event) => event.stopPropagation()}>
            <Button icon={<Camera className="size-4" />} className={buttonClassName || "!h-10 !min-w-[92px] !justify-start !rounded-full !px-3"} style={{ background: control.enabled ? theme.toolbar.activeBg : theme.node.fill, borderColor: control.enabled ? theme.node.activeStroke : theme.node.stroke, color: theme.node.text }} aria-expanded={open} onClick={() => setOpen((current) => !current)}>摄像机</Button>
        </span>
        {open && buttonRect && style ? createPortal(<div ref={panelRef} style={style} data-canvas-no-zoom onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: theme.toolbar.border }}><h2 className="text-base font-semibold">摄像机</h2><button type="button" className="grid size-8 place-items-center rounded-lg" style={{ color: theme.node.muted }} aria-label="关闭" onClick={() => setOpen(false)}><X className="size-5" /></button></div>
            <div className="px-6 py-5"><div className="overflow-x-auto"><div className="grid min-w-[840px] grid-cols-4">
                <SettingColumn theme={theme} label="相机" caption={camera.label} badge={camera.zhName} visual={<CameraVisual profile={camera} theme={theme} />} onPrevious={camera.id === CAMERA_PROFILES[0].id ? undefined : () => update({ camera: shift(CAMERA_PROFILES.map((item) => item.id), camera.id, -1) })} onNext={camera.id === CAMERA_PROFILES[CAMERA_PROFILES.length - 1].id ? undefined : () => update({ camera: shift(CAMERA_PROFILES.map((item) => item.id), camera.id, 1) })} />
                <SettingColumn theme={theme} separator label="镜头" caption={lens.label} badge={lens.zhName} visual={<LensVisual profile={lens} theme={theme} />} onPrevious={lens.id === LENS_PROFILES[0].id ? undefined : () => update({ lens: shift(LENS_PROFILES.map((item) => item.id), lens.id, -1) })} onNext={lens.id === LENS_PROFILES[LENS_PROFILES.length - 1].id ? undefined : () => update({ lens: shift(LENS_PROFILES.map((item) => item.id), lens.id, 1) })} />
                <SettingColumn theme={theme} separator label="焦距" caption="mm" badge={FOCAL_LENGTH_META[control.focalLength]?.zhName} visual={<div className="flex flex-col items-center"><div className="text-5xl font-light leading-none">{control.focalLength}</div><div className="mt-2 text-xs tracking-wider opacity-55">mm</div></div>} onPrevious={control.focalLength === FOCAL_LENGTHS[0] ? undefined : () => update({ focalLength: shift(FOCAL_LENGTHS, control.focalLength, -1) })} onNext={control.focalLength === FOCAL_LENGTHS[FOCAL_LENGTHS.length - 1] ? undefined : () => update({ focalLength: shift(FOCAL_LENGTHS, control.focalLength, 1) })} />
                <SettingColumn theme={theme} separator label="光圈" caption={`f/${control.aperture}`} badge={APERTURE_META[control.aperture]?.zhName} visual={<div className="flex items-baseline"><span className="text-2xl font-light opacity-70">f/</span><span className="text-5xl font-light leading-none">{control.aperture}</span></div>} onPrevious={control.aperture === APERTURES[0] ? undefined : () => update({ aperture: shift(APERTURES, control.aperture, -1) })} onNext={control.aperture === APERTURES[APERTURES.length - 1] ? undefined : () => update({ aperture: shift(APERTURES, control.aperture, 1) })} />
            </div></div><div className="mt-6 flex items-center justify-end gap-2"><span className="text-sm">{control.enabled ? "开启" : "关闭"}</span><Switch size="small" checked={control.enabled} aria-label="摄像机控制" onChange={(enabled) => update({ enabled })} /></div></div>
        </div>, document.body) : null}
    </>;
}

function SettingColumn({ theme, separator, label, caption, badge, visual, onPrevious, onNext }: { theme: CanvasTheme; separator?: boolean; label: string; caption: string; badge?: string; visual: ReactNode; onPrevious?: () => void; onNext?: () => void }) {
    return <div className="flex flex-col items-center px-5" style={{ borderLeft: separator ? `1px solid ${theme.node.stroke}` : undefined }}><Button type="text" disabled={!onPrevious} className="group !h-8 !w-full !p-0 hover:!bg-transparent" style={{ color: theme.node.faint }} icon={<ChevronUp className="h-5 w-8 rounded-md p-0.5" />} aria-label={`上一项${label}`} onClick={onPrevious} /><Tooltip title={`${label}：${caption}`}><div className="relative flex h-[180px] w-full max-w-[180px] flex-col items-center justify-between rounded-2xl border px-4 py-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}><span className="text-sm font-medium">{label}</span><div className="flex flex-1 items-center justify-center">{visual}</div>{badge ? <span className="absolute right-2 top-2.5 rounded-md px-2 py-0.5 text-xs font-medium" style={{ background: theme.toolbar.activeBg }}>{badge}</span> : null}</div></Tooltip><Button type="text" disabled={!onNext} className="group !h-8 !w-full !p-0 hover:!bg-transparent" style={{ color: theme.node.faint }} icon={<ChevronDown className="h-5 w-8 rounded-md p-0.5" />} aria-label={`下一项${label}`} onClick={onNext} /><span className="max-w-full truncate text-center text-sm opacity-80">{caption}</span></div>;
}

function CameraVisual({ profile, theme }: { profile: CameraProfile; theme: CanvasTheme }) { return <svg viewBox="0 0 72 52" className="h-20 w-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="16" y="12" width="34" height="28" rx="3" fill={profile.bodyColor} stroke={profile.accentColor} /><circle cx="52" cy="26" r="9" fill={theme.canvas.background} stroke={profile.accentColor} /><rect x="23" y="6" width="15" height="7" rx="1" fill={profile.bodyColor} /><text x="20" y="36" fontSize="5" fill={profile.accentColor}>CINEMA</text></svg>; }
function LensVisual({ profile, theme }: { profile: LensProfile; theme: CanvasTheme }) { return <svg viewBox="0 0 88 56" className="h-20 w-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="8" y="17" width="68" height="24" rx="5" fill={profile.lensColor} stroke={theme.node.faint} /><rect x="20" y="17" width="5" height="24" fill={profile.ringColor} opacity=".7" /><rect x="36" y="17" width="5" height="24" fill={profile.ringColor} opacity=".7" /><rect x="52" y="17" width="5" height="24" fill={profile.ringColor} opacity=".7" /><circle cx="72" cy="29" r="10" fill={theme.canvas.background} stroke={profile.ringColor} strokeWidth="2" /><circle cx="72" cy="29" r="5" fill={theme.node.panel} stroke={theme.node.faint} /></svg>; }
