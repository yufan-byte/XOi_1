type TaskState = { status: string };
interface Entry<T> { userId: number; updatedAt: number; value: T }

/** In-memory task compatibility layer with mandatory ownership, capacity and retention bounds. */
export class OwnedTasks<T extends TaskState> {
  private entries = new Map<string, Entry<T>>();
  constructor(private onExpire: (id: string) => void = () => {}, private now = Date.now) {}
  private prune() {
    for (const [id, entry] of this.entries) {
      if (entry.value.status !== "running" && this.now() - entry.updatedAt > 24 * 60 * 60 * 1000) {
        this.entries.delete(id);
        this.onExpire(id);
      }
    }
  }
  create(id: string, userId: number, value: T): boolean {
    this.prune();
    if (!Number.isSafeInteger(userId) || userId <= 0 || this.entries.has(id)) return false;
    if ([...this.entries.values()].filter((entry) => entry.userId === userId && entry.value.status === "running").length >= 6) return false;
    if (this.entries.size >= 2000) {
      const completed = [...this.entries].filter(([, entry]) => entry.value.status !== "running").sort((a, b) => a[1].updatedAt - b[1].updatedAt);
      if (!completed.length) return false;
      this.entries.delete(completed[0][0]);
      this.onExpire(completed[0][0]);
    }
    this.entries.set(id, { userId, value, updatedAt: this.now() });
    return true;
  }
  set(id: string, value: T) {
    const entry = this.entries.get(id);
    if (entry) this.entries.set(id, { ...entry, value, updatedAt: this.now() });
  }
  get(id: string): T | undefined { return this.entries.get(id)?.value; }
  getForUser(id: string, userId: number): T | undefined {
    this.prune();
    const entry = this.entries.get(id);
    return entry && entry.userId === Number(userId) ? entry.value : undefined;
  }
  deleteForUser(id: string, userId: number): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.userId !== Number(userId) || entry.value.status === "running") return false;
    this.entries.delete(id);
    this.onExpire(id);
    return true;
  }
}
