import type { Knex } from "knex";

export type ResourceKind = "project" | "script" | "novel" | "asset" | "image" | "storyboard" | "track" | "video" | "task" | "event" | "agentData" | "flow";
export interface ResourceRow {
  id: number;
  userId: number;
  projectId?: number | null;
  scriptId?: number | null;
  parentId?: number | null;
}
export type ResourceLoader = (kind: ResourceKind, ids: number[]) => Promise<ResourceRow[]>;

/** Resolve ownership from stored relationships, never from a caller-supplied projectId. */
export function createResourceLoader(db: Knex): ResourceLoader {
  return async (kind, ids) => {
    if (kind === "project") return db("o_project").whereIn("id", ids).select("id", "userId", "id as projectId");
    if (kind === "image") {
      return db("o_image as r").join("o_assets as a", "a.id", "r.assetsId").join("o_project as p", "p.id", "a.projectId")
        .whereIn("r.id", ids).select("r.id", "p.userId", "a.projectId", "r.assetsId as parentId");
    }
    if (kind === "event") {
      return db("o_event as r").join("o_eventChapter as c", "c.eventId", "r.id").join("o_novel as n", "n.id", "c.novelId")
        .join("o_project as p", "p.id", "n.projectId").whereIn("r.id", ids).distinct("r.id", "p.userId", "n.projectId");
    }
    if (kind === "flow") {
      // Legacy flows have no owner column: only their actual asset/storyboard links grant access.
      const direct = await db("o_imageFlow").whereIn("id", ids).whereNotNull("userId").select("id", "userId");
      const legacyIds = ids.filter((id) => !direct.some((row) => Number(row.id) === id));
      const linked = await Promise.all(["o_assets", "o_storyboard"].map((table) =>
        db(`${table} as r`).join("o_project as p", "p.id", "r.projectId").whereIn("r.flowId", legacyIds)
          .select("r.flowId as id", "p.userId", "r.projectId")));
      return [...direct, ...linked.flat()];
    }
    const tables: Record<Exclude<ResourceKind, "project" | "image" | "event" | "flow">, string> = {
      script: "o_script", novel: "o_novel", asset: "o_assets", storyboard: "o_storyboard",
      track: "o_videoTrack", video: "o_video", task: "o_tasks", agentData: "o_agentWorkData",
    };
    const query = db(`${tables[kind]} as r`).join("o_project as p", "p.id", "r.projectId").whereIn("r.id", ids);
    const columns = ["r.id", "p.userId", "r.projectId"];
    if (["storyboard", "track", "video"].includes(kind)) columns.push("r.scriptId");
    if (kind === "asset") columns.push("r.assetsId as parentId");
    if (kind === "video") columns.push("r.videoTrackId as parentId");
    return query.select(columns);
  };
}
