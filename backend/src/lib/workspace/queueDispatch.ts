import { db } from "@/utils/db";
import { getGatewayRequestContext } from "@/lib/gateway/context";
import { MediaQueue, type MediaKind } from "./mediaQueue";
// No scheduler import here: gateway -> scheduler -> budget -> gateway is a cycle.
// Resolve the connection only when called, after application database readiness.
export async function markQueuedDispatch() {
  const context = getGatewayRequestContext();
  if (!context?.mediaQueue) return;
  if (context.mediaQueue.signal?.aborted)
    throw new Error("任务已停止，未继续提交上游");
  await new MediaQueue(db).markDispatch({
    ...context.mediaQueue,
    kind: context.mediaQueue.kind as MediaKind,
    userId: context.userId,
    billingId: context.billingId!,
    body: {},
  });
}
