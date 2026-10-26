import type { Knex } from "knex";
import { readContinuity } from "./directorContinuity";

/** Swap the current image and retain project-local prior results without another model call. */
export async function saveStoryboardImageVersion(
  db: Knex,
  projectId: number,
  scriptId: number,
  id: number,
  filePath: string,
  restore = false,
) {
  return db.transaction(async (trx) => {
    const row = await trx("o_storyboard")
      .where({ id, projectId, scriptId })
      .forUpdate()
      .first();
    if (!row) throw Error("镜头不属于当前剧集");
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
    c.imageHistory = [
      ...previous,
      ...(c.imageHistory || []).filter(
        (v) => v.filePath !== filePath && v.filePath !== row.filePath,
      ),
    ].slice(0, 12);
    await trx("o_storyboard")
      .where({ id, projectId, scriptId })
      .update({
        filePath,
        state: "已完成",
        reason: "",
        continuity: JSON.stringify(c),
      });
    return c;
  });
}
