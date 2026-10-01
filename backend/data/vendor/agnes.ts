/**
 * Agnes AI 供应商模板
 * @version 1.1
 *
 * 兼容 OpenAI 格式
 * Base URL: https://api.agnes-ai.cn/v1
 * 认证: Authorization: Bearer YOUR_API_KEY
 */

declare const exports: any;
declare const createOpenAICompatible: any;
declare const axios: any;
declare const urlToBase64: (url: string) => Promise<string>;
declare const pollTask: (fn: () => Promise<{ completed: boolean; data?: string; error?: string }>, interval?: number, timeout?: number) => Promise<{ completed: boolean; data?: string; error?: string }>;

const vendor = {
  id: "agnes",
  version: "1.1",
  name: "Agnes AI",
  author: "XOi",
  description: "Agnes AI 供应商，支持文本、图像、视频生成。兼容 OpenAI 格式。\n\n[官方文档](https://www.agnes-ai.cn/zh-Hans/docs/overview)",
  inputs: [
    { key: "apiKey", label: "API Key", type: "password", required: true, placeholder: "请输入 Agnes AI API Key" },
    { key: "baseUrl", label: "Base URL", type: "url", required: true, placeholder: "https://api.agnes-ai.cn/v1" },
  ],
  inputValues: { apiKey: "", baseUrl: "https://api.agnes-ai.cn/v1" },
  models: [
    { name: "agnes-2.5-flash", modelName: "agnes-2.5-flash", type: "text", think: false },
    { name: "agnes-2.5-pro-alpha", modelName: "agnes-2.5-pro-alpha", type: "text", think: false },
    { name: "agnes-image-2.1-flash", modelName: "agnes-image-2.1-flash", type: "image", mode: ["text"] },
    { name: "agnes-video-v2.0", modelName: "agnes-video-v2.0", type: "video", mode: ["singleImage", "text"], audio: false, durationResolutionMap: [{ duration: [5], resolution: ["1280x720"] }] },
  ],
};

// 文本请求
const textRequest = (model: any) => {
  if (!vendor.inputValues.apiKey) throw new Error("缺少 API Key");
  return createOpenAICompatible({
    baseURL: vendor.inputValues.baseUrl,
    apiKey: vendor.inputValues.apiKey,
  }).chatModel(model.modelName);
};

// 图片生成请求
const imageRequest = async (config: any, model: any) => {
  if (!vendor.inputValues.apiKey) throw new Error("缺少 API Key");

  const baseUrl = vendor.inputValues.baseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/images/generations`;

  const response = await axios.post(
    url,
    {
      model: model.modelName,
      prompt: config.prompt,
      n: 1,
      size: config.size || "1024x1024",
    },
    {
      headers: {
        Authorization: `Bearer ${vendor.inputValues.apiKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  const imageUrl = response.data?.data?.[0]?.url;
  if (!imageUrl) throw new Error("图片生成失败，未返回URL");

  return await urlToBase64(imageUrl);
};

// 视频生成请求（异步任务模式）
const videoRequest = async (config: any, model: any) => {
  if (!vendor.inputValues.apiKey) throw new Error("缺少 API Key");
  if (!vendor.inputValues.baseUrl) throw new Error("缺少 Base URL配置");

  // 去掉末尾的 /v1 和斜杠，避免拼接时出现 /v1/v1
  const baseUrl = vendor.inputValues.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  const headers = {
    Authorization: `Bearer ${vendor.inputValues.apiKey}`,
    "Content-Type": "application/json",
  };

  // Agnes 新版视频接口不接受旧版 num_frames/frame_rate 字段；时长由模型默认值/接口策略处理。
  // 构建请求参数时只发送接口允许的核心字段，避免在提交阶段直接 400。
  const modelName = String(model.modelName || "").toLowerCase();
  const isVideo25 = modelName.includes("agnes-video-2.5");
  const hasReference = Boolean(config.imageBase64?.[0]);
  const body: any = {
    model: model.modelName,
    prompt: config.prompt,
    // v2.0 与 2.5 使用不同枚举：v2.0 为 ti2vid；2.5 系列为 text/reference。
    mode: isVideo25 ? (hasReference ? "reference" : "text") : "ti2vid",
  };

  // 图生视频：base64 转 data URI
  if (config.imageBase64?.[0]) {
    const img = config.imageBase64[0];
    const imageData = img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`;
    if (isVideo25) body.images = [imageData];
    else body.image = imageData;
  }

  // 1. 创建视频任务；把 Agnes 的 JSON 错误带回任务状态，避免前端只看到笼统的 500。
  let createResp: any;
  try {
    createResp = await axios.post(`${baseUrl}/v1/videos`, body, { headers });
  } catch (error: any) {
    const detail = error?.response?.data;
    const suffix = detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : "";
    throw new Error(`Agnes 视频任务创建失败 (HTTP ${error?.response?.status || "网络错误"})${suffix}`);
  }
  const taskId = createResp.data?.task_id || createResp.data?.id;
  if (!taskId) throw new Error("视频任务创建失败，未返回 task_id");

  // 2. 轮询等待任务完成
  let videoId = createResp.data?.video_id;
  console.log("[agnes] 创建任务成功, taskId:", taskId, "videoId:", videoId);

  const result = await pollTask(async () => {
    let queryResp: any;
    try {
      queryResp = await axios.get(`${baseUrl}/v1/videos/${taskId}`, { headers });
    } catch (error: any) {
      const detail = error?.response?.data;
      const suffix = detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : "";
      return { completed: true, error: `Agnes 视频任务查询失败 (HTTP ${error?.response?.status || "网络错误"})${suffix}` };
    }
    const data = queryResp.data;
    const status = data?.status;
    if (data?.video_id) videoId = data.video_id;

    if (status === "completed") return { completed: true };
    if (status === "failed") {
      return { completed: true, error: `视频生成失败: ${data?.error?.message || JSON.stringify(data?.error) || "未知错误"}` };
    }
    return { completed: false };
  }, 5000, 600000);

  if (result.error) throw new Error(result.error);

  // 3. 用 video_id 获取视频 URL
  if (!videoId) throw new Error("未获取到 video_id");
  console.log("[agnes] 任务完成, videoId:", videoId);
  const videoResp = await axios.get(`${baseUrl}/agnesapi?video_id=${videoId}`, { headers });
  console.log("[agnes] /agnesapi 响应:", JSON.stringify(videoResp.data));
  // URL 可能在顶层 url 或 metadata.url
  const videoUrl = videoResp.data?.url || videoResp.data?.metadata?.url;
  console.log("[agnes] 提取的 videoUrl:", videoUrl);
  if (!videoUrl) throw new Error(`获取视频URL失败，响应: ${JSON.stringify(videoResp.data)}`);

  console.log("[agnes] 开始下载视频:", videoUrl);
  return await urlToBase64(videoUrl);
};

const ttsRequest = async (config: any, model: any) => "";

exports.vendor = vendor;
exports.textRequest = textRequest;
exports.imageRequest = imageRequest;
exports.videoRequest = videoRequest;
exports.ttsRequest = ttsRequest;

export {};
