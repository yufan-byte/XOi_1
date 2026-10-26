import axios from "axios";
import { getUserGatewayCredentials } from "@/lib/gateway/newapi";
import oss from "@/utils/oss";
import { createVideoRecovery } from "./videoRecoveryLogic";
export const recoverGatewayVideo = createVideoRecovery({ getCredentials: getUserGatewayCredentials, get: (url, config) => axios.get(url, config), writeFile: (file, buffer) => oss.writeFile(file, buffer) });
