"use client";
import {Layers3} from 'lucide-react';
import {canvasThemes} from '@/lib/canvas-theme';
import {useThemeStore} from '@/stores/use-theme-store';
export function CanvasDirectorNodePanel({onOpen,project,cover}:{onOpen:()=>void;project?:any;cover?:string}){
 const theme=canvasThemes[useThemeStore(s=>s.theme)],link=project?.schemaVersion===1?project.link:null;
 return <div className="flex h-full w-full flex-col overflow-hidden" style={{color:theme.node.text}}>
  {cover?<img src={cover} alt="当前镜头的白模参考" className="min-h-0 flex-1 object-contain" draggable={false}/>:<div className="grid min-h-20 flex-1 place-items-center"><Layers3 className="size-10 opacity-60"/></div>}
  <div className="space-y-2 border-t px-4 py-3" style={{borderColor:theme.node.stroke}}>
   <strong className="block truncate text-sm">{link?.shotName||'3D 导演场景'}</strong>
   <p className="m-0 text-xs opacity-60">{link?`${link.durationSeconds} 秒 · ${link.aspectRatio} · 参考 v${link.revision} · 第 ${link.frame} 帧`:'搭建白模、安排人物和机位，再带回制作参考'}</p>
   <button type="button" className="w-full rounded border px-3 py-2 text-sm" style={{borderColor:theme.node.stroke}} onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onOpen();}}>{link?'继续编辑这个镜头':'打开导演台'}</button>
  </div>
 </div>;
}
