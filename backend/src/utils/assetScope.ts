import u from "@/utils";

/**
 * 资产归属不复制文件：o_assets 保存项目级实体，o_scriptAssets 保存它被哪个剧本使用。
 * 所有从剧本工作流发起的新增/生成，都通过这个小工具幂等地补一条关联。
 */
export async function assertScriptInProject(projectId: number, scriptId?: number | null) {
  if (scriptId == null) return null;
  const script = await u.db("o_script").where({ id: scriptId, projectId }).select("id").first();
  if (!script) throw new Error("剧本不属于当前项目");
  return script.id as number;
}

export async function linkAssetToScript(assetId: number, scriptId?: number | null) {
  if (scriptId == null) return;
  await u.db("o_scriptAssets").insert({ scriptId, assetId }).onConflict(["scriptId", "assetId"]).ignore();
}
