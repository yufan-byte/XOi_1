import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {mediaCommand,ownedMedia,renderMovie,tailFrame,motionClip,joinSpeech} from '../lib/oneStop/mediaProduction';
import {readTextStream} from '../lib/oneStop/textStream';
import {movieSignature} from '../../../shared/oneStopMedia';

test('real local encoder: mixed clips + longer speech become persistent H264/AAC MP4; no upstream',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'xoi-production-test-'));
 try{
  const folder=path.join(dir,'one-stop','1');await fs.mkdir(folder,{recursive:true});
  const one='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',two='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',speech='cccccccc-cccc-cccc-cccc-cccccccccccc';
  await mediaCommand('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=red:s=160x90:r=24:d=0.5','-c:v','libx264','-pix_fmt','yuv420p',path.join(folder,one+'.mp4')]);
  await mediaCommand('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=90x160:r=24:d=0.5','-f','lavfi','-i','sine=frequency=440:duration=0.5','-c:v','libx264','-c:a','aac','-pix_fmt','yuv420p','-shortest',path.join(folder,two+'.mp4')]);
  await mediaCommand('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','sine=frequency=660:duration=0.9',path.join(folder,speech+'.mp3')]);
  const url=(id:string,ext='mp4')=>`/oss/one-stop/1/${id}.${ext}`;
  const joined=await joinSpeech(dir,1,[url(speech,'mp3'),url(speech,'mp3')]);assert.ok(joined.duration>=2.05);assert.ok(await ownedMedia(dir,1,joined.url,['mp3']));
  await assert.rejects(joinSpeech(dir,2,[url(speech,'mp3')]));await assert.rejects(joinSpeech(dir,1,[]));
  const p={ratio:'16:9',script:{episodes:[{scenes:[{id:'a',videoUrl:url(one),speechUrl:url(speech,'mp3')},{id:'b',videoUrl:url(two)}]}]}};
  const frames=await tailFrame(dir,1,url(one));assert.match(frames,/^data:image\/jpeg;base64,/);
  const frameId='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';await fs.writeFile(path.join(folder,frameId+'.jpg'),Buffer.from(frames.split(',')[1],'base64'));
  const motion=await motionClip(dir,1,url(frameId,'jpg'),'16:9',1);assert.equal(motion.source,'image-motion');assert.ok(await ownedMedia(dir,1,motion.url,['mp4']));
  let progress=0;const result=await renderMovie(dir,1,p,undefined,async done=>{progress=done;});assert.equal(progress,2);assert.equal(result.source,movieSignature(p));assert.ok(result.bytes>1000);assert.ok(result.duration>=1.4);
  const file=await ownedMedia(dir,1,result.url,['mp4']);
  const info=JSON.parse(await mediaCommand('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]));
  assert.equal(info.streams.find((s:any)=>s.codec_type==='video').codec_name,'h264');assert.equal(info.streams.find((s:any)=>s.codec_type==='audio').codec_name,'aac');assert.ok(Number(info.format.duration)>1.3);
  await assert.rejects(ownedMedia(dir,2,url(one),['mp4']));await assert.rejects(ownedMedia(dir,1,'https://internal/private.mp4',['mp4']));await assert.rejects(ownedMedia(dir,1,'/oss/one-stop/1/../../private.mp4',['mp4']));
  await assert.rejects(renderMovie(dir,1,{...p,script:{episodes:[{scenes:[{videoUrl:url(one),videoStatus:'stale'}]}]}}));
  await assert.rejects(renderMovie(dir,1,{...p,script:{episodes:[{scenes:[{videoUrl:url(one),speechUrl:url(speech,'mp3'),speechStatus:'stale'}]}]}}),/配音/);
  const ctl=new AbortController();ctl.abort();await assert.rejects(renderMovie(dir,1,p,ctl.signal));
  const link=path.join(folder,'dddddddd-dddd-dddd-dddd-dddddddddddd.mp4');await fs.symlink('/etc/hosts',link);await assert.rejects(ownedMedia(dir,1,url('dddddddd-dddd-dddd-dddd-dddddddddddd'),['mp4']));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('true streaming handles fragmented UTF8 and rejects truncated/length/error completions',async()=>{
 const payload=['data: {"choices":[{"delta":{"content":"少年"}}]}\r\n\r\n','data: {"choices":[{"delta":{"content":"御剑"}}]}\n\n','data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'].join('');
 const bytes=new TextEncoder().encode(payload),parts:string[]=[];
 const response=new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=5)c.enqueue(bytes.slice(i,i+5));c.close();}}));
 assert.equal(await readTextStream(response,async text=>{parts.push(text);}), '少年御剑');assert.ok(parts.includes('少年'));
 for(const invalid of ['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n','data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n\n','data: {"error":{"message":"secret"}}\n\n'])await assert.rejects(readTextStream(new Response(invalid),async()=>{}));
});
