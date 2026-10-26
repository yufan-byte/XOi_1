import { ref } from "vue";

export const navigationPending = ref(false);

export const pageLoaders: Record<string, () => Promise<any>> = {
  "/project": () => import("@/views/project/index.vue"),
  "/task": () => import("@/views/task/index.vue"),
  "/novel": () => import("@/views/novel/index.vue"),
  "/script": () => import("@/views/script/index.vue"),
  "/scriptAgent": () => import("@/views/scriptAgent/index.vue"),
  "/cornerScape": () => import("@/views/cornerScape/index.vue"),
  "/production": () => import("@/views/production/index.vue"),
  "/editor": () => import("@/views/editor/index.vue"),
  "/assets": () => import("@/views/assets/index.vue"),
  "/director3d": () => import("@/views/director3d/index.vue"),
  "/canvas": () => import("@/views/canvas/index.vue"),
  "/aiAssistant": () => import("@/views/aiAssistant/index.vue"),
  "/square": () => import("@/views/square/index.vue"),
  "/viral-replicate": () => import("@/views/viralReplicate/index.vue"),
  "/skills": () => import("@/views/skills/index.vue"),
};

const warming = new Map<string, Promise<any>>();
/** Warm code on intent, without fetching project data or invoking any model. */
export function warmPage(path: string): Promise<any> {
  const loader = pageLoaders[path];
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!loader || connection?.saveData || connection?.effectiveType === "2g") return Promise.resolve();
  let request = warming.get(path);
  if (!request) {
    request = loader().catch(() => { warming.delete(path); });
    warming.set(path, request);
  }
  return request;
}
