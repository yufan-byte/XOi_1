import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { assertScriptInProject } from "@/utils/assetScope";
const router = express.Router();

// 获取资产
export default router.post(
  "/",
  validateFields({
    projectId: z.number(),
    type: z.string(),
    name: z.string().optional(),
    page: z.number(),
    limit: z.number(),
    scriptId: z.number().optional().nullable(),
    scope: z.enum(["all", "shared", "script"]).optional().default("all"),
  }),
  async (req, res) => {
    const { projectId, type, name, page = 1, limit = 10, scriptId, scope = "all" } = req.body;
    let selectedScriptId: number | null = null;
    try {
      selectedScriptId = scriptId == null ? null : await assertScriptInProject(projectId, scriptId);
    } catch (error) {
      return res.status(400).send({ code: 400, message: error instanceof Error ? error.message : "剧本归属校验失败", data: null });
    }
    if (scope === "script" && selectedScriptId == null) {
      return res.status(400).send({ code: 400, message: "请选择一个剧本", data: null });
    }
    const offset = (page - 1) * limit;
    // 通过关联表过滤，而不是把同一份素材复制成多份。子资产继承父资产的剧本归属。
    const applyScope = (query: any) => {
      if (scope === "shared") {
        query = query
          .whereNotExists(function (this: any) {
            this.select(1).from("o_scriptAssets").whereRaw("o_scriptAssets.assetId = o_assets.id");
          })
          .whereNotExists(function (this: any) {
            this.select(1)
              .from("o_scriptAssets")
              .whereRaw("o_scriptAssets.assetId = o_assets.assetsId");
          });
      } else if (scope === "script" && selectedScriptId != null) {
        query = query.whereExists(function (this: any) {
          this.select(1)
            .from("o_scriptAssets")
            .where("o_scriptAssets.scriptId", selectedScriptId)
            .where(function (link: any) {
              link.whereRaw("o_scriptAssets.assetId = o_assets.id").orWhereRaw("o_scriptAssets.assetId = o_assets.assetsId");
            });
        });
      }
      return query;
    };
    let query = u
      .db("o_assets")
      .leftJoin("o_image", "o_assets.imageId", "o_image.id")
      .select("o_assets.*", "o_image.filePath", "o_image.state")
      .where("o_assets.projectId", projectId)
      .andWhere("o_assets.type", type);
    query = applyScope(query);
    if (name) {
      query = query.andWhere("name", "like", `%${name}%`);
    }
    // 分页查询
    const parentAssets = await query.where("o_assets.assetsId", null).offset(offset).limit(limit);

    // 获取所有子资产供关联使用
    let childQuery = u
      .db("o_assets")
      .leftJoin("o_image", "o_assets.imageId", "o_image.id")
      .select("o_assets.*", "o_image.filePath", "o_image.state", "o_image.errorReason")
      .where("o_assets.projectId", projectId)
      .andWhere("o_assets.type", type)
      .whereNotNull("o_assets.assetsId");
    childQuery = applyScope(childQuery);
    if (name) {
      childQuery = childQuery.andWhere("o_assets.name", "like", `%${name}%`);
    }
    const childAssets = await childQuery;

    // 为每个子资产添加图片地址
    const childAssetsWithSrc = await Promise.all(
      childAssets.map(async (child) => ({
        ...child,
        src: child.filePath && (await filterTypeGetFileUrl(child.filePath!, child.type)),
      })),
    );

    // 为每个父资产添加子资产
    const allAssetIds = [...parentAssets, ...childAssets].map((item) => item.id).filter(Boolean);
    const scriptLinks = allAssetIds.length
      ? await u
          .db("o_scriptAssets")
          .leftJoin("o_script", "o_script.id", "o_scriptAssets.scriptId")
          .whereIn("o_scriptAssets.assetId", allAssetIds)
          .select("o_scriptAssets.assetId", "o_scriptAssets.scriptId", "o_script.name as scriptName")
      : [];
    const scriptNames = new Map<number, string[]>();
    for (const link of scriptLinks) {
      const names = scriptNames.get(link.assetId) || [];
      if (link.scriptName && !names.includes(link.scriptName)) names.push(link.scriptName);
      scriptNames.set(link.assetId, names);
    }
    const annotate = (asset: any) => ({
      ...asset,
      // 子资产如果没有自己的关联，沿用父资产的剧本标签。
      scriptNames: scriptNames.get(asset.id) || (asset.assetsId ? scriptNames.get(asset.assetsId) : []) || [],
    });
    const result = await Promise.all(
      parentAssets.map(async (parent) => ({
        ...annotate(parent),
        sonAssets: childAssetsWithSrc
          .filter((child) => child.assetsId === parent.id)
          .map(annotate),
        src: parent.filePath && (await filterTypeGetFileUrl(parent.filePath!, parent.type)),
        ...(parent.type == "audio" ? { sex: parent.describe?.split("|")[0], describe: parent.describe?.split("|")[1] } : {}),
      })),
    );

    // 统计总数
    let totalQueryBuilder = u
      .db("o_assets")
      .where("projectId", projectId)
      .andWhere("type", type)
      .andWhere("assetsId", null)
      .andWhere((qb) => {
        if (name) {
          qb.andWhere("name", "like", `%${name}%`);
        }
      });
    totalQueryBuilder = applyScope(totalQueryBuilder);
    const totalQuery = (await totalQueryBuilder.count("* as total").first()) as any;
    res.status(200).send(success({ data: result, total: totalQuery?.total }));
  },
);

async function filterTypeGetFileUrl(url: string, type: string) {
  if (type == "role" || type == "tool" || type == "scene") {
    return await u.oss.getSmallImageUrl(url);
  } else {
    return await u.oss.getFileUrl(url);
  }
}
