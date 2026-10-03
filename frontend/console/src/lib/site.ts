/**
 * 站点常量。品牌从「造物引擎」换成 XOi。
 *
 * 备案信息通过 Vite 环境变量注入（VITE_ICP / VITE_POLICE / VITE_POLICE_CODE）；
 * 未设置时页脚回退到版权说明行，不显示备案链接。
 */
export const SITE = {
    name: import.meta.env.VITE_SITE_NAME || "XOi",
    /** 站点对外域名（客服弹窗、分享链接会用到） */
    domain: import.meta.env.VITE_SITE_DOMAIN || "xoi.net",
    icp: import.meta.env.VITE_ICP || "",
    icpUrl: "https://beian.miit.gov.cn/",
    police: import.meta.env.VITE_POLICE || "",
    policeCode: import.meta.env.VITE_POLICE_CODE || "",
    /** 客服微信 / 联系方式（忘记密码走人工重置时展示） */
    support: import.meta.env.VITE_SUPPORT_CONTACT || "",
} as const;

export function policeUrl(code: string) {
    return `https://beian.mps.gov.cn/#/query/webSearch?code=${encodeURIComponent(code)}`;
}
