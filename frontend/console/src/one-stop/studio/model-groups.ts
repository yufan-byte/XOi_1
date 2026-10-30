import type { CatalogModel } from "@/lib/models";

/** The sidebar and line picker must agree on the product and billing boundary. */
export function studioModelGroup(m: CatalogModel) {
  const source = `${m.id} ${m.name}`.toLowerCase();
  if (/seedance|即梦/.test(source)) {
    const version = source.match(/(?:seedance|即梦)[-_ ]?(\d(?:[._-]\d)?)/)?.[1]?.replace(/[_-]/g, ".") || "";
    // Unknown versions must not silently become an interchangeable product.
    if (!version) return { key: `model:${m.id}`, label: m.name, priority: 5 };
    const official = /guanzhuan|官转|(?:^|[-_.])gz(?:[-_.]|$)|official/.test(source);
    const fast = /(?:^|[-_. ])fast(?:[-_. 0-9]|$)|快速/.test(source);
    const billing = m.billingUnit === "per_second" ? "按秒" : "按次";
    const variant = fast ? "fast" : "standard";
    return {
      key: `seedance:${version}:${official ? "official" : variant}:${billing}`,
      label: `seedance${version}${fast ? " · Fast" : ""}${official ? " · 官转" : ""} · ${billing}`,
      priority: version === "2.5" ? (billing === "按秒" ? 0 : 1) : (billing === "按秒" ? 2 : 3),
    };
  }
  const series = m.series || m.name;
  return { key: `${m.category}:${series}`, label: series, priority: 20 };
}
