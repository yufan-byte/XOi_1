"use client";

import { useEffect, useRef, useState } from "react";
import { Film, Upload, X } from "lucide-react";
import { Button, Input, Popover, Select } from "antd";
import ReactMarkdown from "react-markdown";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { backendFetch } from "../../../../../../src/xoi/backend";
import { extractAnalysisFrames, type AnalysisVideo } from "../../../../../../../src/utils/videoFrames";
import type { CanvasAgentSkillSelection, CanvasAssistantReference } from "../types";

type Props = {
    references: CanvasAssistantReference[];
    model: string;
    skills?: CanvasAgentSkillSelection[];
    disabled: boolean;
    onInsert: (report: string) => void;
};

/** A reference tool inside the existing composer; never submits or replaces its Agent. */
export function CanvasReferenceAnalysisPopover({ references, model, skills, disabled, onInsert }: Props) {
    const theme = canvasThemes[useThemeStore(state => state.theme)];
    const token = useUserStore(state => state.token);
    const videos = references.filter(reference => reference.type === "video" && (reference.dataUrl || reference.url));
    const [open, setOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [videoId, setVideoId] = useState("");
    const [request, setRequest] = useState("拆解这个参考视频的镜头、构图、运镜、光影和剪辑节奏，给出可执行的分镜与制作建议。");
    const [video, setVideo] = useState<AnalysisVideo | null>(null);
    const [report, setReport] = useState("");
    const [progress, setProgress] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [complete, setComplete] = useState(false);
    const controllerRef = useRef<AbortController | null>(null);
    const uploadRef = useRef<HTMLInputElement>(null);
    const reference = videos.find(item => item.id === videoId) || videos[0];
    const source = file || (reference?.dataUrl || reference?.url);

    const stop = () => {
        if (!controllerRef.current) return;
        controllerRef.current.abort();
        controllerRef.current = null;
        setBusy(false);
        setProgress("已停止，可重新分析");
    };
    const close = () => { stop(); setOpen(false); };
    useEffect(() => () => { controllerRef.current?.abort(); }, []);
    useEffect(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setOpen(false); setFile(null); setVideo(null); setReport(""); setBusy(false); setComplete(false); setError(""); setProgress(""); setVideoId("");
    }, [token]);
    const reset = () => { setReport(""); setVideo(null); setComplete(false); setError(""); setProgress(""); };

    const analyze = async () => {
        if (!source || busy || disabled) return;
        const controller = new AbortController();
        controllerRef.current = controller;
        reset(); setBusy(true); setProgress("正在读取视频画面…");
        try {
            const frames = await extractAnalysisFrames({ name: file?.name || reference?.title || "参考视频", source }, controller.signal, setProgress);
            controller.signal.throwIfAborted();
            setVideo(frames);
            const modelName = (model.split("::").pop() || "").replace(/^newapi:/, "");
            const analysisModel = modelName ? `newapi:${modelName}` : undefined;
            const response = await backendFetch("/api/aiAssistant/chat/stream", {
                method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: request.trim(), messages: [], model: analysisModel, skills: (skills || []).filter(skill => skill.source === "system").map(skill => skill.id).slice(0, 4), analysisVideo: frames }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.message || data.msg || data.error || `分析请求失败 (${response.status})`);
            }
            const reader = response.body?.getReader();
            if (!reader) throw new Error("无法读取分析结果");
            const decoder = new TextDecoder();
            let buffer = "", doneEvent = false, content = "";
            const consume = (line: string) => {
                const value = line.trim();
                if (value === "data: [DONE]") { doneEvent = true; return; }
                if (!value.startsWith("data: ")) return;
                const event = JSON.parse(value.slice(6));
                if (event.error) throw new Error(String(event.error));
                if (event.tool?.message) setProgress(String(event.tool.message));
                if (typeof event.content === "string") { content += event.content; setReport(content); }
            };
            try {
                while (true) {
                    const chunk = await reader.read();
                    controller.signal.throwIfAborted();
                    if (chunk.done) break;
                    buffer += decoder.decode(chunk.value, { stream: true });
                    const lines = buffer.split("\n"); buffer = lines.pop() || "";
                    lines.forEach(consume);
                }
                consume(buffer + decoder.decode());
            } finally { await reader.cancel().catch(() => {}); }
            controller.signal.throwIfAborted();
            if (!doneEvent || !content.trim()) throw new Error("分析未完成，请重试");
            setComplete(true); setProgress("分析完成");
        } catch (reason) {
            if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "分析失败，请重试");
        } finally {
            if (controllerRef.current === controller) { controllerRef.current = null; setBusy(false); }
        }
    };

    const content = <section style={{ width: "min(580px, calc(100vw - 56px))" }} onPointerDown={event => event.stopPropagation()} aria-label="参考视频分析">
        <div className="mb-4 flex items-center justify-between"><div><strong className="text-sm">拆解参考视频</strong><p className="m-0 mt-1 text-xs opacity-55">分析结果可填入画布对话，继续创作。</p></div><Button type="text" size="small" aria-label="关闭参考分析" icon={<X className="size-4" />} onClick={close} /></div>
        <div className="thin-scrollbar space-y-3 overflow-y-auto" style={{ maxHeight: "min(540px, 58vh)" }}>
            <div className="flex items-center gap-2">
                <Button icon={<Upload className="size-3.5" />} disabled={busy} onClick={() => uploadRef.current?.click()}>{file ? "更换视频" : "上传视频"}</Button>
                {file ? <span className="min-w-0 truncate text-xs" title={file.name}>{file.name}</span> : videos.length ? <Select className="min-w-0 flex-1" aria-label="选择画布参考视频" value={reference?.id} disabled={busy} options={videos.map(item => ({ value: item.id, label: item.label || item.title }))} onChange={id => { setVideoId(id); reset(); }} /> : <span className="text-xs opacity-55">也可先在画布对话中引用视频</span>}
                {file && videos.length ? <Button type="text" size="small" disabled={busy} onClick={() => { setFile(null); reset(); }}>用画布素材</Button> : null}
            </div>
            <input hidden ref={uploadRef} type="file" accept="video/*" onChange={event => { const selected = event.target.files?.[0]; event.target.value = ""; if (selected) { setFile(selected); reset(); } }} />
            <Input.TextArea aria-label="参考分析需求" rows={2} value={request} disabled={busy} onChange={event => { setRequest(event.target.value); setComplete(false); }} />
            <div className="text-[11px] opacity-55">抽取 12 帧 · 不包含音轨 · 使用当前思考模型{model ? ` ${model}` : ""}</div>
            {video ? <div className="flex gap-2 overflow-x-auto pb-1" aria-label="视频抽帧预览">{video.frames.map(frame => <figure key={frame.time} className="m-0 w-24 shrink-0"><img src={frame.dataUrl} alt={`${frame.time.toFixed(1)} 秒的画面`} className="h-16 w-24 rounded-md object-cover" /><figcaption className="mt-1 text-[10px] opacity-55">{frame.time.toFixed(1)}s</figcaption></figure>)}</div> : null}
            {progress ? <p role="status" className="m-0 text-xs opacity-65">{progress}</p> : null}
            {error ? <p role="alert" className="m-0 text-xs text-red-500">{error}</p> : null}
            {report ? <div className="rounded-xl border p-3 text-xs leading-7" style={{ borderColor: theme.node.stroke }}><ReactMarkdown>{report}</ReactMarkdown></div> : null}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
            <Button disabled={!busy && (disabled || !source || !request.trim())} onClick={() => busy ? stop() : void analyze()}>{busy ? "停止分析" : complete ? "重新分析" : "开始分析"}</Button>
            <Button type="primary" disabled={!complete || busy || disabled} onClick={() => { onInsert(`参考视频分析（${video?.name || "参考视频"}）：\n${report}`); close(); }}>填入对话</Button>
        </div>
    </section>;
    return <Popover trigger="click" placement="top"
                arrow={false} open={open} onOpenChange={value => value ? setOpen(true) : close()} content={content} styles={{ container: { padding: 18, background: theme.toolbar.panel, color: theme.node.text, border: `1px solid ${theme.node.stroke}`, borderRadius: 16 } }}>
        <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={{ color: theme.node.text }} icon={<Film className="size-4" />} title="拆解参考视频" aria-label="拆解参考视频" disabled={disabled} />
    </Popover>;
}
