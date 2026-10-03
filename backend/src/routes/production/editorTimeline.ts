import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";

const router = express.Router();

/**
 * 剪辑工作台：按「分镜顺序」返回镜头，供编辑器自动装配主轨（进入即有稿）。
 *
 * 与 /assets/getMaterialData 的分工，别混：
 *   · 本接口 = 分镜语义：顺序 / 提示词 / 分镜图 / 该镜头下的全部成片视频 + 当前选用
 *   · getMaterialData = 扁平素材：项目素材（视频/音频/图片）+ 官方片尾，供左侧素材库
 *
 * 为什么不交给前端拼：顺序在 o_storyboard.index，选用关系在 o_videoTrack.videoId，
 * 两张表 + o_video 的关联只有服务端拿得准；前端拼等于把口径复制一份，必然漂移。
 *
 * 数据关系（实测）：
 *   o_storyboard.trackId ──► o_videoTrack.id ──► o_video.videoTrackId（state = 生成成功）
 *   一个 track 可能挂多条 storyboard（分镜帧），但视频是 track 级的 —— 所以
 *   **镜头粒度 = o_videoTrack**，顺序取该 track 下最小 index。
 */

async function safeFileUrl(filePath?: string | null): Promise<string> {
  if (!filePath) return "";
  try {
    return await u.oss.getFileUrl(filePath);
  } catch {
    return "";
  }
}

export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    scriptId: z.number().optional(),
  }),
  async (req, res) => {
    const { projectId, scriptId } = req.body;

    let storyboardQuery = u.db("o_storyboard").where("o_storyboard.projectId", projectId);
    if (scriptId) storyboardQuery = storyboardQuery.andWhere("o_storyboard.scriptId", scriptId);
    const storyboards = await storyboardQuery.select("*");

    let trackQuery = u.db("o_videoTrack").where("o_videoTrack.projectId", projectId);
    if (scriptId) trackQuery = trackQuery.andWhere("o_videoTrack.scriptId", scriptId);
    const tracks = await trackQuery.select("*");

    const trackIds = tracks.map((t: any) => t.id).filter((id: any) => id != null);
    const videoRows = trackIds.length
      ? await u.db("o_video").whereIn("o_video.videoTrackId", trackIds).andWhere("o_video.state", "生成成功").select("*")
      : [];

    const videosByTrack = new Map<number, any[]>();
    for (const row of videoRows) {
      const list = videosByTrack.get(Number(row.videoTrackId)) ?? [];
      list.push(row);
      videosByTrack.set(Number(row.videoTrackId), list);
    }

    const framesByTrack = new Map<number, any[]>();
    for (const sb of storyboards) {
      const tid = Number(sb.trackId);
      if (!Number.isFinite(tid)) continue;
      const list = framesByTrack.get(tid) ?? [];
      list.push(sb);
      framesByTrack.set(tid, list);
    }
    // 每个 track 内的分镜帧按 index 排序，第一张作为这个镜头的代表（缩略图 / 提示词 / 时长）
    for (const list of framesByTrack.values()) {
      list.sort((a, b) => {
        const ai = a.index == null ? Number.MAX_SAFE_INTEGER : Number(a.index);
        const bi = b.index == null ? Number.MAX_SAFE_INTEGER : Number(b.index);
        if (ai !== bi) return ai - bi;
        return Number(a.id) - Number(b.id);
      });
    }

    const orderedTracks = [...tracks].sort((a: any, b: any) => {
      const aHead = framesByTrack.get(Number(a.id))?.[0];
      const bHead = framesByTrack.get(Number(b.id))?.[0];
      const ai = aHead?.index == null ? Number.MAX_SAFE_INTEGER : Number(aHead.index);
      const bi = bHead?.index == null ? Number.MAX_SAFE_INTEGER : Number(bHead.index);
      if (ai !== bi) return ai - bi;
      return Number(a.id) - Number(b.id);
    });

    const shots = await Promise.all(
      orderedTracks.map(async (track: any, i: number) => {
        const frames = framesByTrack.get(Number(track.id)) ?? [];
        const head = frames[0] ?? null;

        const videos = await Promise.all(
          (videosByTrack.get(Number(track.id)) ?? []).map(async (v: any) => ({
            id: v.id,
            url: await safeFileUrl(v.filePath),
          })),
        );

        // 选用关系：o_videoTrack.videoId 是分镜台里勾选的那条；没勾过就退到最新一条
        const pickedId = Number(track.videoId ?? 0) || Number(track.selectVideoId ?? 0);
        const picked = videos.find((v) => Number(v.id) === pickedId) ?? videos[videos.length - 1];

        return {
          id: Number(track.id),
          index: head?.index == null ? i : Number(head.index),
          prompt: track.prompt || head?.prompt || "",
          duration: Number(track.duration) || Number(head?.duration) || 0,
          thumb: await safeFileUrl(head?.filePath),
          frameCount: frames.length,
          selectedVideoUrl: picked?.url ?? "",
          videos,
        };
      }),
    );

    res.status(200).send(success({ shots }));
  },
);
