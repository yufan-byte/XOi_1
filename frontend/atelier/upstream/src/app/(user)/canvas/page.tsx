"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button } from "antd";
import { Download, FileUp, Plus } from "lucide-react";

import { readZip } from "@/lib/zip";
import { setMediaBlob } from "@/services/file-storage";
import { setImageBlob } from "@/services/image-storage";
import { CanvasDeleteProjectsDialog } from "./components/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "./components/canvas-project-card";
import type { CanvasExportFile } from "./export-types";
import { useCanvasStore } from "./stores/use-canvas-store";
import { useCanvasUiStore } from "./stores/use-canvas-ui-store";
import { exportCanvasProjects } from "./utils/canvas-export";

export default function CanvasPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const [search, setSearch] = useState("");
    const hydrated = useCanvasStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const importProject = useCanvasStore((state) => state.importProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const visibleProjects = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return projects;
        return projects.filter((project) => project.name.toLowerCase().includes(keyword));
    }, [projects, search]);

    const enterProject = (id: string) => {
        router.push(`/canvas/${id}`);
    };
    const createAndEnter = () => enterProject(createProject(`无限画布 ${projects.length + 1}`));
    const importCanvas = async (file?: File) => {
        if (!file) return;
        try {
            const zip = await readZip(file);
            const projectFile = zip.get("projects.json");
            if (!projectFile) throw new Error("missing projects.json");
            const data = JSON.parse(await projectFile.text()) as CanvasExportFile;
            await Promise.all(
                data.projects.flatMap((project) =>
                    project.files.map(async (item) => {
                        const blob = zip.get(item.path);
                        if (!blob) return;
                        const typedBlob = blob.type ? blob : blob.slice(0, blob.size, item.mimeType);
                        await (item.storageKey.startsWith("image:") ? setImageBlob(item.storageKey, typedBlob) : setMediaBlob(item.storageKey, typedBlob));
                    }),
                ),
            );
            data.projects.forEach((item) => importProject(item.project));
            message.success(`已导入 ${data.projects.length} 个画布`);
        } catch {
            message.error("导入失败，请选择有效的画布压缩包");
        } finally {
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    return (
        <main className="h-full overflow-auto bg-[#f7f7f5] text-stone-950 dark:bg-background dark:text-stone-100">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-6 py-8 lg:px-10">
                <header className="flex flex-wrap items-end justify-between gap-5 rounded-[26px] border border-stone-200/80 bg-white px-7 py-7 shadow-[0_10px_30px_rgba(36,34,29,0.05)] dark:border-stone-800 dark:bg-stone-950">
                    <div className="min-w-[240px]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f57400]">XOi Canvas Studio</p>
                        <h1 className="mt-3 text-3xl font-semibold tracking-tight">无限画布</h1>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-stone-500">把提示词、参考图和生成结果放在同一个空间里，随时回来继续创作。</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedIds.length ? (
                            <>
                                <Button disabled={!hydrated} icon={<Download className="size-4" />} onClick={() => void exportCanvasProjects(projects.filter((project) => selectedIds.includes(project.id)), `无限画布-${selectedIds.length}个项目`)}>
                                    导出选中
                                </Button>
                                <Button disabled={!hydrated} onClick={() => setDeleteIds(selectedIds)}>
                                    删除选中
                                </Button>
                            </>
                        ) : null}
                        {projects.length ? (
                            <Button disabled={!hydrated} onClick={() => setDeleteIds(projects.map((project) => project.id))}>
                                删除全部
                            </Button>
                        ) : null}
                        <Button disabled={!hydrated} icon={<FileUp className="size-4" />} onClick={() => inputRef.current?.click()}>
                            导入画布
                        </Button>
                        <Button disabled={!hydrated} type="primary" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                            新建画布
                        </Button>
                    </div>
                </header>

                {hydrated && projects.length ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold">最近使用</h2>
                            <p className="mt-1 text-xs text-stone-500">共 {projects.length} 个画布</p>
                        </div>
                        <label className="flex h-10 min-w-[220px] items-center rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-500 shadow-sm dark:border-stone-800 dark:bg-stone-950">
                            <span className="mr-2 text-stone-400">⌕</span>
                            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索画布" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-stone-400" />
                        </label>
                    </div>
                ) : null}

                {!hydrated ? (
                    <section className="flex min-h-[360px] items-center justify-center border-y border-stone-200 text-sm text-stone-500 dark:border-stone-800">正在加载画布...</section>
                ) : visibleProjects.length ? (
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {visibleProjects.map((project) => (
                            <CanvasProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                ) : projects.length ? (
                    <section className="flex min-h-[260px] flex-col items-center justify-center rounded-[24px] border border-dashed border-stone-300 bg-white/70 text-center dark:border-stone-700 dark:bg-stone-950/60">
                        <h2 className="text-lg font-medium">没有匹配的画布</h2>
                        <p className="mt-2 text-sm text-stone-500">换一个关键词试试，或者新建一个画布。</p>
                    </section>
                ) : (
                    <section className="flex min-h-[360px] flex-col items-center justify-center rounded-[24px] border border-dashed border-stone-300 bg-white/70 text-center dark:border-stone-700 dark:bg-stone-950/60">
                        <h2 className="text-xl font-medium">还没有画布</h2>
                        <p className="mt-3 text-sm text-stone-500">新建一个画布后，就可以独立保存节点、连线和画布外观。</p>
                        <Button type="primary" className="mt-6" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                            新建画布
                        </Button>
                    </section>
                )}
            </div>

            <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importCanvas(event.target.files?.[0])} />
            <CanvasDeleteProjectsDialog />
        </main>
    );
}
