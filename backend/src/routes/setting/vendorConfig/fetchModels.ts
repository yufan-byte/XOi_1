import { Router } from "express";
import axios from "axios";
import { fetchTextWithLimit } from "@/utils/safeUrl";
import u from "@/utils";

const router = Router();

// 模型分类关键词
const IMAGE_KEYWORDS = ["image", "img", "dall", "flux", "stable", "midjourney", "sd", "picture", "photo", "agnes-image"];
const VIDEO_KEYWORDS = ["video", "vid", "motion", "animate", "film", "movie", "clip", "agnes-video"];
const TTS_KEYWORDS = ["tts", "speech", "voice", "audio", "whisper"];

function classifyModel(modelId: string): "image" | "video" | "text" | "tts" {
  const id = modelId.toLowerCase();
  if (IMAGE_KEYWORDS.some((kw) => id.includes(kw))) return "image";
  if (VIDEO_KEYWORDS.some((kw) => id.includes(kw))) return "video";
  if (TTS_KEYWORDS.some((kw) => id.includes(kw))) return "tts";
  return "text";
}

router.post("/", async (req, res) => {
  try {
    const vendor = typeof req.body?.id === "string" ? await u.db("o_vendorConfig").where("id", req.body.id).first() : null;
    if (!vendor) return res.status(404).json({ message: "供应商不存在" });
    const inputs = JSON.parse(vendor.inputValues || "{}");
    const base_url = inputs.baseUrl;
    const api_key = inputs.apiKey;

    if (!base_url) {
      return res.status(400).json({ message: "请先填写请求地址" });
    }

    if (!api_key) {
      return res.status(400).json({ message: "请先填写 API Key" });
    }

    // 规范化地址
    let baseUrl = base_url.trim().replace(/\/+$/, "");

    // Respect the configured API prefix (for example /v1 or /api/v3).

    if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
      baseUrl = "https://" + baseUrl;
    }

    // 调用上游模型列表接口
    const url = `${baseUrl}/models`;
    const response = { data: JSON.parse(await fetchTextWithLimit(url, 2 * 1024 * 1024, { Authorization: `Bearer ${api_key}` })) };

    // 支持多种响应格式
    let items = response.data?.data;
    if (!items && response.data?.models) {
      items = response.data.models;
    }
    if (!items && response.data?.list) {
      items = response.data.list;
    }
    if (!Array.isArray(items)) {
      items = [];
    }

    const all: string[] = [];
    const image_models: string[] = [];
    const chat_models: string[] = [];
    const video_models: string[] = [];

    for (const model of items) {
      let id = "";
      if (typeof model === "string") {
        id = model;
      } else if (typeof model === "object" && model !== null) {
        id = model.id || model.name || model.model || "";
      }
      if (!id) continue;

      all.push(id);
      const category = classifyModel(id);

      switch (category) {
        case "image":
          image_models.push(id);
          break;
        case "video":
          video_models.push(id);
          break;
        case "tts":
          // TTS模型暂不处理
          break;
        default:
          chat_models.push(id);
      }
    }

    console.log(`拉取成功: ${all.length}个模型 (文本:${chat_models.length} 图片:${image_models.length} 视频:${video_models.length})`);

    res.json({
      total: all.length,
      image_models,
      chat_models,
      video_models,
      all,
      models: items,
    });
  } catch (error: any) {
    console.error("拉取模型列表失败:", error.message);

    // 提供更友好的错误信息
    let errorMsg = "拉取模型列表失败";
    if (error.response) {
      const status = error.response.status;
      if (status === 401) {
        errorMsg = "API Key无效，请检查";
      } else if (status === 404) {
        errorMsg = "模型列表地址不正确，请检查供应商的 API 路径";
      } else {
        errorMsg = `上游返回错误: ${status}`;
      }
    } else if (error.code === "ECONNREFUSED") {
      errorMsg = "无法连接到API服务器，请检查地址";
    } else if (error.code === "ETIMEDOUT") {
      errorMsg = "连接超时，请检查网络";
    } else {
      errorMsg = "请求失败，请检查上游地址和网络配置";
    }

    res.status(500).json({ message: errorMsg });
  }
});

export default router;
