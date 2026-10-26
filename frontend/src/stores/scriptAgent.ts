import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import { useChat } from "@/utils/useChat";
import {accountBoundary} from '@/utils/accountBoundary';

interface PlanData {
  storySkeleton: string;
  adaptationStrategy: string;
  script: { id?: number; name: string; content: string }[];
}

function makeScriptAgentStore(projectId: string, scope: number) {
  return defineStore(`scriptAgent-${scope}-${projectId}`, () => {
        const owner=accountBoundary.capture();
        const planData = ref<PlanData>({
          storySkeleton: "",
          adaptationStrategy: "",
          script: [],
        });

        const selectedSkills = ref<string[]>([]);
        const selectedModel = ref("");
        // 项目级文本模型作为对话默认模型（新建/编辑项目时选择）；用户在页面手动切换后仍以手动选择为准
        const projectTextModel = String(projectStore().project?.textModel || "");
        if (projectTextModel) selectedModel.value = projectTextModel;
        const { connected, messages, chat: sendChat, stopGenerate, socket, status, lastError, disconnect, connect, reconnect } = useChat({
          url: `${settingStore().baseUrl}/socket/scriptAgent`,
          auth: () => ({
            isolationKey: `${projectId}:scriptAgent`,
            projectId: projectId,
          }),
          manageLifecycle: false,
          xmlTags: [
            { tag: "storySkeleton", keepInMessage: false },
            { tag: "adaptationStrategy", keepInMessage: false },
            { tag: "scriptItem", keepInMessage: false },
          ],
          onXmlTag: (data) => {
            const { tag, value, children, status, attrs } = data;
            if (tag === "storySkeleton") {
              planData.value.storySkeleton = value;
            } else if (tag === "adaptationStrategy") {
              planData.value.adaptationStrategy = value;
            } else if (tag === "scriptItem") {
              const name = attrs.name ?? "";
              const content = value;
              if (name) {
                const existingIndex = planData.value.script.findIndex((s) => s.name === name);
                if (existingIndex !== -1) {
                  planData.value.script[existingIndex].content = content;
                } else {
                  planData.value.script.push({ name, content });
                }
              }
            }
            if (status === "complete") {
              setPlanData();
            }
          },
          autoConnect: false,
        });

        watch(
          socket,
          (s) => {
            if (s) {
              s.on("getPlanData", (_, callback) => {
                callback(planData.value);
              });
            }
          },
          { immediate: true },
        );

        async function setPlanData() {
          accountBoundary.assert(owner);
          await axios.post("/scriptAgent/setPlanData", { projectId: projectId, agentType: "scriptAgent", data: planData.value });
        }

        const thinkLevel = ref(0);

        function updateThinkConfig(value: number) {
          thinkLevel.value = value;
          if (socket.value) {
            socket.value.emit("updateThinkConfig", { think: value > 0, thinlLevel: value });
          }
        }

        const chat = (content: string) => sendChat(content, undefined, [...selectedSkills.value], selectedModel.value || undefined);
        return { connected, messages, chat, selectedSkills, selectedModel, stopGenerate, socket, status, lastError, planData, setPlanData, connect, reconnect, disconnect, thinkLevel, updateThinkConfig };
      });
}

const storeMap = new Map<string, ReturnType<typeof makeScriptAgentStore>>();

function createScriptAgentStore(projectId: string) {
  const scope=accountBoundary.capture().generation,key=`${scope}:${projectId}`;
  if (!storeMap.has(key)) {
    storeMap.set(key, makeScriptAgentStore(projectId,scope));
  }
  return storeMap.get(key)!;
}
accountBoundary.subscribe(()=>storeMap.clear());

export default function useScriptAgentStore() {
  const id = projectStore().project?.id;
  if (!id) throw new Error("No project selected");
  return createScriptAgentStore(id)();
}
