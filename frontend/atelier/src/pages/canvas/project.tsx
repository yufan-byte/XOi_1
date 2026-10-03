import UpstreamCanvasProject from "@upstream/app/(user)/canvas/[id]/canvas-client-page";
import { XoiCanvasBackControl, XoiCanvasReturnControls } from "@/xoi/upstream-canvas-bridge";

export default function CanvasProjectPage() {
    return <div className="relative h-full w-full"><UpstreamCanvasProject /><XoiCanvasReturnControls /><XoiCanvasBackControl /></div>;
}
