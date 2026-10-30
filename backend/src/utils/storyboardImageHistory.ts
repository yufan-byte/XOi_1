import type { Knex } from "knex";
import { readContinuity } from "./directorContinuity";
import replaceUrl from "./replaceUrl";

/** Swap the current image and retain project-local prior results without another model call. */
export async function saveStoryboardImageVersion(
  db: Knex,
  projectId: number,
  scriptId: number,
  id: number,
  filePath: string,
  restore = false,
  options?: { expectedFilePath?: string | null; flowId?: number },
) {
  return db.transaction(async (trx) => {
    const row = await trx("o_storyboard")
      .where({ id, projectId, scriptId })
      .forUpdate()
      .first();
    if (!row) throw Error("镜头不属于当前剧集");
    if (options?.expectedFilePath !== undefined && (row.filePath ? replaceUrl(row.filePath) : null) !== options.expectedFilePath)
      throw Error("当前分镜画面已被其他操作更新，请重新打开画布后再采用。");
    if (options?.flowId && row.state === "生成中") throw Error("镜头正在生成，请等待完成后再采用画面。");
    const c = readContinuity(row.continuity) || {
      transition: "cut" as const,
      startState: "",
      endState: "",
      screenDirection: "",
    };
    if (
      restore &&
      (row.state === "生成中" ||
        !c.imageHistory?.some((v) => v.filePath === filePath))
    )
      throw Error("该历史版本不可恢复或镜头正在生成");
    const previous =
      row.filePath && row.filePath !== filePath
        ? [{ filePath: row.filePath, createdAt: Date.now() }]
        : [];
    const history = [
      ...previous,
      ...(c.imageHistory || []).filter(
        (v) => v.filePath !== filePath && v.filePath !== row.filePath,
      ),
    ];
    if (history.length > 100) throw Error("该镜头历史图片已达上限，原画面与历史均已保留。");
    c.imageHistory = history;
    await trx("o_storyboard")
      .where({ id, projectId, scriptId })
      .update({
        filePath,
        state: "已完成",
        reason: "",
        continuity: JSON.stringify(c),
        ...(options?.flowId ? { flowId: options.flowId, shouldGenerateImage: 1 } : {}),
      });
    return c;
  });
}
