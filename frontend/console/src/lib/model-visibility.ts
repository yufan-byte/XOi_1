/** Loading the brand must not eagerly load the whole model catalog. */
export const hiddenModelIds = new Set<string>();
export function setHiddenModels(ids: string[]) {
  hiddenModelIds.clear();
  for (const id of ids) hiddenModelIds.add(id);
}
export function isModelHidden(id: string) { return hiddenModelIds.has(id); }
