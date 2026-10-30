/**
 * 用户上传提示词 / 技能内容审核（前端共享版）。
 *
 * 口径：拦截明确违规的三类内容——暴力血腥、网络攻击、违法制作；
 * 正常影视创作词汇（打斗、伤口、破案等）不误伤，只拦「教程式 / 猎奇式」明确违规词。
 * 后端在 skills 路由有同款实现（backend/src/utils/promptGuard.ts），两边关键词保持同步。
 */

type GuardRule = { label: string; pattern: RegExp };

const RULES: GuardRule[] = [
    {
        label: "暴力血腥",
        pattern: /血腥|断肢|肢解|斩首|砍头|开膛|剖腹|挖眼|虐杀|酷刑折磨|内脏流出|尸体解剖|gore|disembowel|decapitat\w*|mutilat\w+|snuff film|血肉模糊/i,
    },
    {
        label: "网络攻击",
        pattern: /网络攻击|ddos|分布式拒绝服务|dos攻击|sql\s*注入|注入攻击|xss|跨站脚本|漏洞利用|漏洞武器|提权|权限提升|反弹\s*shell|reverse\s*shell|勒索软件|勒索病毒|ransomware|木马程序|后门植入|后门程序|键盘记录|keylogger|钓鱼网站|钓鱼页面|密码爆破|暴力破解|撞库|0day\s*利用|恶意软件|malware|僵尸网络|botnet|挖矿木马|病毒样本|c2服务器|command and control|渗透攻击|黑客入侵教程|跳板入侵/i,
    },
    {
        label: "违法制作",
        pattern: /炸药配方|炸弹制作|自制炸药|爆炸装置|雷管制作|土制炸弹|毒品合成|制毒|冰毒合成|神经毒剂|生物武器|bioweapon|核材料获取|枪支改装/i,
    },
];

export type PromptScreenResult = { ok: true } | { ok: false; category: string; excerpt: string };

/** 审核一段用户提交的文本；命中违规返回分类与命中片段。 */
export function screenPromptText(text: string): PromptScreenResult {
    const value = String(text || "");
    if (!value.trim()) return { ok: true };
    for (const rule of RULES) {
        const match = value.match(rule.pattern);
        if (match) return { ok: false, category: rule.label, excerpt: match[0].slice(0, 24) };
    }
    return { ok: true };
}

/** 审核对象里的全部字符串字段（浅层），适合预设 values、技能 patch 等结构。 */
export function screenPromptRecord(record: unknown): PromptScreenResult {
    if (!record || typeof record !== "object") return { ok: true };
    for (const value of Object.values(record as Record<string, unknown>)) {
        if (typeof value !== "string") continue;
        const result = screenPromptText(value);
        if (!result.ok) return result;
    }
    return { ok: true };
}

export function promptGuardMessage(result: PromptScreenResult): string {
    return result.ok ? "" : `内容未通过审核：包含${result.category}类违规内容（「${result.excerpt}」），不允许保存或导入`;
}
