/** A late poll must never replace a new attempt or downgrade a completed result. */
export function matchesCanvasTaskAttempt(
    metadata: { status?: string; imageTaskId?: string; videoTaskId?: string; videoTaskVideoId?: string; audioTaskId?: string } | undefined,
    kind: "image" | "video" | "audio",
    expectedTaskId: string,
) {
    if (!metadata || metadata.status !== "loading" || !expectedTaskId) return false;
    const currentId = kind === "video" ? metadata.videoTaskVideoId || metadata.videoTaskId
        : kind === "image" ? metadata.imageTaskId : metadata.audioTaskId;
    return currentId === expectedTaskId;
}
