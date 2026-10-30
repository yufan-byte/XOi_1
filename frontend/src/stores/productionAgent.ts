import axios from "@/utils/axios";
import { sessionSignal } from "@/utils/session";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import { useChat } from "@/utils/useChat";
import type { FlowData, Storyboard } from "@/views/production/utils/flowBuilder";
import type { ChatMessagesData } from "@tdesign-vue-next/chat";
import { useThrottleFn } from "@vueuse/core";
import {accountBoundary} from '@/utils/accountBoundary';

function makeProductionAgentStore(projectId: string, scope: number) {
  return defineStore(`productionAgent-${scope}-${projectId}`, () => {
    const owner=accountBoundary.capture();
    const defMsg: ChatMessagesData[] = [
      {
        id: "welcome",
        role: "assistant",
        content: [
          { type: "text", status: "complete", data: "我可以整理导演计划、核对前后镜头、修改指定分镜。预览、视频生成和剪辑都可以直接在工作台操作。" },
          {
            type: "suggestion",
            status: "complete",
            data: [{ title: "核对本集进度", prompt: "读取当前工作区，只用三点以内说明本集已完成什么、还缺什么以及下一步入口。不要重写计划、重新审核或提交媒体生成。" }],
          },
        ],
      },
    ];
    onMounted(() => {
      if (messages.value.length <= 0) messages.value = [...defMsg, ...messages.value];
    });

    const flowData = ref<FlowData>({
      script: "", // 剧本
      scriptPlan: "", //导演计划
      storyboardTable: "", //分镜表
      assets: [], // 衍生资产
      storyboard: [], //分镜面板
      workbench: {
        videoList: [],
      }, // 工作台数据
    });

    const episodesId = ref<number>();

    const { connected, messages, chat, stopGenerate, socket, status, lastError, reconnect, connect, disconnect } = useChat({
      url: `${settingStore().baseUrl}/socket/productionAgent`,
      auth: () => ({
        isolationKey: `${projectId}:productionAgent:${episodesId.value}`,
        projectId: projectId,
        scriptId: episodesId.value,
      }),
      manageLifecycle: false,
      autoConnect: false,
      xmlTags: [
        { tag: "script", keepInMessage: false },
        { tag: "scriptPlan", keepInMessage: false },
        { tag: "storyboardTable", keepInMessage: false },
        { tag: "storyboardItem", keepInMessage: false },
      ],
      onXmlTag: async (data) => {
        const { tag, value, children, attrs, status } = data;
        if (tag === "script") {
          flowData.value.script = value ?? "";
        } else if (tag === "scriptPlan") {
          flowData.value.scriptPlan = value ?? "";
        } else if (tag === "storyboardTable") {
          flowData.value.storyboardTable = value ?? "";
        }
        if (status == "complete" && tag === 'script') {
          throttledFn();
        }
      },
    });

    // 实际的节流方法
    const throttledFn = useThrottleFn(
      () => {
        if(!accountBoundary.current(owner))return;
        setFlowData(episodesId.value);
      },
      500,
      true,
      true,
    );
    // 注册 getPlanData 事件（无需依赖组件生命周期）
    watch(
      socket,
      (s) => {
        if (s) {
          s.on('directorStageSaved', () => { getFlowData(); });
          s.on("connect", () => {
            getHistory();
          });
          s.on("getFlowData", (_, callback) => {
            const returnData = JSON.parse(JSON.stringify(flowData.value));
            returnData.assets.forEach((item: any) => {
              delete item.prompt;
              delete item.flowId;
              delete item.src;
              if (item.derive && item.derive.length) {
                item.derive.forEach((deriveItem: any) => {
                  delete deriveItem.prompt;
                  delete deriveItem.flowId;
                  delete deriveItem.src;
                });
              }
            });
            returnData.storyboard.forEach((item: any) => {
              delete item.prompt;
              delete item.src;
              delete item.flowId;
            });
            callback(returnData);
          });
          s.on("addDeriveAsset", async (data, callback) => {
            const assets = flowData.value.assets.find((a) => a.id === data.assetsId);
            if (!assets) return callback({ success: false, message: $t("storyboard.assets.notExist") });
            const deriveAssetList = assets.derive || [];
            const item = deriveAssetList.find((d) => d.id === data.id);
            if (item) {
              if (!item) return callback({ success: false, message: $t("storyboard.assets.notDerivativeExist") });
              item.name = data.name;
              item.type = assets.type;
              callback({ success: true, message: $t("storyboard.assets.derivativeUpdateSuccess") });
            } else {
              deriveAssetList.push({
                assetsId: data.assetsId,
                id: data.id,
                name: data.name,
                type: assets.type,
                desc: data.describe,
                prompt: "",
                state: "未生成" as "未生成" | "生成中" | "已完成" | "生成失败",
                src: "",
              });
              callback({ success: true, message: $t("storyboard.assets.derivativeAddSuccess") });
            }
          });
          s.on("delDeriveAsset", async (data, callback) => {
            const assets = flowData.value.assets.find((a) => a.id === data.assetsId);
            if (!assets) return callback({ success: false, message: $t("storyboard.assets.notExist") });
            const deriveAssetList = assets.derive || [];
            const index = deriveAssetList.findIndex((d) => d.id === data.id);
            if (index === -1) return callback({ success: false, message: $t("storyboard.assets.notDerivativeExist") });
            deriveAssetList.splice(index, 1);
            callback({ success: true, message: $t("storyboard.assets.derivativeDelSuccess") });
          });
          s.on("generateDeriveAsset", async (data, callback) => {
            const assetsData = await batchGenerateAssets(data.ids);
            callback({ success: true, message: assetsData });
          });
          s.on("generateStoryboard", async (data, callback) => {
            try {
              const storyData = await batchGenerateStoryboard(data.ids);
              callback({ success: true, message: storyData });
            } catch (e: any) { callback({ success: false, error: e?.message || '分镜生成未启动' }); }
          });
          s.on("addStoryboard", async (data, callback) => {
            try {
            const insertVal = {
              prompt: data.prompt || "",
              duration: Number(data.duration) || 0,
              track: data.track || "",
              state: "未生成" as "未生成" | "生成中" | "已完成" | "生成失败",
              src: null,
              videoDesc: data.videoDesc,
              shouldGenerateImage:
                (typeof data.shouldGenerateImage == "boolean" && data.shouldGenerateImage) || String(data.shouldGenerateImage).toLowerCase() == "true"
                  ? 1
                  : 0,
              associateAssetsIds: data.associateAssetsIds || [],
              continuity: data.continuity || null,
            };
            await addStoryboardInfo([insertVal]);
            await getFlowData();
            throttledFn();
            callback({ success: true, message: $t("storyboard.assets.derivativeAddSuccess") });
            } catch (e: any) { callback({ success: false, error: e?.message || '镜头保存失败，请核对后重试' }); }
          });
        }
      },
      { immediate: true },
    );

    async function setFlowData(scriptId?: number) {
      accountBoundary.assert(owner);
      await axios.post("/production/saveFlowData", {
        projectId: projectId,
        data: flowData.value,
        episodesId: scriptId || episodesId.value,
      });
    }

    async function saveDirectorDocument(stage: 'scriptPlan' | 'storyboardTable', content: string, expectedContent: string, expectedPlan: string, expectedScript: string) {
      accountBoundary.assert(owner);
      const episode = episodesId.value;
      const { data } = await axios.post('/production/saveFlowData', { projectId: Number(projectId), episodesId: episode, data: {}, documentEdit: { stage, content, expectedContent, expectedPlan, expectedScript } });
      accountBoundary.assert(owner);
      if (episode !== episodesId.value) return;
      if (flowData.value[stage] === expectedContent && flowData.value.script === expectedScript) {
        flowData.value[stage] = content;
        flowData.value.reviewState = data;
      } else await getFlowData();
    }

    async function approveStage(stage: 'scriptPlan' | 'storyboardTable') {
      const episode = episodesId.value;
      const snapshot = { content: flowData.value[stage], scriptPlan: flowData.value.scriptPlan, script: flowData.value.script };
      await setFlowData(episode);
      const { data } = await axios.post('/production/reviewStage', { projectId: Number(projectId), scriptId: episode, stage, ...snapshot });
      if (episode === episodesId.value) flowData.value.reviewState = data;
    }
    let applyingServerFlow = false;
    watch(() => [flowData.value.script, flowData.value.scriptPlan], (next, prev) => {
      if (!applyingServerFlow && prev && next.some((value, i) => value !== prev[i]) && flowData.value.reviewState) {
        flowData.value.reviewState.planApproved = false;
        flowData.value.reviewState.tableApproved = false;
      }
    }, { flush: 'sync' });
    watch(() => flowData.value.storyboardTable, (next, prev) => {
      if (!applyingServerFlow && next !== prev && flowData.value.reviewState) flowData.value.reviewState.tableApproved = false;
    }, { flush: 'sync' });

    let flowRequestVersion = 0;
    async function getFlowData() {
      const version = ++flowRequestVersion;
      const episode = episodesId.value;
      const token = sessionSignal();
      const { data } = await axios.post("/production/getFlowData", {
        projectId: projectId,
        episodesId: episode,
      });
      if (version !== flowRequestVersion || episode !== episodesId.value || token !== sessionSignal()) return;
      applyingServerFlow = true;
      try { flowData.value = data; } finally { applyingServerFlow = false; }
    }
    async function batchGenerateStoryboard(allIds: number[], compulsory: boolean = false, useCurrentImage = false) {
      if (!flowData.value.reviewState?.tableApproved) throw new Error('请先在导演总览中审核导演计划和分镜表，再生成分镜画面');
      accountBoundary.assert(owner);
      const requestedEpisode = episodesId.value;
      try {
        const { data, message } = await axios.post("/production/storyboard/batchGenerateImage", {
          scriptId: requestedEpisode,
          projectId: projectId,
          storyboardIds: allIds,
          concurrentCount: settingStore().otherSetting.assetsBatchGenereateSize,
          compulsory,
          useCurrentImage,
        });
        accountBoundary.assert(owner);
        if (episodesId.value !== requestedEpisode) return data;
        // 后端在「有分镜拿不到角色/场景参考图」时会用 message 带出处警（不是默认的“成功”）。
        // 以前这种情形是静默 filter 掉参考图，AI 凭空生成、UI 一个字都不提示。
        if (message && message !== "成功") {
          window.$message.warning(message, 6000);
        }
        if (data) {
          if (flowData.value.storyboard.length === 0) {
            flowData.value.storyboard = data;
            return data;
          } else {
            flowData.value.storyboard.forEach((item) => {
              const findData = data.find((i: any) => i.id == item.id);
              if (findData) {
                item.state = findData.state;
                if (findData.src) item.src = findData.src;
              }
            });
          }
        }
        return data;
      } catch (e) {
        window.$message.error((e as any)?.message);
        throw e;
      }
    }
    async function batchGenerateAssets(allIds: number[]) {
      flowData.value.assets.forEach((asset) => {
        if (asset.derive) {
          asset.derive.forEach((derive) => {
            if (allIds.includes(derive.id)) {
              derive.state = "生成中" as "未生成" | "生成中" | "已完成" | "生成失败";
            }
          });
        }
      });
      try {
        const { data } = await axios.post("/production/assets/batchGenerateAssetsImage", {
          assetIds: allIds,
          projectId: projectId,
          scriptId: episodesId.value,
          concurrentCount: settingStore().otherSetting.assetsBatchGenereateSize,
        });
        if (data) {
          data.forEach((record: { id: number; state: "未生成" | "生成中" | "已完成" | "生成失败"; src: string }) => {
            flowData.value.assets.forEach((asset) => {
              if (asset.derive) {
                asset.derive.forEach((derive) => {
                  if (derive.id === record.id) {
                    derive.state = record.state;
                    derive.src = record.src;
                  }
                });
              }
            });
          });
        }
        return data;
      } catch (e) {}
    }
    const assetsNotStateImageIds = computed(() => {
      const ids: number[] = [];
      flowData.value.assets.forEach((asset) => {
        if (asset.derive) {
          asset.derive.forEach((derive) => {
            if (derive.state == ("生成中" as "未生成" | "生成中" | "已完成" | "生成失败")) {
              ids.push(derive.id);
            }
          });
        }
      });
      return ids;
    });
    const storyboardNotStateImageIds = computed(() => {
      const ids: number[] = [];
      flowData.value.storyboard.forEach((asset) => {
        if (asset.state == "生成中" && asset.id) {
          ids.push(asset.id);
        }
      });
      return ids;
    });
    // ---- 资产图片轮询 ----
    let assetsPollingTimer: number | null = null;
    let assetsPollingInFlight = false;

    async function pollAssetsImages() {
      if(!accountBoundary.current(owner))return;
      const ids = assetsNotStateImageIds.value;
      if (ids.length === 0 || assetsPollingInFlight) return;
      assetsPollingInFlight = true;
      try {
        const { data } = await axios.post("/production/assets/pollingImage", {
          ids: ids,
        });
        if (!data || data.length === 0) return;
        const records = data as Array<{ id: number; state: string; src?: string; errorReason?: string; prompt?: string }>;
        records.forEach((record) => {
          flowData.value.assets.forEach((asset) => {
            if (!asset.derive) return;
            asset.derive.forEach((derive) => {
              if (derive.id === record.id) {
                derive.state = record.state as "未生成" | "生成中" | "已完成" | "生成失败";
                if (record.src) derive.src = record.src;
                derive.errorReason = record?.errorReason ?? "";
                derive.prompt = record?.prompt ?? "";
              }
            });
          });
        });
      } catch (e) {
        console.error("[assetsPolling] error", e);
      } finally {
        assetsPollingInFlight = false;
      }
    }

    function startAssetsPolling() {
      if(!accountBoundary.current(owner))return;
      if (assetsPollingTimer) return;
      assetsPollingTimer = window.setInterval(async () => {
        if (assetsNotStateImageIds.value.length === 0) {
          stopAssetsPolling();
          return;
        }
        await pollAssetsImages();
      }, 5000);
      // 立即执行一次
      pollAssetsImages();
    }

    function stopAssetsPolling() {
      if (assetsPollingTimer) {
        clearInterval(assetsPollingTimer);
        assetsPollingTimer = null;
      }
    }

    watch(
      () => assetsNotStateImageIds.value,
      (ids) => {
        if (ids.length > 0) {
          startAssetsPolling();
        } else {
          stopAssetsPolling();
        }
      },
    );

    // ---- 分镜图片轮询 ----
    let storyboardPollingTimer: number | null = null;
    let storyboardPollingInFlight = false;

    async function pollStoryboardImages() {
      if(!accountBoundary.current(owner))return;
      const ids = storyboardNotStateImageIds.value;
      if (ids.length === 0 || storyboardPollingInFlight) return;
      storyboardPollingInFlight = true;
      try {
        const { data } = await axios.post("/production/storyboard/pollingImage", {
          ids: ids,
        });
        if (!data || data.length === 0) return;
        const records = data as Array<{ id: number; state: string; src?: string; reason?: string; continuity?: Storyboard['continuity'] }>;
        records.forEach((record) => {
          const item = flowData.value.storyboard.find((s) => s.id === record.id);
          if (item) {
            item.state = record.state as "未生成" | "生成中" | "已完成" | "生成失败";
            if (record.src) item.src = record.src;
            if ('continuity' in record) item.continuity = record.continuity;
            item.reason = record?.reason ?? "";
          }
        });
      } catch (e) {
        console.error("[storyboardPolling] error", e);
      } finally {
        storyboardPollingInFlight = false;
      }
    }

    function startStoryboardPolling() {
      if(!accountBoundary.current(owner))return;
      if (storyboardPollingTimer) return;
      storyboardPollingTimer = window.setInterval(async () => {
        if (storyboardNotStateImageIds.value.length === 0) {
          stopStoryboardPolling();
          return;
        }
        await pollStoryboardImages();
      }, 5000);
      // 立即执行一次
      pollStoryboardImages();
    }

    function stopStoryboardPolling() {
      if (storyboardPollingTimer) {
        clearInterval(storyboardPollingTimer);
        storyboardPollingTimer = null;
      }
    }

    watch(
      () => storyboardNotStateImageIds.value,
      (ids) => {
        if (ids.length > 0) {
          startStoryboardPolling();
        } else {
          stopStoryboardPolling();
        }
      },
    );

    function updateContext() {
      if (episodesId.value! < 0) return;
      const ctx = {
        isolationKey: `${projectId}:productionAgent:${episodesId.value}`,
        projectId: projectId,
        scriptId: episodesId.value,
      };
      if (!connected.value) connect();
      socket.value!.emit("updateContext", ctx);
    }
    async function addStoryboardInfo(items: any[]) {
      const { data } = await axios.post("/production/storyboard/batchAddStoryboardInfo", {
        scriptId: episodesId.value,
        data: items,
        projectId: projectId,
      });

      flowData.value.storyboard.forEach((item) => {
        const updated = data.find((d: Storyboard) => d.prompt == item.prompt && d.duration == item.duration && d.videoDesc == item.videoDesc);
        if (updated) {
          item.id = updated.id;
          item.trackId = updated.trackId;
          item.src = updated.src;
          item.state = updated.state;
          item.associateAssetsIds = updated.associateAssetsIds;
        }
      });
    }

    const loadingHistory = ref(false);
    let historyRequestVersion = 0;
    async function getHistory() {
      const version = ++historyRequestVersion;
      const episode = episodesId.value;
      const token = sessionSignal();
      loadingHistory.value = true;
      try {
        const { data } = await axios.post(`/agents/getMemory`, {
          projectId: projectId,
          episodesId: episode,
          agentType: "productionAgent",
        });
        if (version !== historyRequestVersion || episode !== episodesId.value || token !== sessionSignal()) return;
        messages.value = [...defMsg, ...data];
      } finally {
        if (version === historyRequestVersion) loadingHistory.value = false;
      }
    }

    const thinkLevel = ref(0);

    function updateThinkConfig(value: number) {
      thinkLevel.value = value;
      if (socket.value) {
        socket.value.emit("updateThinkConfig", { think: value > 0, thinlLevel: value });
      }
    }

    const assistantTextModel = ref(projectStore().project?.textModel || '');
    const detach=accountBoundary.subscribe(()=>{stopAssetsPolling();stopStoryboardPolling();});
    onScopeDispose(detach);
    const assistantDraft = ref('');
    const chatWithSelectedModel = (content: string) => chat(content, undefined, undefined, assistantTextModel.value || undefined);
    return {
      connected,
      messages,
      chat: chatWithSelectedModel,
      assistantTextModel,
      assistantDraft,
      stopGenerate,
      socket,
      status,
      lastError,
      flowData,
      setFlowData,
      approveStage,
      saveDirectorDocument,
      getFlowData,
      episodesId,
      stopAssetsPolling,
      stopStoryboardPolling,
      updateContext,
      getHistory,
      loadingHistory,
      batchGenerateStoryboard,
      reconnect,
      thinkLevel,
      updateThinkConfig,
      disconnect,
    };
  });
}

const storeMap = new Map<string, ReturnType<typeof makeProductionAgentStore>>();

function createProductionAgentStore(projectId: string) {
  const scope=accountBoundary.capture().generation,key=`${scope}:${projectId}`;
  if (!storeMap.has(key)) {
    storeMap.set(key, makeProductionAgentStore(projectId,scope));
  }
  return storeMap.get(key)!;
}
accountBoundary.subscribe(()=>storeMap.clear());

export default function useProductionAgentStore() {
  const id = projectStore().project?.id;
  if (!id) throw new Error("No project selected");
  return createProductionAgentStore(id)();
}
