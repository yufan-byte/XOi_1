import {getAssistantAiConfig} from "@/utils/aiAssistant/modelConfig";
import {listDirectorSkills} from "@/utils/director/skillRegistry";
import {planDirector} from "@/utils/director/planner";
import {composeDirector} from "@/utils/director/composer";
import {createDirectorRouter} from "@/utils/director/router";
import {trackedGatewayFetch} from "@/lib/gateway/receipts";
import {stopCurrentBudget} from "@/lib/gateway/budgets";

export default createDirectorRouter({getConfig:getAssistantAiConfig,getSkills:listDirectorSkills,plan:planDirector,compose:composeDirector,fetcher:trackedGatewayFetch,finishBudget:stopCurrentBudget});
