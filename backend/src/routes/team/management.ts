import {teamManagement} from "@/lib/team/managementRuntime";
import {ensureTeamTables} from "@/lib/team/store";
import {createTeamManagementRouter} from "@/lib/team/managementRouter";
export default createTeamManagementRouter(teamManagement,ensureTeamTables);
