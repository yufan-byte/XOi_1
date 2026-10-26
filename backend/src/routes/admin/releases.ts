import {db} from "@/utils/db";
import {releaseControl,releaseInstanceId} from "@/lib/workspace/releaseRuntime";
import {createReleaseRouter} from "@/lib/workspace/releaseRouter";
export default createReleaseRouter(db,releaseControl,releaseInstanceId,process.env.XOI_RELEASE_ROLLOUT_ENABLED==="1");
