"use client";
// 制作阶段：06 剧本 / 07 资产 / 08 分镜 / 09 视频（含成片）
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, Film, ImagePlus, Loader2, Mic, Pencil, Plus, RefreshCw, RotateCcw, Sparkles, Trash2, Upload, Volume2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PillSelect } from "@/components/ui/select";
import type { CatalogModel } from "@/lib/models";
import { cn, uid } from "@/lib/utils";
import { validOf, voiceLibraryOf } from "@/lib/voices";
import { mfVideoCaps } from "../multiframe/video-caps";
import { durationsOf, sampleKey, sampleLine, shotSeconds, videoBillParams } from "./caps";
import { PriceTag } from "./cost-dialog";
import { defaultVideoPrompt, extractAssets, generateAssetImage, generateSceneSpeech, generateSceneVideo, generateScript, generateStoryboard, generateVoiceSample, sceneVideoRefCount, writeShotPrompts, type ShotSpec } from "./pipeline";
import { runProjectGeneration,recoverExistingVideo } from '../adapters/generation';
import { composeWebm, downloadAll, downloadUrl, shrinkImage } from "./video-kit";
import { Field, PlaylistPlayer, SegButtons, StatusBadge, inputCls, textareaCls } from "./ui";
import { ConfirmBar, Empty, StageHeader, err, type StepProps } from "./stage-kit";
import {KeyframeDialog} from './keyframe-dialog';
import {VideoGenDialog} from './video-gen-dialog';
import {movieCurrent,videoInputPolicy,imageReferenceLimit} from '../../../../../shared/oneStopMedia';
import {planSpeech,hasSpeech,speechStale,movieAudioIssues} from '../../../../../shared/oneStopSpeech';
import { ASSET_KIND_LABEL, VOICES, allScenes, episodeTargetSec, fmtDuration, patchScene, regionLang, scenesSeconds, type AssetKind, type ComicAsset, type ComicProject, type ComicScene } from "./types";

export type { Save, StepProps } from "./stage-kit";

const SHOT_SIZES = ["远景", "全景", "中景", "近景", "特写"];
const CAMERAS = ["固定", "推", "拉", "摇", "移", "跟", "升降", "环绕"];
const cellCls = "w-full rounded-lg border bg-background px-2 py-1 outline-none focus:border-primary/50";
/** 按项目当前选的模型取目录卡片：批量跑到后面时用户可能改了模型，每次都按最新项目查 */
const modelOf = (catalog: CatalogModel[] | undefined, id?: string) => (id ? catalog?.find((m) => m.id === id) : undefined);
/** 角色音色「跟随项目默认」：Radix Select 不收空字符串，用占位值 */
const DEFAULT_VOICE = "__default";

/* ---------- 06 剧本 ---------- */
export function ScriptStep({ p, save, busy, setBusy, confirmStage, redo }: StepProps) {
  const script = p.script;
  const run = async () => {
    if (script && !await redo("script")) return;
    setBusy(true);
    try { const s = await generateScript(p); save((c) => ({ ...c, script: s })); toast.success(`已生成剧本《${s.title}》，共 ${s.episodes.length} 集 ${allScenes({ ...p, script: s }).length} 场`); }
    catch (e) { toast.error(err(e)); } finally { setBusy(false); }
  };
  const setScene = (id: string, patch: Partial<ComicScene>) => save((c) => patchScene(c, id, patch));
  const addScene = (ei: number) => save((c) => ({ ...c, script: { ...c.script!, episodes: c.script!.episodes.map((e, i) => (i === ei ? { ...e, scenes: [...e.scenes, { id: `e${ei + 1}s${uid().slice(0, 4)}`, location: "", time: "", action: "", dialogue: "", characters: [] }] } : e)) } }));
  const delScene = (id: string) => save((c) => ({ ...c, script: { ...c.script!, episodes: c.script!.episodes.map((e) => ({ ...e, scenes: e.scenes.filter((s) => s.id !== id) })) } }));
  return (
    <div className="space-y-5">
      <StageHeader p={p} stage="script"><Button variant="secondary" disabled={busy} onClick={run}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}{script ? "重新生成剧本" : "AI 生成剧本"}</Button></StageHeader>
      {!script ? (busy ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed py-12 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin text-primary" />正在把小说改写成分场剧本…</div> : <Empty text={p.novel ? "点击「AI 生成剧本」把小说正文改写为分场剧本。" : "点击「AI 生成剧本」按大纲直接写出分场剧本。"} />) : (
        <>
          <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
            <Field label="剧名"><input value={script.title} onChange={(e) => save((c) => ({ ...c, script: { ...c.script!, title: e.target.value } }))} className={inputCls} /></Field>
            <Field label="梗概"><input value={script.synopsis} onChange={(e) => save((c) => ({ ...c, script: { ...c.script!, synopsis: e.target.value } }))} className={inputCls} /></Field>
          </div>
          {script.episodes.map((ep, ei) => (
            <div key={ei} className="overflow-hidden rounded-2xl border">
              <div className="flex items-center gap-2 bg-muted/60 px-4 py-2 text-sm font-medium"><Film size={14} /><span className="font-mono text-xs text-muted-foreground">第 {ei + 1} 集</span><input value={ep.title} onChange={(e) => save((c) => ({ ...c, script: { ...c.script!, episodes: c.script!.episodes.map((x, i) => (i === ei ? { ...x, title: e.target.value } : x)) } }))} className="bg-transparent outline-none" /><span className="ml-auto text-xs text-muted-foreground">{ep.scenes.length} 场{(() => { const t = episodeTargetSec(p, p.outline?.episodes[ei]); return t ? ` · 本集总时长 ${fmtDuration(t)} · 已排约 ${fmtDuration(scenesSeconds(ep.scenes))}` : ""; })()}</span></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
                <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="w-12 px-3 py-2">#</th><th className="w-32 px-3 py-2">场景</th><th className="w-28 px-3 py-2">时间</th><th className="w-36 px-3 py-2">人物</th><th className="w-60 px-3 py-2">对白</th><th className="px-3 py-2">动作</th><th className="w-10" /></tr></thead>
                <tbody>{ep.scenes.map((s, si) => (
                  <tr key={s.id} className="border-b align-top last:border-0">
                    <td className="px-3 py-2 text-xs text-muted-foreground">{si + 1}</td>
                    <td className="px-3 py-2"><input value={s.location} onChange={(e) => setScene(s.id, { location: e.target.value })} className={cellCls} /></td>
                    <td className="px-3 py-2"><input value={s.time} onChange={(e) => setScene(s.id, { time: e.target.value })} className={cellCls} /></td>
                    <td className="px-3 py-2"><input value={s.characters.join("、")} onChange={(e) => setScene(s.id, { characters: e.target.value.split(/[、,，\s]+/).filter(Boolean) })} className={cellCls} placeholder="用顿号分隔" /></td>
                    <td className="px-3 py-2"><textarea value={s.dialogue} rows={3} onChange={(e) => setScene(s.id, { dialogue: e.target.value })} className={cn(cellCls, "leading-5")} /></td>
                    <td className="px-3 py-2"><textarea value={s.action} rows={3} onChange={(e) => setScene(s.id, { action: e.target.value })} className={cn(cellCls, "leading-5")} /></td>
                    <td className="py-2 pr-2"><button onClick={() => delScene(s.id)} className="icon-btn h-8 w-8 hover:bg-muted hover:text-danger" title="删除本场"><Trash2 size={14} /></button></td>
                  </tr>
                ))}</tbody>
              </table></div>
              <div className="px-3 py-2"><button onClick={() => addScene(ei)} className="chip h-8 text-xs hover:bg-muted"><Plus size={12} />添加一场</button></div>
            </div>
          ))}
        </>
      )}
      <ConfirmBar p={p} stage="script" busy={busy} can={!!script && allScenes(p).length > 0} onConfirm={confirmStage} />
    </div>
  );
}

/* ---------- 07 资产 ---------- */
export function AssetsStep({ p, save, busy, setBusy, confirmStage, redo, get, runBatch, catalog }: StepProps) {
  const [adding, setAdding] = useState<AssetKind | null>(null); const [newName, setNewName] = useState(""); const [newDesc, setNewDesc] = useState("");
  const [sampling, setSampling] = useState<string | null>(null);
  const im = modelOf(catalog, p.models.image); const sm = modelOf(catalog, p.models.audio);
  // 角色音色只能从当前配音模型认的音色里选（海螺发 alloy 会「音色不存在」）；目录没加载时退回 OpenAI 系兜底
  const voiceList = sm ? voiceLibraryOf(sm).map((v) => ({ value: v.id, label: v.gender ? `${v.name} · ${v.gender === "female" ? "女" : v.gender === "male" ? "男" : v.gender === "child" ? "童" : "中性"}` : v.name })) : VOICES;
  const voiceIds = voiceList.map((v) => v.value);
  const defVoice = validOf(voiceIds, p.voice, undefined) ?? p.voice;
  const voiceOpts = [{ value: DEFAULT_VOICE, label: `默认（${voiceList.find((v) => v.value === defVoice)?.label ?? defVoice}）` }, ...voiceList];
  const setAsset = (id: string, patch: Partial<ComicAsset>) => save((c) => ({ ...c, assets: c.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const extract = async () => {
    if (!p.script) { toast.error("请先生成剧本"); return; }
    if (p.assets.some((a) => !a.custom) && !await redo("assets")) return;
    setBusy(true);
    try { const assets = await extractAssets(p); save((c) => ({ ...c, assets: [...c.assets.filter((a) => a.custom), ...assets] })); toast.success(`提取到 ${assets.length} 项资产`); }
    catch (e) { toast.error(err(e)); } finally { setBusy(false); }
  };
  /** 读最新的资产（名称 / 描述可能刚被改过），单项失败只标记该项 */
  const gen = async (id: string, signal?: AbortSignal, quiet = false): Promise<boolean> => {
    const cur = get(); const a = cur.assets.find((x) => x.id === id); if (!a) return false;
    setAsset(id, { status: "running", error: undefined });
    try { const url = await generateAssetImage(cur, a, signal, modelOf(catalog, cur.models.image)); setAsset(id, { status: "done", imageUrl: url }); return true; }
    catch (e) { setAsset(id, { status: "error", error: err(e) }); if (!quiet) toast.error(err(e)); return false; }
  };
  const genAll = async () => { if(busy)return; try { await runProjectGeneration(get(), 'asset-images'); } catch(e) { toast.error(err(e)); } };
  const upload = async (a: ComicAsset, f?: File) => { if (!f) return; try { setAsset(a.id, { imageUrl: await shrinkImage(f, 1024), status: "done", error: undefined, custom: true }); toast.success("已使用自定义参考图"); } catch { toast.error("图片读取失败，请换一张"); } };
  /** 试听：(模型, 音色, 语言, 名字) 不变就直接重播缓存，变了才重新合成（每次合成都要扣一次钱） */
  const listen = async (a: ComicAsset) => {
    const cur = get(); const voice = validOf(voiceIds, a.voice, defVoice) ?? defVoice; const key = sampleKey(cur.models.audio ?? "", voice, cur.region, a.name);
    if (a.sampleUrl && a.sampleKey === key) { void new Audio(a.sampleUrl).play().catch(() => {}); return; }
    setSampling(a.id);
    try { const url = await generateVoiceSample(cur, sampleLine(regionLang(cur.region).lang, a.name), voice, modelOf(catalog, cur.models.audio)); if (a.sampleUrl?.startsWith("blob:")) URL.revokeObjectURL(a.sampleUrl); setAsset(a.id, { sampleUrl: url, sampleKey: key }); void new Audio(url).play().catch(() => {}); }
    catch (e) { toast.error(err(e)); } finally { setSampling(null); }
  };
  const addCustom = async () => { if (!adding || !newName.trim()) return; save((c) => ({ ...c, assets: [...c.assets, { id: uid(), kind: adding, name: newName.trim(), description: newDesc.trim(), status: "idle", custom: true }] })); setAdding(null); setNewName(""); setNewDesc(""); };
  const groups = (["character", "scene", "prop"] as AssetKind[]).map((k) => ({ kind: k, items: p.assets.filter((a) => a.kind === k) }));
  return (
    <div className="space-y-5">
      <StageHeader p={p} stage="assets">
        <Button variant="secondary" disabled={busy} onClick={extract}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}{p.assets.length ? "重新提取" : "提取资产"}</Button>
        <Button variant="soft" disabled={busy || !p.assets.some(a=>!a.imageUrl)} onClick={genAll}><Sparkles size={16} />补齐缺失定妆图{p.assets.some(a=>!a.imageUrl)?` · ${p.assets.filter(a=>!a.imageUrl).length}`:''}</Button>
      </StageHeader>
      {!p.assets.length && <Empty text="点击「提取资产」由 AI 从剧本中识别角色、场景与道具。" />}
      {groups.map((g) => (
        <section key={g.kind}>
          <div className="mb-2 flex items-center gap-2"><h3 className="font-medium">{ASSET_KIND_LABEL[g.kind]}</h3><span className="text-xs text-muted-foreground">{g.items.length}</span><button onClick={() => setAdding(g.kind)} className="chip h-7 text-xs hover:bg-muted"><Plus size={12} />添加自定义{ASSET_KIND_LABEL[g.kind]}</button></div>
          {adding === g.kind && <div className="mb-3 flex flex-wrap items-end gap-2 rounded-2xl border bg-muted/40 p-3"><Field label="名称" className="w-40"><input value={newName} onChange={(e) => setNewName(e.target.value)} className={inputCls} /></Field><Field label="描述" className="flex-1"><input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className={inputCls} /></Field><Button size="sm" onClick={addCustom}>添加</Button><Button size="sm" variant="ghost" onClick={() => setAdding(null)}>取消</Button></div>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {g.items.map((a) => (
              <div key={a.id} className="overflow-hidden rounded-2xl border bg-card">
                <div className={cn("relative bg-muted", g.kind === "scene" ? "aspect-video" : "aspect-square")}>
                  {a.imageUrl ? <img src={a.imageUrl} alt={a.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-muted-foreground">{a.status === "running" ? <Loader2 className="animate-spin text-primary" /> : "暂无定妆图"}</div>}
                  <div className="absolute left-2 top-2"><StatusBadge status={a.status} label={a.custom ? "自定义" : "未生成"} /></div>
                </div>
                <div className="space-y-2 p-3">
                  <input value={a.name} onChange={(e) => setAsset(a.id, { name: e.target.value })} className="w-full bg-transparent font-semibold outline-none" />
                  <textarea value={a.description} rows={3} onChange={(e) => setAsset(a.id, { description: e.target.value })} className="w-full rounded-lg border bg-background px-2 py-1 text-xs leading-5 outline-none focus:border-primary/50" />
                  {a.error && <div className="text-xs text-danger">{a.error}</div>}
                  {a.kind === "character" && <div className="flex flex-wrap items-center gap-1.5"><PillSelect label="音色" ariaLabel={`${a.name}的配音音色`} value={a.voice && voiceIds.includes(a.voice) ? a.voice : DEFAULT_VOICE} options={voiceOpts} onChange={(v) => setAsset(a.id, { voice: v === DEFAULT_VOICE ? undefined : v })} className="h-8 max-w-full text-xs" /><button disabled={sampling === a.id || !p.models.audio} onClick={() => listen(a)} title="试听按一次语音合成计费" className="chip h-8 text-xs hover:bg-muted disabled:opacity-50">{sampling === a.id ? <Loader2 size={12} className="animate-spin" /> : <Volume2 size={12} />}试听</button>{!(a.sampleUrl && a.sampleKey === sampleKey(p.models.audio ?? "", validOf(voiceIds, a.voice, defVoice) ?? defVoice, p.region, a.name)) && <span className="text-[10px] text-muted-foreground">试听按一次语音合成计费</span>}</div>}
                  <div className="flex flex-wrap gap-1.5">
                    <button disabled={a.status === "running"} onClick={() => gen(a.id)} className="chip h-8 text-xs hover:bg-muted disabled:opacity-50">{a.imageUrl ? <><RefreshCw size={12} />重生</> : <><Sparkles size={12} />生成定妆图</>}<PriceTag model={im} /></button>
                    <label className="chip h-8 cursor-pointer text-xs hover:bg-muted"><Upload size={12} />上传参考图<input type="file" accept="image/*" className="hidden" onChange={(e) => { void upload(a, e.target.files?.[0]); e.target.value = ""; }} /></label>
                    <button onClick={() => save((c) => ({ ...c, assets: c.assets.filter((x) => x.id !== a.id) }))} className="icon-btn ml-auto h-8 w-8 hover:bg-muted hover:text-danger" title="删除"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <ConfirmBar p={p} stage="assets" busy={busy} can={p.assets.length > 0 || !!p.done.assets} onConfirm={confirmStage} hint="定妆图可以稍后补；无独立资产的作品也可确认进入分镜设计。" />
    </div>
  );
}

/* ---------- 08 分镜 ---------- */
export function StoryboardStep({ p, save, busy, setBusy, confirmStage, redo, get, runBatch, vcaps, catalog }: StepProps) {
  const scenes = allScenes(p);
  const generating=useRef(new Set<string>());
  const [editor,setEditor]=useState<{id:string;mode:'frames'|'prompt'}|null>(null);
  const im = modelOf(catalog, p.models.image); const durations = durationsOf(vcaps);
  if (!scenes.length) return <div className="space-y-5"><StageHeader p={p} stage="storyboard" /><Empty text="还没有剧本场景，请先回到 06 剧本。" /></div>;
  const applyShots = (target: ComicScene[], map: Record<string, ShotSpec>) => save((c) => { let n = c; for (const s of target) if (map[s.id]) n = patchScene(n, s.id, { shotPrompt: map[s.id].prompt, shotSize: map[s.id].shotSize, camera: map[s.id].camera }); return n; });
  const writePrompts = async (only?: ComicScene[]): Promise<Record<string, ShotSpec>> => {
    if (!only && scenes.some((s) => s.imageUrl) && !await redo("storyboard")) return {};
    setBusy(true);
    try { const target = only ?? scenes; const map = await writeShotPrompts(p, target, vcaps); applyShots(target, map); toast.success("分镜已设计好"); return map; }
    catch (e) { toast.error(err(e)); return {}; } finally { setBusy(false); }
  };
  const sceneOf = (id: string) => allScenes(get()).find((x) => x.id === id);
  /** 先置「生成中」再补写画面（按钮立即禁用，防连点重复扣费）；不碰全局 busy——批量里中途把 busy 清掉会放出第二个批量循环 */
  const genOne = async (id: string, mode: "main" | "extra", signal?: AbortSignal, quiet = false): Promise<boolean> => {
    if(busy||generating.current.has(id))return false;
    const s = sceneOf(id); if (!s) return false;
    generating.current.add(id);
    save((c) => patchScene(c, id, { imageStatus: "running", imageError: undefined }));
    try {
      let prompt = s.shotPrompt;
      if (!prompt) { const map = await writeShotPrompts(get(), [s], vcaps); if(!map[id]?.prompt)throw new Error('没有取得本镜画面描述，原图保留。请先编辑画面，再重试。'); prompt = map[id].prompt; applyShots([s], map); }
      const cur = sceneOf(id) ?? s;
      await generateStoryboard(get(), { ...cur, shotPrompt: prompt }, prompt, signal, modelOf(catalog, get().models.image),mode);
      // The server atomically archives the old main frame / appends the extra frame.
      // Do not apply that mutation twice after the fresh document is synchronized.
      return true;
    } catch (e) { save((c) => patchScene(c, id, { imageStatus: "error", imageError: err(e) })); if (!quiet) toast.error(err(e)); return false; }
    finally {generating.current.delete(id);}
  };
  const genAll = async () => { if(busy)return; try { await runProjectGeneration(get(), 'storyboard-images'); } catch(e) { toast.error(err(e)); } };  const ratioCls = p.ratio === "9:16" ? "aspect-[9/16]" : p.ratio === "1:1" ? "aspect-square" : "aspect-video";
  return (
    <div className="space-y-5">
      <StageHeader p={p} stage="storyboard">
        <Button variant="secondary" disabled={busy} onClick={() => writePrompts()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}{scenes.some((s) => s.shotPrompt) ? "重新设计全部分镜" : "AI 设计分镜"}</Button>
        <Button variant="soft" disabled={busy||!scenes.some(s=>!s.imageUrl)} onClick={genAll}><Sparkles size={16} />补齐缺失关键帧{scenes.some(s=>!s.imageUrl)?` · ${scenes.filter(s=>!s.imageUrl).length}`:''}</Button>
      </StageHeader>
      {im && imageReferenceLimit(im)===0 && <p className="text-xs text-muted-foreground">当前图片模型仅支持文字出图；人物设定会写入提示词，不会发送该模型不支持的参考图字段。需要更强的一致性，请在项目设置选择支持参考图的图片模型。</p>}
      <div className={cn("grid gap-4", p.ratio === "9:16" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "sm:grid-cols-2 xl:grid-cols-3")}>
        {scenes.map((s, i) => (
          <div key={s.id} className="overflow-hidden rounded-2xl border bg-card">
            <div className={cn("relative bg-muted", ratioCls)}>
              {s.imageUrl ? <img src={s.imageUrl} alt={`分镜 ${i + 1}`} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-muted-foreground">{s.imageStatus === "running" ? <Loader2 className="animate-spin text-primary" /> : "暂无关键帧"}</div>}
              <div className="absolute left-2 top-2 flex gap-1"><span className="rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">镜号 {String(i + 1).padStart(2, "0")}</span><StatusBadge status={s.imageStatus} /></div>
            </div>
            <div className="space-y-2 p-3">
              <div className="text-sm font-medium">{s.location || "未命名地点"} · {s.time}</div>
              <div className="grid grid-cols-3 gap-1.5 text-xs">
                <label className="block"><span className="text-muted-foreground">景别</span><input list="comic-shot-sizes" value={s.shotSize ?? ""} onChange={(e) => save((c) => patchScene(c, s.id, { shotSize: e.target.value }))} placeholder="中景" className={cn(cellCls, "mt-0.5")} /></label>
                <label className="block"><span className="text-muted-foreground">运镜</span><input list="comic-cameras" value={s.camera ?? ""} onChange={(e) => save((c) => patchScene(c, s.id, { camera: e.target.value }))} placeholder="固定" className={cn(cellCls, "mt-0.5")} /></label>
                <div><span className="text-muted-foreground">时长</span>{p.fixedShotSec?<span className="os-fixed-duration" title="请在项目设定修改每镜固定时长">{shotSeconds(p,s,vcaps)} 秒 · 固定</span>:<PillSelect ariaLabel={`镜头 ${i+1} 时长`} value={String(shotSeconds(p,s,vcaps))} options={durations.map(v=>({value:String(v),label:`${v} 秒`}))} onChange={v=>save(c=>patchScene(c,s.id,{videoSeconds:Number(v)}))} className="mt-0.5 h-8 w-full justify-between text-xs"/>}</div>
              </div>
              <div className="text-xs"><span className="text-muted-foreground">画面：</span><button onClick={()=>setEditor({id:s.id,mode:'prompt'})} className="mt-1 block w-full rounded-lg bg-muted/60 px-2 py-1.5 text-left leading-5 text-muted-foreground hover:bg-muted">{s.shotPrompt ? <span className="line-clamp-3">{s.shotPrompt}</span> : "尚未设计画面 · 点击手动编写"}</button></div>
              <div className="text-xs"><span className="text-muted-foreground">台词：</span><span className="line-clamp-2">{s.dialogue || "（无）"}</span></div>
              {s.imageError && <div className="text-xs text-danger">{s.imageError}</div>}
              <div className="text-xs text-muted-foreground"><PriceTag model={im}/>{!!s.altImages?.length&&<span className="ml-2">候选图 {s.altImages.length} 张</span>}</div>
              <div className="flex flex-wrap gap-1.5">
                <button disabled={s.imageStatus === "running"} onClick={() => genOne(s.id, "main")} className="chip h-8 text-xs hover:bg-muted disabled:opacity-50">{s.imageUrl ? <><RotateCcw size={12} />重新生成</> : <><Sparkles size={12} />生成关键帧</>}</button>
                <button onClick={()=>setEditor({id:s.id,mode:'prompt'})} className="chip h-8 text-xs hover:bg-muted"><Pencil size={12} />编辑画面</button>
                <button onClick={()=>setEditor({id:s.id,mode:'frames'})} className="chip h-8 text-xs hover:bg-muted"><ImagePlus size={12} />补图 / 换图</button>
                {s.imageUrl && <button onClick={() => downloadUrl(s.imageUrl!, `${p.name}-分镜${i + 1}.png`)} className="icon-btn ml-auto h-8 w-8 hover:bg-muted" title="下载"><Download size={13} /></button>}
              </div>
            </div>
          </div>
        ))}
      </div>
      <datalist id="comic-shot-sizes">{SHOT_SIZES.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="comic-cameras">{CAMERAS.map((v) => <option key={v} value={v} />)}</datalist>
      {editor&&scenes.some(s=>s.id===editor.id)&&<KeyframeDialog key={`${editor.id}:${editor.mode}`} scene={scenes.find(s=>s.id===editor.id)!} index={scenes.findIndex(s=>s.id===editor.id)} mode={editor.mode} busy={busy} save={save} model={im} onClose={()=>setEditor(null)} onGenerate={()=>genOne(editor.id,scenes.find(s=>s.id===editor.id)?.imageUrl?'extra':'main')}/>}
      <ConfirmBar p={p} stage="storyboard" busy={busy} can={scenes.every(s=>!!s.shotPrompt||!!s.imageUrl)} onConfirm={confirmStage} hint="先完成每个镜头的画面设计；关键帧可在本页「补图 / 换图」中补齐，纯提示词视频无需关键帧。" />
    </div>
  );
}

/* ---------- 09 视频（逐镜视频 + 成片） ---------- */
export function VideoStage(props: StepProps) {
  const [tab, setTab] = useState<"clips" | "final">(movieCurrent(props.p)?"final":"clips");
  useEffect(()=>{if(movieCurrent(props.p))setTab('final');},[props.p.finalMovie?.url]);
  const scenes = allScenes(props.p);
  const ready = scenes.filter((s) => s.videoUrl).length;
  return (
    <div className="space-y-5">
      <StageHeader p={props.p} stage="video"><SegButtons value={tab} options={[{ value: "clips", label: `逐镜视频 ${ready}/${scenes.length}` }, { value: "final", label: "成片" }]} onChange={setTab} /></StageHeader>
      {tab === "clips" ? <VideoStep {...props} /> : <FinalStep {...props} onBackToClips={()=>setTab('clips')} />}
    </div>
  );
}

function VideoStep({ p, save, busy, get, runBatch, vcaps, catalog,navigate,openSettings }: StepProps) {
  const [genOpenId, setGenOpenId] = useState<string | null>(null);
  const scenes = allScenes(p);
  if (!scenes.length) return <Empty text="还没有剧本场景。" />;
  const vm = modelOf(catalog, p.models.video);
  /** 按最新项目的视频模型取线路能力：批量途中改了模型，后面的镜头按新线路的档位提交 */
  const capsOf = (c: ComicProject) => { const m = modelOf(catalog, c.models.video); return m ? mfVideoCaps(m) : undefined; };
  /** 每次都读最新场景：批量跑到后面的镜头时，用户中途改的时长 / 提示词 / 模型也要生效 */
  const genVideoFor = async (id: string, signal?: AbortSignal, quiet = false): Promise<boolean> => {
    const cur = get(); const all = allScenes(cur); const s = all.find((x) => x.id === id); if (!s) return false;
    if (!s.imageUrl && (cur.videoInput!=='text'||cur.videoProduction==='image-motion')) { if (!quiet) toast.error(`镜号 ${all.indexOf(s) + 1} 还没有关键帧`); return false; }
    const prompt = s.videoPrompt || defaultVideoPrompt(cur, s); const seconds = shotSeconds(cur, s, capsOf(cur));
    // 清掉旧 taskId：否则中途刷新后「按任务号恢复」拿回的是上一次的旧视频
    save((c) => patchScene(c, id, { videoPrompt: prompt, videoStatus: "running", videoProgress: 0, videoError: undefined }));
    try { const r = await generateSceneVideo(cur, s, prompt, seconds, (n) => save((c) => patchScene(c, id, { videoProgress: n })), signal, modelOf(catalog, cur.models.video), (taskId) => save((c) => patchScene(c, id, { videoTaskId: taskId }))); save((c) => patchScene(c, id, { videoStatus: "done", videoUrl: r.url, videoTaskId: r.taskId, videoProgress: 100 })); return true; }
    catch (e) { save((c) => patchScene(c, id, { videoStatus: "error", videoError: err(e) })); if (!quiet) toast.error(err(e)); return false; }
  };
  const genAll = async () => { if(busy)return; try { await runProjectGeneration(get(), 'scene-videos'); } catch(e) { toast.error(err(e)); } };
  /** 按任务号找回：不重新提交、不再扣费，任务还在跑就等到出结果（刷新时任务可能还没完成，直接取成品只会报「已过期」） */
  const recover = async (s: ComicScene) => {
    const taskId = s.videoTaskId; if (!taskId) return;
    save((c) => patchScene(c, s.id, { videoStatus: "running", videoProgress: 0, videoError: undefined }));
    try{const r = await recoverExistingVideo(get(),taskId);
    if (r.kind === "done") save((c) => patchScene(c, s.id, { videoStatus: "done", videoUrl: r.url, videoProgress: 100 }));
    else { const msg = r.kind === "later" ? r.message : "已停止等待"; save((c) => patchScene(c, s.id, { videoStatus: "stale", videoError: msg })); if (r.kind === "later") toast.error(msg); }}catch(e){save(c=>patchScene(c,s.id,{videoStatus:'stale',videoError:err(e)}));toast.error(err(e));}
  };
  const speak = async (s: ComicScene) => {if(busy)return;const cur=get(),current=allScenes(cur).find(x=>x.id===s.id)??s;save((c) => patchScene(c, s.id, { speechError: undefined }));try {const url = await generateSceneSpeech(cur,current,modelOf(catalog,cur.models.audio));save((c) => patchScene(c, s.id, { speechStatus: "done", speechUrl: url }));}catch(e){toast.error(err(e));}};
  const ratioCls = p.ratio === "9:16" ? "aspect-[9/16]" : p.ratio === "1:1" ? "aspect-square" : "aspect-video";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3 py-3 text-sm">
        <PillSelect label="镜头制作" value={p.videoProduction||'ai'} options={[{value:'ai',label:'AI 视频模型'},{value:'image-motion',label:'图片运镜 · 无视频模型费用'}]} onChange={v=>{if(!busy)save(c=>({...c,videoProduction:v as 'ai'|'image-motion',...(v==='image-motion'?{videoInput:'reference' as const}:{})}));}}/>
        {p.videoProduction!=='image-motion' && <PillSelect label="视频输入" value={p.videoInput||'reference'} options={[{value:'reference',label:'关键帧与角色参考'},{value:'text',label:'纯提示词',description:'无需生图；人物跨镜头外貌一致性较弱'}]} onChange={v=>{if(!busy)save(c=>({...c,videoInput:v as 'reference'|'text',...(v==='text'?{videoChain:'parallel' as const}:{})}));}}/>}
        {p.videoProduction!=='image-motion' && p.videoInput!=='text' && <PillSelect label="镜头衔接" value={p.videoChain || 'parallel'} options={[{value:'parallel',label:'独立镜头',description:'关键帧与角色参考，适合切换场景'},{value:'serial',label:'尾帧续接',description:'上一镜末帧接下一镜，适合连续动作'}]} onChange={v=>{if(busy)return;if(v==='serial'&&!videoInputPolicy(vm).first){toast.info('当前模型不支持首帧续接，请先在项目设置切换支持首帧的模型');return;}save(c=>({...c,videoChain:v as 'parallel'|'serial'}));}} />}
        <label className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" checked={!!p.autoVoice} disabled={busy||!p.models.audio} onChange={e=>save(c=>({...c,autoVoice:e.target.checked}))}/>连续制作时生成台词配音</label>
        <span className="text-xs text-muted-foreground">配音需已配置语音模型；成片可保存到服务器</span>
      </div>
      {p.videoInput==='text' ? <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">仅按提示词生成，不发送参考图、不自动生图；跨镜头人物外貌可能变化，需要更强一致性时请切回参考图模式。</div> : vcaps?.frame === "none" && <div className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"><AlertTriangle size={14} className="shrink-0" />该线路不支持首帧，镜头会和分镜图不一致，建议换线路</div>}
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{p.videoProduction==='image-motion' ? '图片运镜：把分镜图制作成缓慢推进的动态镜头，不是AI视频生成，不调用视频模型；已有配音可一起合成。' : <>{p.videoInput==='text' ? '仅发送当前镜头提示词，不发送关键帧或角色图' : p.videoChain==='serial' ? '集内逐镜读取上一镜末帧续接，不跨集接镜' : videoInputPolicy(vm).reference ? "关键帧与出场角色定妆图一同作为参考（受模型张数限制）" : "使用本镜关键帧；不支持参考图的模型仅接收提示词"}。视频按{vm?.billingUnit === "per_second" ? "秒" : "次"}计费。</>}<Button variant="soft" size="sm" className="ml-auto" disabled={busy||!scenes.some(s=>(!s.videoUrl||s.videoStatus==='stale')&&(s.imageUrl||p.videoInput==='text'&&p.videoProduction!=='image-motion'))} onClick={genAll}><Sparkles size={14} />生成待完成镜头</Button></div>
      <p className="text-xs text-muted-foreground">台词按“角色：台词”分行，分别使用角色音色；旁白和未设音色的角色跟随项目默认。同音色相邻台词合并调用，成功片段保存后，失败可只补缺失部分。<button className="ml-2 text-primary" onClick={()=>navigate('assets')}>去设置角色音色 →</button></p>
      {scenes.some(s=>!s.imageUrl)&&(p.videoInput!=='text'||p.videoProduction==='image-motion')&&<div className="os-readonly-note">还有 {scenes.filter(s=>!s.imageUrl).length} 个镜头缺少关键帧。<Button variant="secondary" size="sm" onClick={()=>navigate('storyboard')}>去分镜补图</Button><span>上传图片不调用模型；AI 补图按模型用量结算。</span></div>}
      <div className="space-y-3">
        {scenes.map((s, i) => (
          <div key={s.id} className="grid gap-4 rounded-2xl border bg-card p-3 md:grid-cols-[160px_1fr_minmax(220px,320px)]">
            <div className={cn("relative overflow-hidden rounded-xl bg-muted", ratioCls, p.ratio === "9:16" && "max-h-72")}>{s.imageUrl ? <img src={s.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-muted-foreground">无关键帧</div>}<span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">镜号 {String(i + 1).padStart(2, "0")}</span></div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">{s.location} · {s.time}{s.shotSize && <span className="rounded-md bg-muted px-1.5 text-[11px] font-normal">{s.shotSize}{s.camera ? ` · ${s.camera}` : ""}</span>}<StatusBadge status={s.videoStatus} progress={s.videoProgress} />{(() => { const n = sceneVideoRefCount(p, s, vm); return n ? <span className="rounded-full bg-primary-tint px-2 py-0.5 text-[11px] font-normal text-accent-foreground">已附 {n} 张角色参考</span> : null; })()}</div>
              <button type="button" className="vg-prompt-preview" title="点击打开生成对话框，编辑提示词与参数" onClick={() => setGenOpenId(s.id)}>{s.videoPrompt ?? defaultVideoPrompt(p, s)}</button>
              {s.videoError && <div className="text-xs text-danger">{s.videoError}</div>}
              <div className="flex flex-wrap items-center gap-1.5">
                {p.fixedShotSec && <span className="chip h-8 text-xs text-muted-foreground" title="项目设定了每镜固定时长，在「项目设定」或生成对话框里修改">时长 <b className="font-medium text-foreground">{shotSeconds(p, s, vcaps)} 秒</b> · 固定</span>}
                <button disabled={busy || s.videoStatus === "running" || (!s.imageUrl && (p.videoInput!=='text'||p.videoProduction==='image-motion'))} onClick={() => setGenOpenId(s.id)} className="chip h-8 text-xs hover:bg-muted disabled:opacity-50">{s.videoUrl || s.videoTaskId ? <><RotateCcw size={12} />重生视频</> : <><Film size={12} />生成视频</>}{p.videoProduction==='image-motion'?<span>0 模型积分 · 本地运镜</span>:<PriceTag model={vm} seconds={shotSeconds(p, s, vcaps)} params={videoBillParams(p, vcaps)} />}</button>
                {s.videoSource==='image-motion' && <span className="text-xs text-muted-foreground">图片运镜镜头</span>}
                {s.videoStatus === "stale" && s.videoTaskId && <button onClick={() => recover(s)} className="chip h-8 text-xs hover:bg-muted"><RefreshCw size={12} />按任务号恢复</button>}
                <span className="mx-1 h-4 w-px bg-border" />
                <button disabled={busy||!p.models.audio||!hasSpeech(s)} onClick={() => speak(s)} className="chip h-8 text-xs hover:bg-muted disabled:opacity-50"><Mic size={12} />{s.speechUrl&&s.speechStatus==='done'&&!speechStale(p,s)?'重新配音':s.speechParts?.length||s.speechUrl?'补齐配音':'生成配音'}</button>
                {s.speechUrl && <audio src={s.speechUrl} controls className="h-8 max-w-[220px]" />}
                {speechStale(p,s) && <span className="text-[11px] text-warning">台词或音色已变化 / 配音待补齐，旧录音保留</span>}
              </div>
              {s.speechError && <div className="text-xs text-danger">{s.speechError}</div>}
              {hasSpeech(s)&&<SceneVoiceSummary p={p} scene={s} model={modelOf(catalog,p.models.audio)}/>}
            </div>
            <div className="overflow-hidden rounded-xl bg-black/90">{s.videoUrl ? <video src={s.videoUrl} controls className="h-full max-h-72 w-full object-contain" /> : <div className="grid h-full min-h-[120px] place-items-center text-xs text-white/60">{s.videoStatus === "running" ? <div className="w-3/4 text-center"><Loader2 className="mx-auto mb-2 animate-spin" /><div className="h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-primary transition-all" style={{ width: `${s.videoProgress ?? 0}%` }} /></div><div className="mt-1">生成中 {Math.round(s.videoProgress ?? 0)}%</div></div> : s.videoStatus === "stale" ? "刷新后视频需恢复或重新生成" : "暂无视频"}</div>}</div>
          </div>
        ))}
      </div>
      {(() => { const target = scenes.find((x) => x.id === genOpenId); return target ? <VideoGenDialog p={p} scene={target} index={scenes.indexOf(target)} vm={vm} vcaps={vcaps} busy={busy} save={save} onClose={() => setGenOpenId(null)} onSubmit={(id) => genVideoFor(id)} onOpenSettings={() => { setGenOpenId(null); openSettings?.(); }} /> : null; })()}
    </div>
  );
}

function SceneVoiceSummary({p,scene,model}:{p:ComicProject;scene:ComicScene;model?:CatalogModel}){
  if(!model)return <p className="text-xs text-muted-foreground">请在项目设定选择配音模型，再设置角色音色。</p>;
  try{const parts=planSpeech(p,scene,model),library=voiceLibraryOf(model);return <details className="os-speech-plan"><summary>{parts.length} 段角色配音 · {scene.speechParts?.length?`已保留 ${scene.speechParts.length} 个成功片段`:'按段调用、按实际用量计费'} <PriceTag model={model}/></summary><ol>{parts.map((part,i)=><li key={i}><strong>{part.speakers.join(' / ')||'旁白'} · {library.find(x=>x.id===part.voice)?.name||part.voice}</strong><span>{part.text}</span></li>)}</ol><p>重新配音会重新调用各段；补齐只调用尚未完成或内容已变化的片段。音频拼接不调用模型。</p></details>;}catch(e){return <p className="text-xs text-warning">{err(e)}</p>;}
}

function FinalStep({ p, save, busy, confirmStage,onBackToClips }: StepProps&{onBackToClips:()=>void}) {
  const scenes = allScenes(p);
  const ready = scenes.filter((s) => s.videoUrl);
  const [composing, setComposing] = useState<string | null>(null); const [out, setOut] = useState<string | null>(null);
  const cloudReady=movieCurrent(p);
  const audioIssues=movieAudioIssues(p);
  const cloudRender=async()=>{if(busy)return;setComposing('服务器合成中…');try{await runProjectGeneration(p,'render');toast.success('MP4成片已保存到服务器，换设备也可下载');}catch(e){toast.error(err(e));}finally{setComposing(null);}};
  useEffect(() => () => { if (out) URL.revokeObjectURL(out); }, [out]);
  const compose = async () => {
    if (!ready.length) { toast.error("还没有可合成的视频"); return; }
    if(audioIssues.length){toast.error('请先补齐与当前台词、音色一致的配音，旧文件保留');return;}
    setComposing("准备中…");
    try { const blob = await composeWebm(ready.map((s) => ({ video: s.videoUrl!, audio: s.speechUrl })), { onProgress: (i, t) => setComposing(`合成中 ${i}/${t}`) }); const url = URL.createObjectURL(blob); setOut(url); toast.success("合成完成，可下载 WebM"); }
    catch (e) { toast.error(err(e)); } finally { setComposing(null); }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{ready.some(s=>s.videoSource==='image-motion')&&<span className="chip text-xs">含图片运镜镜头 · 非纯AI视频生成</span>}已就绪 {ready.length}/{scenes.length} 段。{cloudReady?`成片 ${Number(p.finalMovie!.duration||0).toFixed(1)} 秒，已保存到服务器。`:'服务器合成为 MP4，含已有配音，保存后可跨设备下载。'}合成本身不调用模型、不扣模型积分。
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={!ready.length} onClick={() => downloadAll(ready.map((s) => ({ url: s.videoUrl!, name: `${p.name}-镜${scenes.indexOf(s) + 1}.mp4` })))}><Download size={14} />导出（逐段下载）</Button>
          <Button variant="soft" size="sm" disabled={busy || !ready.length || ready.length!==scenes.length || !!composing||!!audioIssues.length} onClick={cloudRender}>{composing ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />}{composing ?? (cloudReady?'重新合成 MP4':'合成并保存 MP4')}</Button>
          {cloudReady && <a className="chip" href={p.finalMovie!.url} download={`${p.name}-成片.mp4`}><Download size={14}/>下载 MP4 成片</a>}
          <Button variant="soft" size="sm" disabled={busy || !ready.length || !!composing||!!audioIssues.length} onClick={compose}>本机备用 WebM</Button>
          {out && <Button size="sm" onClick={() => downloadUrl(out, `${p.name}-成片.webm`)}><Download size={14} />下载成片</Button>}
        </div></div>
      {!!audioIssues.length&&<div className="os-readonly-note">{audioIssues.length} 个镜头的配音待补齐或与当前台词、音色不一致。旧录音、旧成片仍保留。<Button variant="secondary" size="sm" onClick={onBackToClips}>查看逐镜配音</Button></div>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <PlaylistPlayer ratio={p.ratio} items={ready.map((s) => ({ id: s.id, title: `镜号 ${String(scenes.indexOf(s) + 1).padStart(2, "0")} · ${s.location}`, video: s.videoUrl!, audio: s.speechUrl }))} />
        <div className="space-y-2">
          <div className="text-sm font-medium">片段清单</div>
          {scenes.map((s, i) => <div key={s.id} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><span className="w-8 font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span><span className="flex-1 truncate">{s.location} · {s.time}</span><StatusBadge status={s.videoStatus} />{s.speechUrl && <Mic size={12} className="text-success" />}</div>)}
          {cloudReady && <video src={p.finalMovie!.url} controls className="mt-3 w-full rounded-xl bg-black" />}
          {p.finalMovie && !cloudReady && <p className="text-xs text-warning">镜头或配音已变化，旧成片保留，请重新合成最新版本。</p>}
          {out && <video src={out} controls className="mt-3 w-full rounded-xl bg-black" />}
        </div>
      </div>
      <ConfirmBar p={p} stage="video" busy={busy} can={p.status === "已完成" || cloudReady} onConfirm={() => { if (p.status === "已完成") { save((c) => ({ ...c, status: "进行中", done: { ...c.done, video: false } })); toast.success("已标记为进行中"); } else { confirmStage(); toast.success("已标记为已完成"); } }} label={p.status === "已完成" ? "标记为进行中" : "确认，标记为已完成"} hint="成片合成成功后会自动保存在服务器；不要把仅有镜头片段当成完整成片。" />
    </div>
  );
}
