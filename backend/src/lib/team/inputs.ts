import {z} from "zod";
import {QUOTA_PER_YUAN as QUOTA_PER_UNIT} from "@/utils/creditUnits";
const limit=z.number().finite().nonnegative().refine(v=>Number.isSafeInteger(Math.round(v*QUOTA_PER_UNIT)),"额度超出允许范围");
const nickname=z.string().trim().min(1).max(40);
const period=z.enum(["day","month","total"]);
const teamId=z.coerce.number().int().positive().optional();
/** 批量下发沿用同一套密码口径（8~64 位，和网关保持一致）。 */
const password=z.string().min(8).max(64);
export const newMemberInput=z.object({nickname,email:z.string().trim().toLowerCase().email().max(254).optional().or(z.literal("")),password,limit,period,canViewAll:z.boolean().default(false)}).strict();
export const memberActionInput=z.discriminatedUnion("action",[
  z.object({action:z.literal("update"),nickname:nickname.optional(),limit:limit.optional(),period:period.optional(),canViewAll:z.boolean().optional()}).strict(),
  z.object({action:z.literal("password"),password}).strict(),
  z.object({action:z.literal("disable")}).strict(),z.object({action:z.literal("enable")}).strict(),z.object({action:z.literal("delete")}).strict(),
]);
export const renameTeamInput=z.object({name:nickname,expectedName:z.string().min(1).max(40),teamId}).strict();
export const managementQuery=z.object({view:z.enum(["ledger","operations"]).default("ledger"),page:z.coerce.number().int().min(1).max(100000).default(1),teamId}).strict();
export const teamQuery=z.object({month:z.string().max(7).optional(),summary:z.enum(["0","1"]).optional(),teamId}).strict();
export const teamListQuery=z.object({q:z.string().trim().max(40).optional(),page:z.coerce.number().int().min(1).max(100000).default(1),size:z.coerce.number().int().min(1).max(50).default(12)}).strict();
export const sudoInput=z.object({
  action:z.literal("sudo"),
  password:z.string().min(1).max(200).optional(),
  // 动态口令 6 位数字；救援码 10 位大写字母数字（允许连字符/空格，方便用户照抄）
  code:z.string().trim().regex(/^(\d{6}|[A-Za-z0-9][A-Za-z0-9-]{8,18})$/,"请输入 6 位动态口令或 10 位救援码").optional(),
}).strict();
/** MFA 绑定 / 关闭：code 确认开启，password 用于关闭前复核。 */
export const mfaEnrollInput=z.object({action:z.literal("mfaEnroll")}).strict();
export const mfaConfirmInput=z.object({action:z.literal("mfaConfirm"),code:z.string().trim().regex(/^\d{6}$/,"动态口令需为 6 位数字")}).strict();
export const mfaDisableInput=z.object({action:z.literal("mfaDisable"),password:z.string().min(1).max(200)}).strict();
export const batchExportQuery=z.object({
  batchId:z.string().trim().uuid("批次编号无效"),
  teamId:z.coerce.number().int().positive(),
  format:z.enum(["xlsx","csv"]).default("xlsx"),
}).strict();
export const batchMembersInput=z.object({
  action:z.literal("batchMembers"),
  teamId:z.coerce.number().int().positive(),
  count:z.coerce.number().int().min(1).max(200),
  prefix:z.string().trim().min(2).max(12).regex(/^[a-z0-9][a-z0-9_-]{1,11}$/,"账号前缀只能用小写字母/数字/下划线/短横线"),
  nicknameBase:z.string().trim().max(30).optional(),
  limit,
  period,
  canViewAll:z.boolean().default(false),
}).strict();
