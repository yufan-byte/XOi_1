import { z } from "zod";
const formats = ["mp3","wav","opus","flac","aac","pcm"] as const;
const schema = z.object({ model:z.string().trim().min(1).max(200), input:z.string().trim().min(1).max(10000),
  voice:z.string().trim().min(1).max(100).optional(), response_format:z.enum(formats).default("mp3"),
  speed:z.number().min(.25).max(4).optional(), instructions:z.string().max(4000).optional() });
export function canvasAudioRequest(body: any) {
  if (body?.endpoint && body.endpoint !== "/audio/speech") throw new Error("暂不支持此音频接口，只开放文字转语音");
  const value=body?.request || body;
  if (value?.audio || value?.reference_audio || value?.voice_clone || value?.messages) throw new Error("声音克隆／多模态音频暂未开放，不会自动提交收费请求");
  const parsed=schema.safeParse({...value,model:String(value?.model||"").replace(/^newapi:/,"")});
  if(!parsed.success)throw new Error("请选择语音模型并填写1–10000字文本，确认音色、速度和音频格式");
  return parsed.data;
}
export const audioMime: Record<string,string> = {mp3:"audio/mpeg",wav:"audio/wav",opus:"audio/ogg",flac:"audio/flac",aac:"audio/aac",pcm:"audio/pcm"};
export async function readAudioBody(response: Response, maxBytes=32*1024*1024) {
  if(!response.ok)throw new Error(`语音生成失败（${response.status}），实际费用请查积分明细`);
  if(!/^(audio\/|application\/octet-stream)/i.test(response.headers.get("content-type")||""))throw new Error("语音接口未返回音频，费用状态请核对积分明细");
  if(Number(response.headers.get("content-length")||0)>maxBytes)throw new Error("生成音频超过文件大小上限");
  const reader=response.body?.getReader();if(!reader)throw new Error("语音接口返回空内容");
  const chunks: Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw new Error("生成音频超过文件大小上限");chunks.push(value);}}
  catch(error){await reader.cancel();throw error;}
  finally{reader.releaseLock();}
  if(!size)throw new Error("语音接口返回空内容");
  return Buffer.concat(chunks);
}
