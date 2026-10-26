import {
  DirectorInputError,
  type DirectorPlan,
  type DirectorScene,
} from "./directorSkills";

export function directorCanvasGraph(
  plan: DirectorPlan,
  scene: DirectorScene,
  projectName: string,
  reference?: { url: string; width: number; height: number },
) {
  const nodes: Array<{
      id: string;
      type: string;
      x: number;
      y: number;
      w: number;
      h: number;
      data: Record<string, unknown>;
    }> = [],
    edges: Array<{ s: string; t: string }> = [];
  const summary = crypto.randomUUID(),
    referenceId = reference ? crypto.randomUUID() : undefined;
  nodes.push({
    id: summary,
    type: "text",
    x: 64,
    y: 48,
    w: reference ? 1384 : 1060,
    h: 120,
    data: {
      label: "制作说明",
      content: `${projectName} · ${plan.shots.length} 个待制作镜头\n检查提示词 → 选择视频模型 → 确认费用后生成。${plan.shots.length > 1 ? "更多镜头在下方。" : ""}\n${reference ? "参考图是当前主摄像机白模截图，不是 AI 镜头方案的渲染；精确运镜请另上传预演录像。" : "未附白模参考；当前为文字提示词工作流，需要保留调度时请上传白模图或预演录像。"}`,
    },
  });
  if (reference && referenceId)
    nodes.push({
      id: referenceId,
      type: "image",
      x: 64,
      y: 220,
      w: 280,
      h: Math.min(420, (280 * reference.height) / reference.width),
      data: {
        label: "当前机位 · 白模参考",
        url: reference.url,
        mediaW: reference.width,
        mediaH: reference.height,
      },
    });
  const promptX = reference ? 384 : 64,
    configX = promptX + 480;
  const focusNodeIds: string[] = [
    summary,
    ...(referenceId ? [referenceId] : []),
  ];
  for (const [i, shot] of plan.shots.entries()) {
    const text = crypto.randomUUID(),
      config = crypto.randomUUID(),
      duration = shot.durationSeconds ?? scene.durationSeconds;
    if (!Number.isInteger(duration) || duration < 1 || duration > 60)
      throw new DirectorInputError("镜头时长无效，未带入画布");
    const label = `${String(i + 1).padStart(2, "0")} · ${shot.name}`;
    nodes.push({
      id: text,
      type: "text",
      x: promptX,
      y: 220 + i * 420,
      w: 440,
      h: 300,
      data: { label: label + " · 提示词", content: shot.prompt },
    });
    // The linked text is the sole prompt source; do not also duplicate it in config.prompt.
    nodes.push({
      id: config,
      type: "videoConfig",
      x: configX,
      y: 220 + i * 420,
      w: 560,
      h: 360,
      data: {
        label: label + " · 视频制作",
        duration,
        ratio: scene.aspectRatio,
      },
    });
    edges.push({ s: text, t: config });
    if (referenceId) edges.push({ s: referenceId, t: config });
    if (i === 0) focusNodeIds.push(text, config);
  }
  return {
    title: `${projectName} · 镜头制作`,
    source: "director3d",
    nodes,
    edges,
    focusNodeIds,
  };
}

/** One confirmed shot, immutable source identity; the optional video is the same version. */
export function directorReferenceGraph(
  reference: import("./directorProject").DirectorReferenceProject,
  image: { url: string; width: number; height: number },
  prompt?: string,
  video?: import("./directorPreviz").DirectorPrevizAsset,
) {
  const { link } = reference,
    root = `director-${crypto.randomUUID()}`,
    photo = `reference-${crypto.randomUUID()}`,
    text = `prompt-${crypto.randomUUID()}`,
    config = `config-${crypto.randomUUID()}`,
    clip = `previz-${crypto.randomUUID()}`;
  const source = {
    sceneId: link.sceneId,
    shotId: link.shotId,
    revision: link.revision,
    frame: link.frame,
  };
  const shotPrompt =
    prompt?.trim() ||
    `${link.shotName}。根据白模参考的构图安排画面，补充角色外观与场景风格。${video ? "预演视频用于表达机位与人物运动；实际遵循程度取决于所选模型。" : `当前参考为第 ${link.frame} 帧静态截图；运动需补充预演录像，不代表精确轨迹控制。`}`;
  const nodes: Array<{
    id: string;
    type: string;
    x: number;
    y: number;
    w: number;
    h: number;
    data: Record<string, unknown>;
  }> = [
    {
      id: root,
      type: "director",
      x: 64,
      y: 100,
      w: 380,
      h: 340,
      data: {
        // 画布上这张卡代表的是「导演台」，不是「一个镜头节点」：
        // 镜头名/时长/版本由卡片内容自己展示（见 canvas-director-node-panel）。
        // 之前这里用 link.shotName，画布上就出现「镜头 01」和「导演台」两个并列节点，
        // 看起来像两件不相关的东西。
        label: "导演台",
        directorProject: reference,
        directorSource: source,
        url: image.url,
      },
    },
    {
      id: photo,
      type: "image",
      x: 500,
      y: 100,
      w: 320,
      h: Math.min(300, (320 * image.height) / image.width),
      data: {
        label: `构图参考 · 第 ${link.frame} 帧 · v${link.revision}`,
        url: image.url,
        mediaW: image.width,
        mediaH: image.height,
        directorSource: source,
        referenceRole: "composition",
      },
    },
    {
      id: text,
      type: "text",
      x: 500,
      y: video ? 700 : 440,
      w: 440,
      h: 220,
      data: {
        label: "镜头制作说明",
        content: shotPrompt,
        directorSource: source,
      },
    },
    {
      id: config,
      type: "videoConfig",
      x: 1020,
      y: 100,
      w: 560,
      h: 360,
      data: {
        label: "选择模型后生成",
        duration: link.durationSeconds,
        ratio: link.aspectRatio,
        directorSource: source,
      },
    },
  ];
  const edges = [
    { s: root, t: photo },
    { s: photo, t: config },
    { s: text, t: config },
  ];
  if (video) {
    nodes.push({
      id: clip,
      type: "video",
      x: 500,
      y: 360,
      w: 440,
      h: Math.min(330, (440 * video.height) / video.width),
      data: {
        label: `运镜参考 · ${video.durationSeconds.toFixed(1)} 秒 · v${link.revision}`,
        url: video.url,
        mediaW: video.width,
        mediaH: video.height,
        duration: video.durationSeconds,
        durationMs: Math.round(video.durationSeconds * 1000),
        mimeType: video.mimeType,
        referenceRole: "motion",
        directorSource: source,
        previz: {
          requestId: video.requestId,
          fps: video.fps,
          frameCount: video.frameCount,
          codec: video.codec,
        },
      },
    });
    edges.push({ s: root, t: clip }, { s: clip, t: config });
  }
  return {
    title: `${link.sceneName} · ${link.shotName}`,
    source: "director3d",
    referenceId: `${link.sceneId}:${link.shotId}:${link.revision}:${link.frame}${video ? ":video" : ""}`,
    focusNodeIds: nodes.map((n) => n.id),
    nodes,
    edges,
  };
}
