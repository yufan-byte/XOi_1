import { Request, Response } from "express";
import u from "@/utils";

/**
 * POST /assetsGenerate/saveCanvasResult
 * 保存画布编辑后的结果（替换资产图片）
 */
export default async function saveCanvasResult(req: Request, res: Response) {
  try {
    const { id, filePath } = req.body;
    if (!id || !filePath) {
      return res.status(400).json({ error: "缺少必要参数" });
    }

    // 验证资产存在
    const asset = await u.db("o_assets").where("id", id).first();
    if (!asset) {
      return res.status(404).json({ error: "资产不存在" });
    }

    // 创建新的图片记录
    const [newImageId] = await u.db("o_image").insert({
      filePath: filePath,
      state: "已完成",
      assetsId: id,
    });

    // 更新资产关联的图片
    await u.db("o_assets").where("id", id).update({
      imageId: newImageId,
    });

    res.json({ success: true, message: "画布结果已保存", imageId: newImageId });
  } catch (error) {
    console.error("保存画布结果失败:", error);
    res.status(500).json({ error: "保存失败" });
  }
}
