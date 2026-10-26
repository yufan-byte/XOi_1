/**
 * GET /api/works/history —— 「我的作品」生成历史（只读聚合）。
 *
 * 为什么不做「生成完成后写 mc_works」：
 *   生成产物本来就已经落库了 —— 角色/场景/道具/素材图在 o_image（projectId 经 o_assets 关联）、
 *   分镜图在 o_storyboard.filePath、分镜视频在 o_video.filePath。往 5~8 个生成路由里各埋一个
 *   登记钩子，既要给每个路由补 userId/标题/封面，又会把「登记失败」变成新的故障面。
 *   这里改成按当前用户的**项目**聚合现有生成记录，零写入、零风险，且和造物「读任务历史」的思路一致。
 *   （造物那里也是渲染层合并本地 store + new-api tasks 历史，不是另建一张作品表。）
 *
 * 归属口径：o_project.userId == req.user.id（o_user 镜像 id，与 new-api uid 同值）。
 * 音频不收录：XOi 的音频是用户上传的素材（无 TTS 生成链路），已归在「项目素材」里，重复收录没意义。
 */
import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";

const router = express.Router();

type HistoryType = "image" | "video";

interface HistoryItem {
  id: string;
  work_type: HistoryType;
  source: "asset" | "storyboard" | "video" | "output";
  title: string;
  description: string;
  cover_url: string;
  cover_kind: "image" | "video";
  poster_url?: string;
  status: "done";
  created_at: number | undefined;
  project_id: number | undefined;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** 相对 oss 路径 → 浏览器可访问 URL（dev 下带 host，生产为 /oss/...） */
async function url(filePath: unknown): Promise<string> {
  const p = String(filePath ?? "").trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  try {
    return await u.oss.getFileUrl(p);
  } catch {
    return "";
  }
}

export default router.get("/", async (req, res) => {
  const me = num((req as unknown as { user?: { id?: number } }).user?.id);
  if (!me) return res.status(401).send({ success: false, message: "请先登录" });

  const type = String(req.query.type || "all");
  const limit = Math.min(Math.max(num(req.query.limit) || 80, 1), 300);
  const keyword = String(req.query.keyword || "").trim().toLowerCase();
  const scopedId = req.query.projectId === undefined ? null : Number(req.query.projectId);
  if (scopedId !== null && (!Number.isSafeInteger(scopedId) || scopedId <= 0)) return res.status(400).send({ success: false, message: '项目编号无效' });

  try {
    // PostgreSQL returns bigint identifiers as strings; do not discard owned projects.
    const ownedProjects = u.db("o_project").where("userId", me);
    if (scopedId !== null) ownedProjects.andWhere('id', scopedId);
    const projectIds = (await ownedProjects.pluck("id")).map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
    if (!projectIds.length) return res.status(200).send(success({ items: [] }));

    const items: HistoryItem[] = [];
    const posters = type === 'all' || type === 'video' ? await u.db('o_storyboard').whereIn('projectId',projectIds).whereNotNull('filePath').whereNot('filePath','').orderBy('index','asc','last').orderBy('id').select('projectId','trackId','filePath') : [];

    if (type === "all" || type === "image") {
      // 1) 资产图：o_image ← o_assets（角色/道具/场景/素材），projectId 在 o_assets 上
      const imgRows = await u
        .db("o_image as i")
        .leftJoin("o_assets as a", "a.id", "i.assetsId")
        .whereIn("a.projectId", projectIds)
        .andWhere("i.state", "已完成")
        .andWhereNot("i.filePath", "")
        .orderBy("i.id", "desc")
        .limit(limit)
        .select(
          "i.id as id",
          "i.filePath as filePath",
          "i.model as model",
          "i.resolution as resolution",
          "a.name as name",
          "a.prompt as prompt",
          "a.type as assetType",
          "a.projectId as projectId",
          "a.startTime as startTime",
        );
      for (const r of imgRows) {
        const cover = await url(r.filePath);
        if (!cover) continue;
        items.push({
          id: `img_${r.id}`,
          work_type: "image",
          source: "asset",
          title: String(r.name || `${r.assetType || "资产"}图 #${r.id}`),
          description: String(r.prompt || ""),
          cover_url: cover,
          cover_kind: "image",
          status: "done",
          created_at: num(r.startTime) || undefined,
          project_id: num(r.projectId) || undefined,
        });
      }

      // 2) 分镜图：直接存在 o_storyboard.filePath 上
      const sbRows = await u
        .db("o_storyboard")
        .whereIn("projectId", projectIds)
        .andWhere("state", "已完成")
        .andWhereNot("filePath", "")
        .orderBy("id", "desc")
        .limit(limit)
        .select("id", "filePath", "prompt", "index", "projectId", "createTime");
      for (const r of sbRows) {
        const cover = await url(r.filePath);
        if (!cover) continue;
        items.push({
          id: `sb_${r.id}`,
          work_type: "image",
          source: "storyboard",
          title: `分镜图 #${r.index ?? r.id}`,
          description: String(r.prompt || ""),
          cover_url: cover,
          cover_kind: "image",
          status: "done",
          created_at: num(r.createTime) || undefined,
          project_id: num(r.projectId) || undefined,
        });
      }
    }

    if (type === "all" || type === "video") {
      // 3) 分镜视频：o_video.filePath，提示词在 o_videoTrack
      const vidRows = await u
        .db("o_video as v")
        .leftJoin("o_videoTrack as t", "t.id", "v.videoTrackId")
        .whereIn("v.projectId", projectIds)
        .andWhere("v.state", "生成成功")
        .andWhereNot("v.filePath", "")
        .orderBy("v.id", "desc")
        .limit(limit)
        .select("v.id as id", "v.filePath as filePath", "v.projectId as projectId", "v.videoTrackId as videoTrackId", "v.time as time", "t.prompt as prompt");
      for (const r of vidRows) {
        const cover = await url(r.filePath);
        if (!cover) continue;
        items.push({
          id: `vid_${r.id}`,
          work_type: "video",
          source: "video",
          title: `分镜视频 #${r.id}`,
          description: String(r.prompt || ""),
          cover_url: cover,
          cover_kind: "video",
          poster_url: await url(posters.find(p=>Number(p.trackId)===Number(r.videoTrackId))?.filePath),
          status: "done",
          created_at: num(r.time) || undefined,
          project_id: num(r.projectId) || undefined,
        });
      }

      // 4) 成片：前端合成后归档到 o_output 的整片（粗剪成片，项目的终点产物）
      const outRows = await u
        .db("o_output")
        .whereIn("projectId", projectIds)
        .andWhereNot("filePath", "")
        .orderBy("id", "desc")
        .limit(limit)
        .select("id", "filePath", "name", "duration", "resolution", "projectId", "createTime");
      for (const r of outRows) {
        const cover = await url(r.filePath);
        if (!cover) continue;
        const meta = [r.resolution, r.duration ? `${Math.round(num(r.duration))}s` : ""].filter(Boolean).join(" · ");
        items.push({
          id: `out_${r.id}`,
          work_type: "video",
          source: "output",
          title: String(r.name || `成片 #${r.id}`),
          description: meta,
          cover_url: cover,
          cover_kind: "video",
          poster_url: await url(posters.find(p=>Number(p.projectId)===Number(r.projectId))?.filePath),
          status: "done",
          created_at: num(r.createTime) || undefined,
          project_id: num(r.projectId) || undefined,
        });
      }
    }

    let list = items;
    if (keyword) {
      list = list.filter((x) => `${x.title} ${x.description}`.toLowerCase().includes(keyword));
    }
    // 有时间的排前面（新的在前），无时间的沉底
    list.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    res.status(200).send(success({ items: list.slice(0, limit) }));
  } catch (e) {
    console.error("[works/history]", e);
    res.status(500).send({ success: false, message: "读取生成历史失败" });
  }
});
