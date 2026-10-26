/** Accept compatible providers that return SSE even when stream:false was requested. */
export function parseChatCompletionStream(raw: string): Record<string, unknown> | undefined {
    // SSE may begin with a BOM, comment, event name or retry/id field.
    if (!/^\s*(?:data:|:|event:|id:|retry:)/.test(raw)) return undefined;
    let usage: unknown;
    let finishReason: string | null = null;
    let sawChoice = false;
    let completed = false;
    let content = '', reasoning = '';
    const tools = new Map<number, { id?: string; type: string; function: { name: string; arguments: string } }>();
    for (const block of raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n\n/)) {
        const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n').trim();
        if (!data) continue;
        if (data === '[DONE]') { completed = true; break; }
        let chunk: any;
        try { chunk = JSON.parse(data); } catch { throw new Error('文本模型流式响应不完整，本批操作未执行'); }
        if (chunk.error) return { error: chunk.error };
        if (chunk.usage) usage = chunk.usage;
        const choice = chunk.choices?.find((item: any) => item.index === undefined || item.index === 0);
        if (!choice) continue;
        sawChoice = true;
        if (choice.finish_reason) { finishReason = choice.finish_reason; completed = true; }
        const delta = choice.delta || choice.message || {};
        if (typeof delta.content === 'string') content += delta.content;
        if (typeof delta.reasoning_content === 'string') reasoning += delta.reasoning_content;
        for (const call of delta.tool_calls || []) {
            const index = Number(call.index ?? 0);
            const item = tools.get(index) || { type: 'function', function: { name: '', arguments: '' } };
            if (call.id) item.id = call.id;
            if (typeof call.function?.name === 'string') item.function.name += call.function.name;
            if (typeof call.function?.arguments === 'string') item.function.arguments += call.function.arguments;
            tools.set(index, item);
        }
    }
    // Even a syntactically valid tool JSON must not run after a disconnected stream.
    if (sawChoice && !completed) throw new Error('文本模型流式响应不完整，本批操作未执行；未自动重试');
    return { ...(usage ? { usage } : {}), choices: sawChoice ? [{ finish_reason: finishReason, message: { content, ...(reasoning ? { reasoning_content: reasoning } : {}), ...(tools.size ? { tool_calls: [...tools.entries()].sort(([a], [b]) => a-b).map(([,item])=>item) } : {}) } }] : [] };
}
