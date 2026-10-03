import express from "express";
import u from "@/utils";
import { success, error } from "@/lib/responseFormat";
import { assertAllowedVendor, getUserGatewayCredentials } from "@/lib/gateway/newapi";
import fs from "fs";
import path from "path";
import isPathInside from "is-path-inside";

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

// 模型选择由管理员统一配置，凭据按当前 new-api 用户动态取得。
async function getAiConfig(userId: number, requestedModel?: unknown): Promise<{ baseUrl: string; apiKey: string; model: string } | null> {
  const agentConfig = await u.db("o_agentDeploy").where("key", "universalAi").first();
  if (!agentConfig) return null;
  const configured = String(agentConfig.modelName || agentConfig.model || "").trim();
  if (!configured) return null;
  const separator = configured.indexOf(":");
  const vendorId = separator >= 0 ? configured.slice(0, separator) : String(agentConfig.vendorId || "newapi");
  let model = separator >= 0 ? configured.slice(separator + 1) : configured;
  assertAllowedVendor(vendorId);
  if (vendorId !== "newapi") throw new Error("AI 助手必须配置为 NewAPI 模型");
  if (requestedModel) {
    const requested = String(requestedModel).trim();
    const requestedSeparator = requested.indexOf(":");
    const requestedVendor = requestedSeparator >= 0 ? requested.slice(0, requestedSeparator) : "";
    const requestedName = requestedSeparator >= 0 ? requested.slice(requestedSeparator + 1) : requested;
    if (requestedVendor !== "newapi" || !requestedName) throw new Error("所选模型不是 NewAPI 可用模型");
    const available = await u.vendor.getModelList("newapi");
    if (!available.some((item: any) => String(item?.modelName || "") === requestedName && item?.type === "text")) {
      throw new Error("所选模型当前不可用，请重新选择");
    }
    model = requestedName;
  }
  const credentials = await getUserGatewayCredentials(userId);
  return { ...credentials, model };
}

// 流式对话接口
router.post("/stream", async (req, res) => {
  const { content, messages = [], skills = [], model: requestedModel } = req.body;
  const userId = (req as any).user?.id;

  if (!content) {
    return res.status(400).json(error("内容不能为空"));
  }

  const aiConfig = await getAiConfig(Number(userId), requestedModel);
  if (!aiConfig) {
    return res.status(400).json(error("未配置AI模型，请联系管理员在设置中配置供应商和Agent"));
  }

  const { baseUrl, apiKey, model } = aiConfig;

  // 构建消息列表
  const skillsContext = await buildSkillsContext(skills);
  const apiMessages: Message[] = [
    {
      role: "system",
      content: "你是XOi，一个智能创作助手。不要提及你是Agnes或Sapiens AI。你可以帮用户生成剧本、创作故事、分析内容。请用中文回复。回复要简洁直接，不要自我介绍。" + skillsContext,
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
        stream: true,
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

    // 设置 SSE 头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = response.body?.getReader();
    if (!reader) {
      return res.status(500).json(error("无法读取响应流"));
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === "") continue;
          if (trimmed === "data: [DONE]") {
            res.write("data: [DONE]\n\n");
            continue;
          }
          if (trimmed.startsWith("data: ")) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (e: any) {
      console.error("[aiAssistant] 流读取错误:", e.message);
    }

    res.end();
  } catch (e: any) {
    console.error("[aiAssistant] 请求错误:", e.message);
    if (!res.headersSent) {
      res.status(500).json(error(`请求失败: ${e.message}`));
    }
  }
});

// 非流式对话接口（备用）
router.post("/", async (req, res) => {
  const { content, messages = [], model: requestedModel } = req.body;
  const userId = (req as any).user?.id;

  if (!content) {
    return res.status(400).json(error("内容不能为空"));
  }

  const aiConfig = await getAiConfig(Number(userId), requestedModel);
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
