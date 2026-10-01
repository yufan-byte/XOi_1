import UpstreamCanvasProject from "/Users/zhaochenyu/Desktop/C_code/infinite-canvas-main/web/src/app/(user)/canvas/[id]/canvas-client-page";
import { XoiCanvasReturnControls } from "@/xoi/upstream-canvas-bridge";

export default function CanvasProjectPage() {
    return <div className="relative h-full w-full"><UpstreamCanvasProject /><XoiCanvasReturnControls /></div>;
}
