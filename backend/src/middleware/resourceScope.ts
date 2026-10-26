import type { RequestHandler } from "express";
import type { ResourceKind, ResourceLoader, ResourceRow } from "../utils/resourceAccess";

type Rule = [ResourceKind, string];
const rules: Record<string, Rule[]> = {};
function add(kind: ResourceKind, field: string, ...paths: string[]) {
  for (const path of paths) (rules[path.toLowerCase()] ??= []).push([kind, field]);
}
add("project", "id", "project/editProject", "project/delProject", "general/getSingleProject", "general/updateProject");
add("asset", "id", "assets/batchDelete", "assets/delAssets", "assets/saveAssets", "assets/updateAssets", "assets/updateAudioAssets",
  "assetsGenerate/generateAssets", "assetsGenerate/saveCanvasResult", "production/assets/deleteAssetsDireve", "production/assets/updateAssetsUrl");
add("asset", "ids", "assets/pollingImageAssets", "assets/pollingPromptAssets", "cornerScape/pollingAudio", "production/assets/pollingImage");
add("asset", "assetsItem.*.id", "assets/updateAudioAssets");
add("asset", "items.*.id", "assetsGenerate/batchGenerateImageAssets");
add("asset", "items.*.assetsId", "assetsGenerate/batchPolishAssetsPrompt");
add("asset", "assets", "script/addScript", "script/updateScript");
add("asset", "data.*.associateAssetsIds", "production/storyboard/batchAddStoryboardInfo");
add("image", "id", "assets/delImage", "assetsGenerate/cancelGenerate");
add("novel", "id", "novel/delNovel", "novel/updateNovel");
add("novel", "ids", "novel/batchDeleteNovel", "novel/getNovelEventState");
add("event", "id", "novel/event/deletEvent");
add("event", "ids", "novel/event/batchDeleteEvent");
add("script", "id", "script/updateScript", "script/exportScript");
add("script", "ids", "script/delScript", "script/pollScriptAssets");
add("script", "data.script.*.id", "scriptAgent/updateData");
add("agentData", "id", "scriptAgent/updateData");
add("storyboard", "id", "production/storyboard/editStoryboardInfo", "production/storyboard/removeFrame", "production/storyboard/updateStoryboardUrl");
add("storyboard", "id", "production/storyboard/saveContinuity");
add("storyboard", "id", "production/storyboard/restoreContinuityImage");
add("storyboard", "ids", "production/storyboard/batchDelete", "production/storyboard/pollingImage");
add("storyboard", "data.storyboard.*.id", "production/saveFlowData");
add("track", "id", "production/workbench/deleteTrack", "production/workbench/updateVideoDuration", "production/workbench/updateVideoPrompt");
add("track", "trackData.*.trackId", "production/workbench/batchGeneratePrompt", "production/workbench/batchGenerateVideo");
add("video", "id", "production/workbench/delVideo");
add("flow", "id", "production/editImage/getImageFlow");

const commonFields: Rule[] = [
  ["project", "projectId"], ["script", "scriptId"], ["script", "episodesId"], ["script", "scriptIds"],
  ["novel", "novelIds"], ["asset", "assetsId"], ["asset", "assetsIds"], ["asset", "assetIds"], ["asset", "audioIds"],
  ["image", "imageId"], ["storyboard", "storyboardIds"], ["track", "trackId"], ["track", "trackIds"],
  ["video", "videoId"], ["video", "videoIds"], ["task", "taskId"], ["flow", "flowId"],
];
const sourcePaths: Record<string, string[]> = {
  "production/workbench/getfileurl": ["items"],
  "production/workbench/generatevideoprompt": ["info"],
  "production/workbench/batchgenerateprompt": ["trackData.*.info"],
  "production/workbench/generatevideo": ["uploadData"],
  "production/workbench/batchgeneratevideo": ["trackData.*.uploadData"],
};

class ScopeError extends Error { constructor(public status: number, message: string) { super(message); } }
function valuesAt(value: any, parts: string[]): unknown[] {
  if (value == null) return [];
  if (!parts.length) return [value];
  const [key, ...rest] = parts;
  if (key === "*") {
    if (!Array.isArray(value) || value.length > 500) throw new ScopeError(400, "资源列表最多 500 项");
    return value.flatMap((item) => valuesAt(item, rest));
  }
  return valuesAt(value[key], rest);
}
function idsOf(values: unknown[]): number[] {
  const flat = values.flat();
  if (flat.length > 500) throw new ScopeError(400, "资源列表最多 500 项");
  return [...new Set(flat.filter((value) => value !== undefined && value !== null && value !== "").map((value) => {
    if (!(typeof value === "number" || (typeof value === "string" && /^[1-9]\d*$/.test(value)))) throw new ScopeError(400, "资源参数无效");
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ScopeError(400, "资源参数无效");
    return id;
  }))];
}

/** All creative resource reads, writes and bulk/nested references pass through the same ownership check. */
export function resourceScope(load: ResourceLoader): RequestHandler {
  return async (req, res, next) => {
    const user = (req as any).user;
    if (!user) return next();
    const route = req.path.replace(/^\/+|\/+$/g, "").toLowerCase();
    // One-stop uses its own owner-scoped UUID document store, not o_project's numeric IDs.
    // Exact router endpoints only: their strict schemas and authenticated document queries own this scope.
    if (/^one-stop\/generation\/(quote|jobs)$/.test(route)) return next();
    const creative = /^(project|general|novel|script|scriptagent|assets|assetsgenerate|production|cornerscape|task|agents)(\/|$)/.test(route);
    try {
      const sources = [req.body, req.query].filter((value) => value && !Buffer.isBuffer(value));
      const requested = new Map<ResourceKind, Set<number>>();
      const collect = (kind: ResourceKind, values: unknown[]) => {
        const set = requested.get(kind) ?? new Set<number>();
        for (const id of idsOf(values)) set.add(id);
        if (set.size > 500) throw new ScopeError(400, "资源列表最多 500 项");
        requested.set(kind, set);
      };
      for (const source of sources) {
        // Preserve the global project check for routes outside the creative domains as well.
        for (const [kind, field] of creative ? [...commonFields, ...(rules[route] || [])] : [["project", "projectId"] as Rule]) {
          // Project-wide asset lists historically use scriptId=0 for "all episodes".
          const value = source[field];
          if (field === "scriptId" && value === 0 && /^assets\//.test(route)) continue;
          collect(kind, valuesAt(source, field.split(".")));
        }
        for (const path of sourcePaths[route] || []) {
          for (const items of valuesAt(source, path.split("."))) {
            if (!Array.isArray(items) || items.length > 500) throw new ScopeError(400, "素材列表无效");
            for (const item of items) {
              if (!item || !["assets", "storyboard"].includes(item.sources)) throw new ScopeError(400, "素材来源无效");
              collect(item.sources === "assets" ? "asset" : "storyboard", [item.id]);
            }
          }
        }
        if (creative && (source.id != null || source.ids != null) && !(rules[route] || []).some(([, field]) => field === "id" || field === "ids")) {
          throw new ScopeError(400, "此接口不接受资源 ID");
        }
      }
      const loaded = new Map<ResourceKind, ResourceRow[]>();
      for (const [kind, ids] of requested) {
        if (!ids.size) continue;
        const rows = await load(kind, [...ids]);
        // Every referenced row must exist and belong to this account; mixed-user batches fail as a whole.
        if ([...ids].some((id) => !rows.some((r) => Number(r.id) === id)) ||
          (user.role !== "admin" && rows.some((r) => Number(r.userId) !== Number(user.id)))) {
          throw new ScopeError(403, "无权访问该资源");
        }
        loaded.set(kind, rows);
      }
      const projectIds = requested.get("project");
      if (projectIds?.size === 1) {
        const projectId = [...projectIds][0];
        for (const rows of loaded.values()) if (rows.some((r) => r.projectId != null && Number(r.projectId) !== projectId)) {
          throw new ScopeError(403, "资源不属于当前项目");
        }
      }
      const body = req.body || {};
      if (route === "script/updatescript") {
        const projectId = loaded.get("script")?.[0]?.projectId;
        if (loaded.get("asset")?.some((r) => r.projectId !== projectId)) throw new ScopeError(403, "资产不属于该剧本的项目");
      }
      if (route === "assets/saveassets" && loaded.get("image")?.some((r) => Number(r.parentId) !== Number(body.id))) {
        throw new ScopeError(403, "图片不属于该资产");
      }
      if (route === "assets/updateaudioassets" && loaded.get("asset")?.some((r) => Number(r.id) !== Number(body.id) && Number(r.parentId) !== Number(body.id))) {
        throw new ScopeError(403, "音频子项不属于该资产");
      }
      if (route === "production/workbench/selectvideo" && loaded.get("video")?.some((r) => Number(r.parentId) !== Number(body.trackId))) {
        throw new ScopeError(403, "视频不属于该轨道");
      }
      const scriptId = body.scriptId || body.episodesId;
      if (scriptId && [...loaded.entries()].some(([kind, rows]) => ["storyboard", "track", "video"].includes(kind) && rows.some((r) => r.scriptId != null && Number(r.scriptId) !== Number(scriptId)))) {
        throw new ScopeError(403, "资源不属于当前剧集");
      }
      next();
    } catch (error) {
      if (error instanceof ScopeError) return res.status(error.status).json({ message: error.message });
      next(error);
    }
  };
}
