import type { CanvasAgentContext } from "./canvas-agent-context";

export const CONTEXT_TOTAL_BYTE_BUDGET = 12_000;

/** Index first, focused details on demand. Even a large graph must fit the same prompt budget. */
export function serializeCanvasAgentContext(context: CanvasAgentContext, byteBudget = CONTEXT_TOTAL_BYTE_BUDGET) {
    const focusIds = new Set([...context.selectedNodeIds, ...context.agentState.referenceNodeIds, ...context.agentState.approvedNodeIds]);
    const shortIds = (ids: string[]) => ids.slice(0, 24).map(id => id.slice(0, 160));
    const nodes = context.nodes.map(node => ({ id: node.id.slice(0, 160), type: node.type, title: node.title.slice(0, 80), status: node.status, hasMedia: node.hasMedia || undefined }));
    const focusedNodes = context.nodes.filter(node => focusIds.has(node.id)).slice(0, 12).map(node => ({
        ...node, title: node.title.slice(0, 80), text: node.text?.slice(0, 600), prompt: node.prompt?.slice(0, 600),
        error: node.error?.slice(0, 160), mediaUrl: undefined,
    }));
    const snapshot = {
        ...context,
        project: { ...context.project, title: context.project.title.slice(0, 100) },
        agentState: { ...context.agentState, brief: context.agentState.brief?.slice(0, 600), approvedPlan: context.agentState.approvedPlan?.slice(0, 1000),
            approvedNodeIds: shortIds(context.agentState.approvedNodeIds), referenceNodeIds: shortIds(context.agentState.referenceNodeIds),
            pendingTaskIds: shortIds(context.agentState.pendingTaskIds), completedTaskIds: shortIds(context.agentState.completedTaskIds) },
        selectedNodeIds: shortIds(context.selectedNodeIds), nodes, focusedNodes,
        connections: context.connections.slice(0, 120),
        tasks: context.tasks.slice(0, 24).map(task => ({ ...task, error: task.error?.slice(0, 100) })),
        note: "nodes 是索引，focusedNodes 是引用节点摘要；索引和连线可能截断。完整正文/参数用 get_node，其他节点用 query_canvas_nodes 按需读取。",
    };
    const bytes = () => new TextEncoder().encode(JSON.stringify(snapshot)).length;
    // Drop decorative topology before focused content; never dump the entire graph into the prompt.
    while (bytes() > byteBudget && snapshot.connections.length) snapshot.connections.pop();
    while (bytes() > byteBudget && snapshot.tasks.length) snapshot.tasks.pop();
    while (bytes() > byteBudget && snapshot.nodes.length > 12) snapshot.nodes.pop();
    while (bytes() > byteBudget && snapshot.focusedNodes.length) snapshot.focusedNodes.pop();
    while (bytes() > byteBudget && snapshot.nodes.length) snapshot.nodes.pop();
    return JSON.stringify(snapshot);
}
