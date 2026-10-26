export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f5f6f7",
            dot: "rgba(88,99,116,.38)",
            line: "rgba(88,99,116,.14)",
            selectionStroke: "#1c1917",
            selectionFill: "rgba(28,25,23,.06)",
        },
        node: {
            label: "#545c68",
            fill: "#f0f1f3",
            panel: "#ffffff",
            stroke: "#e3e5e8",
            activeStroke: "#1c1917",
            placeholder: "#8b9099",
            text: "#252932",
            muted: "#737b87",
            faint: "#9ba1aa",
        },
        toolbar: {
            panel: "rgba(255,255,255,.94)",
            border: "#e3e5e8",
            item: "#545c68",
            itemHover: "#f0f1f3",
            activeBg: "#f0f1f3",
            activeText: "#252932",
        },
    },
    dark: {
        canvas: {
            background: "#181715",
            dot: "rgba(245,245,244,.24)",
            line: "rgba(245,245,244,.10)",
            selectionStroke: "#fafaf9",
            selectionFill: "rgba(250,250,249,.10)",
        },
        node: {
            label: "#d6d3d1",
            fill: "#292524",
            panel: "#1f1d1a",
            stroke: "#44403c",
            activeStroke: "#fafaf9",
            placeholder: "#a8a29e",
            text: "#f5f5f4",
            muted: "#d6d3d1",
            faint: "#78716c",
        },
        toolbar: {
            panel: "rgba(31,29,26,.96)",
            border: "#44403c",
            item: "#d6d3d1",
            itemHover: "#292524",
            activeBg: "#3a3631",
            activeText: "#f5f5f4",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
