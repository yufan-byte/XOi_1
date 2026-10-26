export const ARCHIVE_AGENT_INPUT_AFTER = 3000;

/** Preserve the full source on canvas; send intent and a real retrieval pointer. */
export function archivedCanvasAgentInput(text: string, nodeId: string) {
    return `用户的完整长稿已保存为当前画布文字节点 ${nodeId}，共${text.length}字，原文未删除或改写。下面只是开头/结尾定位，不能把省略内容当作不存在。请先get_node读取原稿，超过一页按nextTextOffset继续读取，记录已读范围后再改编；根据用户任务自主规划，遵守最后的制作要求。
【开头】\n${text.slice(0, 400)}
【结尾与本次要求】\n${text.slice(-1000)}`;
}
