/** Preserve storyboard order and deduplicate multi-frame clips; append standalone tracks last. */
export function orderedDirectorTrackIds(
  frames: { trackId?: unknown }[],
  tracks: { id?: unknown }[],
) {
  const existing = new Set(tracks.map((t) => Number(t.id)));
  return [
    ...new Set([
      ...frames.map((f) => Number(f.trackId)),
      ...tracks.map((t) => Number(t.id)),
    ]),
  ].filter((id) => Number.isSafeInteger(id) && id > 0 && existing.has(id));
}
