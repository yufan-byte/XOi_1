import express from "express";
import u from "@/utils";
import { success, error } from "@/lib/responseFormat";
import { getUserPoints, getActionPoints, deductPoints } from "@/utils/points";
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

// 从数据库获取 AI 配置（管理员配置的全局共享）
async function getAiConfig(): Promise<{ baseUrl: string; apiKey: string; model: string } | null> {
  const agentConfig = await u.db("o_agentDeploy").where("key", "universalAi").first();
  if (!agentConfig || !agentConfig.model || !agentConfig.vendorId) {
    return null;
  }

  const vendor = await u.db("o_vendorConfig").where("id", agentConfig.vendorId).first();
  if (!vendor) return null;

  const inputValues = JSON.parse(vendor.inputValues || "{}");
  if (!inputValues.apiKey) return null;

  // modelName 格式为 "vendorId:modelName"，需要提取冒号后面的部分
  const modelName = agentConfig.modelName || "gpt-4o-mini";
  const actualModel = modelName.includes(":") ? modelName.split(":")[1] : modelName;

  return {
    baseUrl: inputValues.baseUrl || "https://api.openai.com/v1",
    apiKey: inputValues.apiKey,
    model: actualModel,
  };
}

// 流式对话接口
router.post("/stream", async (req, res) => {
  const { content, messages = [], skills = [] } = req.body;
  const userId = (req as any).user?.id;

  if (!content) {
    return res.status(400).json(error("内容不能为空"));
  }

  // 检查积分是否足够（不扣分，只检查）
  if (userId) {
    const current = await getUserPoints(userId);
    const required = await getActionPoints("text_generate");
    if (required > 0 && current < required) {
      return res.status(400).json(error(`积分不足，当前余额: ${current}，需要: ${required}`));
    }
  }

  // 从数据库读取管理员配置的 API Key
  const aiConfig = await getAiConfig();
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
      // API 失败，不扣分
      const statusMsg: Record<number, string> = {
        401: "API Key 无效，请联系管理员",
        403: "API 访问被拒绝",
        429: "AI 服务请求过于频繁，请稍后再试",
        503: "AI 服务暂时不可用，请稍后再试",
      };
      return res.status(response.status).json(error(statusMsg[response.status] || `API请求失败: ${response.status}`));
    }

    // API 调用成功，现在扣积分
    let deductInfo: { deducted: boolean; points: number; balance: number } | null = null;
    if (userId) {
      const required = await getActionPoints("text_generate");
      if (required > 0) {
        await deductPoints(userId, "text_generate", "AI对话");
        const newBalance = await getUserPoints(userId);
        deductInfo = { deducted: true, points: required, balance: newBalance };
      }
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

    // 发送扣费信息（作为第一条 SSE 事件）
    if (deductInfo) {
      res.write(`data: ${JSON.stringify({ pointsDeducted: deductInfo.points, balance: deductInfo.balance })}\n\n`);
    }

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
  const { content, messages = [] } = req.body;
  const userId = (req as any).user?.id;

  if (!content) {
    return res.status(400).json(error("内容不能为空"));
  }

  // 检查积分是否足够（不扣分，只检查）
  if (userId) {
    const current = await getUserPoints(userId);
    const required = await getActionPoints("text_generate");
    if (required > 0 && current < required) {
      return res.status(400).json(error(`积分不足，当前余额: ${current}，需要: ${required}`));
    }
  }

  const aiConfig = await getAiConfig();
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
      // API 失败，不扣分
      const statusMsg: Record<number, string> = {
        401: "API Key 无效，请联系管理员",
        403: "API 访问被拒绝",
        429: "AI 服务请求过于频繁，请稍后再试",
        503: "AI 服务暂时不可用，请稍后再试",
      };
      return res.status(response.status).json(error(statusMsg[response.status] || `API请求失败: ${response.status}`));
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "";

    // API 成功，扣积分
    let deductInfo = null;
    if (userId) {
      const required = await getActionPoints("text_generate");
      if (required > 0) {
        await deductPoints(userId, "text_generate", "AI对话");
        const newBalance = await getUserPoints(userId);
        deductInfo = { pointsDeducted: required, balance: newBalance };
      }
    }

    res.json(success({ content: reply, ...deductInfo }));
  } catch (e: any) {
    console.error("[aiAssistant] 请求错误:", e.message);
    res.status(500).json(error(`请求失败: ${e.message}`));
  }
});

export default router;
