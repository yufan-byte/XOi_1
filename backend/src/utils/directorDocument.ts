import type { Knex } from "knex";
import {
  readDirectorReview,
  directorReviewState,
  type DirectorStage,
} from "./directorStageReview";
export interface DirectorDocumentEdit {
  stage: DirectorStage;
  content: string;
  expectedContent: string;
  expectedPlan: string;
  expectedScript: string;
}
/** Update just the document being edited. Preserve agent memory, approvals and all media records. */
export async function saveDirectorDocument(
  db: Knex,
  userId: number,
  projectId: number,
  scriptId: number,
  edit: DirectorDocumentEdit,
) {
  return db.transaction(async (trx) => {
    const project = await trx("o_project")
      .where({ id: projectId, userId })
      .forUpdate()
      .first();
    if (!project) return { message: "无权编辑此项目" };
    const { script, row, data } = await readDirectorReview(
      trx,
      projectId,
      scriptId,
    );
    if (
      String(script.content || "") !== edit.expectedScript ||
      String(data[edit.stage] || "") !== edit.expectedContent ||
      (edit.stage === "storyboardTable" &&
        String(data.scriptPlan || "") !== edit.expectedPlan)
    )
      return {
        message:
          "内容已更新，请关闭编辑窗口并重新核对后再保存。你的编辑仍保留在输入框中。",
      };
    data[edit.stage] = edit.content;
    const record = {
      projectId,
      episodesId: scriptId,
      key: "productionAgent",
      data: JSON.stringify(data),
    };
    if (row)
      await trx("o_agentWorkData")
        .where({ id: row.id })
        .update({ data: record.data });
    else await trx("o_agentWorkData").insert(record);
    return { state: directorReviewState(script.content || "", data) };
  });
}
