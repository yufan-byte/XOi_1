/**
 * 模型引用巡检：只报告，不改写。
 *
 * 渠道列表是瞬时状态，直接更新 o_project/o_agentDeploy 会把一次上游抖动
 * 永久写进业务配置。运行时由 resolveUserCatalogModel 临时选择同系列健康线路；
 * 原偏好保留，上游恢复后自然回切。
 */
import { db } from "@/utils/db";
import { getGatewayModels } from "@/lib/model-catalog";

function bareModel(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return String(raw.split("::").pop() || "").replace(/^newapi:/, "").trim();
}

export async function repairStaleModelRefs(): Promise<void> {
  try {
    const models = await getGatewayModels();
    const valid = new Set(models.map((m) => m.modelName));
    const stale: string[] = [];

    // o_project: imageModel / videoModel（项目表没有 textModel 列）
    const projects = await db("o_project").select("id", "imageModel", "videoModel");
    for (const project of projects) {
      for (const column of ["imageModel", "videoModel"] as const) {
        const bare = bareModel((project as any)[column]);
        if (!bare || valid.has(bare)) continue;
        stale.push(`o_project ${project.id} ${column}=${bare}`);
      }
    }

    // o_agentDeploy: 全部是文字类 Agent 配置
    const agents = await db("o_agentDeploy").select("key", "modelName");
    for (const agent of agents) {
      const bare = bareModel(agent.modelName);
      if (!bare || valid.has(bare)) continue;
      stale.push(`o_agentDeploy ${agent.key} modelName=${bare}`);
    }
    if (stale.length) console.warn(`[model-ref-audit] ${stale.length} 个持久模型偏好当前不在网关目录；运行时将临时回退且不会改库：${stale.slice(0, 20).join("；")}${stale.length > 20 ? "…" : ""}`);
  } catch (error) {
    console.warn("[model-ref-audit] 巡检失败（下轮再试）:", (error as Error).message);
  }
}
