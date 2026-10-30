// Reviewed OpenAI vision families only; newer aliases need an explicit budget review.
// https://developers.openai.com/api/docs/guides/images-vision
export function supportsBoundedGptVision(model: string) {
  return /^gpt-(?:4o(?:-mini)?|4\.1(?:-mini|-nano)?|5(?:\.[1245])?(?:-mini|-nano)?)(?:-\d{4}-\d{2}-\d{2})?$/.test(model.replace(/^newapi:/, ""));
}
// Qwen commercial image models: one image is capped at 16,384 visual tokens
// plus image framing. Omni/audio, open-source aliases and future families require review.
// https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions
export function supportsBoundedQwenVision(model:string){
  return /^qwen3\.[5678]-(?:flash|plus|max)(?:-\d{4}-\d{2}-\d{2}|-\d{4})?$/.test(model.replace(/^newapi:/,''));
}
export function boundedVisionPayload(body:Record<string,any>,allowRemoteImage?:(url:string)=>boolean){
  if(supportsBoundedGptVision(String(body.model||'')))return boundedGptVisionPayload(body);
  if(!supportsBoundedQwenVision(String(body.model||''))||!Array.isArray(body.messages))return null;
  let images=0;
  const messages=body.messages.map((message:any)=>!Array.isArray(message.content)?message:{...message,content:message.content.map((part:any)=>{
    if(part?.type!=='image_url')return part;
    const url=part.image_url?.url;
    if(Object.keys(part).some(key=>!['type','image_url'].includes(key))||Object.keys(part.image_url||{}).some(key=>!['url','detail'].includes(key))||part.image_url?.detail&&part.image_url.detail!=='low'||typeof url!=='string'||url.length>2_000_000||!(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(url)||allowRemoteImage?.(url)))throw Error('通义识图只支持经过校验的图片或本人授权素材');
    images++;return {type:'text',text:'[bounded image]'};
  })});
  if(!images||images>4)return null;
  const payload=JSON.stringify({...body,messages});
  if(/"type"\s*:\s*"(?:image|input_image|image_url|video|audio|input_audio)|"(?:image_url|audio_url|video_url)"\s*:/.test(payload))return null;
  for(const message of messages)if(message.content!=null&&typeof message.content!=='string'&&(!Array.isArray(message.content)||message.content.some((part:any)=>part?.type!=='text'||typeof part.text!=='string')))return null;
  return {payload,images};
}
// Includes Qwen's two framing tokens and conservative per-image overhead.
export const VISION_IMAGE_TOKEN_BOUND=20_000;
// Covers the documented low-detail patch multipliers, including 4.1-nano.
export const GPT_VISION_IMAGE_TOKEN_BOUND = 16_384;
/** Count explicit low-detail inline images without treating base64 as text tokens.
 * Remote files, high/auto detail, audio, tools and unknown model families stay blocked.
 */
export function boundedGptVisionPayload(body: Record<string, any>): { payload: string; images: number } | null {
  if (!supportsBoundedGptVision(String(body.model || "")) || !Array.isArray(body.messages)) return null;
  let images = 0;
  const messages = body.messages.map((message: any) => {
    if (!Array.isArray(message.content)) return message;
    return { ...message, content: message.content.map((part: any) => {
      if (part?.type !== "image_url") return part;
      const url = part.image_url?.url;
      if (Object.keys(part).some(key => !["type", "image_url"].includes(key)) || Object.keys(part.image_url || {}).some(key => !["url", "detail"].includes(key)) || part.image_url?.detail !== "low" || typeof url !== "string" || url.length > 2_000_000 || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(url)) throw Error("GPT 识图仅支持经过压缩的低细节内嵌图片");
      images++;
      return { type: "text", text: "[bounded image]" };
    }) };
  });
  if (!images || images > 4) return null;
  const payload = JSON.stringify({ ...body, messages });
  if (/"type"\s*:\s*"(?:image|input_image|image_url|video|audio|input_audio)|"(?:image_url|audio_url|video_url)"\s*:/.test(payload)) return null;
  for (const message of messages) if (message.content != null && typeof message.content !== "string" && (!Array.isArray(message.content) || message.content.some((part: any) => part?.type !== "text" || typeof part.text !== "string"))) return null;
  return { payload, images };
}
