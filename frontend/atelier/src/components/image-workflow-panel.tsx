import { useMemo, useState } from "react";
import { Button, Drawer, Empty, Input, Tag } from "antd";
import { ArrowRight, Layers3, Sparkles } from "lucide-react";

type WorkflowVariable = {
    key: string;
    label: string;
    placeholder: string;
    multiline?: boolean;
};

export type ImageWorkflowPreset = {
    id: string;
    name: string;
    category: string;
    description: string;
    variables: WorkflowVariable[];
    prompt: string;
};

export const imageWorkflowPresets: ImageWorkflowPreset[] = [
    {
        id: "product-launch",
        name: "产品发布主视觉",
        category: "商业视觉",
        description: "从产品信息生成一组统一的发布海报方向。",
        variables: [
            { key: "product", label: "产品描述", placeholder: "例如：一款雾面黑色无线耳机" },
            { key: "audience", label: "受众与气质", placeholder: "例如：面向年轻专业人士，克制、精密" },
            { key: "scene", label: "场景与色彩", placeholder: "例如：深色摄影棚，蓝紫轮廓光", multiline: true },
        ],
        prompt: "为 {product} 设计一张产品发布主视觉。目标受众和品牌气质：{audience}。场景与色彩：{scene}。主体保持结构准确、材质真实，使用有层次的商业摄影布光，构图适合后期排版，画面干净，不生成文字、水印或额外品牌标识。",
    },
    {
        id: "character-sheet",
        name: "角色一致性设定",
        category: "角色设计",
        description: "快速生成可用于分镜和系列画面的角色设定图。",
        variables: [
            { key: "character", label: "角色描述", placeholder: "例如：短发、橙色夹克的城市快递员", multiline: true },
            { key: "style", label: "视觉风格", placeholder: "例如：写实电影概念设计" },
        ],
        prompt: "生成 {character} 的角色一致性设定图，视觉风格为 {style}。包含正面、四分之三侧面、侧面和背面四个完整视角，并附三个表情近景；保持脸型、发型、服装、配饰、体型和色彩完全一致，均匀摄影棚光线，排版整齐，角色之间不重叠，不出现说明文字与水印。",
    },
    {
        id: "storyboard-frame",
        name: "电影分镜画面",
        category: "叙事分镜",
        description: "把一个镜头想法整理成有前中后景的电影画面。",
        variables: [
            { key: "action", label: "人物与动作", placeholder: "例如：女孩在雨中把伞递给陌生人", multiline: true },
            { key: "location", label: "地点与时间", placeholder: "例如：夜晚的旧火车站" },
            { key: "camera", label: "镜头语言", placeholder: "例如：低机位，35mm，浅景深" },
        ],
        prompt: "设计一个电影分镜画面：{action}。地点与时间：{location}。镜头语言：{camera}。画面需要明确的前景、中景和背景层次，人物动作清楚，光线服务于叙事，具有真实电影曝光和细腻质感，不出现文字、水印或多余人物。",
    },
];

export function ImageWorkflowPanel({ open, onClose, onRun, referenceCount }: { open: boolean; onClose: () => void; onRun: (prompt: string, workflowName: string) => void; referenceCount: number }) {
    const [selectedId, setSelectedId] = useState(imageWorkflowPresets[0].id);
    const [values, setValues] = useState<Record<string, string>>({});
    const selected = useMemo(() => imageWorkflowPresets.find((item) => item.id === selectedId) || imageWorkflowPresets[0], [selectedId]);
    const setWorkflow = (id: string) => {
        setSelectedId(id);
        setValues({});
    };
    const run = () => {
        const missing = selected.variables.find((variable) => !values[variable.key]?.trim());
        if (missing) return;
        const prompt = selected.prompt.replace(/\{(\w+)\}/g, (_, key: string) => values[key]?.trim() || "");
        onRun(prompt, selected.name);
    };

    return (
        <Drawer title="图片创作工作流" placement="right" width="min(760px, 94vw)" open={open} onClose={onClose} styles={{ body: { padding: 0 } }}>
            <div className="grid min-h-full lg:grid-cols-[220px_minmax(0,1fr)]">
                <aside className="border-b border-stone-200 p-4 dark:border-stone-800 lg:border-b-0 lg:border-r">
                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-400"><Layers3 className="size-3.5" /> 工作流模板</div>
                    <div className="space-y-2">
                        {imageWorkflowPresets.map((workflow) => <button key={workflow.id} type="button" onClick={() => setWorkflow(workflow.id)} className={`w-full rounded-xl border p-3 text-left transition ${selected.id === workflow.id ? "border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900" : "border-stone-200 hover:border-stone-400 dark:border-stone-800 dark:hover:border-stone-600"}`}><div className="text-sm font-semibold">{workflow.name}</div><div className={`mt-1 text-xs ${selected.id === workflow.id ? "text-white/65 dark:text-stone-600" : "text-stone-500 dark:text-stone-400"}`}>{workflow.category}</div></button>)}
                    </div>
                </aside>
                <section className="flex min-h-full flex-col p-5 sm:p-7">
                    <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-400"><Sparkles className="size-3.5" /> {selected.category}</div><h2 className="mt-2 text-2xl font-semibold">{selected.name}</h2><p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">{selected.description}</p></div>
                    <div className="mt-6 space-y-4">{selected.variables.map((variable) => <label key={variable.key} className="block"><span className="mb-1.5 block text-sm font-medium">{variable.label}</span>{variable.multiline ? <Input.TextArea autoSize={{ minRows: 3, maxRows: 7 }} value={values[variable.key] || ""} placeholder={variable.placeholder} onChange={(event) => setValues((current) => ({ ...current, [variable.key]: event.target.value }))} /> : <Input value={values[variable.key] || ""} placeholder={variable.placeholder} onChange={(event) => setValues((current) => ({ ...current, [variable.key]: event.target.value }))} />}</label>)}</div>
                    <div className="mt-5 flex flex-wrap items-center gap-2"><Tag color={referenceCount ? "blue" : "default"}>{referenceCount ? `将使用 ${referenceCount} 张参考图` : "未添加参考图"}</Tag><span className="text-xs text-stone-400">工作流会沿用当前工作台的模型、尺寸和生成张数设置。</span></div>
                    <div className="mt-auto pt-8"><Button type="primary" size="large" block icon={<ArrowRight />} disabled={selected.variables.some((variable) => !values[variable.key]?.trim())} onClick={run}>套用工作流并生成</Button></div>
                    {!selected.variables.length ? <Empty className="mt-8" /> : null}
                </section>
            </div>
        </Drawer>
    );
}
