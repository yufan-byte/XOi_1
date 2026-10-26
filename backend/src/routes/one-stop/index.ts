import { OneStopDocuments } from "../../lib/oneStop/documents";
import { createOneStopRouter } from "../../lib/oneStop/router";
let store: OneStopDocuments | undefined;
const runtime = () => import("../../lib/oneStop/generationRuntime");
const history=async()=>{const [{OneStopHistory},{requireDb}]=await Promise.all([import('../../lib/oneStop/history'),import('../../lib/agent/db')]);return new OneStopHistory(requireDb());};
/** Startup explicitly registers durable handlers; a router-only import remains inert. */
export async function initializeOneStopGeneration() {
  await (await runtime()).initializeOneStopGenerationStore();
}
export default createOneStopRouter(
  async () => {
    const { requireDb } = await import("../../lib/agent/db");
    return (store ??= new OneStopDocuments(requireDb()));
  },
  {
    capabilities: () => ({
      enabled: process.env.XOI_ONE_STOP_GENERATION_DISABLED !== "1",
      durableTasks: true,
      budgetHardLimit: false,
      serverComposition:true,
    }),
    quote: async (user, input) =>
      (await runtime()).generationQuote(user, input),
    submit: async (user, input) =>
      (await runtime()).submitGeneration(user, input),
    get: async (user, id) => (await runtime()).getGeneration(user, id),
    list: async (user, id) => (await runtime()).listGenerations(user, id),
    stop: async (user, id) => (await runtime()).stopGeneration(user, id),
    receipt: async (user, id) => (await runtime()).generationReceipt(user, id),
    active: async (user, id) => (await runtime()).activeProjectJob(user, id),
    recover: async (user, id) => (await runtime()).recoverGeneration(user, id),
    acknowledge: async (user, id, confirmed) =>
      (await runtime()).acknowledgeGeneration(user, id, confirmed),
  },
  {
    list:async(user,id,page)=>(await history()).list(user,id,page),
    get:async(user,id,version)=>(await history()).get(user,id,version),
    restore:async(user,id,version,revision,clientId)=>(await history()).restore(user,id,version,revision,clientId),
  },
);
