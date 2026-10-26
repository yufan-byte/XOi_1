import { useEffect, useRef } from "react";
import { Modal } from "antd";
import { useTranslation } from "react-i18next";
import { getOwnerTag } from "@/xoi/owner";

type DirectorPanelProps = {
    nodeId: string;
    open: boolean;
    onClose: () => void;
    onExport: (kind: "image" | "video", blob: Blob) => void;
};

// Embedded MONOFORM previs studio panel for a director node. The iframe scopes its project storage with ?key=<nodeId>,
// and MONOFORM posts exported PNG/MP4 blobs back to the canvas host.
export function DirectorPanel({ nodeId, open, onClose, onExport }: DirectorPanelProps) {
    const { t } = useTranslation();
    const onExportRef = useRef(onExport);
    onExportRef.current = onExport;

    useEffect(() => {
        if (!open) return;
        const handler = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            const data = event.data as { source?: string; type?: string; kind?: "image" | "video"; blob?: Blob } | undefined;
            if (!data || data.source !== "monoform" || data.type !== "export") return;
            if ((data.kind === "image" || data.kind === "video") && data.blob) onExportRef.current(data.kind, data.blob);
        };
        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
    }, [open]);

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            width="min(96vw, 1280px)"
            centered
            destroyOnHidden
            title={t("canvas.director.title")}
            styles={{ body: { height: "min(84vh, 820px)", padding: 0, overflow: "hidden" } }}
        >
            {/* monoform 由宿主项目挂在根路径 /monoform/（与画布产物分目录伺服） */}
            <iframe src={`/monoform/index.html?key=${encodeURIComponent(`${getOwnerTag()}-canvas-${nodeId}`)}`} title="MONOFORM" className="h-full w-full border-0" allow="camera; microphone; clipboard-write; download; fullscreen" />
        </Modal>
    );
}
