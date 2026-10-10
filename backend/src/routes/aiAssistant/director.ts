import express from "express";
import { success, error } from "@/lib/responseFormat";
import { getAssistantAiConfig } from "@/utils/aiAssistant/modelConfig";
import { AssistantError } from "@/utils/aiAssistant/videoAnalysis";
import { listDirectorSkills } from "@/utils/director/skillRegistry";
import { planDirector, validateDirectorRequest } from "@/utils/director/planner";
import { assertDirectorOwner, DirectorInputError } from "../../../../shared/directorSkills";

const router = express.Router();
router.get("/skills", async (_req, res) => res.json(success(await listDirectorSkills())));
router.post("/plan", async (req, res) => {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]);
  const disconnect = () => { if (!res.writableEnded) controller.abort(); };
  res.on("close", disconnect);
  try {
    const userId = Number((req as any).user?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(401).json(error("请先登录"));
    const input = validateDirectorRequest(req.body);
    try { assertDirectorOwner(input.scene.projectId, userId); }
    catch { return res.status(403).json(error("场景不属于当前账号")); }
    const config = await getAssistantAiConfig(userId, req.body.model);
    if (!config) throw new AssistantError("请先配置导演方案使用的文本模型");
    const result = await planDirector({ config, input, signal });
    if (!res.destroyed) res.json(success({ ...result, projectId: input.scene.projectId, activeShotId: input.scene.activeShotId }));
  } catch (e) {
    if (controller.signal.aborted || res.destroyed) return;
    const message = signal.aborted ? "导演方案生成超时，请缩小需求后重试" : e instanceof DirectorInputError || e instanceof AssistantError ? e.message : "导演方案服务暂不可用，请确认技能完整包已经导入";
    res.status(signal.aborted ? 504 : e instanceof AssistantError ? e.status : e instanceof DirectorInputError ? 400 : 500).json(error(message));
  } finally { res.off("close", disconnect); }
});
export default router;
