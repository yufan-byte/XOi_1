import type { Knex } from "knex";

export class CreativeDeleteError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function checkedIds(values: number[]) {
  if (!values.length || values.length > 500 || values.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new CreativeDeleteError(400, "请选择 1~500 个有效条目");
  return [...new Set(values)];
}

async function lockOwnedProjects(trx: Knex.Transaction, userId: number, ids: number[]) {
  const query = trx("o_project").whereIn("id", ids).select("id", "userId").orderBy("id");
  if (trx.client.config.client === "pg") query.forUpdate();
  const rows = await query;
  if (rows.length !== ids.length || rows.some(row => Number(row.userId) !== userId)) throw new CreativeDeleteError(403, "项目不存在或无权删除");
}

/** Refuse destructive cleanup while persisted extraction/generation is still in progress. */
async function assertProjectsIdle(trx: Knex.Transaction, projectIds: number[]) {
  const checks = [
    trx("o_tasks").whereIn("projectId", projectIds).whereIn("state", ["进行中", "生成中", "running", "processing", "pending", "等待中", "queued", "unknown"]).first("id"),
    trx("o_novel").whereIn("projectId", projectIds).where("eventState", 0).first("id"),
    trx("o_script").whereIn("projectId", projectIds).whereIn("extractState", [0, 2]).first("id"),
    trx("o_assets").whereIn("projectId", projectIds).where("promptState", "生成中").first("id"),
    trx("o_image as i").join("o_assets as a", "a.id", "i.assetsId").whereIn("a.projectId", projectIds).where("i.state", "生成中").first("i.id"),
    trx("o_storyboard").whereIn("projectId", projectIds).where("state", "生成中").first("id"),
    trx("o_video").whereIn("projectId", projectIds).where("state", "生成中").first("id"),
    trx("o_videoTrack").whereIn("projectId", projectIds).where("state", "生成中").first("id"),
  ];
  // A transaction uses one PG connection; avoid overlapping queries on that connection.
  for (const check of checks) if (await check) throw new CreativeDeleteError(409, "此项目仍有提取、生成或待核实任务，请处理完成后再删除");
}

async function ownedChildren(trx: Knex.Transaction, table: "o_novel" | "o_script", ids: number[], userId: number) {
  let rows = await trx(table).whereIn("id", ids).select("id", "projectId");
  if (rows.length !== ids.length) throw new CreativeDeleteError(404, "所选内容已不存在，请刷新列表");
  const projects = [...new Set(rows.map(row => Number(row.projectId)))];
  await lockOwnedProjects(trx, userId, projects);
  // A concurrent delete may have completed while the project lock was being acquired.
  rows = await trx(table).whereIn("id", ids).select("id", "projectId");
  if (rows.length !== ids.length) throw new CreativeDeleteError(404, "所选内容已不存在，请刷新列表");
  await assertProjectsIdle(trx, projects);
  return rows;
}

async function detachNovelEvents(trx: Knex.Transaction, novelIds: number[]) {
  if (!novelIds.length) return;
  const links = await trx("o_eventChapter").whereIn("novelId", novelIds).select("eventId");
  const eventIds = [...new Set(links.map(link => Number(link.eventId)))];
  await trx("o_eventChapter").whereIn("novelId", novelIds).delete();
  if (eventIds.length) {
    // Link IDs and event IDs are different. Shared events survive until their final chapter is removed.
    await trx("o_event").whereIn("id", eventIds).whereNotExists(
      trx("o_eventChapter").select(trx.raw("1")).whereRaw("?? = ??", ["o_eventChapter.eventId", "o_event.id"]),
    ).delete();
  }
}

export async function deleteOwnedNovels(db: Knex, userId: number, values: number[]) {
  const ids = checkedIds(values);
  await db.transaction(async trx => {
    await ownedChildren(trx, "o_novel", ids, userId);
    await detachNovelEvents(trx, ids);
    await trx("o_novel").whereIn("id", ids).delete();
  });
}

export async function deleteOwnedEvents(db: Knex, userId: number, values: number[]) {
  const ids = checkedIds(values);
  await db.transaction(async trx => {
    const events = await trx("o_event").whereIn("id", ids).select("id");
    if (events.length !== ids.length) throw new CreativeDeleteError(404, "所选事件已不存在，请刷新列表");
    const loadLinks = () => trx("o_eventChapter as c").leftJoin("o_novel as n", "n.id", "c.novelId")
      .leftJoin("o_project as p", "p.id", "n.projectId").whereIn("c.eventId", ids).select("c.eventId", "n.projectId", "p.userId");
    const links = await loadLinks();
    if (ids.some(id => !links.some(link => Number(link.eventId) === id)) || links.some(link => Number(link.userId) !== userId)) throw new CreativeDeleteError(403, "无权删除未归属本人项目的事件");
    const projects = [...new Set(links.map(link => Number(link.projectId)))];
    await lockOwnedProjects(trx, userId, projects);
    await assertProjectsIdle(trx, projects);
    const latestLinks = await loadLinks();
    if (latestLinks.some(link => Number(link.userId) !== userId || !projects.includes(Number(link.projectId)))) throw new CreativeDeleteError(409, "事件关联已变化，请刷新后重试");
    // Foreign keys require deleting associations before their parent events.
    await trx("o_eventChapter").whereIn("eventId", ids).delete();
    await trx("o_event").whereIn("id", ids).delete();
  });
}

export async function deleteOwnedScripts(db: Knex, userId: number, values: number[]) {
  const ids = checkedIds(values);
  await db.transaction(async trx => {
    const scripts = await ownedChildren(trx, "o_script", ids, userId);
    const projectIds = [...new Set(scripts.map(script => Number(script.projectId)))];
    const frames = await trx("o_storyboard").whereIn("scriptId", ids).select("id");
    if (frames.length) await trx("o_assets2Storyboard").whereIn("storyboardId", frames.map(frame => frame.id)).delete();
    await trx("o_agentWorkData").whereIn("projectId", projectIds).whereIn("episodesId", ids).delete();
    await trx("o_scriptAssets").whereIn("scriptId", ids).delete();
    await trx("o_output").whereIn("projectId", projectIds).where(builder => builder.whereIn("scriptId", ids).orWhereIn("episodesId", ids)).delete();
    await trx("o_video").whereIn("scriptId", ids).delete();
    await trx("o_storyboard").whereIn("scriptId", ids).delete();
    await trx("o_videoTrack").whereIn("scriptId", ids).delete();
    // Assets/media may be shared by other episodes. Only remove this episode's references.
    await trx("o_assets").whereIn("projectId", projectIds).whereIn("scriptId", ids).update({ scriptId: null });
    for (const script of scripts) await trx("memories").where("isolationKey", `${script.projectId}:productionAgent:${script.id}`).delete();
    await trx("o_script").whereIn("id", ids).delete();
  });
}

export async function deleteOwnedProject(db: Knex, userId: number, id: number) {
  checkedIds([id]);
  await db.transaction(async trx => {
    await lockOwnedProjects(trx, userId, [id]);
    await assertProjectsIdle(trx, [id]);
    const novels = await trx("o_novel").where("projectId", id).select("id");
    const scripts = await trx("o_script").where("projectId", id).select("id");
    const frames = await trx("o_storyboard").where("projectId", id).select("id");
    const assets = await trx("o_assets").where("projectId", id).select("id");
    const assetIds = assets.map(asset => asset.id);
    await detachNovelEvents(trx, novels.map(novel => novel.id));
    if (scripts.length) await trx("o_scriptAssets").whereIn("scriptId", scripts.map(script => script.id)).delete();
    if (frames.length) await trx("o_assets2Storyboard").whereIn("storyboardId", frames.map(frame => frame.id)).delete();
    if (assetIds.length) {
      await trx("o_scriptAssets").whereIn("assetId", assetIds).delete();
      await trx("o_assets2Storyboard").whereIn("assetId", assetIds).delete();
      await trx("o_assetsRole2Audio").where(builder => builder.whereIn("assetsRoleId", assetIds).orWhereIn("assetsAudioId", assetIds)).delete();
      await trx("o_assets").whereIn("id", assetIds).update({ imageId: null });
      await trx("o_image").whereIn("assetsId", assetIds).delete();
    }
    for (const table of ["o_output", "o_agentWorkData", "o_video", "o_storyboard", "o_videoTrack", "o_assets", "o_script", "o_novel", "o_tasks"]) await trx(table).where("projectId", id).delete();
    await trx("memories").where("isolationKey", "like", `${id}:%`).delete();
    // Delete the project last. A failed child deletion rolls back every preceding mutation.
    await trx("o_project").where({ id, userId }).delete();
  });
}
