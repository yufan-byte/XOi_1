import { useParams } from "react-router-dom";
import UpstreamCanvasProject from "@upstream/app/(user)/canvas/[id]/canvas-client-page";
import { XoiCanvasBackControl, XoiCanvasReturnControls } from "@/xoi/upstream-canvas-bridge";

export default function CanvasProjectPage() {
    const { id } = useParams();
    return <div className="relative h-full w-full"><UpstreamCanvasProject key={id} /><XoiCanvasReturnControls /><XoiCanvasBackControl /></div>;
}
