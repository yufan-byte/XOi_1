import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";

/**
 * Host the upstream Infinite Canvas asset picker in a small iframe opened by
 * the outer XOi composer. The picker keeps using the original asset store and
 * UI; only the selected payload crosses the iframe boundary.
 */
export function XoiAssetPickerBridge() {
    const view = new URLSearchParams(window.location.search).get("view");
    if (view !== "asset-picker") return null;

    const send = (type: string, payload?: InsertAssetPayload) => {
        window.parent.postMessage({ type, payload }, window.location.origin);
    };

    return <AssetPickerModal open onInsert={(payload) => send("xoi:asset-picker-insert", payload)} onClose={() => send("xoi:asset-picker-close")} />;
}
