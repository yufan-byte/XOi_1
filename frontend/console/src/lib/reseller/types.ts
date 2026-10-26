/** 平台与代理配置模型：服务端共享数据库持久化，客户端不保存凭据或配置真源。 */
export interface SiteBrand { name: string; subtitle: string; hideSubtitle: boolean; logo: string; footer: string; icp?: string; police?: string; policeCode?: string; supportPhone?: string; supportEmail?: string; company?: string }
export interface SiteDomain { subdomain: string; subdomainReason: string; subdomainStatus: "none" | "pending" | "approved" | "rejected"; customDomains: { domain: string; audience: "global" | "cn"; status: "pending" | "active" | "rejected"; createdAt: number }[] }
export interface SiteTheme { skin: string; loginVideo: string; customBackground: string; customTemplate: string }
export interface ModelsConfig { disabled: string[]; markupPct: number; markupHistory: { pct: number; at: number }[]; /** 对分销加成：开通新下级时对方的默认进货加价 %（0-20） */ downstreamMarkupPct?: number }
export interface ContactWechat { id: string; name: string; wechat: string; qr: string }
export interface GroupLink { id: string; name: string; platform: string; url: string; qr: string; note: string }
export interface CustomerService { contacts: ContactWechat[]; groups: GroupLink[] }
export interface SettingsConfig { /** 团队功能：默认关闭。开团会用站长的管理员令牌批量建号，任何登录用户都能开的话，
 *  等于把批量建号 + 领注册赠额 + 领签到 + 收走余额这条链路对所有人开放（2026-09-21 审查）。 */
  teamEnabled?: boolean; notifyEmail: string; notifyRegister: boolean; notifyCommission: boolean; minTopup: number; allowCustomAmount: boolean; topupTiers: number[]; userInvite: boolean; inviteRate: number; inviteReward: "credits" | "cash"; showInviteCodeOnSignup: boolean; inviteDomain?: "subdomain" | "custom"; topupGuide?: boolean; topupGuideText?: string; topupGuideButton?: string; topupGuideUrl?: string; showBecomeReseller?: boolean; becomeResellerPopup?: boolean }
/** 站内运营 · 活动管理：充值福利（满赠梯度）+ 本站每日签到 */
export interface ActivitiesConfig { topupBonus: { enabled: boolean; tiers: { threshold: number; bonus: number }[] }; checkin: { enabled: boolean; amount: number; mode: "pool" | "direct"; pool: number; savedOn: string; savesToday: number } }
export interface RecruitConfig { markup: number; clicks: number }
export interface CustomerMeta { tags: string[]; note: string }
export interface PayoutAccount { id: string; type: string; note: string; qr: string; createdAt: number }
export interface PayoutProfile { company: string; bank: string; account: string; taxId: string; invoiceFile: string }
export interface Withdrawal { id: string; amount: number; accountId: string; status: string; createdAt: number }
export interface FinanceConfig { accounts: PayoutAccount[]; profile: PayoutProfile; withdrawals: Withdrawal[]; invoices: { id: string; amount: number; status: string; createdAt: number }[] }
export interface AuditEntry { id: string; actorRole: string; actorEmail: string; action: string; targetType: string; targetId: string; at: number; ip: string }
export interface ResellerData { site: SiteBrand; domain: SiteDomain; theme: SiteTheme; models: ModelsConfig; customerService: CustomerService; settings: SettingsConfig; recruit: RecruitConfig; customers: Record<string, CustomerMeta>; finance: FinanceConfig; audit: AuditEntry[]; activities: ActivitiesConfig; agreementSignedAt?: number }

export const DEFAULT_DATA: ResellerData = {
  site: { name: "", subtitle: "", hideSubtitle: false, logo: "", footer: "" },
  domain: { subdomain: "", subdomainReason: "", subdomainStatus: "none", customDomains: [] },
  theme: { skin: "obsidian", loginVideo: "", customBackground: "", customTemplate: "" },
  models: { disabled: [], markupPct: 0, markupHistory: [] },
  customerService: { contacts: [], groups: [] },
  settings: { notifyEmail: "", notifyRegister: true, notifyCommission: true, minTopup: 0, allowCustomAmount: true, topupTiers: [], userInvite: false, inviteRate: 0, inviteReward: "credits", showInviteCodeOnSignup: true },
  recruit: { markup: 500, clicks: 0 },
  customers: {},
  finance: { accounts: [], profile: { company: "", bank: "", account: "", taxId: "", invoiceFile: "" }, withdrawals: [], invoices: [] },
  audit: [],
  activities: { topupBonus: { enabled: false, tiers: [] }, checkin: { enabled: false, amount: 0.1, mode: "pool", pool: 0, savedOn: "", savesToday: 0 } },
};
/** 未登录用户也可读取的公开配置（品牌、客服、充值档次、邀请开关） */
export const PUBLIC_SECTIONS = ["site", "theme", "customerService", "settings", "models"] as const;
export type Section = keyof ResellerData;
