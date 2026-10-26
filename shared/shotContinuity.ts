/** Continuity observations are evidence for a human review, never a guarantee of visual correctness. */
export type ContinuityIssue = {
  category: string;
  severity: "warning" | "error";
  evidence: string;
  suggestion: string;
};
export type ContinuityReview = {
  sourceSignature: string;
  kind: "image" | "video";
  checkedAt: number;
  manual?: boolean;
  summary: string;
  issues: ContinuityIssue[];
  uncertainties: string[];
};
export interface ShotContinuity {
  sceneId?: number | null;
  transition: "cut" | "continue" | "new_scene";
  startState: string;
  endState: string;
  screenDirection: string;
  spatialLayout?: string;
  repairNotes?: string;
  anchorStoryboardId?: number | null;
  review?: ContinuityReview | null;
  imageHistory?: { filePath: string; createdAt: number }[];
}
export interface ContinuityFrame {
  id?: number;
  trackId?: number;
  src?: string | null;
  prompt?: string;
  videoDesc?: string;
  associateAssetsIds?: number[];
  continuity?: ShotContinuity | null;
}
const clean = (url?: string | null) => (url || "").split(/[?#]/)[0];
function frameSnapshot(f?: ContinuityFrame) {
  if (!f) return null;
  const c = f.continuity;
  const rules = c
    ? {
        sceneId: c.sceneId || null,
        transition: c.transition,
        startState: c.startState || "",
        endState: c.endState || "",
        screenDirection: c.screenDirection || "",
        spatialLayout: c.spatialLayout || "",
        repairNotes: c.repairNotes || "",
        anchorStoryboardId: c.anchorStoryboardId || null,
      }
    : null;
  return [
    f.id,
    clean(f.src),
    f.prompt,
    f.videoDesc,
    f.associateAssetsIds,
    rules,
  ];
}
/** A change detector, not a security or ownership check. Ignore expiring URL signatures and the review itself. */
export function continuitySignature(
  current: ContinuityFrame,
  previous?: ContinuityFrame,
  anchor?: ContinuityFrame,
  videos?: string[],
  scene?: { id: number; src?: string; desc?: string },
) {
  const text = JSON.stringify([
    frameSnapshot(current),
    frameSnapshot(previous),
    frameSnapshot(anchor),
    videos?.map(clean),
    scene ? [scene.id, clean(scene.src), scene.desc || ""] : null,
  ]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `continuity-v1-${(hash >>> 0).toString(16)}`;
}
export function continuityWarnings(
  current: ContinuityFrame,
  previous?: ContinuityFrame,
): string[] {
  const c = current.continuity,
    warnings: string[] = [];
  if (!c?.sceneId)
    warnings.push("尚未固定场景资产，无法可靠判断是否在同一个空间。");
  if (!c?.spatialLayout?.trim())
    warnings.push("尚未填写固定布局，建议明确床、门窗、桌子的位置关系。");
  if (!c?.startState?.trim() || !c?.endState?.trim())
    warnings.push(
      "人物起止状态不完整，建议填写站位、姿势、视线和道具所在位置。",
    );
  if (c?.transition === "continue") {
    if (!previous) warnings.push("第一镜没有上一镜，不能设置为连续动作接镜。");
    else if (!c.sceneId || c.sceneId !== previous.continuity?.sceneId)
      warnings.push("连续动作与上一镜的场景未对齐，请先核对场景。");
    if (previous && !previous.continuity?.endState?.trim())
      warnings.push("上一镜尚未记录末态，动作衔接缺少依据。");
  }
  return warnings;
}
export function parseContinuityReview(
  text: string,
): Pick<ContinuityReview, "summary" | "issues" | "uncertainties"> {
  const raw = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let value: any;
  try {
    value = JSON.parse(raw);
  } catch {
    throw Error("AI 未返回可解析的检查结果，请更换支持看图的模型后重试。");
  }
  if (
    !value ||
    typeof value.summary !== "string" ||
    !Array.isArray(value.issues) ||
    !Array.isArray(value.uncertainties)
  )
    throw Error("检查结果结构不完整，未标记为通过。");
  const str = (s: unknown, limit: number) =>
    typeof s === "string" && s.trim() && s.length <= limit;
  if (
    !str(value.summary, 3000) ||
    value.issues.length > 20 ||
    value.uncertainties.length > 20 ||
    value.issues.some(
      (i: any) =>
        !i ||
        !["warning", "error"].includes(i.severity) ||
        !str(i.category, 100) ||
        !str(i.evidence, 2000) ||
        !str(i.suggestion, 2000),
    ) ||
    value.uncertainties.some((s: unknown) => !str(s, 2000))
  )
    throw Error("检查结果字段无效，未标记为通过。");
  return {
    summary: value.summary,
    issues: value.issues.map((i: ContinuityIssue) => ({
      category: i.category,
      severity: i.severity,
      evidence: i.evidence,
      suggestion: i.suggestion,
    })),
    uncertainties: value.uncertainties,
  };
}
export function continuityRepairText(issues: ContinuityIssue[]) {
  return issues
    .map((i) => `${i.category}：${i.suggestion}`)
    .join("\n")
    .slice(0, 4000);
}
