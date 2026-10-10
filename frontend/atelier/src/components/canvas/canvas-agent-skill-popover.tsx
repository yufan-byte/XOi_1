"use client";
import "./canvas-skill-library.css";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, FileUp, Pencil, Search, Trash2, Wrench } from "lucide-react";
import { App, Button, Empty, Form, Input, Modal, Popover, Spin } from "antd";

import { AgentSkillCover, AgentSkillCoverEditor } from "@/components/agent-skill-cover";
import { canvasThemes } from "@/lib/canvas-theme";
import { AGENT_SKILL_CONTENT_MAX_LENGTH, type AgentSkill } from "@/services/api/agent-skills";
import { useAgentSkillStore } from "@/stores/use-agent-skill-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import type { CanvasAgentSkillSelection } from "@/types/canvas";

type CanvasAgentSkillPopoverProps = {
    selectedSkills?: CanvasAgentSkillSelection[];
    onSelect: (skill: CanvasAgentSkillSelection) => void;
    onDeleteSelected: (id: string, source: CanvasAgentSkillSelection["source"]) => void;
};

export function CanvasAgentSkillPopover({ selectedSkills, onSelect, onDeleteSelected }: CanvasAgentSkillPopoverProps) {
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
    const [tab, setTab] = useState<"all" | "director" | "system" | "user">("all");
    const [query, setQuery] = useState("");
    const [previewId, setPreviewId] = useState("");
    const [editingSkill, setEditingSkill] = useState<AgentSkill | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const editingCoverUrl = Form.useWatch("coverUrl", form);
    const editingCoverStorageKey = Form.useWatch("coverStorageKey", form);

    useEffect(() => {
        if (open) void loadSkills().catch((error) => message.error(error instanceof Error ? error.message : "Skill 加载失败"));
    }, [loadSkills, message, open, token]);

    const skills = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        const source = tab === "user" ? userSkills : tab === "system" ? systemSkills.filter(skill => !skill.id.startsWith("purchased/director/")) : tab === "director" ? systemSkills.filter(skill => skill.id.startsWith("purchased/director/")) : [...systemSkills, ...userSkills];
        return source.filter(skill => !keyword || `${skill.name} ${skill.description}`.toLowerCase().includes(keyword));
    }, [query, systemSkills, tab, userSkills]);
    const preview = skills.find(skill => `${skill.source}:${skill.id}` === previewId) || skills[0];
    const isSelected = (skill: AgentSkill) => selectedSkills?.some(selected => selected.id === skill.id && selected.source === skill.source);

    const selectSkill = (skill: AgentSkill) => {
        onSelect({ id: skill.id, name: skill.name, source: skill.source });
        setOpen(false);
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
        <div className="canvas-skill-library" style={{ "--skill-hover-bg": theme.toolbar.itemHover, "--skill-border": theme.node.stroke, "--skill-muted": theme.node.muted, "--skill-fill": theme.node.fill } as CSSProperties} onPointerDown={event => event.stopPropagation()}>
            <div className="canvas-skill-search">
                <Input allowClear prefix={<Search className="size-4 opacity-55" />} placeholder="搜索技能" aria-label="搜索技能" value={query} onChange={event => setQuery(event.target.value)} />
                <Button size="small" icon={<FileUp className="size-3.5" />} onClick={() => fileInputRef.current?.click()}>导入</Button>
            </div>
            <div className="canvas-skill-columns">
                <nav className="canvas-skill-categories" aria-label="技能分类">
                    {([["all", "全部"], ["director", "导演与分镜"], ["system", "通用创作"], ["user", "我的"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>{tab === key ? <Check className="size-3.5" /> : <span className="size-3.5" />}{label}</button>)}
                </nav>
                <div className="canvas-skill-list thin-scrollbar">
                    <Spin spinning={isLoading}>
                        {skills.length ? skills.map(skill => (
                            <div key={`${skill.source}:${skill.id}`} className="canvas-skill-row" data-active={preview === skill}>
                                <button type="button" className="canvas-skill-item" onClick={() => setPreviewId(`${skill.source}:${skill.id}`)}>
                                    <strong>{skill.name}{isSelected(skill) ? <Check className="size-3.5" /> : null}</strong>
                                    <span>{skill.description || "自定义创作工作流"}</span>
                                </button>
                                {skill.source === "user" ? <div className="canvas-skill-edit"><Button type="text" size="small" icon={<Pencil className="size-3.5" />} aria-label={`编辑 ${skill.name}`} onClick={() => editSkill(skill)} /><Button type="text" size="small" icon={<Trash2 className="size-3.5" />} aria-label={`删除 ${skill.name}`} onClick={() => removeSkill(skill)} /></div> : null}
                            </div>
                        )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tab === "user" ? "导入 Markdown 或文本创建技能" : "没有匹配的技能"} />}
                    </Spin>
                </div>
                {preview ? <section className="canvas-skill-preview" aria-label="技能详情">
                    <AgentSkillCover name={preview.name} coverUrl={preview.coverUrl} coverStorageKey={preview.coverStorageKey} borderColor={theme.node.stroke} background={theme.node.fill} />
                    <span className="canvas-skill-kind">{preview.id.startsWith("purchased/director/") ? "导演与分镜" : preview.source === "user" ? "我的技能" : "通用创作"}</span>
                    <h3>{preview.name}</h3>
                    <p>{preview.description || "把你的工作流带入画布创作。"}</p>
                    <small>选择后随下一条消息使用，可在输入框中移除。</small>
                    <Button type="primary" block onClick={() => selectSkill(preview)}>{isSelected(preview) ? "继续使用" : "使用技能"}</Button>
                </section> : null}
            </div>
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
                        onSelect({ id: skill.id, name: skill.name, source: skill.source });
                        message.success("Skill 已导入");
                        setOpen(false);
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
                content={content}
                styles={{ container: { padding: 14, background: theme.toolbar.panel, color: theme.node.text, border: `1px solid ${theme.node.stroke}`, borderRadius: 16 } }}
            >
                <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={{ color: theme.node.text }} icon={<Wrench className="size-4" />} title="技能" aria-label="技能" />
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
