import type { ReactNode } from "react";
import { Button, Dropdown, Popover, Segmented, Switch, Tooltip } from "antd";
import { Clapperboard, Eraser, FolderOpen, Globe2, Image as ImageIcon, Library, MoreHorizontal, Music2, Palette, Settings2, Trash2, Type, Upload, Video } from "lucide-react";

import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type Props = {
    selectedCount: number;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onAddText: () => void;
    onAddPanorama: () => void;
    onAddDirector: () => void;
    onAddConfig: () => void;
    onUpload: () => void;
    onDelete: () => void;
    onClear: () => void;
    onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
    onShowImageInfoChange: (show: boolean) => void;
    onOpenAssetLibrary: () => void;
    onOpenMyAssets: () => void;
};

/** 常用创作工具常驻；扩展能力集中在更多菜单，仍复用原来的画布操作。 */
export function CanvasToolbar(props: Props) {
    const colorTheme = useThemeStore(state => state.theme);
    const setTheme = useThemeStore(state => state.setTheme);
    const theme = canvasThemes[colorTheme];
    const appearance = <div className="w-60 space-y-4 p-1" style={{ color: theme.node.text }}>
        <div className="text-sm font-medium">画布外观</div>
        <label className="block space-y-2"><span className="text-xs" style={{ color: theme.node.muted }}>主题</span>
            <Segmented block value={colorTheme} onChange={value => setTheme(value as "light" | "dark")} options={[{ label: "浅色", value: "light" }, { label: "深色", value: "dark" }]} />
        </label>
        <label className="block space-y-2"><span className="text-xs" style={{ color: theme.node.muted }}>背景</span>
            <Segmented block value={props.backgroundMode} onChange={value => props.onBackgroundModeChange(value as CanvasBackgroundMode)} options={[{ label: "点阵", value: "dots" }, { label: "网格", value: "lines" }, { label: "纯色", value: "blank" }]} />
        </label>
        <div className="flex items-center justify-between text-xs"><span>显示图片信息</span><Switch size="small" checked={props.showImageInfo} onChange={props.onShowImageInfoChange} /></div>
    </div>;

    return <nav aria-label="画布创作工具" className="absolute left-4 top-1/2 z-50 -translate-y-1/2" onPointerDown={event => event.stopPropagation()}>
        <div className="thin-scrollbar flex max-h-[calc(100dvh-168px)] flex-col items-center gap-1 overflow-y-auto rounded-2xl border p-1.5 backdrop-blur-xl [&>*]:shrink-0" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, boxShadow: colorTheme === "dark" ? "0 4px 24px #0003" : "0 4px 24px #20293808" }}>
            <Tool label="文本" onClick={props.onAddText}><Type /></Tool>
            <Tool label="图片" onClick={props.onAddImage}><ImageIcon /></Tool>
            <Tool label="视频" onClick={props.onAddVideo}><Video /></Tool>
            <Tool label="音频" onClick={props.onAddAudio}><Music2 /></Tool>
            <Tool label="导演台" onClick={props.onAddDirector}><Clapperboard /></Tool>
            <div className="my-1 h-px w-6" style={{ background: theme.toolbar.border }} />
            <Tool label="我的素材" onClick={props.onOpenMyAssets}><FolderOpen /></Tool>
            <Tool label="上传素材" onClick={props.onUpload}><Upload /></Tool>
            <Popover trigger="click" placement="rightBottom" arrow={false} content={appearance} styles={{ container: { background: theme.node.panel, border: `1px solid ${theme.toolbar.border}`, borderRadius: 16 } }}>
                <span><Tool label="画布外观"><Palette /></Tool></span>
            </Popover>
            <Dropdown trigger={["click"]} placement="bottomLeft" menu={{ items: [
                { key: "config", icon: <Settings2 size={16} />, label: "生成配置", onClick: props.onAddConfig },
                { key: "panorama", icon: <Globe2 size={16} />, label: "全景图", onClick: props.onAddPanorama },
                { key: "library", icon: <Library size={16} />, label: "素材库", onClick: props.onOpenAssetLibrary },
                { type: "divider" },
                { key: "delete", icon: <Trash2 size={16} />, label: "删除选中", disabled: !props.selectedCount, danger: true, onClick: props.onDelete },
                { key: "clear", icon: <Eraser size={16} />, label: "清空画布", danger: true, onClick: props.onClear },
            ] }}>
                <span><Tool label="更多工具"><MoreHorizontal /></Tool></span>
            </Dropdown>
        </div>
    </nav>;
}

function Tool({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) {
    const theme = canvasThemes[useThemeStore(state => state.theme)];
    return <Tooltip title={label} placement="right" mouseEnterDelay={0.25}>
        <Button type="text" aria-label={label} className="!flex !size-10 !min-w-10 !items-center !justify-center !rounded-xl !p-0 [&_svg]:size-5 [&_svg]:stroke-[1.7]" style={{ color: theme.node.text }} onClick={onClick} icon={children} />
    </Tooltip>;
}
