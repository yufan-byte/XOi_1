import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { message } from "antd";
import { localForageStorage } from "@/lib/localforage-storage";
import { listCanvasProjects, saveCanvasProject } from "@/services/api/canvas-tasks";
import { fetchUserConfig } from "@/services/api/user-config";
import { useUserStore } from "@/stores/use-user-store";
import { getVerifiedToken } from "@/xoi/owner";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { CanvasAgentConfig, CanvasAssistantSession, CanvasConnection, CanvasNodeData, CanvasPendingAgentRequest, ViewportTransform } from "../types";

export type CanvasSidePanelState = {
    open: boolean;
    width: number;
};

export const DEFAULT_CANVAS_SIDE_PANEL: CanvasSidePanelState = { open: false, width: 280 };
export const DEFAULT_CANVAS_AGENT_PANEL: CanvasSidePanelState = { open: false, width: 464 };

export type CanvasProject = {
    cloudRevision?: number;
    cloudPending?: boolean;
    cloudConflict?: boolean;
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    agentConfig: CanvasAgentConfig | null;
    autoTitlePending: boolean;
    pendingAgentRequest?: CanvasPendingAgentRequest;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
    sidePanel: CanvasSidePanelState;
    agentPanel: CanvasSidePanelState;
};

type CanvasStore = {
    hydrated: boolean;
    projects: CanvasProject[];
    createProject: (title?: string, options?: { agentConfig?: CanvasAgentConfig; pendingAgentRequest?: CanvasPendingAgentRequest }) => string;
    importProject: (project: Partial<CanvasProject>) => string;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "agentConfig" | "autoTitlePending" | "backgroundMode" | "showImageInfo" | "viewport" | "sidePanel" | "agentPanel" | "pendingAgentRequest">>) => void;
    syncWithRemote: (token: string, syncEnabled: boolean) => Promise<void>;
    setSyncEnabled: (enabled: boolean) => void;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
// v2 避开此前把公共旧库复制进各账号的本地缓存；历史缓存保留待人工核对归属。
const CANVAS_STORE_KEY = "infinite-canvas:canvas_store:v2";
type PersistedCanvasState = Pick<CanvasStore, "projects">;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let queuedPersistState: PersistedCanvasState | null = null;
let accountCanvasSyncEnabled = false;
const projectSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const projectSaveChains = new Map<string, Promise<void>>();
const pendingProjectSaves = new Map<string, () => Promise<void>>();

function waitForUserStoreHydration() {
    if (useUserStore.persist.hasHydrated()) return Promise.resolve();

    return new Promise<void>((resolve) => {
        let unsubscribe = () => { };
        unsubscribe = useUserStore.persist.onFinishHydration(() => {
            unsubscribe();
            resolve();
        });
        if (useUserStore.persist.hasHydrated()) {
            unsubscribe();
            resolve();
        }
    });
}

function queueProjectSave(project: CanvasProject) {
    const token = useUserStore.getState().token;
    const syncEnabled = accountCanvasSyncEnabled;
    useCanvasStore.setState(state=>({projects:state.projects.map(p=>p.id===project.id?{...p,cloudPending:true}:p)}));
    const previous = projectSaveTimers.get(project.id);
    if (previous) clearTimeout(previous);

    const saveNow = () => {
            projectSaveTimers.delete(project.id);
            pendingProjectSaves.delete(project.id);
            if (
                !token || token !== getVerifiedToken() ||
                !syncEnabled ||
                !accountCanvasSyncEnabled ||
                useUserStore.getState().token !== token
            ) {
                return Promise.resolve();
            }
            const previous=projectSaveChains.get(project.id)||Promise.resolve();
            const save=previous.catch(()=>{}).then(async()=>{
                if(token!==getVerifiedToken()||useUserStore.getState().token!==token)return;
                const snapshot=useCanvasStore.getState().projects.find(p=>p.id===project.id);
                if(!snapshot||snapshot.cloudConflict)return;
                try{
                    const saved=await saveCanvasProject(token,snapshot);
                    if(token!==getVerifiedToken())return;
                    useCanvasStore.setState(state=>({projects:state.projects.map(p=>p.id===snapshot.id?{...p,cloudRevision:saved.cloudRevision,cloudPending:p!==snapshot}:p)}));
                }catch(error){
                    if(token!==getVerifiedToken())return;
                    const conflict=(error as any).status===409;
                    useCanvasStore.setState(state=>({projects:state.projects.map(p=>p.id===snapshot.id?{...p,cloudPending:true,cloudConflict:conflict}:p)}));
                    message.error(conflict?"画布版本冲突，本机修改已保留；重新打开时会保留为独立副本，不会覆盖云端":"云端保存失败，本机修改已保留，请检查网络后重试");
                }
            });
            projectSaveChains.set(project.id,save);
            void save.finally(()=>{if(projectSaveChains.get(project.id)===save)projectSaveChains.delete(project.id);});
            return save;
    };
    pendingProjectSaves.set(project.id, saveNow);
    projectSaveTimers.set(project.id, setTimeout(() => { void saveNow(); }, 400));
}

function cancelProjectSaves(ids: string[]) {
    ids.forEach((id) => {
        const timer = projectSaveTimers.get(id);
        if (!timer) return;
        clearTimeout(timer);
        projectSaveTimers.delete(id);
        pendingProjectSaves.delete(id);
    });
}

/** Flush the existing save queue before leaving the standalone editor document. */
export async function flushCanvasBeforeExit(projectId: string) {
    const timer = projectSaveTimers.get(projectId);
    if (timer) clearTimeout(timer);
    const saveNow = pendingProjectSaves.get(projectId);
    await (saveNow ? saveNow() : projectSaveChains.get(projectId));
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    const state = { projects: useCanvasStore.getState().projects };
    queuedPersistState = state;
    await localForageStorage.setItem(CANVAS_STORE_KEY, JSON.stringify({ state, version: 0 }));
}

const canvasStorage: PersistStorage<CanvasStore> = {
    getItem: async (name) => {
        await waitForUserStoreHydration();
        // upstream persist 中可能残留上个账号的 JWT；这里必须用启动时 /auth/me 核验过的 token。
        const token = getVerifiedToken();
        if (token) {
            const raw=await localForageStorage.getItem(name);
            let local:CanvasProject[]=[];try{local=JSON.parse(raw||"null")?.state?.projects||[];}catch{}
            try {
                const [userConfig, remoteProjects] = await Promise.all([fetchUserConfig(token), listCanvasProjects(token)]);
                accountCanvasSyncEnabled = userConfig.syncCapabilities?.userData === true;
                const copies=local.filter(p=>p.cloudPending).map(p=>remoteProjects.some(r=>r.id===p.id)||p.cloudConflict?({...p,id:nanoid(),title:`${p.title}（本机未同步副本）`,cloudRevision:undefined,cloudPending:true,cloudConflict:false}):p);
                const nextState = { projects: [...copies,...remoteProjects] };
                const parsed = { state: nextState, version: 0 } as StorageValue<CanvasStore>;
                queuedPersistState = nextState;
                await localForageStorage.setItem(name, JSON.stringify(parsed));
                return parsed;
            } catch (error) {
                console.error(
                    "Failed to hydrate canvas projects from remote",
                    error,
                );
                if(local.length)return {state:{projects:local},version:0} as StorageValue<CanvasStore>;
            }
        }

        // 服务端不可达时不展示无法核对归属的旧本地工程。
        return null;
    },

    setItem: (name, value) => {
        const nextState = value.state as PersistedCanvasState;
        if (
            queuedPersistState &&
            queuedPersistState.projects === nextState.projects
        ) {
            return;
        }
        queuedPersistState = nextState;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            void localForageStorage.setItem(name, JSON.stringify(value));
        }, 400);
    },
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useCanvasStore = create<CanvasStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            createProject: (title = "未命名画布", options) => {
                const now = new Date().toISOString();
                const id = nanoid();
                const project: CanvasProject = {
                    id,
                    title,
                    createdAt: now,
                    updatedAt: now,
                    nodes: [],
                    connections: [],
                    chatSessions: [],
                    activeChatId: null,
                    agentConfig: options?.agentConfig || null,
                    autoTitlePending: true,
                    pendingAgentRequest: options?.pendingAgentRequest,
                    backgroundMode: "dots",
                    showImageInfo: false,
                    viewport: initialViewport,
                    sidePanel: DEFAULT_CANVAS_SIDE_PANEL,
                    agentPanel: options?.pendingAgentRequest ? { ...DEFAULT_CANVAS_AGENT_PANEL, open: true } : DEFAULT_CANVAS_AGENT_PANEL,
                };
                set((state) => ({
                    projects: [project, ...state.projects],
                }));
                queueProjectSave(project);
                return id;
            },
            importProject: (source) => {
                const now = new Date().toISOString();
                const project: CanvasProject = {
                    id: nanoid(),
                    title: source.title || "导入画布",
                    createdAt: source.createdAt || now,
                    updatedAt: now,
                    nodes: source.nodes || [],
                    connections: source.connections || [],
                    chatSessions: (source.chatSessions || []).map((session) => ({ ...session, codexThreadId: undefined, codexServiceId: undefined })),
                    activeChatId: source.activeChatId || null,
                    agentConfig: source.agentConfig || null,
                    autoTitlePending: false,
                    backgroundMode: source.backgroundMode || "dots",
                    showImageInfo: source.showImageInfo || false,
                    viewport: source.viewport || initialViewport,
                    sidePanel: source.sidePanel || DEFAULT_CANVAS_SIDE_PANEL,
                    agentPanel: source.agentPanel || DEFAULT_CANVAS_AGENT_PANEL,
                };
                set((state) => ({
                    projects: [project, ...state.projects],
                }));
                queueProjectSave(project);
                return project.id;
            },
            openProject: (id) =>
                get().projects.find((item) => item.id === id) || null,
            renameProject: (id, title) => {
                const project = get().projects.find(
                    (item) => item.id === id,
                );
                if (!project) return;
                const nextProject = {
                    ...project,
                    title: title.trim() || project.title,
                    autoTitlePending: false,
                    updatedAt: new Date().toISOString(),
                };
                set((state) => ({
                    projects: state.projects.map((item) =>
                        item.id === id ? nextProject : item,
                    ),
                }));
                queueProjectSave(nextProject);
            },
            deleteProjects: (ids) => {
                cancelProjectSaves(ids);
                set((state) => ({
                    projects: state.projects.filter(
                        (project) => !ids.includes(project.id),
                    ),
                }));
            },
            updateProject: (id, patch) => {
                const project = get().projects.find(
                    (item) => item.id === id,
                );
                if (!project) return;
                const nextProject = {
                    ...project,
                    ...patch,
                    updatedAt: new Date().toISOString(),
                };
                set((state) => ({
                    projects: state.projects.map((item) =>
                        item.id === id ? nextProject : item,
                    ),
                }));
                queueProjectSave(nextProject);
            },
            syncWithRemote: async (token, syncEnabled) => {
                if (token !== getVerifiedToken()) return;
                accountCanvasSyncEnabled = syncEnabled;
                if (!syncEnabled) return;
                await Promise.all([...projectSaveChains.values()]);
                if(token!==getVerifiedToken())return;
                const remoteProjects = await listCanvasProjects(token).catch(
                    () => null,
                );
                if (!remoteProjects) return;
                if (saveTimer) {
                    clearTimeout(saveTimer);
                    saveTimer = null;
                }
                const copies=get().projects.filter(p=>p.cloudPending).map(p=>remoteProjects.some(r=>r.id===p.id)||p.cloudConflict?({...p,id:nanoid(),title:`${p.title}（本机未同步副本）`,cloudRevision:undefined,cloudPending:true,cloudConflict:false}):p);
                const nextState = { projects: [...copies,...remoteProjects] };
                queuedPersistState = nextState;
                set(nextState);
                await localForageStorage.setItem(
                    CANVAS_STORE_KEY,
                    JSON.stringify({ state: nextState, version: 0 }),
                );
            },
            setSyncEnabled: (enabled) => {
                accountCanvasSyncEnabled = enabled;
            },
        }),
        {
            name: CANVAS_STORE_KEY,
            storage: canvasStorage,
            partialize: (state) =>
                ({
                    projects: state.projects,
                }) as StorageValue<CanvasStore>["state"],
            onRehydrateStorage: () => () => {
                useCanvasStore.setState({ hydrated: true });
            },
        },
    ),
);

export function mergeCanvasProjects(
    remoteProjects: CanvasProject[],
    localProjects: CanvasProject[],
): CanvasProject[] {
    const projects = new Map<string, CanvasProject>();
    [...localProjects, ...remoteProjects].forEach((project) => {
        const previous = projects.get(project.id);
        if (
            !previous ||
            Date.parse(project.updatedAt || "") >=
            Date.parse(previous.updatedAt || "")
        ) {
            projects.set(project.id, project);
        }
    });
    return Array.from(projects.values()).sort(
        (a, b) =>
            Date.parse(b.updatedAt || "") -
            Date.parse(a.updatedAt || ""),
    );
}
