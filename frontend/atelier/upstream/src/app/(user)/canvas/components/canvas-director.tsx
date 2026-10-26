"use client";
import { useEffect, useRef, useState } from "react";
import { getOwnerTag, getAuthToken } from "@/xoi/owner";
import { assertDirectorReference, type DirectorReferenceProject } from "../../../../../../../../shared/directorProject";
import { checkpointDirector, directorShotPackage } from "../../../../../../../src/utils/directorHandoff";
import type { CanvasDirectorCapture, CanvasDirectorPanorama } from "../types";
type Props = {
    nodeId: string;
    project: unknown;
    panoramas: CanvasDirectorPanorama[];
    theme: "light" | "dark";
    onClose: () => void;
    onProjectChange: (project: unknown) => void;
    onPanoramaRemoved: (payload: Pick<CanvasDirectorPanorama, "edgeId" | "sourceNodeId">) => void;
    onCapturesSent: (id: string, captures: CanvasDirectorCapture[]) => void;
    onReferenceSent: (graph: any) => Promise<void>;
};
export function CanvasDirector({ nodeId, project, onClose, onCapturesSent, onReferenceSent }: Props) {
    const owner = getOwnerTag().replace(/^u/, ""),
        token = getAuthToken(),
        iframeRef = useRef<HTMLIFrameElement>(null),
        mounted = useRef(true),
        forkId = useRef(""),
        working = useRef(false);
    const [sceneId, setSceneId] = useState(""),
        [source, setSource] = useState<DirectorReferenceProject | null>(null),
        [review, setReview] = useState(false),
        [error, setError] = useState(""),
        [busy, setBusy] = useState(false),
        [revision, setRevision] = useState(0),
        [legacy, setLegacy] = useState(false),
        [available, setAvailable] = useState(false),
        [retry, setRetry] = useState(0),
        [selectedShot, setSelectedShot] = useState(""),
        [needsStudio, setNeedsStudio] = useState(false);
    const check = () => {
        if (!mounted.current || getAuthToken() !== token) throw new Error("账号或画布已切换");
    };
    useEffect(() => {
        mounted.current = true;
        let cancelled = false;
        (async () => {
            try {
                let reference: DirectorReferenceProject | null = null;
                if ((project as any)?.schemaVersion === 1) {
                    assertDirectorReference(project, owner);
                    reference = project;
                } else if (project && typeof project === "object" && Object.keys(project).length) setLegacy(true);
                const id = reference?.link.sceneId || `director3d-u${owner}-canvas-${nodeId}`;
                const localKey = `monoform-project-${id}`,
                    old = localStorage.getItem(`monoform-project-u${owner}-canvas-${nodeId}`);
                if (!reference && !localStorage.getItem(localKey) && old) localStorage.setItem(localKey, old);
                setSource(reference);
                setSelectedShot(reference?.link.shotId || "");
                setAvailable(false);
                const response = await fetch(`/api/director-scenes/${encodeURIComponent(id)}`, { headers: { Authorization: token }, signal: AbortSignal.timeout(5000) });
                if (cancelled) return;
                check();
                if (reference) {
                    if (!response.ok) {
                        setReview(true);
                        setError("原场景暂不可用，可重试或将画布参考另存为新场景。");
                        setSceneId(id);
                        return;
                    }
                    const { data } = await response.json();
                    if (!Array.isArray(data?.payload?.project?.shots)) throw new Error("云端场景格式无效，原参考保留");
                    setAvailable(true);
                    const exists = data.payload.project.shots.some((s: any) => s.id === reference!.link.shotId);
                    if (!exists) setSelectedShot("");
                    if (!exists || data.revision !== reference.link.revision) {
                        setReview(true);
                        setError(exists ? "场景已有更新。画布图片保留原参考版本，请选择打开最新场景，或将参考版本另存。" : "原镜头已移除，可打开场景当前镜头，或将参考版本另存。");
                    }
                }
                setSceneId(id);
            } catch (e: any) {
                if (!cancelled) setError(e.message || "导演场景读取失败");
            }
        })();
        return () => {
            cancelled = true;
            mounted.current = false;
        };
    }, [nodeId, project, owner, token, retry]);
    const start = () => {
        if (working.current) return false;
        working.current = true;
        setBusy(true);
        return true;
    };
    const finish = () => {
        working.current = false;
        if (mounted.current) setBusy(false);
    };
    async function close() {
        if (!start()) return;
        try {
            if (sceneId && !review) await checkpointDirector(iframeRef.current, sceneId, owner);
            check();
            onClose();
        } catch (e: any) {
            setError(e.message + "；本机草稿仍保留，可重试或保留草稿返回。");
        } finally {
            finish();
        }
    }
    async function openStudio() {
        if (!start()) return;
        try {
            await checkpointDirector(iframeRef.current, sceneId, owner);
            check();
            window.top!.location.hash = "/director3d?scene=" + encodeURIComponent(sceneId);
        } catch (e: any) {
            setError(e.message);
        } finally {
            finish();
        }
    }
    async function fork() {
        if (!source || !start()) return;
        try {
            check();
            const id = (forkId.current ||= `director3d-u${owner}-${crypto.randomUUID()}`);
            let response = await fetch(`/api/director-scenes/${id}`, { headers: { Authorization: token }, signal: AbortSignal.timeout(12000) });
            if (response.status === 404)
                response = await fetch(`/api/director-scenes/${id}`, {
                    method: "PUT",
                    headers: { Authorization: token, "Content-Type": "application/json" },
                    body: JSON.stringify({ revision: 0, title: source.link.sceneName + " · 参考副本", payload: { schemaVersion: 1, project: source.snapshot } }),
                    signal: AbortSignal.timeout(12000),
                });
            check();
            if (!response.ok) throw new Error("副本保存未确认，请重试");
            setSceneId(id);
            setSelectedShot(source.link.shotId);
            setReview(false);
            setError("");
            setRevision(1);
        } catch (e: any) {
            setError(e.message);
        } finally {
            finish();
        }
    }
    useEffect(() => {
        const handle = async (event: MessageEvent) => {
            if (event.origin !== location.origin || event.source !== iframeRef.current?.contentWindow || event.data?.source !== "monoform") return;
            const d = event.data;
            if (d.type === "motion-preset" && d.key === sceneId) {
                setNeedsStudio(true);
                return;
            }
            if (d.type === "scene-sync" && d.key === sceneId) {
                setRevision(d.revision || 0);
                return;
            }
            if (d.type === "send-shot" && d.key === sceneId) {
                if (!start()) return;
                try {
                    const { graph } = await directorShotPackage(iframeRef.current, sceneId, owner, source?.link.sceneName || "导演场景",undefined,{mode:d.mode==='video'?'video':'image'});
                    check();
                    await onReferenceSent(graph);
                } catch (e: any) {
                    if (mounted.current&&e.name!=="AbortError") setError(e.message);
                } finally {
                    finish();
                }
                return;
            }
            // Raw MP4 exports download natively. Only the versioned send-shot pipeline may add a video package.
            if (d.type !== "export" || d.kind === "video" || !(d.blob instanceof Blob)) return;
            const fileName = `导演台-${Date.now()}.${d.kind === "image" ? "png" : d.blob.type === "video/webm" ? "webm" : "mp4"}`;
            if (d.kind === "image") {
                const reader = new FileReader();
                reader.onload = () => {
                    if (mounted.current && getAuthToken() === token) onCapturesSent(nodeId, [{ dataUrl: String(reader.result), fileName }]);
                };
                reader.readAsDataURL(d.blob);
            }
        };
        window.addEventListener("message", handle);
        return () => window.removeEventListener("message", handle);
    }, [sceneId, nodeId, owner, source, token, onCapturesSent, onReferenceSent]);
    return (
        <div className="fixed inset-0 z-[2000] bg-[#242220] text-[#eee9e4]" data-canvas-no-zoom>
            <div className="absolute left-0 top-0 z-30 flex h-[44px] w-[180px] items-center gap-2 border-b border-r border-[#51463e] bg-[#292522] px-2 text-xs">
                <button type="button" disabled={busy} aria-label="保存并返回画布" className="rounded border border-[#665346] px-2 py-1 disabled:opacity-50" onClick={() => void close()}>
                    {busy ? "正在保存…" : "← 保存并返回"}
                </button>
                <span className="truncate">{revision ? `场景 v${revision}` : "3D 导演台"}</span>
            </div>
            {busy && (
                <div className="absolute inset-0 z-20 grid place-items-center bg-black/10 text-sm">
                    <span className="rounded border border-[#665346] bg-[#292522] px-4 py-3">正在核对并保存当前镜头…</span>
                </div>
            )}
            {legacy && (
                <div className="absolute right-4 top-[90px] z-30 max-w-md rounded border border-[#665346] bg-[#292522] p-3 text-xs">
                    旧格式工程保留在节点中，未自动转换或覆盖。
                    <button
                        className="ml-2 underline"
                        onClick={() => {
                            const url = URL.createObjectURL(new Blob([JSON.stringify(project)], { type: "application/json" }));
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = "旧版导演工程.json";
                            a.click();
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }}
                    >
                        下载旧工程
                    </button>
                </div>
            )}
            {needsStudio && !review && (
                <section role="status" className="absolute right-4 top-[90px] z-40 max-w-sm rounded border border-[#886144] bg-[#292522] p-4 text-sm shadow-lg">
                    <p>运镜预设和 AI 助理在完整导演台中使用，将继续编辑当前场景。</p>
                    <div className="mt-3 flex gap-3">
                        <button disabled={busy} className="rounded border px-3 py-2" onClick={() => void openStudio()}>
                            保存并打开完整导演台
                        </button>
                        <button className="underline" onClick={() => setNeedsStudio(false)}>
                            继续在此编辑
                        </button>
                    </div>
                </section>
            )}
            {(review || error) && (
                <section role="status" className="absolute left-1/2 top-[90px] z-40 w-[min(560px,90vw)] -translate-x-1/2 rounded border border-[#886144] bg-[#292522] p-4 text-sm shadow-lg">
                    <p>{error}</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                        {review && (
                            <>
                                <button
                                    disabled={busy}
                                    className="rounded border px-3 py-2 disabled:opacity-50"
                                    onClick={() => {
                                        if (available) {
                                            setReview(false);
                                            setError("");
                                        } else {
                                            setError("正在重新核对场景…");
                                            setRetry((v) => v + 1);
                                        }
                                    }}
                                >
                                    {available ? "打开最新场景" : "重新核对原场景"}
                                </button>
                                <button disabled={busy} className="rounded border px-3 py-2 disabled:opacity-50" onClick={() => void fork()}>
                                    将参考版本另存为新场景
                                </button>
                            </>
                        )}
                        <button disabled={busy} className="underline disabled:opacity-50" onClick={onClose}>
                            {review ? "返回画布" : "保留本机草稿并返回"}
                        </button>
                    </div>
                </section>
            )}
            {sceneId && !review && (
                <iframe
                    key={sceneId}
                    ref={iframeRef}
                    title="3D导演台"
                    src={`/monoform/index.html?key=${encodeURIComponent(sceneId)}${selectedShot ? `&shot=${encodeURIComponent(selectedShot)}` : ""}`}
                    className="block h-full w-full border-0"
                    allow="clipboard-write; download; fullscreen"
                />
            )}
        </div>
    );
}
