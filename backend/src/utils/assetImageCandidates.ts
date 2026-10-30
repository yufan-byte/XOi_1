import type { Knex } from "knex";

type BatchItem = { id: number; type: string };

/** Create all placeholders atomically; candidate mode never changes the selected image. */
export async function createBatchImagePlaceholders(db: Knex, projectId: number, items: BatchItem[], candidateOnly: boolean): Promise<number[]> {
  return db.transaction(async (trx) => {
    const ids: number[] = [];
    for (const item of items) {
      const [imageId] = await trx("o_image").insert({ type: item.type, state: "生成中", assetsId: item.id });
      if (!candidateOnly) await trx("o_assets").where({ id: item.id, projectId }).update({ imageId });
      ids.push(Number(imageId));
    }
    return ids;
  });
}

/** Adopt only a completed candidate belonging to the asset, and detect a changed selection. */
export async function adoptImageCandidate(db: Knex, input: { id: number; projectId: number; imageId: number; expectedImageId: number | null }): Promise<"adopted" | "invalid" | "conflict"> {
  const candidate = await db("o_image").where({ id: input.imageId, assetsId: input.id }).select("state", "filePath").first();
  if (!candidate || candidate.state !== "已完成" || !candidate.filePath) return "invalid";
  const updated = await db("o_assets").where({ id: input.id, projectId: input.projectId })
    .modify((query) => input.expectedImageId === null ? query.whereNull("imageId") : query.where("imageId", input.expectedImageId))
    .update({ imageId: input.imageId });
  return updated ? "adopted" : "conflict";
}
