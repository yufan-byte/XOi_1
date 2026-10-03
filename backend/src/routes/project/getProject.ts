import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
const router = express.Router();

/** 进度段 id 与前端 components/pipeline/pipelineSteps.ts 的 PROGRESS_SEGMENTS 一一对应 */
type Counter = { done: number; total: number };

function blankProgress(): Record<string, Counter> {
  return {
    material: { done: 0, total: 0 },
    script: { done: 0, total: 0 },
    asset: { done: 0, total: 0 },
    storyboard: { done: 0, total: 0 },
    output: { done: 0, total: 0 },
  };
}

const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * 获取项目（按用户隔离），附带流水线进度聚合。
 *
 * progress 是「项目卡在哪一步」的服务端答案，供前端项目卡的进度条与顶栏进度带使用：
 * 素材(章节) / 剧本(分集) / 角色场景(资产出图) / 分镜(已完成) / 成片(归档)。
 * 全部是 count 查询，一次 whereIn 批量取回，避免 N+1；列表页一次请求即可拿到全部进度。
 */
export default router.post("/", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).send({ message: "未登录" });
  }
  const projects = await u.db("o_project").where("userId", userId).select("*");
  const ids: number[] = projects.map((p: any) => p.id).filter((id: any) => typeof id === "number");

  const progressById: Record<number, Record<string, Counter>> = {};
  projects.forEach((p: any) => {
    progressById[p.id] = blankProgress();
  });

  if (ids.length) {
    const [novelRows, scriptRows, assetRows, storyboardRows, storyboardDoneRows, outputRows] = await Promise.all([
      //素材：已收录的小说章节数
      u.db("o_novel").whereIn("projectId", ids).groupBy("projectId").select("projectId").count({ c: "*" }),
      //剧本：分集剧本数
      u.db("o_script").whereIn("projectId", ids).groupBy("projectId").select("projectId").count({ c: "*" }),
      //角色场景：资产总数 + 已出图（imageId 非空）
      u.db("o_assets").whereIn("projectId", ids).groupBy("projectId").select("projectId").count({ total: "*" }).count({ done: "imageId" }),
      //分镜：分镜总数 / 已完成数
      u.db("o_storyboard").whereIn("projectId", ids).groupBy("projectId").select("projectId").count({ c: "*" }),
      u.db("o_storyboard").whereIn("projectId", ids).where("state", "已完成").groupBy("projectId").select("projectId").count({ c: "*" }),
      //成片：归档的成片数
      u.db("o_output").whereIn("projectId", ids).groupBy("projectId").select("projectId").count({ c: "*" }),
    ]);

    const put = (rows: any[], apply: (bucket: Record<string, Counter>, row: any) => void) => {
      rows.forEach((row: any) => {
        const bucket = progressById[row.projectId];
        if (bucket) apply(bucket, row);
      });
    };

    put(novelRows, (b, r) => {
      const n = num(r.c);
      b.material = { done: n, total: n };
    });
    put(scriptRows, (b, r) => {
      const n = num(r.c);
      b.script = { done: n, total: n };
    });
    put(assetRows, (b, r) => {
      b.asset = { done: num(r.done), total: num(r.total) };
    });
    put(storyboardRows, (b, r) => {
      b.storyboard = { ...b.storyboard, total: num(r.c) };
    });
    put(storyboardDoneRows, (b, r) => {
      b.storyboard = { ...b.storyboard, done: num(r.c) };
    });
    put(outputRows, (b, r) => {
      b.output = { done: num(r.c), total: num(r.c) };
    });
  }

  const data = projects.map((p: any) => ({ ...p, progress: progressById[p.id] ?? blankProgress() }));
  res.status(200).send(success(data));
});
