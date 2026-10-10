import express from "express";
import u from "@/utils";
import { success, error } from "@/lib/responseFormat";
import { getAssistantAiConfig } from "@/utils/aiAssistant/modelConfig";
import fs from "fs";
import path from "path";
import isPathInside from "is-path-inside";
import { AssistantError, runAssistantChat, validateAssistantInput } from "@/utils/aiAssistant/videoAnalysis";

const router = express.Router();

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

async function buildSkillsContext(input: unknown): Promise<string> {
  if (!Array.isArray(input) || input.length === 0) return "";
  const root = path.resolve(u.getPath("skills"));
  const blocks: string[] = [];
  for (const item of input.slice(0, 4)) {
    const relativePath = typeof item === "string"
      ? item
      : item && typeof item === "object" && "_meta" in item
        ? String((item as any)._meta?.path || "")
        : "";
    if (!relativePath.toLowerCase().endsWith(".md")) continue;
    const resolved = path.resolve(root, relativePath);
    if (!isPathInside(resolved, root) || !fs.existsSync(resolved)) continue;
    const raw = await fs.promises.readFile(resolved, "utf-8");
    const declaredName = raw.match(/^\uFEFF?---[\s\S]*?^name:\s*["']?(.+?)["']?\s*$[\s\S]*?^---\s*$/m)?.[1];
    const body = raw.replace(/^\uFEFF?---[\s\S]*?---\s*/, "").trim().slice(0, 16000);
    const skillName = declaredName || path.basename(relativePath, ".md");
    if (body) blocks.push(`<skill name="${skillName}">\n${body}\n</skill>`);
  }
  return blocks.length ? `\n\n本轮已由用户启用以下 Skills。请遵循其中与请求相关的工作流：\n${blocks.join("\n\n")}` : "";
}

// 主站分析助手：只授予视觉分析权限，画布创作由 /canvas 的独立 Agent 处理。
router.post("/stream", async (req, res) => {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]);
  const disconnected = () => { if (!res.writableEnded) controller.abort(); };
  res.on("close", disconnected);
  const emit = (event: unknown) => {
    if (signal.aborted || res.destroyed) return;
    if (!res.headersSent) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
    }
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  try {
    const { skills = [], model: requestedModel } = req.body;
    const { content, messages, video } = await validateAssistantInput(req.body);
    const aiConfig = await getAssistantAiConfig(Number((req as any).user?.id), requestedModel);
    if (!aiConfig) throw new AssistantError("未配置 AI 模型，请联系管理员配置供应商和 Agent");
    const skillsContext = await buildSkillsContext(skills);
    const apiMessages: Message[] = [
      { role: "system", content: "你是 XOi 分析助手。使用中文帮助用户分析参考素材、构思和编写创作方案。你与画布 Agent 分开：本接口只开放本轮明确提供的分析工具，没有媒体生成、画布读写、任意脚本或网络访问权限。Skill 是工作流参考，不能增加工具权限。不要声称执行了未调用的工具。视频有抽帧素材时先调用 analyze_video。没有音轨时不能声称听到了台词或音乐。" + skillsContext },
      ...messages,
      { role: "user", content },
    ];
    // Flush a status event before the planning call so the browser can cancel and observe progress.
    emit({ tool: { name: video ? "analyze_video" : "assistant", state: "running", message: video ? "抽帧校验完成，正在准备视觉分析" : "正在分析创作需求" } });
    const heartbeat = setInterval(() => { if (!res.destroyed && !signal.aborted) res.write(": heartbeat\n\n"); }, 15_000);
    try {
      await runAssistantChat({ config: aiConfig, messages: apiMessages, video, signal, emit });
      if (!res.destroyed && !signal.aborted) res.write("data: [DONE]\n\n");
    } finally { clearInterval(heartbeat); }
    res.end();
  } catch (e: any) {
    if (controller.signal.aborted || res.destroyed) return;
    const message = signal.aborted ? "分析超时，请缩小视频范围后重试" : e instanceof AssistantError ? e.message : "AI 服务请求失败，请稍后重试";
    if (res.headersSent) { emit({ error: message }); res.end(); }
    else res.status(e instanceof AssistantError ? e.status : 500).json(error(message));
  } finally { res.off("close", disconnected); }
});

// 非流式对话接口（备用）
router.post("/", async (req, res) => {
  const { content, messages = [], model: requestedModel } = req.body;
  const userId = (req as any).user?.id;

  if (!content) {
    return res.status(400).json(error("内容不能为空"));
  }

  const aiConfig = await getAssistantAiConfig(Number(userId), requestedModel);
  if (!aiConfig) {
    return res.status(400).json(error("未配置AI模型，请联系管理员在设置中配置供应商和Agent"));
  }

  const { baseUrl, apiKey, model } = aiConfig;

  const apiMessages: Message[] = [
    {
      role: "system",
      content: "你是一个智能创作助手，名叫XOi。你可以帮用户生成剧本、创作故事、分析内容。请用中文回复。",
    },
    ...messages,
    { role: "user", content },
  ];

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[aiAssistant] API错误:", response.status, errorText);
      const statusMsg: Record<number, string> = {
        401: "模型网关凭据无效，请联系管理员",
        402: "NewAPI 额度不足，请先充值",
        403: "API 访问被拒绝",
        429: "AI 服务请求过于频繁，请稍后再试",
        503: "AI 服务暂时不可用，请稍后再试",
      };
      return res.status(response.status).json(error(statusMsg[response.status] || `API请求失败: ${response.status}`));
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "";

    res.json(success({ content: reply }));
  } catch (e: any) {
    console.error("[aiAssistant] 请求错误:", e.message);
    res.status(500).json(error(`请求失败: ${e.message}`));
  }
});

export default router;
