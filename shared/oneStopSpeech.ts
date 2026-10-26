import presets from './oneStopVoicePresets.json';
export interface SpeechPart {voice:string;text:string;speakers:string[]}
export function sceneSpeechSource(p:any,scene:any){return JSON.stringify([p.models?.audio,p.voice,scene.dialogue,(p.assets||[]).filter((a:any)=>a.kind==='character').map((a:any)=>[a.name,a.voice])]);}
export function hasSpeech(scene:any){return !!String(scene.dialogue||'').trim()&&!/^[（(\[]?\s*(?:无|无台词|无对白|none|n\/a)\s*[）)\]]?$/i.test(String(scene.dialogue).trim());}
export function speechStale(p:any,scene:any){return scene.speechStatus==='stale'||!!scene.speechSource&&scene.speechSource!==sceneSpeechSource(p,scene);}
export function movieAudioIssues(p:any){return (p.script?.episodes||[]).flatMap((e:any)=>e.scenes||[]).filter((s:any)=>s.speechUrl&&speechStale(p,s)||p.autoVoice&&hasSpeech(s)&&(!s.speechUrl||s.speechStatus!=='done'));}
export function voiceIds(model:any):string[]{
  const name=String(model?.modelName||model?.id||''),schema=model?.paramSchema||{},field=schema.voice||{};
  const listed=field.options?.map((o:any)=>String(o.value))||field.enum?.map(String);
  if(listed?.length)return listed;
  const family=/doubao/i.test(name)?'doubao':/minimax|speech|voice/i.test(name)?'minimax':/gemini|gm-/i.test(name)?'gemini':'openai';
  if(family==='doubao')return presets.data.filter(p=>p.family==='doubao').map(p=>p.id);
  const described=String(field.description||'').match(/\b[a-z]{2}_[a-z0-9]+(?:_[a-z0-9]+)+\b/gi);
  if(described?.length&&!/gpt|tts-1|openai/i.test(name))return [...new Set(described)];
  return presets.data.filter(p=>p.family===family).map(p=>p.id);
}
/** Shared plan for both the visible voice summary and the server's billable calls. */
export function planSpeech(p:any,scene:any,model:any):SpeechPart[]{
  if(!hasSpeech(scene))throw Error('本镜没有可合成的台词');
  const allowed=voiceIds(model),fallback=allowed.includes(p.voice)?p.voice:allowed.includes(model?.defaults?.voice)?model.defaults.voice:allowed[0];
  if(!fallback)throw Error('当前语音模型没有可用音色，请更换语音模型');
  const parts:SpeechPart[]=[];
  for(const raw of String(scene.dialogue||'').split(/\r?\n/)){
    const line=raw.trim();if(!line)continue;
    const m=/^([^：:]{1,48})[：:](.*)$/.exec(line),speaker=m?m[1].replace(/[（(][^）)]*[）)]/g,'').trim():'',text=m?m[2].trim():line;
    if(!text)continue;
    const a=speaker&&(p.assets||[]).find((a:any)=>a.kind==='character'&&a.name&&(a.name===speaker||a.name.includes(speaker)||speaker.includes(a.name)));
    const voice=a&&allowed.includes(a.voice)?a.voice:fallback,last=parts.at(-1);
    if(last&&last.voice===voice){last.text+='\n'+text;if(speaker&&!last.speakers.includes(speaker))last.speakers.push(speaker);}
    else parts.push({voice,text,speakers:speaker?[speaker]:[]});
  }
  if(!parts.length)throw Error('本镜没有可合成的台词');
  if(parts.length>64)throw Error('本镜超过64段交替配音，请先拆分镜头；未提交模型');
  const limit=Math.min(12000,Number(model?.paramSchema?.input?.maxLength)||12000);
  if(parts.some(x=>x.text.length>limit))throw Error('单段台词超过当前模型长度，请拆分台词或镜头；未提交模型');
  return parts;
}
