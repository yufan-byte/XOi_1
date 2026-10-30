/**
 * 用户上传提示词 / 技能内容审核（服务端版）。
 *
 * 口径与前端共享版（atelier upstream src/lib/prompt-guard.ts）保持同步：
 * 拦截暴力血腥、网络攻击、违法制作三类明确违规内容；正常影视创作词汇不误伤。
 * 挂载点：POST /api/skills（用户保存/上架技能）。分享码导入的内容源自已审核入库的行，天然干净。
 */

const RULES: Array<{ label: string; pattern: RegExp }> = [
    { label: "暴力血腥", pattern: /血腥|断肢|肢解|斩首|砍头|开膛|剖腹|挖眼|虐杀|酷刑折磨|内脏流出|尸体解剖|gore|disembowel|decapitat\w*|mutilat\w+|snuff film|血肉模糊/i },
    { label: "网络攻击", pattern: /网络攻击|ddos|分布式拒绝服务|dos攻击|sql\s*注入|注入攻击|xss|跨站脚本|漏洞利用|漏洞武器|提权|权限提升|反弹\s*shell|reverse\s*shell|勒索软件|勒索病毒|ransomware|木马程序|后门植入|后门程序|键盘记录|keylogger|钓鱼网站|钓鱼页面|密码爆破|暴力破解|撞库|0day\s*利用|恶意软件|malware|僵尸网络|botnet|挖矿木马|病毒样本|c2服务器|command and control|渗透攻击|黑客入侵教程|跳板入侵/i },
    { label: "违法制作", pattern: /炸药配方|炸弹制作|自制炸药|爆炸装置|雷管制作|土制炸弹|毒品合成|制毒|冰毒合成|神经毒剂|生物武器|bioweapon|核材料获取|枪支改装/i },
];

export type PromptScreenResult = { ok: true } | { ok: false; category: string; excerpt: string };

export function screenPromptText(text: string): PromptScreenResult {
    const value = String(text || "");
    if (!value.trim()) return { ok: true };
    for (const rule of RULES) {
        const match = value.match(rule.pattern);
        if (match) return { ok: false, category: rule.label, excerpt: match[0].slice(0, 24) };
    }
    return { ok: true };
}

/** 审核技能保存载荷（name/description/content 及可能的附属文件内容）。 */
export function screenSkillPayload(body: Record<string, unknown>): PromptScreenResult {
    const chunks: string[] = [];
    for (const key of ["name", "description", "content", "prompt"]) {
        const value = body?.[key];
        if (typeof value === "string") chunks.push(value);
    }
    const files = body?.files;
    if (Array.isArray(files)) {
        for (const file of files) {
            if (file && typeof file === "object") {
                const content = (file as Record<string, unknown>).content;
                if (typeof content === "string") chunks.push(content);
            }
        }
    }
    return screenPromptText(chunks.join("\n"));
}
