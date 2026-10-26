import {z} from "zod";
import {QUOTA_PER_YUAN as QUOTA_PER_UNIT} from "@/utils/creditUnits";
const limit=z.number().finite().nonnegative().refine(v=>Number.isSafeInteger(Math.round(v*QUOTA_PER_UNIT)),"额度超出允许范围");
const nickname=z.string().trim().min(1).max(40);
const period=z.enum(["day","month","total"]);
export const newMemberInput=z.object({nickname,email:z.string().trim().toLowerCase().email().max(254),password:z.string().min(8).max(20),limit,period,canViewAll:z.boolean().default(false)}).strict();
export const memberActionInput=z.discriminatedUnion("action",[
  z.object({action:z.literal("update"),nickname:nickname.optional(),limit:limit.optional(),period:period.optional(),canViewAll:z.boolean().optional()}).strict(),
  z.object({action:z.literal("password"),password:z.string().min(8).max(20)}).strict(),
  z.object({action:z.literal("disable")}).strict(),z.object({action:z.literal("enable")}).strict(),z.object({action:z.literal("delete")}).strict(),
]);
export const renameTeamInput=z.object({name:nickname,expectedName:z.string().min(1).max(40)}).strict();
export const managementQuery=z.object({view:z.enum(["ledger","operations"]).default("ledger"),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict();
