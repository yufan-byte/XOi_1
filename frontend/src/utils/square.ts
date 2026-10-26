/** Both the square and the assistant showcase read the same published snapshots. */
export type SquareType = "canvas" | "image" | "video";
export interface SquareItem {
  id: string; t: string; d: string; u: string; k: "image" | "video";
  mk?: "image" | "video";
  pr?: string;
  c: string; n: string; pk: "official" | "user"; a?: string; pid?: string;
  r: number; l: number; v: number; at: string; ref: string[]; nc: number;
  /** Work type comes from its source tab, independently of the cover media type. */
  src: SquareType;
}
export interface SquareSnapshot {
  categories: [string, string][];
  hot: string[];
  new: string[];
  items: Record<string, SquareItem>;
}
const snapshots = new Map<SquareType, { at: number; request: Promise<SquareSnapshot> }>();
export function loadSquareSnapshot(type: SquareType): Promise<SquareSnapshot> {
  const cached = snapshots.get(type);
  if (cached && Date.now() - cached.at < 60_000) return cached.request;
  const request = fetch(`/square-data/${type}.json`, { cache: "no-store" }).then(async response => {
    if (!response.ok) throw new Error(`Square snapshot: ${response.status}`);
    const snapshot = await response.json() as SquareSnapshot;
    for (const item of Object.values(snapshot.items || {})) item.src = type;
    return snapshot;
  }).catch(error => {
    if (snapshots.get(type)?.request === request) snapshots.delete(type);
    throw error;
  });
  snapshots.set(type, { at: Date.now(), request });
  return request;
}
export const squarePromptOf = (item: SquareItem) => (item.pr || item.d || item.t || "").trim();
export function isSquareType(value: unknown): value is SquareType {
  return value === "canvas" || value === "image" || value === "video";
}
