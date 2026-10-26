/** OpenAI SSE reader. Partial text is observational; only a complete stop commits a chapter. */
export async function readTextStream(response: Response, onText: (text: string) => Promise<void>, signal?: AbortSignal) {
  if (!response.body) throw Error('模型没有返回正文');
  const reader=response.body.getReader(), decoder=new TextDecoder(); let buffer='',text='',finish='',bytes=0;
  const line = async (value: string) => {
    if (!value.startsWith('data:')) return;
    const data=value.slice(5).trim(); if (!data || data==='[DONE]') return;
    const event=JSON.parse(data); if(event.error)throw Error('模型流式输出失败');
    const choice=event.choices?.[0]; if(choice?.finish_reason)finish=choice.finish_reason;
    if(typeof choice?.delta?.content==='string'){text+=choice.delta.content;if(text.length>30000)throw Error('小说正文超过长度限制');await onText(text);}
  };
  try {
    while(true){signal?.throwIfAborted();const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>4*1024*1024)throw Error('模型输出超过安全限制');buffer+=decoder.decode(part.value,{stream:true});let index;while((index=buffer.indexOf('\n'))>=0){const value=buffer.slice(0,index).replace(/\r$/,'');buffer=buffer.slice(index+1);await line(value);}}
    buffer+=decoder.decode();if(buffer.trim())await line(buffer.trim());
    if(finish!=='stop'||!text.trim())throw Error('模型输出中断或未完整结束，原章节保留；不会自动重复生成');
    await onText(text); return text;
  } finally {await reader.cancel().catch(()=>{});}
}
