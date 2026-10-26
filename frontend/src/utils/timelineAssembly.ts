export function requestedClipDuration(requested: number, probed: number) {
  const request = Number.isFinite(requested) && requested > 0 ? requested : 0;
  const actual = Number.isFinite(probed) && probed > 0 ? probed : 0;
  return Math.max(.05, request && actual ? Math.min(request, actual) : request || actual || 5);
}
export function missingShotCount(expected: string[], used: string[]) {
  const path = (s: string) => { try { return new URL(s, 'http://local.invalid').pathname; } catch { return s; } };
  const present = new Set(used.map(path));
  return [...new Set(expected.filter(Boolean).map(path))].filter(s => !present.has(s)).length;
}
