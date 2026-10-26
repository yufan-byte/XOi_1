import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { movieSignature } from '../../../../shared/oneStopMedia';
import {movieAudioIssues} from '../../../../shared/oneStopSpeech';

/** Only owner-scoped, locally archived files. Never let ffmpeg open arbitrary URLs. */
export async function ownedMedia(root: string, user: number, url: string, extensions: string[]) {
  if (!Number.isSafeInteger(user) || user < 1 || !new RegExp(`^/oss/one-stop/${user}/[a-f0-9-]+\\.(${extensions.join('|')})$`).test(url)) throw Error('媒体不属于当前账号或尚未归档');
  const realRoot = await fs.realpath(root), file = await fs.realpath(path.join(realRoot, url.slice(5)));
  const ownFolder=path.join(realRoot,'one-stop',String(user));
  if (await fs.realpath(ownFolder)!==ownFolder || !file.startsWith(ownFolder + path.sep)) throw Error('媒体路径无效');
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size < 1 || stat.size > 256 * 1024 * 1024) throw Error('媒体为空或超过256MB限制');
  return file;
}
export function mediaCommand(binary: 'ffmpeg' | 'ffprobe', args: string[], signal?: AbortSignal, timeout = 20 * 60_000): Promise<string> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const proc = spawn(process.env[binary === 'ffmpeg' ? 'XOI_FFMPEG_PATH' : 'XOI_FFPROBE_PATH'] || binary, args, { shell: false, stdio: ['ignore','pipe','pipe'] });
    let output = '', diagnostic = '', stopped = false;
    const abort = () => { stopped = true; proc.kill('SIGKILL'); };
    const timer = setTimeout(abort, timeout); timer.unref(); signal?.addEventListener('abort', abort, {once:true});
    proc.stdout.on('data', b => { output = (output + b).slice(-1000000); });
    proc.stderr.on('data', b => { diagnostic = (diagnostic + b).slice(-4000); });
    const clean = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    proc.once('error', e => { clean(); reject(Error((e as any).code === 'ENOENT' ? '服务器缺少 FFmpeg/FFprobe，请管理员安装后重试；不需要重新生成镜头' : '媒体处理进程无法启动')); });
    proc.once('close', code => { clean(); if (stopped || signal?.aborted) reject(Error('媒体处理已停止，原镜头文件保留')); else if (code !== 0) reject(Error('媒体处理失败，原镜头文件保留，请检查文件格式')); else resolve(output); });
  });
}
async function probe(file: string, signal?: AbortSignal) {
  const raw = JSON.parse(await mediaCommand('ffprobe', ['-v','error','-protocol_whitelist','file','-format_whitelist','mov,matroska,webm,mp3,wav','-show_entries','format=duration:stream=codec_type,width,height','-of','json',file], signal, 15000));
  const duration = Number(raw.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 120) throw Error('单镜媒体时长无效或超过120秒');
  if(raw.streams?.some((s:any)=>s.codec_type==='video'&&(!s.width||!s.height||s.width>8192||s.height>8192||s.width*s.height>25_000_000)))throw Error('视频像素尺寸超过本机合成限制，请先压缩镜头');
  return {duration, audio: raw.streams?.some((s: any) => s.codec_type === 'audio')};
}
// A bounded local encoder: one process per node, even when many model jobs run concurrently.
let encoderTail = Promise.resolve();
async function serialized<T>(signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
  const before = encoderTail; let release!: () => void;
  encoderTail = new Promise<void>(r => { release = r; });
  try { await before; signal?.throwIfAborted(); return await fn(); } finally { release(); }
}
export async function tailFrame(root: string, user: number, url: string, signal?: AbortSignal) {
  return serialized(signal, async () => {
    const input = await ownedMedia(root,user,url,['mp4','webm']), dir = await fs.mkdtemp(path.join(os.tmpdir(),'xoi-tail-'));
    try {
      const output = path.join(dir,'frame.jpg');
      await mediaCommand('ffmpeg',['-nostdin','-v','error','-threads','2','-filter_threads','1','-protocol_whitelist','file','-format_whitelist','mov,matroska,webm','-sseof','-0.15','-i',input,'-frames:v','1','-vf','scale=1600:1600:force_original_aspect_ratio=decrease','-q:v','3',output],signal,60000);
      return 'data:image/jpeg;base64,' + (await fs.readFile(output)).toString('base64');
    } finally { await fs.rm(dir,{recursive:true,force:true}); }
  });
}
/** Normalize cached voice parts before joining; ffmpeg never receives a remote URL. */
export async function joinSpeech(root:string,user:number,urls:string[],signal?:AbortSignal){
  if(!urls.length||urls.length>64)throw Error('配音片段数量无效');
  return serialized(signal,async()=>{
    const inputs=await Promise.all(urls.map(url=>ownedMedia(root,user,url,['mp3','wav','m4a']))),dir=await fs.mkdtemp(path.join(os.tmpdir(),'xoi-speech-'));
    try{
      let duration=0;
      for(let i=0;i<inputs.length;i++){
        const info=await probe(inputs[i],signal);if(!info.audio)throw Error('配音片段没有有效音轨');duration+=info.duration+(i ? .25 : 0);
        if(duration>120)throw Error('本镜配音超过120秒，请拆分镜头；已生成片段保留，不需要重复付费生成');
        await mediaCommand('ffmpeg',['-nostdin','-v','error','-threads','2','-protocol_whitelist','file','-format_whitelist','mp3,wav,mov','-i',inputs[i],'-vn','-ar','48000','-ac','1',path.join(dir,`${i}.wav`)],signal,60000);
      }
      const manifest=inputs.flatMap((_,i)=>[...(i?["file 'gap.wav'"]:[]),`file '${i}.wav'`]).join('\n');
      await mediaCommand('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','anullsrc=r=48000:cl=mono','-t','0.25',path.join(dir,'gap.wav')],signal,15000);
      await fs.writeFile(path.join(dir,'parts.txt'),manifest);
      const output=path.join(dir,'voice.mp3');
      await mediaCommand('ffmpeg',['-nostdin','-v','error','-protocol_whitelist','file','-f','concat','-safe','1','-i',path.join(dir,'parts.txt'),'-c:a','libmp3lame','-b:a','128k',output],signal,60000);
      const folder=path.join(await fs.realpath(root),'one-stop',String(user));if(await fs.realpath(folder)!==folder)throw Error('配音归档路径无效');
      const id=crypto.randomUUID(),temp=path.join(folder,id+'.partial');
      try{await fs.copyFile(output,temp,fs.constants.COPYFILE_EXCL);signal?.throwIfAborted();await fs.rename(temp,path.join(folder,id+'.mp3'));}finally{await fs.unlink(temp).catch(()=>{});}
      return {url:`/oss/one-stop/${user}/${id}.mp3`,duration};
    }finally{await fs.rm(dir,{recursive:true,force:true});}
  });
}
/** Explicit image-motion mode, never labelled as AI-generated video. No upstream call. */
export async function motionClip(root:string,user:number,image:string,ratio:string,seconds:number,signal?:AbortSignal) {
  return serialized(signal,async()=>{
    const input=await ownedMedia(root,user,image,['png','jpg','jpeg','webp']);
    const size=await sharp(input,{limitInputPixels:25_000_000}).metadata();
    if(!size.width||!size.height||size.width>8192||size.height>8192)throw Error('分镜图片尺寸过大，请先压缩图片');
    if(!Number.isFinite(seconds)||seconds<1||seconds>60)throw Error('图片运镜时长必须为1–60秒');
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'xoi-motion-'));
    try{
      const [w,h]=ratio==='9:16'?[720,1280]:ratio==='1:1'?[960,960]:[1280,720],output=path.join(dir,'clip.mp4'),frames=Math.ceil(seconds*24);
      await mediaCommand('ffmpeg',['-nostdin','-v','error','-threads','2','-filter_threads','1','-protocol_whitelist','file','-format_whitelist','png_pipe,jpeg_pipe,webp_pipe,image2','-i',input,'-vf',`scale=${w*2}:${h*2}:force_original_aspect_ratio=increase,crop=${w*2}:${h*2},zoompan=z='min(1.06,1+on*0.06/${frames})':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=${frames}:s=${w}x${h}:fps=24,format=yuv420p`,'-frames:v',String(frames),'-c:v','libx264','-threads','2','-preset','veryfast','-crf','22','-movflags','+faststart',output],signal);
      const folder=path.join(await fs.realpath(root),'one-stop',String(user));if(await fs.realpath(folder)!==folder)throw Error('归档目录无效');
      signal?.throwIfAborted();const id=crypto.randomUUID(),temp=path.join(folder,id+'.partial'),dest=path.join(folder,id+'.mp4');
      try{await fs.copyFile(output,temp,fs.constants.COPYFILE_EXCL);signal?.throwIfAborted();await fs.rename(temp,dest);}finally{await fs.unlink(temp).catch(()=>{});}
      return {url:`/oss/one-stop/${user}/${id}.mp4`,source:'image-motion',seconds};
    }finally{await fs.rm(dir,{recursive:true,force:true});}
  });
}
export async function renderMovie(root: string, user: number, p: any, signal?: AbortSignal, progress?: (done: number,total: number) => Promise<void>) {
  return serialized(signal, async () => {
    const scenes = (p.script?.episodes || []).flatMap((e: any) => e.scenes || []);
    if (!scenes.length || scenes.length > 200 || scenes.some((s: any) => !s.videoUrl || s.videoStatus === 'stale')) throw Error('请先完成所有镜头视频，不能把缺失或待重生的镜头当成成片');
    if(movieAudioIssues(p).length)throw Error('部分镜头配音缺失或与当前台词、音色不一致，请先补齐配音；旧配音和旧成片保留');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(),'xoi-render-'));
    const [width,height] = p.ratio === '9:16' ? [720,1280] : p.ratio === '1:1' ? [960,960] : [1280,720];
    try {
      let totalSeconds = 0;
      for (let i=0;i<scenes.length;i++) {
        signal?.throwIfAborted();
        const scene = scenes[i], input = await ownedMedia(root,user,scene.videoUrl,['mp4','webm']), info = await probe(input,signal);
        const audio = scene.speechUrl ? await ownedMedia(root,user,scene.speechUrl,['mp3','wav','m4a']) : undefined;
        const audioInfo = audio ? await probe(audio,signal) : undefined;
        const duration = Math.max(info.duration,audioInfo?.duration || 0); totalSeconds += duration;
        if (totalSeconds > 7200) throw Error('单次成片超过2小时，请按集导出');
        const args = ['-nostdin','-v','error','-threads','2','-filter_threads','1','-protocol_whitelist','file','-format_whitelist','mov,matroska,webm','-i',input];
        if (audio) args.push('-protocol_whitelist','file','-format_whitelist','mp3,wav,mov','-i',audio);
        else if (!info.audio) args.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo');
        args.push('-map','0:v:0','-map',audio || !info.audio ? '1:a:0' : '0:a:0','-vf',`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,tpad=stop_mode=clone:stop_duration=120`,'-af','apad','-t',String(duration),'-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-threads','2','-c:a','aac','-ar','48000','-ac','2','-movflags','+faststart',path.join(dir,`${i}.mp4`));
        await mediaCommand('ffmpeg',args,signal);
        await progress?.(i+1,scenes.length);
      }
      // Manifest contains only generated numeric basenames, never client text/paths.
      await fs.writeFile(path.join(dir,'clips.txt'),scenes.map((_: any,i: number)=>`file '${i}.mp4'`).join('\n'));
      const output = path.join(dir,'movie.mp4');
      await mediaCommand('ffmpeg',['-nostdin','-v','error','-protocol_whitelist','file','-f','concat','-safe','1','-i',path.join(dir,'clips.txt'),'-c','copy','-movflags','+faststart',output],signal);
      const stat = await fs.stat(output); if (!stat.size || stat.size > 1024*1024*1024) throw Error('成片为空或超过1GB，请按集导出');
      signal?.throwIfAborted();
      const folder = path.join(await fs.realpath(root),'one-stop',String(user)); await fs.mkdir(folder,{recursive:true});
      const realFolder = await fs.realpath(folder); if (realFolder!==folder) throw Error('归档目录无效');
      const id = crypto.randomUUID(), temporary = path.join(realFolder,id+'.partial'), dest = path.join(realFolder,id+'.mp4');
      try { await fs.copyFile(output,temporary,fs.constants.COPYFILE_EXCL); signal?.throwIfAborted(); await fs.rename(temporary,dest); } finally { await fs.unlink(temporary).catch(()=>{}); }
      return {url:`/oss/one-stop/${user}/${id}.mp4`,source:movieSignature(p),bytes:stat.size,duration:totalSeconds,createdAt:Date.now(),format:'mp4'};
    } finally { await fs.rm(dir,{recursive:true,force:true}); }
  });
}
