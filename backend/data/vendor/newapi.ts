/**
 * XOi AI 供应商 - new-api 统一网关
 * @version 2.0
 *
 * ============================================================
 * 这个文件完全照造物引擎的实现来（不搞版本兼容分支）
 * ============================================================
 * 依据是造物自己的源码，不是猜的：
 *   · src/lib/llm.ts              图片 / 视频的实际发请求代码
 *   · src/app/video/page.tsx      视频参数拼装
 *   · src/app/image/page.tsx      图片参数拼装（size 与 resolution 的真正来源）
 *   · src/lib/image-size.ts       ★ 比例 × 清晰度 → 像素串 的权威白名单表
 *   · src/data/api-docs.ts        端点的权威参数表
 *   · src/components/api-docs/model-detail.tsx
 *         「模型卡的 aspect_ratio → size 像素串」
 *         「模型卡的 duration → seconds, resolution / aspect_ratio 原样发（别拼 size 像素串）,
 *           首帧 → input_reference, 多图 → images[]」
 *         注：该文件还写着「resolution 2K/4K → quality:"high"」，那是**过时文案**，
 *         与 src/app/image/page.tsx 的实现相反，不要跟（见下方 ⚠️ 图片清晰度）。
 *
 * ┌──────────┬──────────────────────────────────────────────────────┐
 * │ 文本      │ POST /v1/chat/completions（OpenAI 兼容）              │
 * │ 图片      │ POST /v1/images/generations  同步返回 data[0].url    │
 * │ 视频      │ POST /v1/videos  异步 → 轮询 GET /v1/videos/{id}     │
 * │           │ → GET /v1/videos/{id}/content 下载 mp4 二进制         │
 * │ 语音      │ POST /v1/audio/speech  同步二进制                    │
 * └──────────┴──────────────────────────────────────────────────────┘
 *
 * ⚠️ 视频只有 /v1/videos 这一个入口。造物的文档里明确写着
 *    `/v1/tasks/{id}`、`/v1/media/generate` 都**不存在**，别去试。
 * ⚠️ 视频清晰度用 resolution（取模型卡的枚举），**不要自己拼 size 像素串** ——
 *    很多线路固定只出一种清晰度，发像素串上游反推对不上会直接 400。
 *
 * ============================================================
 * 计费铁律
 * ============================================================
 * 推理请求由后端在运行时注入**当前用户专属令牌**，new-api 直接扣该用户额度。
 * 后台配置里的管理令牌只用于管理员手动同步模型列表，不参与用户推理。
 */

// ============================================================
// 类型定义（vm 沙箱里不能 import，全部就地声明）
// ============================================================
type VideoMode =
  | "singleImage"
  | "startEndRequired"
  | "endFrameOptional"
  | "startFrameOptional"
  | "text"
  | (`videoReference:${number}` | `imageReference:${number}` | `audioReference:${number}`)[];

interface TextModel {
  name: string;
  modelName: string;
  type: "text";
  think: boolean;
}

interface ImageModel {
  name: string;
  modelName: string;
  type: "image";
  mode: ("text" | "singleImage" | "multiReference")[];
  associationSkills?: string;
}

interface VideoModel {
  name: string;
  modelName: string;
  type: "video";
  mode: VideoMode[];
  associationSkills?: string;
  audio: "optional" | false | true;
  durationResolutionMap: { duration: number[]; resolution: string[] }[];
}

interface TTSModel {
  name: string;
  modelName: string;
  type: "tts";
  voices: { title: string; voice: string }[];
}

interface VendorConfig {
  id: string;
  version: string;
  name: string;
  author: string;
  description?: string;
  icon?: string;
  inputs: { key: string; label: string; type: "text" | "password" | "url"; required: boolean; placeholder?: string }[];
  inputValues: Record<string, string>;
  models: (TextModel | ImageModel | VideoModel | TTSModel)[];
}

type RefItem = { type: "image" | "audio" | "video"; base64: string };

interface ImageConfig {
  prompt: string;
  /** 平台传的是 referenceList（version >= 2.0）；老模板收到 imageBase64。两个都兼容。 */
  referenceList?: RefItem[];
  imageBase64?: string[];
  size: "1K" | "2K" | "4K";
  aspectRatio: `${number}:${number}`;
}

interface VideoConfig {
  duration: number;
  resolution: string;
  aspectRatio: string;
  prompt: string;
  referenceList?: RefItem[];
  imageBase64?: string[];
  audio?: boolean;
  mode: VideoMode[] | VideoMode;
}

interface TTSConfig {
  text: string;
  voice: string;
  speechRate: number;
  pitchRate: number;
  volume: number;
}

interface PollResult {
  completed: boolean;
  data?: string;
  error?: string;
}

// ============================================================
// 全局声明（由 backend/src/utils/vm.ts 注入）
// ============================================================
declare const axios: any;
declare const logger: (msg: string) => void;
declare const Buffer: any;
declare const createOpenAICompatible: any;
declare const pollTask: (fn: () => Promise<PollResult>, interval?: number, timeout?: number) => Promise<PollResult>;
declare const exports: {
  vendor: VendorConfig;
  textRequest: (m: TextModel, t: boolean, tl: 0 | 1 | 2 | 3) => any;
  imageRequest: (c: ImageConfig, m: ImageModel) => Promise<string>;
  videoRequest: (c: VideoConfig, m: VideoModel) => Promise<string>;
  ttsRequest: (c: TTSConfig, m: TTSModel) => Promise<string>;
  fetchModels?: () => Promise<{ text: string[]; image: string[]; video: string[] }>;
  checkForUpdates?: () => Promise<{ hasUpdate: boolean; latestVersion: string; notice: string }>;
  updateVendor?: () => Promise<string>;
};

function log(msg: string) {
  try {
    if (typeof logger === "function") logger(msg);
  } catch {
    /* 忽略 */
  }
}

// ============================================================
// 供应商配置
// ============================================================
const vendor: VendorConfig = {
  id: "newapi",
  version: "2.0",
  author: "XOi",
  name: "new-api 统一网关",
  description: "全部模型调用统一下沉到 new-api 网关：文本 / 图片 / 视频 / 语音。计费、渠道、倍率、限流全部复用网关侧能力。",
  icon: "",
  inputs: [
    { key: "apiKey", label: "模型同步令牌", type: "password", required: false, placeholder: "可选：仅供管理员在后台同步模型列表，推理时不会使用" },
    { key: "baseUrl", label: "网关地址", type: "url", required: true, placeholder: "形如 https://your-newapi.example.com（会自动补 /v1）" },
  ],
  inputValues: { apiKey: "", baseUrl: "" },
  /**
   * ⚠️ 这里**故意留空**。
   *
   * `u.vendor.getModelList(id)` 返回的是「本文件的 vendor.models」+「o_vendorConfig.models 列」的并集，
   * 所以一旦这里写了占位模型，它们会**永远**出现在画布/后台的模型列表里 ——
   * 哪怕站点根本没在网关里上架这些模型，用户选中就必然报错。
   *
   * 正式使用时：在后台「供应商 → 拉取模型列表」同步，
   * 或直接维护 o_vendorConfig 的 models 列（与 new-api 上下架保持一致）。
   * 模型清单的唯一权威是**网关**，不是这个文件。
   */
  models: [],
};

// ============================================================
// 公共
// ============================================================
function baseUrl(): string {
  const raw = String(vendor.inputValues.baseUrl || "").trim().replace(/\/+$/, "");
  if (!raw) throw new Error("缺少网关地址 baseUrl");
  return /\/v\d+$/.test(raw) ? raw : `${raw}/v1`;
}

function apiKey(): string {
  const raw = String(vendor.inputValues.apiKey || "").trim();
  if (!raw) throw new Error("缺少 NewAPI 用户令牌 apiKey");
  return raw.replace(/^Bearer\s+/i, "");
}

function headers() {
  return { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" };
}

/**
 * 统一取数据。
 * /v1 下多数端点直接返回 OpenAI 原生结构；
 * 但错误信封是造物那套 `{code, message, data}`（见造物 api-docs 的说明），
 * 所以这里两者都认，抛错时优先用 message。
 */
function unwrap(res: any): any {
  const body = res && res.data;
  if (body && typeof body === "object") {
    // 造物风格错误信封：{code, message, data}。
    // ⚠️ 这里**不能**要求 `body.data !== undefined`：网关报错时经常只回
    //    `{code, message}` 而不带 data 键（比如视频任务不存在），
    //    那样判不出来就会一路走到「拿不到 id」这种看不出根因的模糊报错。
    //    失败码以造物为准：200 / "200" / 0 / "0" / "success" 都算成功。
    if ("code" in body && "message" in body && !("id" in body) && !("data" in body && Array.isArray(body.data))) {
      const code = (body as any).code;
      const okCode = code === 200 || code === "200" || code === 0 || code === "0" || code === "success";
      if (!okCode) throw new Error(String(body.message || code));
    }
    if ("success" in body && body.success === false) throw new Error(String(body.message || "网关返回失败"));
  }
  return body;
}

/** 取参考图（兼容 referenceList 与老版 imageBase64） */
function refImages(config: ImageConfig | VideoConfig): string[] {
  if (Array.isArray(config.referenceList) && config.referenceList.length) {
    return config.referenceList.filter((r) => r && r.type === "image" && r.base64).map((r) => r.base64);
  }
  if (Array.isArray(config.imageBase64) && config.imageBase64.length) return config.imageBase64.slice();
  return [];
}

/**
 * 比例 × 清晰度 → size 像素串。
 *
 * ★ 这张表逐字抄自造物 `src/lib/image-size.ts` 的 `IMAGE_SIZES`，**不要自己算**。
 *   造物是从上游的拒绝回包里把完整白名单抄回来的（原文：
 *   「该渠道仅支持 1920x1088 / 2048x1152 / 3840x2160 / …」），
 *   每个组合都是上游真正认的像素串，等比缩放出来的数（比如 2K+16:9 算成 3840x2160）
 *   会直接被 400 拒掉。
 *
 * 造物为此专门写过一段注释：以前不管用户选 1K / 2K / 4K，发出去的都是 1K 那一列，
 * 而计费走的是另一个字段 resolution —— 于是选 4K 得到的是 1024 的图，钱按 4K 收。
 * **比例与清晰度必须一起决定像素串。**
 *
 * 认不出的比例（如「自适应」/「auto」）返回 undefined，调用方就不发 size，由模型自适应。
 */
const IMAGE_SIZES: Record<string, Record<string, string>> = {
  "1:1": { "1K": "1024x1024", "2K": "2048x2048", "4K": "2880x2880" },
  "3:2": { "1K": "1536x1024", "2K": "3072x2048", "4K": "3456x2304" },
  "2:3": { "1K": "1024x1536", "2K": "2048x3072", "4K": "2304x3456" },
  "4:3": { "1K": "1280x960", "2K": "2560x1920", "4K": "3200x2400" },
  "3:4": { "1K": "960x1280", "2K": "1920x2560", "4K": "2400x3200" },
  "5:4": { "1K": "1280x1024", "2K": "2560x2048", "4K": "3216x2576" },
  "4:5": { "1K": "1024x1280", "2K": "2048x2560", "4K": "2576x3216" },
  "16:9": { "1K": "1920x1088", "2K": "2048x1152", "4K": "3840x2160" },
  "9:16": { "1K": "1088x1920", "2K": "1152x2048", "4K": "2160x3840" },
  "21:9": { "1K": "2016x864", "2K": "2688x1152", "4K": "3840x1648" },
  "9:21": { "1K": "864x2016", "2K": "1152x2688", "4K": "1648x3840" },
};

function imagePixels(size: string, ratio: string): string | undefined {
  const row = IMAGE_SIZES[String(ratio || "")];
  if (!row) return undefined; // 认不出的比例 → 不发 size
  const k = String(size || "").toUpperCase();
  return row[k === "2K" || k === "4K" ? k : "1K"];
}

// ============================================================
// 文本：POST /v1/chat/completions
// ============================================================
const textRequest = (model: TextModel, _think: boolean, _thinkLevel: 0 | 1 | 2 | 3) => {
  // @ai-sdk/openai-compatible v2 使用 chatModel；旧版 .chat 会在运行时直接抛出
  // “createOpenAICompatible(...).chat is not a function”，导致前端只能看到泛化的请求出错。
  return createOpenAICompatible({ name: "new-api", baseURL: baseUrl(), apiKey: apiKey() }).chatModel(model.modelName);
};

// ============================================================
// 图片：POST /v1/images/generations（同步）
//
// 参考图不走 /v1/images/edits —— 造物文档明说：
//   「已有 URL 或 data:URL 直接用 /v1/images/generations 的 images 数组更简单」
// 我们手上本来就是 base64，所以一律走这个端点。
// 超时给足：造物实测 15~25 秒，是阻塞式的。
// ============================================================
const imageRequest = async (config: ImageConfig, model: ImageModel): Promise<string> => {
  const body: Record<string, any> = {
    model: model.modelName,
    prompt: config.prompt || "",
    n: 1,
    response_format: "url", // 造物站内一律传 url
  };

  const px = imagePixels(config.size, config.aspectRatio);
  if (px) body.size = px;
  // ⚠️ 清晰度必须发 resolution，**不要换成 quality:"high"**。
  //    造物 2026-09-22 实测过这个换法，两个后果都会发生：
  //      (1) 用户选的 4K 根本没送到，出的还是 1K，计费也落回默认档；
  //      (2) 只收「中」档的线路（gpt-image-2.5-flare）直接拒掉整个请求。
  //    quality 是模型卡自己的独立参数（站内表单默认给 "high" 也是那一层的默认值），
  //    与 1K/2K/4K 档位是两件事 —— 这里不碰它。
  const resTier = String(config.size || "").toUpperCase();
  if (resTier === "2K" || resTier === "4K") body.resolution = resTier;

  const images = refImages(config);
  if (images.length) body.images = images; // 图生图 / 多图融合

  const res = await axios.post(`${baseUrl()}/images/generations`, body, { headers: headers(), timeout: 180000 });
  const payload = unwrap(res) || {};
  const first = Array.isArray(payload.data) ? payload.data[0] : payload;
  const url = first && (first.url || first.b64_json);
  if (!url) throw new Error("网关没有返回图片（响应里没有 data[0].url）");
  // b64_json 也认，但站内默认应该是 url
  return first.b64_json && !first.url ? `data:image/png;base64,${first.b64_json}` : url;
};

// ============================================================
// 视频：POST /v1/videos → GET /v1/videos/{id} → GET /v1/videos/{id}/content
//
// 参数拼装严格照造物 src/lib/llm.ts：
//   { model, prompt, seconds, aspect_ratio, resolution, input_reference,
//     end_image_url, images }
// 造物明确**不发** size / mode / input_reference 之外的私有字段。
// ============================================================
const videoRequest = async (config: VideoConfig, model: VideoModel): Promise<string> => {
  const images = refImages(config);
  const mode = Array.isArray(config.mode) ? config.mode[0] : config.mode;

  const body: Record<string, any> = {
    model: model.modelName,
    prompt: config.prompt || "",
    // ⚠️ 网关的 Go 结构体把 seconds 定义成 string（实测 400: cannot unmarshal number into
    // Go struct field .Alias.seconds of type string），必须字符串化
    seconds: String(config.duration || 5),
    // 网关强校验 mode（实测 400: "mode 不能为空"）：有参考图=reference，首尾帧=keyframe，纯文本=text
    mode: (Array.isArray(config.referenceList) && config.referenceList.length > 0)
      ? "reference"
      : (mode === "startEndRequired" ? "keyframe" : "text"),
  };
  if (config.aspectRatio) body.aspect_ratio = config.aspectRatio;
  if (config.resolution) body.resolution = config.resolution;

  // 首帧 / 首尾帧 / 多图参考的分派，与造物 video/page.tsx 一致
  if (images.length) {
    const isFirstLast = mode === "startEndRequired" || mode === "endFrameOptional";
    if (isFirstLast) {
      body.input_reference = images[0];
      if (images[1]) body.end_image_url = images[1];
    } else if (mode === "singleImage" || mode === "startFrameOptional") {
      body.input_reference = images[0];
    } else {
      body.images = images;
    }
  }

  const submitted = unwrap(await axios.post(`${baseUrl()}/videos`, body, { headers: headers(), timeout: 120000 })) || {};
  const taskId = submitted.id || submitted.task_id;
  if (!taskId) throw new Error("提交视频任务后没有拿到 id");

  // 造物文档：长视频 / 高峰期可达十几分钟，轮询总时长要 ≥ 20 分钟
  const polled = await pollTask(
    async (): Promise<PollResult> => {
      try {
        const t = unwrap(await axios.get(`${baseUrl()}/videos/${taskId}`, { headers: headers(), timeout: 60000 })) || {};
        const status = String(t.status || "").toLowerCase();
        if (status === "completed") return { completed: true, data: String(taskId) };
        if (status === "failed" || status === "cancelled" || status === "canceled") {
          const msg = (t.error && (t.error.message || t.error)) || t.message || "上游任务失败";
          return { completed: true, error: String(msg) };
        }
        return { completed: false };
      } catch (e: any) {
        // 单次查询失败不算终态：造物站内是「连续 12 次网络失败才判失败」，这里交给 pollTask 继续重试
        log(`[newapi] 视频轮询出错（继续重试）：${e && e.message ? e.message : e}`);
        return { completed: false };
      }
    },
    7000, // 造物建议 5~10 秒一次
    20 * 60 * 1000,
  );

  if (polled.error) throw new Error(polled.error);
  if (!polled.data) throw new Error("视频任务超时（20 分钟）仍未完成");

  // 成片在 /content，是二进制 mp4（不是 JSON，也不在任务 JSON 里）
  const content = await axios.get(`${baseUrl()}/videos/${taskId}/content`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
    responseType: "arraybuffer",
    timeout: 10 * 60 * 1000,
  });
  const buf = Buffer.from(content.data);
  if (!buf.length) throw new Error("下载成片失败：内容为空");
  return `data:video/mp4;base64,${buf.toString("base64")}`;
};

// ============================================================
// 语音：POST /v1/audio/speech（同步二进制）
// ============================================================
const ttsRequest = async (config: TTSConfig, model: TTSModel): Promise<string> => {
  const res = await axios.post(
    `${baseUrl()}/audio/speech`,
    {
      model: model.modelName,
      input: config.text,
      voice: config.voice,
      speed: typeof config.speechRate === "number" && config.speechRate > 0 ? config.speechRate : 1,
    },
    { headers: headers(), responseType: "arraybuffer", timeout: 300000 },
  );
  const buf = Buffer.from(res.data);
  if (!buf.length) throw new Error("语音合成返回空内容");
  return `data:audio/mpeg;base64,${buf.toString("base64")}`;
};

// ============================================================
// 拉取模型列表（后台「拉取模型」按钮调用）
// ============================================================
async function fetchModels(): Promise<{ text: string[]; image: string[]; video: string[] }> {
  try {
    const res = await axios.get(`${baseUrl()}/models`, { headers: headers(), timeout: 30000 });
    const payload = unwrap(res) || {};
    const ids: string[] = (Array.isArray(payload.data) ? payload.data : []).map((m: any) => m && (m.id || m.model)).filter(Boolean);
    const video = ids.filter((id) => /(^|[-_/])(video|sora|veo|kling|hailuo|minimax|runway|pika|pixverse|vidu|seedance)/i.test(id));
    const image = ids.filter((id) => !video.includes(id) && /(^|[-_/])(dall-?e|gpt-image|seedream|flux|midjourney|mj|stable|sd|imagen|qwen-image|wanx|image|banana)/i.test(id));
    const used = new Set([...image, ...video]);
    const text = ids.filter((id) => !used.has(id));
    return { text, image, video };
  } catch (e: any) {
    log(`[newapi] 拉取模型列表失败：${e && e.message ? e.message : e}`);
    return { text: [], image: [], video: [] };
  }
}

const checkForUpdates = async () => ({ hasUpdate: false, latestVersion: "2.0", notice: "" });
const updateVendor = async () => "";

// ============================================================
// 导出
// ============================================================
exports.vendor = vendor;
exports.textRequest = textRequest;
exports.imageRequest = imageRequest;
exports.videoRequest = videoRequest;
exports.ttsRequest = ttsRequest;
exports.fetchModels = fetchModels;
exports.checkForUpdates = checkForUpdates;
exports.updateVendor = updateVendor;
export {};
