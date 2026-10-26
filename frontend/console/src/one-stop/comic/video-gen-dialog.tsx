import { useState } from 'react';
import { Film, Loader2, Send, Settings2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PillSelect } from '@/components/ui/select';
import { PriceTag } from './cost-dialog';
import { defaultVideoPrompt, sceneRefs } from './pipeline';
import { durationsOf, shotSeconds, videoBillParams } from './caps';
import { patchScene, type ComicProject, type ComicScene } from './types';
import type { Save } from './stage-kit';
import type { CatalogModel } from '@/lib/models';
import type { MfVideoCaps } from '../multiframe/video-caps';
import { videoInputPolicy } from '../../../../../shared/oneStopMedia';

/** 造物式「生成视频」对话框：模式说明 + 计费条 + 参考图预览 + 提示词 + 参数一行 + 提交。
 *  提交走 VideoStep 既有的 genVideoFor（服务端持久任务、按实际用量结算），这里只做确认与参数收集。 */
export function VideoGenDialog({ p, scene, index, vm, vcaps, busy, save, onClose, onSubmit, onOpenSettings }: {
  p: ComicProject;
  scene: ComicScene;
  index: number;
  vm?: CatalogModel;
  vcaps?: MfVideoCaps;
  busy: boolean;
  save: Save;
  onClose: () => void;
  onSubmit: (id: string) => Promise<boolean>;
  onOpenSettings: () => void;
}) {
  const initial = scene.videoPrompt ?? defaultVideoPrompt(p, scene);
  const [prompt, setPrompt] = useState(initial);
  const [seconds, setSeconds] = useState(() => shotSeconds(p, scene, vcaps));
  const fixed = !!p.fixedShotSec;
  const durations = durationsOf(vcaps);
  const modeLabel =
    p.videoProduction === 'image-motion'
      ? '图片运镜 · 本地合成，不调用视频模型'
      : p.videoInput === 'text'
        ? '纯提示词 · 不发送关键帧与参考图'
        : p.videoChain === 'serial'
          ? '关键帧 · 尾帧续接上一镜'
          : videoInputPolicy(vm).reference
            ? '关键帧 + 出场角色定妆参考'
            : '关键帧生视频';
  const refs = p.videoInput === 'text' || p.videoProduction === 'image-motion' ? [] : sceneRefs(p, scene);
  const bill = videoBillParams(p, vcaps);
  const noKeyframe = !scene.imageUrl && (p.videoInput !== 'text' || p.videoProduction === 'image-motion');
  const submitting = busy || scene.videoStatus === 'running';
  const submit = async () => {
    if (!prompt.trim() || noKeyframe || submitting) return;
    save((c) => patchScene(c, scene.id, { videoPrompt: prompt.trim(), videoSeconds: seconds }));
    const ok = await onSubmit(scene.id);
    if (ok) onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="os-video-gen"
        title={`镜头 ${String(index + 1).padStart(2, '0')} · 生成视频`}
        description={`${scene.location || '未命名场景'} · ${scene.time || '时间未设定'}${scene.shotSize ? ` · ${scene.shotSize}${scene.camera ? ` ${scene.camera}` : ''}` : ''}`}
      >
        <div className="vg-mode">
          <span className="vg-mode-tag">{modeLabel}</span>
          <button type="button" className="vg-mode-adjust" onClick={() => { onClose(); onOpenSettings(); }}>
            <Settings2 size={13} />调整模型与模式
          </button>
        </div>
        <div className="vg-billing">
          <span>本次将使用</span>
          <strong>{vm?.name || p.models.video || '未选择视频模型'}</strong>
          <PriceTag model={vm} seconds={seconds} params={bill} />
          <small>确认后提交，按实际用量结算；任务在服务器执行，可关闭页面</small>
        </div>
        {(scene.imageUrl || refs.length > 0) && (
          <div className="vg-refs">
            {scene.imageUrl && (
              <figure className="vg-ref vg-ref-main">
                <img src={scene.imageUrl} alt="本镜关键帧" />
                <figcaption>关键帧{p.videoChain === 'serial' && p.videoInput !== 'text' ? ' · 第 2 镜起改用上一镜末帧' : ''}</figcaption>
              </figure>
            )}
            {refs.slice(0, 5).map((a) => (
              <figure key={a.id} className="vg-ref">
                <img src={a.imageUrl} alt={`${a.name} 定妆图`} />
                <figcaption>{a.name}</figcaption>
              </figure>
            ))}
          </div>
        )}
        <label className="vg-prompt-label">
          画面与动作提示词
          <textarea
            aria-label="视频提示词"
            value={prompt}
            disabled={submitting}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            maxLength={8000}
            className="os-prompt-editor"
            placeholder="描述这一镜的画面、人物动作、运镜与氛围"
          />
        </label>
        <div className="vg-params">
          {fixed || durations.length < 2 ? (
            <span className="vg-chip">时长 <b>{seconds} 秒</b>{fixed ? ' · 项目固定' : ''}</span>
          ) : (
            <PillSelect ariaLabel="每镜时长" value={String(seconds)} options={durations.map((v) => ({ value: String(v), label: `${v} 秒` }))} onChange={(v) => setSeconds(Number(v))} className="h-9 text-xs" />
          )}
          <span className="vg-chip">比例 <b>{p.ratio}</b></span>
          {bill?.resolution && <span className="vg-chip">清晰度 <b>{bill.resolution}</b></span>}
          <span className="vg-chip">数量 <b>1×</b></span>
        </div>
        {noKeyframe && <p className="vg-hint">这一镜还没有关键帧：请先回「08 分镜」补图，或把「视频输入」切到纯提示词。</p>}
        <div className="vg-actions">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button disabled={!prompt.trim() || noKeyframe || submitting} onClick={() => void submit()}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : scene.videoUrl || scene.videoTaskId ? <Send size={14} /> : <Film size={14} />}
            {scene.videoUrl || scene.videoTaskId ? '重新生成本镜' : '生成视频'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
