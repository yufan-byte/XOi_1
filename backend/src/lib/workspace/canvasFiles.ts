import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
export const canvasError = (message: string, status = 409) =>
  Object.assign(new Error(message), { status });
/** Single-node compatibility store. Existing files remain in place, without destructive migration. */
export class CanvasFiles {
  private writes = new Map<string, Promise<unknown>>();
  constructor(private directory: string) {}
  private file(id: string) {
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id))
      throw canvasError("无效的画布编号", 400);
    return path.join(this.directory, `${id}.json`);
  }
  private async raw(id: string) {
    try {
      return JSON.parse(await fs.readFile(this.file(id), "utf8"));
    } catch (e) {
      if ((e as any).code === "ENOENT") return null;
      throw e;
    }
  }
  private queue<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = this.writes.get(id) || Promise.resolve();
    const current = previous.catch(() => {}).then(work);
    this.writes.set(id, current);
    void current
      .finally(() => {
        if (this.writes.get(id) === current) this.writes.delete(id);
      })
      .catch(() => {});
    return current;
  }
  private async write(value: any) {
    const text = JSON.stringify(value);
    if (Buffer.byteLength(text) > 12 * 1024 * 1024)
      throw canvasError("画布超过 12MB，请拆分项目", 413);
    await fs.mkdir(this.directory, { recursive: true });
    const file = this.file(value.id),
      temp = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp, text, "utf8");
      await fs.rename(temp, file);
    } finally {
      await fs.unlink(temp).catch(() => {});
    }
    return value;
  }
  private owner(value: any, userId: number) {
    return (
      Number.isSafeInteger(userId) &&
      userId > 0 &&
      Number(value?.userId || 1) === userId
    );
  }
  private stamp(value: any, previous?: any) {
    value.revision = Number(previous?.revision || 0) + 1;
    value.updated_at = Math.max(
      Date.now(),
      Number(previous?.updated_at || 0) + 1,
    );
    const project = value.settings?.atelier?.project;
    if (project) {
      project.cloudRevision = value.revision;
      project.updatedAt = new Date(value.updated_at).toISOString();
    }
    return value;
  }
  async get(id: string, userId: number, includeDeleted = false) {
    const value = await this.raw(id);
    return value &&
      this.owner(value, userId) &&
      !value.purged &&
      (includeDeleted || !value.deleted_at)
      ? value
      : null;
  }
  async list(userId: number, includeDeleted = false) {
    if (!Number.isSafeInteger(userId) || userId <= 0) return [];
    const files = await fs.readdir(this.directory).catch((e) => {
      if (e.code === "ENOENT") return [];
      throw e;
    });
    const values = [];
    for (const file of files) {
      if (!/^[a-zA-Z0-9_-]{1,160}\.json$/.test(file)) continue;
      let value;
      try {
        value = await this.raw(file.slice(0, -5));
      } catch {
        console.warn("[canvas] 无法读取画布，原文件已保留待核对：", file);
        continue;
      }
      if (
        value &&
        !value.purged &&
        this.owner(value, userId) &&
        (includeDeleted || !value.deleted_at)
      )
        values.push(value);
    }
    return values.sort(
      (a, b) =>
        Number(!!b.pinned) - Number(!!a.pinned) ||
        Number(b.updated_at) - Number(a.updated_at),
    );
  }
  listMetadata(userId:number,includeDeleted=false) {return this.list(userId,includeDeleted);}
  async create(value: any, userId: number) {
    if (!Number.isSafeInteger(userId) || userId <= 0)
      throw canvasError("未登录", 401);
    return this.queue(value.id, async () => {
      if (await this.raw(value.id))
        throw canvasError("画布编号已存在或已删除，请重新创建");
      return this.write(this.stamp({ ...value, userId }));
    });
  }
  async update(
    id: string,
    userId: number,
    expected: { revision?: unknown; timestamp?: unknown },
    change: (value: any) => any,
  ) {
    return this.queue(id, async () => {
      const previous = await this.raw(id);
      if (!previous || !this.owner(previous, userId))
        throw canvasError("画布不存在", 404);
      if (previous.deleted_at || previous.purged)
        throw canvasError("画布已删除，拒绝旧设备重新上传；请在回收站明确恢复");
      const matches =
        expected.revision !== undefined
          ? Number.isSafeInteger(expected.revision) &&
            expected.revision === Number(previous.revision || 0)
          : typeof expected.timestamp === "number" &&
            expected.timestamp === Number(previous.updated_at);
      if (!matches)
        throw canvasError(
          "画布已在其他页面更新或缺少版本信息，本机修改仍保留，请重新打开并核对",
        );
      return this.write(
        this.stamp(
          { ...change(structuredClone(previous)), id, userId },
          previous,
        ),
      );
    });
  }
  async command(
    id: string,
    userId: number,
    change: (value: any) => any,
    includeDeleted = false,
  ) {
    return this.queue(id, async () => {
      const previous = await this.get(id, userId, includeDeleted);
      if (!previous) throw canvasError("画布不存在", 404);
      return this.write(
        this.stamp(
          { ...change(structuredClone(previous)), id, userId },
          previous,
        ),
      );
    });
  }
}
