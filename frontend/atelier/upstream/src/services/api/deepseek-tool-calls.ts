/** Some compatible gateways leave DeepSeek's native DSML tool envelope in content. */
export function parseDeepSeekToolCalls(content: string, allowedNames: ReadonlySet<string>) {
    const normalized = content.replace(/<(\/?)[｜|]{2}DSML[｜|]{2}\s*(calls|invoke|parameter)\b/gi, '<$1dsml:$2');
    if (!normalized.includes('<dsml:')) return undefined;
    const envelope = normalized.match(/<dsml:calls\s*>([\s\S]*?)<\/dsml:calls\s*>/);
    if (!envelope || normalized.match(/<dsml:calls\s*>/g)?.length !== 1) throw new Error('DeepSeek 工具指令不完整，本批操作未执行');
    const calls: Array<{ id: string; function: { name: string; arguments: string } }> = [];
    let remaining = envelope[1];
    const attr = (source: string, key: string) => source.match(new RegExp(`\\b${key}=["']([^"']*)["']`))?.[1];
    const decode = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    for (const invoke of envelope[1].matchAll(/<dsml:invoke\s+([^>]+)>([\s\S]*?)<\/dsml:invoke\s*>/g)) {
        const name = attr(invoke[1], 'name');
        if (!name || !allowedNames.has(name)) throw new Error('DeepSeek 返回了未允许的画布工具，本批操作未执行');
        const args: Record<string, unknown> = Object.create(null);
        let parameterRemainder = invoke[2];
        for (const parameter of invoke[2].matchAll(/<dsml:parameter\s+([^>]+)>([\s\S]*?)<\/dsml:parameter\s*>/g)) {
            const key = attr(parameter[1], 'name');
            if (!key || ['__proto__', 'constructor', 'prototype'].includes(key) || Object.hasOwn(args, key)) throw new Error('DeepSeek 工具参数无效，本批操作未执行');
            const value = decode(parameter[2]);
            args[key] = attr(parameter[1], 'string') === 'true' ? value : JSON.parse(value);
            parameterRemainder = parameterRemainder.replace(parameter[0], '');
        }
        if (parameterRemainder.trim()) throw new Error('DeepSeek 工具参数不完整，本批操作未执行');
        calls.push({ id: 'dsml-' + calls.length, function: { name, arguments: JSON.stringify(args) } });
        remaining = remaining.replace(invoke[0], '');
    }
    if (!calls.length || calls.length > 12 || remaining.trim()) throw new Error('DeepSeek 工具指令不完整，本批操作未执行');
    return { content: normalized.replace(envelope[0], '').trim(), toolCalls: calls };
}
