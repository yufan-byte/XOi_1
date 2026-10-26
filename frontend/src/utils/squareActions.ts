import { ref } from "vue";
import { useRouter } from "vue-router";
import { MessagePlugin } from "tdesign-vue-next";
import { squarePromptOf, type SquareItem } from "./square";

export type SquareOrigin = "square" | "aiAssistant";

/** Preparing a work for the editor never submits a generation task. */
export function useSquareActions(origin: SquareOrigin) {
  const router = useRouter();
  const replicating = ref(false);

  async function canvasWithPrompt(work: SquareItem) {
    const prompt = squarePromptOf(work);
    if (!prompt) { MessagePlugin.warning("该作品没有可用的提示词"); return; }
    const media = work.u ? [work.u] : [];
    const isVideo = work.mk === "video" || work.k === "video";
    try {
      localStorage.setItem("xoi_canvas_handoff_v1", JSON.stringify({
        prompt, assetUrls: isVideo ? [] : media, videoUrls: isVideo ? media : [],
        source: origin, createdAt: Date.now(),
      }));
      await router.push({ path: "/canvas", query: { source: "xoi", handoff: "1", from: origin, t: String(Date.now()) } });
    } catch { MessagePlugin.error("画布入口数据暂时无法保存，请重试"); }
  }

  async function replicate(work: SquareItem) {
    if (replicating.value) return;
    replicating.value = true;
    try {
      const response = await fetch("/square-data/canvas-previews.json", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json() as Record<string, { name?: string; nodes?: unknown[]; edges?: unknown[] }>;
      const preview = data[work.id];
      if (!preview?.nodes?.length) { MessagePlugin.warning("该作品暂无可复刻的工作流"); return; }
      localStorage.setItem("xoi_canvas_graph_v1", JSON.stringify({
        workId: work.id, title: work.t || preview.name || "复刻画布", prompt: squarePromptOf(work),
        nodes: preview.nodes, edges: preview.edges || [],
      }));
      await router.push({ path: "/canvas", query: { source: "xoi", graph: "1", from: origin, t: String(Date.now()) } });
    } catch { MessagePlugin.error("复刻失败，请稍后再试"); }
    finally { replicating.value = false; }
  }

  return { replicating, replicate, canvasWithPrompt };
}
