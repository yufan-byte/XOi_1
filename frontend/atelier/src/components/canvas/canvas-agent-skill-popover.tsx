"use client";
import "./canvas-skill-library.css";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, FileUp, Pencil, Search, Trash2, Wrench, X } from "lucide-react";
import { App, Button, Empty, Form, Input, Modal, Popover, Spin } from "antd";

import { AgentSkillCover, AgentSkillCoverEditor } from "@/components/agent-skill-cover";
import { canvasThemes } from "@/lib/canvas-theme";
import { AGENT_SKILL_CONTENT_MAX_LENGTH, type AgentSkill } from "@/services/api/agent-skills";
import { useAgentSkillStore } from "@/stores/use-agent-skill-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { MAX_CANVAS_AGENT_SKILLS, type CanvasAgentSkillSelection } from "@/types/canvas";
import { getCanvasSkillGuide } from "./canvas-skill-guide";

type CanvasAgentSkillPopoverProps = {
    selectedSkills?: CanvasAgentSkillSelection[];
    onInsertExample?: (example: string) => void;
    onSelect: (skill: CanvasAgentSkillSelection) => void;
    onDeleteSelected: (id: string, source: CanvasAgentSkillSelection["source"]) => void;
};

export function CanvasAgentSkillPopover({ selectedSkills = [], onSelect, onDeleteSelected, onInsertExample }: CanvasAgentSkillPopoverProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const token = useUserStore((state) => state.token);
    const systemSkills = useAgentSkillStore((state) => state.systemSkills);
    const userSkills = useAgentSkillStore((state) => state.userSkills);
    const isLoading = useAgentSkillStore((state) => state.isLoading);
    const loadSkills = useAgentSkillStore((state) => state.loadSkills);
    const importSkill = useAgentSkillStore((state) => state.importSkill);
    const updateSkill = useAgentSkillStore((state) => state.updateSkill);
    const deleteSkill = useAgentSkillStore((state) => state.deleteSkill);
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<Pick<AgentSkill, "name" | "description" | "coverUrl" | "coverStorageKey" | "content">>();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<"all" | "director" | "system" | "user" | "selected">("all");
    const [query, setQuery] = useState("");
    const [previewId, setPreviewId] = useState("");
    const [editingSkill, setEditingSkill] = useState<AgentSkill | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const editingCoverUrl = Form.useWatch("coverUrl", form);
    const editingCoverStorageKey = Form.useWatch("coverStorageKey", form);

    useEffect(() => {
        if (open) void loadSkills().catch((error) => message.error(error instanceof Error ? error.message : "Skill 加载失败"));
    }, [loadSkills, message, open, token]);

    const isSelected = (skill: Pick<AgentSkill, "id" | "source">) => selectedSkills.some(selected => selected.id === skill.id && selected.source === skill.source);
    const availableSkills = useMemo(() => [...systemSkills.filter(skill => skill.id.startsWith("purchased/director/")), ...systemSkills.filter(skill => !skill.id.startsWith("purchased/director/")), ...userSkills].filter(skill => skill.enabled), [systemSkills, userSkills]);
    const skills = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        // Searching spans categories so a previous filter cannot hide a matching skill.
        return availableSkills.filter(skill => {
            if (keyword) return `${skill.name} ${skill.description} ${Object.values(getCanvasSkillGuide(skill) || {}).join(" ")}`.toLowerCase().includes(keyword);
            return tab === "all" || (tab === "selected" ? isSelected(skill) : tab === "user" ? skill.source === "user" : tab === "director" ? skill.id.startsWith("purchased/director/") : skill.source === "system" && !skill.id.startsWith("purchased/director/"));
        });
    }, [query, availableSkills, tab, selectedSkills]);
    const preview = skills.find(skill => `${skill.source}:${skill.id}` === previewId) || skills[0];
    const guide = preview ? getCanvasSkillGuide(preview) : undefined;
    const atLimit = selectedSkills.length >= MAX_CANVAS_AGENT_SKILLS;

    const addSkill = (skill: AgentSkill) => {
        if (isSelected(skill)) return true;
        if (atLimit) { message.info(`最多搭配 ${MAX_CANVAS_AGENT_SKILLS} 项技能，请先移除一项`); return false; }
        onSelect({ id: skill.id, name: skill.name, source: skill.source });
        return true;
    };
    const toggleSkill = (skill: AgentSkill) => {
        if (isSelected(skill)) onDeleteSelected(skill.id, skill.source);
        else addSkill(skill);
    };

    const removeSkill = (skill: AgentSkill) => {
        modal.confirm({
            title: `删除「${skill.name}」？`,
            content: "删除后无法恢复，已发送的历史消息不会被删除。",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                await deleteSkill(skill.id);
                if (selectedSkills?.some((selected) => selected.id === skill.id && selected.source === skill.source)) onDeleteSelected(skill.id, skill.source);
                message.success("Skill 已删除");
            },
        });
    };

    const editSkill = (skill: AgentSkill) => {
        form.setFieldsValue({ name: skill.name, description: skill.description, coverUrl: skill.coverUrl, coverStorageKey: skill.coverStorageKey, content: skill.content });
        setEditingSkill(skill);
        setOpen(false);
    };

    const saveEditingSkill = async () => {
        if (!editingSkill) return;
        setIsSaving(true);
        try {
            const saved = await updateSkill(editingSkill.id, await form.validateFields());
            if (selectedSkills?.some((selected) => selected.id === saved.id && selected.source === saved.source)) onSelect({ id: saved.id, name: saved.name, source: saved.source });
            setEditingSkill(null);
            message.success("Skill 已保存");
        } catch (error) {
            if (error instanceof Error) message.error(error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const content = (
        <div className="canvas-skill-library" style={{ "--skill-hover-bg": theme.toolbar.itemHover, "--skill-border": theme.node.stroke, "--skill-muted": theme.node.muted, "--skill-fill": theme.node.fill } as CSSProperties} onPointerDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}>
            <div className="canvas-skill-search">
                <Input allowClear prefix={<Search className="size-4 opacity-55" />} placeholder="搜索名称或需求，如分镜、运镜、表情" aria-label="搜索技能" value={query} onChange={event => setQuery(event.target.value)} />
                <Button size="small" icon={<FileUp className="size-3.5" />} onClick={() => fileInputRef.current?.click()}>导入</Button>
            </div>
            <div className="canvas-skill-results">{query.trim() ? `全部技能中的搜索结果 · ${skills.length} 项` : `选择适合当前创作的技能 · ${skills.length} 项`}</div>
            <div className="canvas-skill-columns">
                <nav className="canvas-skill-categories" aria-label="技能分类">
                    {([["all", "全部"], ["director", "导演与分镜"], ["system", "通用创作"], ["user", "我的"], ["selected", "已选"]] as const).map(([key, label]) => <button key={key} type="button" aria-label={label} aria-pressed={tab === key && !query.trim()} onClick={() => { setTab(key); setQuery(""); }}>{tab === key && !query.trim() ? <Check className="size-3.5" /> : <span className="size-3.5" />}{label}{key === "selected" ? <span className="canvas-skill-count">{selectedSkills.length}</span> : null}</button>)}
                </nav>
                <div className="canvas-skill-list thin-scrollbar">
                    <Spin spinning={isLoading}>
                        {skills.length ? skills.map(skill => (
                            <div key={`${skill.source}:${skill.id}`} className="canvas-skill-row" data-active={preview === skill}>
                                <button type="button" className="canvas-skill-item" onClick={() => setPreviewId(`${skill.source}:${skill.id}`)}>
                                    <strong>{skill.name}{isSelected(skill) ? <Check className="size-3.5" /> : null}</strong>
                                    <span>{skill.description || "自定义创作工作流"}</span>
                                </button>
                                <button type="button" role="checkbox" aria-checked={Boolean(isSelected(skill))} aria-label={`选择 ${skill.name}`} disabled={atLimit && !isSelected(skill)} className="canvas-skill-check" onClick={() => toggleSkill(skill)}>{isSelected(skill) ? <Check size={14} /> : null}</button>
                                {skill.source === "user" ? <div className="canvas-skill-edit"><Button type="text" size="small" icon={<Pencil className="size-3.5" />} aria-label={`编辑 ${skill.name}`} onClick={() => editSkill(skill)} /><Button type="text" size="small" icon={<Trash2 className="size-3.5" />} aria-label={`删除 ${skill.name}`} onClick={() => removeSkill(skill)} /></div> : null}
                            </div>
                        )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query.trim() ? "试试分镜、镜头、表情等需求词" : tab === "selected" ? "还没有选择技能" : tab === "user" ? "导入 Markdown 或文本创建技能" : "没有可用技能"} />}
                    </Spin>
                </div>
                {preview ? <section className="canvas-skill-preview" aria-label="技能详情">
                    <AgentSkillCover name={preview.name} coverUrl={preview.coverUrl} coverStorageKey={preview.coverStorageKey} borderColor={theme.node.stroke} background={theme.node.fill} />
                    <span className="canvas-skill-kind">{preview.id.startsWith("purchased/director/") ? "导演与分镜" : preview.source === "user" ? "我的技能" : "通用创作"}</span>
                    <h3>{preview.name}</h3>
                    <p>{preview.description || "把你的工作流带入画布创作。"}</p>
                    {guide ? <dl className="canvas-skill-guide"><dt>准备什么</dt><dd>{guide.input}</dd><dt>可以得到</dt><dd>{guide.output}</dd></dl> : null}
                    <div className="canvas-skill-preview-actions">
                        <Button type={isSelected(preview) ? "default" : "primary"} block disabled={atLimit && !isSelected(preview)} onClick={() => toggleSkill(preview)}>{isSelected(preview) ? "移除技能" : "加入对话"}</Button>
                        {guide && onInsertExample ? <Button type="text" block disabled={atLimit && !isSelected(preview)} onClick={() => { if (addSkill(preview)) { onInsertExample(guide.example); setOpen(false); } }}>填入示例需求</Button> : null}
                    </div>
                </section> : null}
            </div>
            <footer className="canvas-skill-footer">
                <div className="canvas-skill-selection"><span>已选 {selectedSkills.length}/{MAX_CANVAS_AGENT_SKILLS}</span><div>{selectedSkills.map(skill => <button key={`${skill.source}:${skill.id}`} type="button" aria-label={`移除 ${skill.name}`} onClick={() => onDeleteSelected(skill.id, skill.source)}>{skill.name}<X size={12} /></button>)}</div></div>
                <div className="canvas-skill-done"><small>{atLimit ? "已达上限，可移除后重新搭配" : "在这段对话中持续使用，随时可移除"}</small><Button size="small" aria-label="完成" onClick={() => setOpen(false)}>完成</Button></div>
            </footer>
            <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                hidden
                onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    try {
                        const skill = await importSkill(file);
                        setTab("user"); setQuery(""); setPreviewId(`${skill.source}:${skill.id}`);
                        message.success("技能已导入到「我的」，可继续查看和选择");
                    } catch (error) {
                        message.error(error instanceof Error ? error.message : "Skill 导入失败");
                    }
                }}
            />
        </div>
    );

    return (
        <>
            <Popover
                trigger="click"
                placement="top"
                arrow={false}
                open={open}
                onOpenChange={setOpen}
                afterOpenChange={visible => { if (visible && window.matchMedia("(min-width: 651px)").matches) window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.canvas-skill-search input')?.focus()); }}
                content={content}
                styles={{ container: { padding: 14, background: theme.node.panel, color: theme.node.text, border: `1px solid ${theme.node.stroke}`, borderRadius: 16 } }}
            >
                <Button type="text" className="!h-8 !min-w-8 !rounded-full !px-2" style={{ color: theme.node.text }} icon={<Wrench className="size-4" />} title="选择创作技能" aria-label="技能" aria-expanded={open}>技能{selectedSkills.length ? <span className="canvas-skill-trigger-count">{selectedSkills.length}</span> : null}</Button>
            </Popover>
            <Modal title="编辑 Skill" open={Boolean(editingSkill)} width={920} footer={null} destroyOnHidden onCancel={() => setEditingSkill(null)}>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Form.Item name="coverUrl" hidden>
                        <Input />
                    </Form.Item>
                    <Form.Item name="coverStorageKey" hidden>
                        <Input />
                    </Form.Item>
                    <div className="grid gap-5 md:grid-cols-[300px_minmax(0,1fr)]">
                        <div>
                            <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入 Skill 名称" }]}>
                                <Input />
                            </Form.Item>
                            <Form.Item name="description" label="描述">
                                <Input.TextArea rows={3} />
                            </Form.Item>
                            <Form.Item label="封面图片">
                                <AgentSkillCoverEditor
                                    name={editingSkill?.name || "Skill"}
                                    coverUrl={editingCoverUrl}
                                    coverStorageKey={editingCoverStorageKey}
                                    borderColor={theme.node.stroke}
                                    background={theme.node.fill}
                                    onChange={(value) => form.setFieldsValue(value)}
                                />
                            </Form.Item>
                            <div className="flex justify-end">
                                <Button type="primary" loading={isSaving} onClick={() => void saveEditingSkill()}>
                                    保存
                                </Button>
                            </div>
                        </div>
                        <Form.Item name="content" label="Skill 内容" style={{ marginBottom: 16 }} rules={[{ required: true, message: "请输入 Skill 内容" }]}>
                            <Input.TextArea
                                count={{
                                    max: AGENT_SKILL_CONTENT_MAX_LENGTH,
                                    strategy: (value) => Array.from(value).length,
                                    show: ({ count, maxLength }) => `${count} / ${maxLength}`,
                                    exceedFormatter: (value, { max }) => Array.from(value).slice(0, max).join(""),
                                }}
                                style={{ height: "min(480px, calc(100vh - 250px))", resize: "none" }}
                            />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>
        </>
    );
}
