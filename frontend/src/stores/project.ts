/** 流水线进度聚合（后端 getProject 附带），段 id 与 components/pipeline/pipelineSteps.ts 对齐 */
export interface ProjectProgressCounter {
  done: number;
  total: number;
}

export interface ProjectProgress {
  material: ProjectProgressCounter;
  script: ProjectProgressCounter;
  asset: ProjectProgressCounter;
  storyboard: ProjectProgressCounter;
  output: ProjectProgressCounter;
}

interface Project {
  id: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string | null;
  videoRatio: string | null;
  createTime: number;
  updatedAt: number;
  imageModel: string;
  videoModel: string;
  projectType: string;
  imageQuality: "1K" | "2K" | "4K" | "";
  mode: string;
  directorManual: string;
  progress?: ProjectProgress;
}

export default defineStore(
  "project",
  () => {
    const allProject = ref<Project[]>([]);

    const project = ref<Project | null>(null);

    return { allProject, project };
  },
  { persist: true },
);
