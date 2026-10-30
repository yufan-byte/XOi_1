import { fetchBinaryWithLimit, validateOutboundUrl } from "@/utils/safeUrl";
import { sharedRateLimiter } from "@/middleware/sharedRateLimiter";
import { safeInlineMediaType } from "@/utils/mediaSecurity";
import { DurableTasks } from "@/lib/workspace/tasks";
import { db as taskDb } from "@/utils/db";
import { recoverGatewayVideo } from "@/lib/workspace/videoRecovery";
import express from "express";
import u from "@/utils";
import { recordDrawStart, recordDrawFinish } from "@/lib/workspace/drawLogs";
import { recoverLateImage } from "@/lib/workspace/imageRecover";
import axios from "axios";
import { getActionPoints, getUserPoints } from "@/utils/points";
import { capturePoints, releasePoints, reservePoints } from "@/utils/billing";
import { getUserGatewayCredentials } from "@/lib/gateway/newapi";
import { trackedGatewayFetch } from "@/lib/gateway/receipts";
import { getUserCatalog, publicModel, resolveUserCatalogModel } from "@/lib/model-catalog";
import sharp from "sharp";
import { imageGenerationTier } from "@/utils/imageGenerationTier";
import {canvasImageRequest} from "@/utils/canvasImageRequest";
import { canvasVideoRequest } from "@/utils/canvasVideoRequest";
import {getGatewayRequestContext} from "@/lib/gateway/context";
import {mediaQueue,registerMediaHandler,runQueuedRoute} from "@/lib/workspace/mediaQueueRuntime";
import {queueRequest} from "@/lib/workspace/queueRequest";
import { assertCurrentMediaOwner, signedProviderMedia } from "@/utils/privateMediaRuntime";
import { authorizeMediaReference, localMediaReference } from "@/utils/mediaReferencePolicy";

/**
 * Infinite Canvas 依赖的 API stubs
 * 这些接口在原项目（Python FastAPI）中存在，但在 XOi 后端中没有。
 * 返回空数据避免 404 错误，让画布基础功能正常工作。
 */

const router = express.Router();

// GET /api/config — AI 配置（画布初始化时调用）
router.get("/config", async (req, res) => {
  try {
    const catalog = await getUserCatalog(Number((req as any).user.id));
    const models = catalog.models.filter(m => m.selectable);
    const ofType = (type: string) => models.filter(m => m.type === type).map(m => m.modelName);
    return res.json({ base_url: "", chat_model: ofType("text")[0] || "", image_model: ofType("image")[0] || "", chat_models: ofType("text"), image_models: ofType("image"), video_models: ofType("video"), audio_models: ofType("audio"),
      api_providers: [{ id: "newapi", name: "平台模型", base_url: "", enabled: true, has_key: true, key_preview: "已配置", chat_models: ofType("text"), image_models: ofType("image"), video_models: ofType("video"), audio_models: ofType("audio") }],
      model_catalog: models.map(m => publicModel(m, catalog.factor)), points_per_yuan: 10, has_api_key: true, comfy_instances: [], ms_chat_models: [], has_ms_key: false });
  } catch (e) {
    console.error("[canvas-stubs] 读取模型配置失败:", e);
    res.status(502).json({
      base_url: "",
      chat_model: "",
      image_model: "",
      chat_models: [],
      image_models: [],
      video_models: [],
      audio_models: [],
      comfy_instances: [],
      api_providers: [],
      has_api_key: false,
      ms_chat_models: [],
      has_ms_key: false,
    });
  }
});

// GET /api/workflows — ComfyUI 工作流列表
router.get("/workflows", (req, res) => {
  res.json({ workflows: [] });
});

// GET /api/local-assets — 本地素材
router.get("/local-assets", (req, res) => {
  res.json({ items: [], tree: null });
});

// GET /api/asset-library — 资产库
router.get("/asset-library", (req, res) => {
  res.json({ library: { libraries: [] } });
});

// GET /api/asset-library/libraries
router.get("/asset-library/libraries", (req, res) => {
  res.json({ libraries: [] });
});

// GET /api/asset-library/categories
router.get("/asset-library/categories", (req, res) => {
  res.json({ categories: [] });
});

// GET /api/asset-library/items
router.get("/asset-library/items", (req, res) => {
  res.json({ items: [] });
});

// POST /api/asset-library/items
router.post("/asset-library/items", (req, res) => {
  res.json({ item: null });
});

// POST /api/asset-library/items/batch
router.post("/asset-library/items/batch", (req, res) => {
  res.json({ items: [] });
});

// POST /api/asset-library/items/delete
router.post("/asset-library/items/delete", (req, res) => {
  res.json({ ok: true });
});

// POST /api/asset-library/workflows/upload
router.post("/asset-library/workflows/upload", (req, res) => {
  res.json({ ok: false, message: "暂不支持" });
});

// GET /api/prompt-libraries — 提示词库
router.get("/prompt-libraries", (req, res) => {
  res.json({
    library: {
      active_library_id: "system",
      libraries: [
        {
          id: "system",
          name: "系统提示词库",
          type: "prompt",
          categories: [
            { id: "view", name: "视角" },
            { id: "style", name: "风格" },
            { id: "scene", name: "场景" },
            { id: "character", name: "角色" },
            { id: "product", name: "产品" },
            { id: "creative", name: "创意" },
          ],
          items: [
            {
              id: "multi_camera_9grid",
              name: "多机位九宫格",
              category: "view",
              scene: "同一主体/场景，9个不同机位/角度同时呈现",
              positive: "A multi-camera angle reference sheet in 3x3 grid layout, showing [主体] from 9 different perspectives simultaneously: top-left front view, top-center 3/4 front view, top-right side profile, middle-left low angle, middle-center eye-level straight-on, middle-right high angle, bottom-left back view, bottom-center 3/4 back view, bottom-right top-down overhead view. [主体详细描述]. Consistent lighting across all 9 frames, uniform light warm gray background color F0EDE8, professional studio photography, clean grid layout with thin white dividers between frames",
              negative: "numbers, text, letters, labels, frame numbers, corner marks, annotations, watermarks, blurry, low quality",
              params: {},
              created_at: Date.now(),
              updated_at: Date.now(),
            },
            {
              id: "character_turnaround",
              name: "角色三视图",
              category: "character",
              scene: "角色设计三视图，用于动画/游戏制作",
              positive: "Character turnaround sheet, three views: front view, side profile, back view, [角色描述]. Consistent proportions and details across all views, clean white background, professional character design reference, full body shot, neutral pose",
              negative: "numbers, text, labels, blurry, inconsistent design, different outfits, different hairstyles",
              params: {},
              created_at: Date.now(),
              updated_at: Date.now(),
            },
            {
              id: "product_showcase",
              name: "产品展示",
              category: "product",
              scene: "产品多角度展示，用于电商/广告",
              positive: "Professional product photography, [产品描述], multiple angles展示, studio lighting, clean white background, high-end commercial photography style, sharp details, realistic materials and textures",
              negative: "blurry, low quality, distorted, text, watermarks, logos",
              params: {},
              created_at: Date.now(),
              updated_at: Date.now(),
            },
            {
              id: "cinematic_scene",
              name: "电影场景",
              category: "scene",
              scene: "电影级场景构图，用于概念设计/分镜",
              positive: "Cinematic scene composition, [场景描述], dramatic lighting, film grain, anamorphic lens flare, depth of field, professional cinematography, 35mm film aesthetic, color graded, moody atmosphere",
              negative: "flat lighting, amateur, low quality, text, watermarks, overexposed",
              params: {},
              created_at: Date.now(),
              updated_at: Date.now(),
            },
            {
              id: "anime_style",
              name: "动漫风格",
              category: "style",
              scene: "日系动漫风格插画",
              positive: "Anime style illustration, [主体描述], vibrant colors, clean line art, cel shading, detailed eyes, dynamic pose, studio quality, professional anime art style",
              negative: "realistic, photographic, 3d render, low quality, blurry, deformed",
              params: {},
              created_at: Date.now(),
              updated_at: Date.now(),
            },
            {
              id: "creative_surreal",
              name: "超现实创意",
              category: "creative",
              scene: "超现实主义创意构图",
              positive: "Surreal creative composition, [创意描述], dreamlike atmosphere, impossible geometry, vibrant colors, artistic expression, conceptual art, high detail, professional digital art",
              negative: "realistic, mundane, ordinary, low quality, blurry",
              params: {},
              created_at: Date.now(),
              updated_at: Date.now(),
            },
          ],
        },
      ],
      updated_at: Date.now(),
    },
  });
});

// GET /api/prompt-libraries/categories
router.get("/prompt-libraries/categories", (req, res) => {
  res.json({
    categories: [
      { id: "view", name: "视角" },
      { id: "style", name: "风格" },
      { id: "scene", name: "场景" },
      { id: "character", name: "角色" },
      { id: "product", name: "产品" },
      { id: "creative", name: "创意" },
    ],
  });
});

// GET /api/prompt-libraries/items
router.get("/prompt-libraries/items", (req, res) => {
  res.json({
    items: [
      {
        id: "multi_camera_9grid",
        name: "多机位九宫格",
        category: "view",
        scene: "同一主体/场景，9个不同机位/角度同时呈现",
        positive: "A multi-camera angle reference sheet in 3x3 grid layout, showing [主体] from 9 different perspectives simultaneously: top-left front view, top-center 3/4 front view, top-right side profile, middle-left low angle, middle-center eye-level straight-on, middle-right high angle, bottom-left back view, bottom-center 3/4 back view, bottom-right top-down overhead view. [主体详细描述]. Consistent lighting across all 9 frames, uniform light warm gray background color F0EDE8, professional studio photography, clean grid layout with thin white dividers between frames",
        negative: "numbers, text, letters, labels, frame numbers, corner marks, annotations, watermarks, blurry, low quality",
        params: {},
        created_at: Date.now(),
        updated_at: Date.now(),
      },
      {
        id: "character_turnaround",
        name: "角色三视图",
        category: "character",
        scene: "角色设计三视图，用于动画/游戏制作",
        positive: "Character turnaround sheet, three views: front view, side profile, back view, [角色描述]. Consistent proportions and details across all views, clean white background, professional character design reference, full body shot, neutral pose",
        negative: "numbers, text, labels, blurry, inconsistent design, different outfits, different hairstyles",
        params: {},
        created_at: Date.now(),
        updated_at: Date.now(),
      },
      {
        id: "product_showcase",
        name: "产品展示",
        category: "product",
        scene: "产品多角度展示，用于电商/广告",
        positive: "Professional product photography, [产品描述], multiple angles展示, studio lighting, clean white background, high-end commercial photography style, sharp details, realistic materials and textures",
        negative: "blurry, low quality, distorted, text, watermarks, logos",
        params: {},
        created_at: Date.now(),
        updated_at: Date.now(),
      },
      {
        id: "cinematic_scene",
        name: "电影场景",
        category: "scene",
        scene: "电影级场景构图，用于概念设计/分镜",
        positive: "Cinematic scene composition, [场景描述], dramatic lighting, film grain, anamorphic lens flare, depth of field, professional cinematography, 35mm film aesthetic, color graded, moody atmosphere",
        negative: "flat lighting, amateur, low quality, text, watermarks, overexposed",
        params: {},
        created_at: Date.now(),
        updated_at: Date.now(),
      },
      {
        id: "anime_style",
        name: "动漫风格",
        category: "style",
        scene: "日系动漫风格插画",
        positive: "Anime style illustration, [主体描述], vibrant colors, clean line art, cel shading, detailed eyes, dynamic pose, studio quality, professional anime art style",
        negative: "realistic, photographic, 3d render, low quality, blurry, deformed",
        params: {},
        created_at: Date.now(),
        updated_at: Date.now(),
      },
      {
        id: "creative_surreal",
        name: "超现实创意",
        category: "creative",
        scene: "超现实主义创意构图",
        positive: "Surreal creative composition, [创意描述], dreamlike atmosphere, impossible geometry, vibrant colors, artistic expression, conceptual art, high detail, professional digital art",
        negative: "realistic, mundane, ordinary, low quality, blurry",
        params: {},
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    ],
  });
});

// POST /api/prompt-libraries/items
router.post("/prompt-libraries/items", (req, res) => {
  res.json({ item: null });
});

// POST /api/prompt-libraries/items/delete
router.post("/prompt-libraries/items/delete", (req, res) => {
  res.json({ ok: true });
});

// POST /api/canvas-assets/check — 检查素材是否存在
router.post("/canvas-assets/check", (req, res) => {
  res.json({ exists: {} });
});

// POST /api/canvas-assets/download — 下载素材
router.post("/canvas-assets/download", (req, res) => {
  res.status(404).json({ message: "暂不支持" });
});

// POST /api/canvas-workflows/export
router.post("/canvas-workflows/export", (req, res) => {
  res.status(404).json({ message: "暂不支持" });
});

// POST /api/canvas-workflows/export-to-library
router.post("/canvas-workflows/export-to-library", (req, res) => {
  res.status(404).json({ message: "暂不支持" });
});

// POST /api/canvas-workflows/import
router.post("/canvas-workflows/import", (req, res) => {
  res.status(404).json({ message: "暂不支持" });
});

// 根据模型名找到对应的供应商
async function findVendorByModel(modelName: string) {
  const wanted = String(modelName || "").trim().toLowerCase();
  const vendors = await u.db("o_vendorConfig").select("id").where("enable", 1);
  for (const v of vendors) {
    const models = await u.vendor.getModelList(v.id!);
    const found = models.find((m: any) => String(m.modelName || "").trim().toLowerCase() === wanted);
    if (found) {
      const vendor = await u.db("o_vendorConfig").where("id", v.id).first();
      const inputValues = JSON.parse(vendor?.inputValues || "{}");
      return { vendorId: v.id!, inputValues, vendor, model: found };
    }
  }
  return null;
}

// 获取供应商 API 配置（优先按模型查找，否则取第一个启用的）
async function getVendorApiConfig(modelName?: string) {
  if (modelName) {
    const found = await findVendorByModel(modelName);
    if (found) return found;
  }
  // 降级：取第一个启用的供应商
  const first = await u.db("o_vendorConfig").where("enable", 1).first();
  if (!first) return null;
  const inputValues = JSON.parse(first.inputValues || "{}");
  return { vendorId: first.id, inputValues, vendor: first, model: null };
}

// 文本对话必须单独按 text 能力选模型。画布的全局默认 model 可能仍指向 image 模型，
// 直接把它拿去调用 /chat/completions 会让上游返回 503。
async function getTextVendorApiConfig(modelName?: string) {
  if (modelName) {
    const found = await findVendorByModel(modelName);
    if (found?.model?.type === "text") return found;
  }
  const vendors = await u.db("o_vendorConfig").select("id").where("enable", 1);
  for (const vendorRow of vendors) {
    const models = await u.vendor.getModelList(vendorRow.id!);
    const textModel = models.find((item: any) => item.type === "text");
    if (!textModel) continue;
    const vendor = await u.db("o_vendorConfig").where("id", vendorRow.id).first();
    const inputValues = JSON.parse(vendor?.inputValues || "{}");
    return { vendorId: vendorRow.id!, inputValues, vendor, model: textModel };
  }
  return null;
}

// POST /api/canvas-llm — LLM 对话
router.post("/canvas-llm", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    console.log("[canvas-llm] userId:", userId);
    if (!userId) return res.status(401).json({ error: "未登录" });

    const { message, model, system_prompt, messages = [], images = [] } = req.body;
    if (!message && !messages.length) {
      return res.status(400).json({ error: "消息不能为空" });
    }

    // 根据模型名找到对应的供应商
    const requestedTextModel = String(model || "").replace(/^newapi:/, "");
    const resolvedTextModel = (await resolveUserCatalogModel(Number(userId), requestedTextModel, "text", !requestedTextModel)).model.modelName;
    const config = await getTextVendorApiConfig(resolvedTextModel);
    if (!config?.model || config.vendorId !== "newapi") {
      return res.status(400).json({ error: "未配置 NewAPI 文本模型，请联系管理员同步并选择模型" });
    }

    const { baseUrl, apiKey } = await getUserGatewayCredentials(Number(userId));
    const useModel = resolvedTextModel;

    // 构建消息
    const apiMessages: any[] = [];
    if (system_prompt) {
      apiMessages.push({ role: "system", content: system_prompt });
    }
    for (const m of messages) {
      const content = Array.isArray(m.content) ? await Promise.all(m.content.map(async (part: any) => {
        if (part?.type !== "image_url") return part;
        const url = part.image_url?.url;
        const path = await authorizeMediaReference(url, assertCurrentMediaOwner);
        return path ? {...part, image_url: {...part.image_url, url: await u.oss.getImageBase64(path)}} : part;
      })) : m.content || m;
      apiMessages.push({ role: m.role || "user", content });
    }
    if (message) {
      // 如果有图片，构建多模态消息
      if (images.length > 0) {
        const content: any[] = [{ type: "text", text: message }];
        for (const img of images) {
          // 兼容两种格式：字符串 URL 或 {url: string} 对象
          let url = typeof img === 'string' ? img : img.url;
          if (url) {
            const path = await authorizeMediaReference(url, assertCurrentMediaOwner);
            if (path) url = await u.oss.getImageBase64(path);
            content.push({ type: "image_url", image_url: { url } });
          }
        }
        apiMessages.push({ role: "user", content });
      } else {
        apiMessages.push({ role: "user", content: message });
      }
    }

    const response = await trackedGatewayFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: useModel,
        messages: apiMessages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[canvas-llm] API错误:", response.status, errorText);
      const detail = errorText.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***").replace(/\s+/g, " ").trim().slice(0, 240);
      return res.status(response.status).json({ error: `API请求失败: ${response.status}${detail ? `：${detail}` : ""}` });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    res.json({
      text,
      pointsDeducted: null,
      balance: await getUserPoints(userId),
    });
  } catch (e: any) {
    console.error("[canvas-llm] 请求错误:", e.message);
    res.status(e.status === 403 ? 403 : e.status === 400 ? 400 : 500).json({ error: `LLM 请求失败: ${e.message}` });
  }
});

// 任务存储（数据库）；内存只保存当前进程的落盘仲裁标记。
const imageTasks = new DurableTasks<{ status: string; result?: any; error?: string; recoveryRequired?: boolean }>(taskDb, "image", (id) => imageDeliveredMarkers.delete(id));

// deliveryMarkerRegistry：CAS 终态仲裁闘门的反向白嫖守卫数据源 —— 图片流水线 aiImage.save() 落盘成功后在此登记 taskId，
//   finalizeFail 进入结算裁决时据此判别是否实质交付以防“近超时却已出货被错退”的薅羊毛场景(R1 场景守护)．
//   标记只在当前生成流水线运行期间保留，收尾后清理，避免随历史任务无限增长。
const imageDeliveredMarkers = new Set<string>();

// POST /api/canvas-image-tasks — 图片生成任务
//   ⚠️ 2026-10-03 起同一实现同时服务两条路径：/api/canvas-image-tasks（atelier 工作台）
//   与 /api/v1/canvas/image-tasks（上游画布编辑器，见文件底部 /v1/canvas 适配层）。
const canvasImageTaskCreate = async (req: any, res: any) => {
  try {
    req.body=canvasImageRequest(req.body);
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "未登录" });

    const { prompt, negative_prompt, model, size, width: wParam, height: hParam, reference_images, ...rest } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "提示词不能为空" });
    }
    if (!Array.isArray(reference_images ?? []) || (reference_images?.length ?? 0) > 32)
      return res.status(400).json({error: "参考图片格式或数量无效"});
    for (const img of reference_images ?? [])
      await authorizeMediaReference(typeof img === "string" ? img : img?.base64 || img?.url, assertCurrentMediaOwner);

    // 解析尺寸：优先使用 width/height，否则解析 size 字符串（如 "1024x1024"）
    let width = wParam;
    let height = hParam;
    if (!width || !height) {
      const sizeMatch = String(size || '').match(/(\d+)\s*x\s*(\d+)/i);
      if (sizeMatch) {
        width = width || Number(sizeMatch[1]);
        height = height || Number(sizeMatch[2]);
      }
    }

    if ([width,height].some(value=>value!==undefined&&(!Number.isSafeInteger(value)||value<1||value>8192)))return res.status(400).json({error:"图片尺寸须为 1–8192 的整数"});
    if (rest.exact_size !== undefined && (typeof rest.exact_size !== "string" || !/^\d{2,4}x\d{2,4}$/.test(rest.exact_size) || rest.exact_size !== `${width}x${height}`)) return res.status(400).json({error:"图片尺寸参数不一致"});
    // ── 计费重构（serene-splashing-pebble.md · 配套评审探针对抗审视）─────────
    // 把原嵌于异步 IIFE 内部的 modelKey/pricingCtx 解析上移至此提交同步段：
    //   既供 ctx-aware atomic-reserve 定价命中 o_points_price_override 差异化倍率，
    //   又直接喂下游 Ai.Image(`${vendorId}:${modelName}`)，省一次重复求值；
    //   同时根治旧码隐藏 bug —— 探测用的是无 ctx 价而最终实扣的是 ctx 化价可能不一致导致门禁与实扣错配。
    let modelKey =
      typeof model === "string" && model.trim()
        ? String(model).trim()
        : "";

    if (!modelKey) {
      modelKey = `newapi:${(await resolveUserCatalogModel(Number(userId), "", "image")).model.modelName}`;
    } else if (!modelKey.includes(":")) {
      // modelName 无 vendorId 前缀时按 findVendorByModel 兜底补齐(split(/:(.+)/) 第二组贪婪捕获保留多冒号modelName审计精度)
      const found = await findVendorByModel(modelKey);
      if (found) modelKey = `${found.vendorId}:${modelKey}`;
    }

    if (modelKey.startsWith("newapi:")) {
      const requested = modelKey.slice("newapi:".length);
      modelKey = `newapi:${(await resolveUserCatalogModel(Number(userId), requested, "image", !requested)).model.modelName}`;
    }

    if (!modelKey || !String(modelKey).includes(":")) {
      return res.status(400).json({ error: "未找到可用的图片模型，请在管理面板选择支持 image 能力并启用的供应商模型再试" });
    }
    const _kv = String(modelKey).split(/:(.+)/);
    const pricingCtx = { vendorId: _kv[0] || null, modelName: _kv[1] || null };

    // ② atomic-reserve：submit 瞬间事务性预扣 N 锁额度；失败路径经下方 CAS 闸门条件全额退还满足“一点 API 生成就扣／不成则归还”心智，
    //   audit 维度(vendor_id/model_name 列)由 checkAndDeductPoints 内部依 ctx 自动写 o_points_log 无需额外维护。
    const taskId = req.__mediaJob?.taskId || `task_${u.uuid()}`;
    const reserve = await reservePoints({
      userId,
      requestId: `canvas-image:${taskId}`,
      scene: "canvas.image",
      action: "image_generate",
      description: "画布图片生成",
      pricingCtx,
      referenceType: "canvas_task",
      referenceId: taskId,
    });
    if (!reserve.success) {
      return res.status(400).json({ error: reserve.message ?? "积分不足，无法发起图片生成任务" });
    }

    if(!req.__mediaJob){
      const billingId=getGatewayRequestContext()?.billingId||"";
      const job=await mediaQueue.enqueue("image",taskId,Number(userId),billingId,queueRequest("image",{...req.body,model:modelKey,width,height}),{model:modelKey,modelKey,prompt,sourceId:req.body.source_id,nodeId:req.body.node_id},req.body.clientTaskId||req.body.client_task_id);
      return res.json({task_id:job.id,status:job.status,pointsDeducted:null,queueMessage:"已进入等待队列，尚未提交上游；实际调用时按用量结算"});
    }
    console.log(
      `[canvas-image] 创建任务 ${taskId}, prompt="${(prompt || "").slice(0, 60)}", model=${
        model || "(auto)"
      }, reservedPoints=${reserve.deducted ?? 0}`
    );
    // 记账：先落一条 running，成功/失败各回填一次（对标造物 mc_draw_logs）
    void recordDrawStart({ taskId, userId: Number(userId), model: modelKey, prompt, size: typeof req.body?.size === "string" ? req.body.size : undefined });

    // ③ 即刻回执：fire-and-forget 异步流水线后台跑的同时立刻返提交快照(cost 字段塞顶层令前端 xoi-bridge.pickCost 点击秒级唤金卡；balance 为快照非权威最新 UI 应另调 refreshProfile)
    res.json({
      task_id: taskId,
      pointsDeducted: reserve.deducted && reserve.deducted > 0 ? reserve.deducted : null,
      balance: await getUserPoints(userId),
    });

    // per-task CAS 终态仲裁器(P-agent P0①必修)：watchdog／catch／success 三路争抢唯一终态写入权；
    //   settled flag 位于各 mutator 首句 JS 单线程下任一方独占置位杜绝交错漏检；
    //   反向白嫖守卫靠 imageDeliveredMarkers 核验 aiImage.save() 已落盘 artifacts 防“近超时出货被错退”(R1 场景守护).
    const watchdogTimerRef = { timer: setTimeout(() => {}, 0) }; // 占位待真看守钟赋值覆盖
    const termState = { settled: false as boolean };

    async function finalizeOk(resultPayload: any): Promise<boolean> {
      if (termState.settled) return false;                  // 输家静默退出禁动 Map/timer/db
      termState.settled = true;
      clearTimeout(watchdogTimerRef.timer);
      await imageTasks.set(taskId, { status: "succeeded", result: resultPayload });
      void recordDrawFinish(taskId, "succeeded", { url: resultPayload?.url || resultPayload?.images?.[0]?.url });
      void capturePoints(reserve).catch((settleError: any) => {
        console.error(`[canvas-image] 任务 ${taskId} 结算异常:`, settleError?.message || settleError);
      });
      return true;
    }

    async function finalizeFail(reason: string): Promise<boolean> {
      if (termState.settled) return false;                  // 已被他方裁定放弃一切副作用
      termState.settled = true;
      clearTimeout(watchdogTimerRef.timer);

      if (imageDeliveredMarkers.has(taskId)) {
        // artifact 已落盘视为实质交付成立：即便走到此处亦升级 succeeded 附 warning 表明曾疑超时不退款防 reverse 白嫖
        const cur = await imageTasks.get(taskId);
        const baseResult: any = cur?.result ?? {};
        const prevWarns: string[] = Array.isArray(baseResult.warnings) ? [...baseResult.warnings] : [];
        prevWarns.push(`upstream slow near deadline (${reason})`);
        await imageTasks.set(taskId, { status: "succeeded", result: { ...baseResult, warnings: prevWarns } });
        await capturePoints(reserve);
        console.warn(`[canvas-image] 任务 ${taskId} 近超时但仍交付成功标注 warning`);
        return true;
      }

      void recordDrawFinish(taskId, "failed", { error: reason });

      // 空手归案 failed 条件全额退款(refundPoints 遇非正值会 throw 故 deducted<=0 短路跳过免中断主流程)
      await imageTasks.set(taskId, { status: /超时|timeout|network|socket|ECONN/i.test(reason) ? "unknown" : "failed", error: reason });
      if (reserve.success && (reserve.deducted || 0) > 0) {
        try {
          await releasePoints(reserve, reason.includes("超时") ? "画布图片超时退还" : "画布图片失败退还");
          console.log(`[canvas-image] 任务 ${taskId} 退款 ${reserve.deducted} 积分(${reason})`);
        } catch (refErr: any) {
          console.error(`[canvas-image] 任务 ${taskId} 退款异常:`, refErr.message);
        }
      }
      return true;
    }

    clearTimeout(watchdogTimerRef.timer);
    // 必须晚于网关的 10 分钟超时，避免上游仍在运行时提前判失败。
    watchdogTimerRef.timer = setTimeout(() => void finalizeFail("图片生成超时（11分钟），结果待核对").catch(console.error), 11 * 60 * 1000);

    // Worker awaits completion; waiting is persisted before any upstream request.
    await (async () => {
      try {
        const aiImage = u.Ai.Image(modelKey as any);

        // 构建参考图清单白名单桥接
        const referenceList = await Promise.all((reference_images || []).map(async (img: any) => {
          const value = typeof img === "string" ? img : img.base64 || img.url || "";
          const path = await authorizeMediaReference(value, assertCurrentMediaOwner);
          return {type: "image" as const, base64: path ? await u.oss.getImageBase64(path) : value};
        }));

        // 计算宽高比(gcd 规约化送上游避免非法浮点比例遭拒收)
        const w = width || 1024;
        const h = height || 1024;
        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
        const g = gcd(w, h);
        const aspectRatio = typeof rest.aspect_ratio === "string" && /^(?:auto|\d{1,2}:\d{1,2})$/.test(rest.aspect_ratio) ? rest.aspect_ratio : `${w / g}:${h / g}` as any;

        // 上游「do request failed」等网络层瞬态失败自动重试一次：
        // 积分只在提交时预扣一次，这里重试不会双扣；超时类错误不重试（上游可能已在出图）。
        const TRANSIENT_UPSTREAM_ERROR = /do request failed|ECONN|socket hang up|network|rate.?limit|429|50[234]/i;
        let runError: unknown = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await aiImage.run({
              prompt,
              referenceList,
              size: imageGenerationTier(size,w,h,rest.resolution),
              aspectRatio,
              ...(rest.exact_size ? { exactSize: rest.exact_size } : {}),
              ...(["text-to-image", "image-edit", "multi-reference"].includes(rest.mode) ? { inputMode: rest.mode } : {}),
            });
            runError = null;
            break;
          } catch (runErr: any) {
            runError = runErr;
            const message = String(runErr?.message || "");
            const isTimeout = runErr?.isTimeout || /等待 \d+ 分钟|\d+ 分钟未返回|timeout of/i.test(message);
            if (attempt === 0 && !isTimeout && TRANSIENT_UPSTREAM_ERROR.test(message)) {
              console.warn(`[canvas-image] 任务 ${taskId} 上游瞬态失败，3 秒后自动重试: ${message}`);
              await new Promise((resolve) => setTimeout(resolve, 3000));
              continue;
            }
            throw runErr;
          }
        }
        if (runError) throw runError;

        // 保存图片落盘 + 拼 OSS 同源代理 URL(Vite/nginx 反代到位规避 download-output 死链)
        const imagePath = `/canvas/generated/${taskId}.jpg`;
        await aiImage.save(imagePath);
        const dimensions=await sharp(await u.oss.getFile(imagePath)).metadata();
        const imageUrl = `/oss${imagePath}`;

        // 收尾：登记落盘标志供 CAS 反向白嫖守卫核验；删原 success-time 二次扣除(已在②预扣过 N 锁额度),
        //   终态写入收敛至 finalizeOk 经 termState 互斥封顶根除 watchdog↔main-flow 双向覆写遗留 bug 及双 toast/双扣隐患；
        //   envelope 去 cost 字段让四条引擎原生轮询消费方失声,xoi-bridge 全局 hook 于 submit 瞬间统一呈现一次仅一次(UX 时机迁移非功能丢失).
        imageDeliveredMarkers.add(taskId);
        const succResult = {
          images: [{ url: imageUrl, width: dimensions.width || w, height: dimensions.height || h }],
          url: imageUrl,
          width: dimensions.width || w,
          height: dimensions.height || h,
        };
        if (await finalizeOk(succResult)) {
          console.log(`[canvas-image] 任务 ${taskId} 完成: ${imageUrl}`);
        }
      } catch (e: any) {
        console.error("[canvas-image] 生成错误:", e.message);
        // 超时先反查造物绘图记录（对标造物 genImage 的 recoverImageCall）：
        // 我们放弃了，上游可能已出图并计费 —— 命中就把图找回落盘，而不是让钱白花。
        // 超时判定要覆盖三种来源：我们自己的中文超时文案、axios 原生超时、
        // 以及网关拦截器把 AbortSignal 超时还原后的错误（含「5 分钟未返回」+ isTimeout 标记）。
        if (e?.isTimeout || /等待 \d+ 分钟|\d+ 分钟未返回|长时间未返回|timeout of \d+ms exceeded/i.test(String(e?.message || ""))) {
          try {
            const recovered = await recoverLateImage({ model: String(modelKey), userId: Number(userId), taskId, since: Date.now() - 330_000 });
            if (recovered) {
              // 纵深防御：造物站返回的 URL 也走 SSRF 防护（公网校验/DNS rebinding/大小截断），
              // 防止上游响应被污染时内网地址进入本服务器的出站请求。
              const { buffer: file } = await fetchBinaryWithLimit(recovered, 128 * 1024 * 1024);
              const imagePath = `/canvas/generated/${taskId}.jpg`;
              await u.oss.writeFile(imagePath, Buffer.from(file));
              const dimensions = await sharp(await u.oss.getFile(imagePath)).metadata();
              const imageUrl = `/oss${imagePath}`;
              imageDeliveredMarkers.add(taskId);
              const recoveredResult = {
                images: [{ url: imageUrl, width: dimensions.width || 1024, height: dimensions.height || 1024 }],
                url: imageUrl,
                width: dimensions.width || 1024,
                height: dimensions.height || 1024,
              };
              if (await finalizeOk(recoveredResult)) {
                console.log(`[canvas-image] 任务 ${taskId} 经造物绘图记录找回: ${imageUrl}`);
              }
              return;
            }
          } catch (re: any) {
            console.warn("[canvas-image] 反查未命中:", re?.message || re);
          }
        }
        // 经 CAS 闸门裁决：无 artifacts 则条件全额退款(②预扣部分返还)，已落盘则升格 succeeded 防 reverse 白嫖(R1 场景守护)
        await finalizeFail(e.message || String(e));
      } finally {
        imageDeliveredMarkers.delete(taskId);
      }
    })().catch((error: any) => console.error(`[canvas-image] 任务 ${taskId} 状态落库异常:`, error?.message || error));

  } catch (e: any) {
    console.error("[canvas-image] 请求错误:", e.message);
    if(!res.headersSent)res.status(e.status||500).json({ error: `图片生成失败: ${e.message}` });else throw e;
  }
};

router.post("/canvas-image-tasks", canvasImageTaskCreate);

// GET /api/canvas-image-tasks/:task_id
router.get("/canvas-image-tasks/:task_id", async (req, res) => {
  // 轮询/查询接口禁止 ETag 304：客户端 !response.ok 会当成失败，节点会永远转圈。
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate"); res.removeHeader("ETag");
  const taskId = req.params.task_id;
  const task = await imageTasks.getForUser(taskId, Number((req as any).user?.id));
  if (!task) {
    return res.status(404).json({ error: "任务不存在" });
  }
  if (task.recoveryRequired || task.status === "unknown") return res.status(409).json({ error: "图片任务结果待核实，请勿重复生成", recoveryRequired: true });
  res.json(task);
});

/* ============================================================
 * 上游画布编辑器任务通道适配（/api/v1/canvas/*）
 * ------------------------------------------------------------
 * 上游画布页（atelier/src/pages/canvas 直接 re-export 上游 page，注释写明
 * "keep on the same upstream store/runtime"）在**登录态**下一律走"账号代理"：
 *   POST /api/v1/canvas/image-tasks            创建任务
 *   GET  /api/v1/canvas/image-tasks/:id        轮询单任务
 *   POST /api/v1/canvas/image-tasks/status     批量查态 {ids}
 * 信封是 {code:0,msg,data}，任务体是 {id,status:"running|completed|failed",progress,image_url,image_urls}；
 * 与 XOi 内部 /api/canvas-image-tasks 的 {task_id} / {status,result,error} 是两套约定。
 * 这里做薄适配：同一套计费 + 供应商管线，两条路径、两种信封。
 * （此前 /api/v1/canvas/* 整体 404，画布编辑器"能配置模型但一生成就失败"。）
 */
const imageTaskErrorMessage = (task: any) => {
  const raw = String(task?.error || "");
  if (/timeout of \d+ms exceeded|超时|ETIMEDOUT|ECONN|socket hang up/i.test(raw)) return "上游生图超时或未返回结果（本单已退款），请换用其他图片模型重试";
  if (raw) return raw;
  if (task?.status === "unknown") return "上游生图未返回结果（本单已退款），请重试或换用其他图片模型";
  return undefined;
};

const upstreamTaskView = (taskId: string, task: any) => {
  const raw = task?.status;
  // unknown/超时是终态：必须让画布节点停下来并提示重试，不能映射成"进行中"无限转圈。
  const status = raw === "succeeded" ? "completed" : raw === "failed" || raw === "unknown" ? "failed" : raw || "queued";
  const images = Array.isArray(task?.result?.images) ? task.result.images.map((i: any) => i?.url).filter(Boolean) : [];
  const single = task?.result?.url || images[0] || "";
  const message = status === "failed" ? imageTaskErrorMessage(task) || "图片生成失败" : undefined;
  // 进度条别死在 0%：按已等待时长给一条渐近曲线（约 1.5 分钟到 60%、封顶 95%），
  // 画布节点就会显示「正在生成 XX%」，用户能看出它在动而不是卡死。
  const startedAt = Number(task?.queuedAt || task?.startedAt || 0);
  const elapsed = startedAt > 0 ? Math.max(0, Date.now() - startedAt) : 0;
  const runningProgress = elapsed ? Math.min(95, Math.round((1 - Math.exp(-elapsed / 90000)) * 95)) : 0;
  return {
    id: taskId,
    source: "canvas" as const,
    source_id: "",
    node_id: "",
    model: task?.model || "",
    prompt: task?.prompt || "",
    status,
    progress: status === "completed" ? 100 : runningProgress,
    image_url: single,
    image_urls: images.length ? images : single ? [single] : [],
    ...(message ? { error: { message }, retryable: true } : {}),
  };
};

router.post("/v1/canvas/image-tasks", async (req: any, res: any) => {
  const rawJson = res.json.bind(res);
  res.json = (body: any) => {
    // 只有成功创建（拿到 task_id）才转成上游信封；错误体原样透传（非 2xx，上游会 fetchErrorDetail 取 message）
    if (body && body.task_id) {
      return rawJson({ code: 0, msg: "", data: upstreamTaskView(body.task_id, { status: body.status || "queued", model: req.body?.model, prompt: req.body?.prompt }) });
    }
    return rawJson(body);
  };
  await canvasImageTaskCreate(req, res);
});

router.get("/v1/canvas/image-tasks/:task_id", async (req: any, res: any) => {
  // 轮询接口绝不能走 ETag/304：上游画布对 !response.ok 直接抛错，304 会让节点永远停在"生成中"。
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.removeHeader("ETag");
  const task = await imageTasks.getForUser(req.params.task_id, Number(req.user?.id));
  if (!task) return res.status(404).json({ code: 404, msg: "任务不存在", data: null });
  // 超时/待核实不再返回 409（那会让画布节点一直转圈）：改为 failed 视图 + 明确原因，前端可提示重试。
  const view = upstreamTaskView(req.params.task_id, task);
  return res.json({ code: 0, msg: "", data: task.recoveryRequired || task.status === "unknown" ? { ...view, recoveryRequired: true } : view });
});

router.post("/v1/canvas/image-tasks/status", async (req: any, res: any) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.removeHeader("ETag");
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  const records = await Promise.all(ids.slice(0, 100).map(async id => ({ id, task: await imageTasks.getForUser(id, Number(req.user?.id)) })));
  res.json({ code: 0, msg: "", data: records.filter(row => row.task).map(row => upstreamTaskView(row.id, row.task)) });
});

router.delete("/v1/canvas/image-tasks/:task_id", async (_req: any, res: any) => {
  if (!await imageTasks.deleteForUser(_req.params.task_id, Number(_req.user?.id))) return res.status(404).json({ code: 404, msg: "任务不存在或尚未完成", data: null });
  res.json({ code: 0, msg: "", data: null });
});

// POST /api/canvas-comfy-tasks — ComfyUI 任务
router.post("/canvas-comfy-tasks", (req, res) => {
  res.json({ task_id: null, message: "未配置 ComfyUI" });
});

// GET /api/canvas-comfy-tasks/:task_id
router.get("/canvas-comfy-tasks/:task_id", (req, res) => {
  res.json({ status: "failed", error: "未配置 ComfyUI" });
});

// POST /api/canvas-video — 视频生成(u.Ai.Video pipeline 正式接通·A 方案)
//   异步双端口镜像 /api/canvas-image-tasks:POST 创建任务即时返 task_id,fire-and-forget 后台跑
//   u.Ai.Video(`${vendorId}:${modelName}`).run(cfg).save(rel) 全程;下方配套 GET :task_id 供前端轮询内存 Map 终态。
//   provider_id 通用框架复刻 findVendorByModel/getVendorApiConfig 定位任意 enable=1 && type==='video' 型号;
//   首跑依赖 seed 元信息齐全的 agnes-video-v2.0(version='1.1'<2 ⇒ ai.ts 自动注入 input.imageBase64 数组喂老模板,
//   其 videoRequest 内部封装 创建任务→pollTask 每5秒探直到 completed/failed 或10分钟超时→下载 base64 整条流水线,
//   caller 单个 await .run() 即阻塞至成品无需自造远程轮询)。
type CanvasVideoTaskState = { status: "queued" | "cancelled" | "running" | "succeeded" | "failed" | "unknown"; result?: any; error?: string; upstreamId?: string; modelKey?: string; recoveryRequired?: boolean };
const canvasVideoTasks = new DurableTasks<CanvasVideoTaskState>(taskDb, "video", (id) => videoDeliveredMarkers.delete(id));

// deliveryMarkerRegistry：CAS 终态仲裁闸门的反向白嫖守卫数据源 —— 视频流水线 vid.save() 落盘成功后在此登记 taskId，
//   finalizeFail 进入结算裁决时据此判别是否实质交付以防“近超时却已出货被错退”的薅羊毛场景（R1 场景守护）。
//   标记只在当前生成流水线运行期间保留，收尾后清理，历史状态由数据库保存。
const videoDeliveredMarkers = new Set<string>();

// timeoutGuard:超过约15分钟仍未完成任务交由 finalizeFail 裁决(agnes 自身10min 上限留充足余裕给下载/OSS 落盘降假阴率);
//   fired 后经 CAS 闸门核验是否已落盘,命中则升格 succeeded-delivered-late 不退款防反向白嫖
const CANVAS_VIDEO_TIMEOUT_MS = 34 * 60 * 1000;

// 画布生成器旁边的积分预览：复用管理员配置的基础价/供应商覆写，不在前端复制计费规则。
router.get("/canvas-video-pricing", async (req, res) => {
  try {
    const modelName = typeof req.query.model === "string" ? req.query.model.trim() : "";
    const cfg = modelName ? await getVendorApiConfig(modelName) : null;
    const points = await getActionPoints("video_generate", cfg ? { vendorId: String(cfg.vendorId), modelName } : undefined);
    res.json({ points });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "读取视频计费失败" });
  }
});

// images(ref对象)/videos(str)/audios(str) 三类不同维度统一收敛为 AiVideo.referenceList 期望的 {type,base64}[];
// 支持三种来源:dataURL(直送剥前缀)、本仓 /oss/<rel>(经 u.oss.getImageBase64 取字节目名虽 Image 实通用 reader 含 mp3/mp4 mime dict)、https 公网直链(fetch 抓 buffer 转 base64)。
function providerMediaOrigin() {
  const base = process.env.XOI_PUBLIC_BASE_URL || process.env.ossURL;
  if (!base) throw Object.assign(new Error("此线路需要公网素材域名，请管理员配置 XOI_PUBLIC_BASE_URL，未提交上游"), {status: 400});
  const url = validateOutboundUrl(base, false);
  if (url.protocol !== "https:") throw Object.assign(new Error("公网素材域名必须使用 HTTPS"), {status: 400});
  return url.origin;
}
async function resolveCanvasMediaRef(
  rawUrl: string,
  hintType: "image" | "audio" | "video",
  requireUrl = false,
): Promise<{ type: "image" | "audio" | "video"; base64: string; url?: string } | null> {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    if (/^data:/i.test(rawUrl)) {
      const stripped = rawUrl.replace(/^data:[^;]*;base64,/i, "");
      return { type: hintType, base64: hintType === "image" ? rawUrl : (stripped === rawUrl ? rawUrl : stripped) };
    }
    const rel = await authorizeMediaReference(rawUrl, assertCurrentMediaOwner);
    if (rel) {
      const dataUrl = await u.oss.getImageBase64(rel);
      return { type: hintType, base64: hintType === "image" ? String(dataUrl) : String(dataUrl).replace(/^data:[^;]+;base64,/i, ""), ...(requireUrl ? {url: providerMediaOrigin() + await signedProviderMedia("/oss" + rel)} : {}) };
    }
    if (/^https?:\/\//i.test(rawUrl)) {
      const { buffer: buf } = await fetchBinaryWithLimit(rawUrl);
      return { type: hintType, base64: buf.toString("base64"), url: rawUrl };
    }
    console.warn("[canvas-video] 未识别的媒体协议已跳过:", rawUrl.slice(0, 120));
    return null;
  } catch (e: any) {
    console.warn("[canvas-video] resolveCanvasMediaRef 解码失败:", e.message);
    return null;
  }
}

// 无限画布视频面板的比例选择器含七档几何比另加 keep/adapt 非标语义;
// 这里收敛进已知名单:命中即直送、其余(keep_ratio/adaptive/auto/空/乱码)统一回落 16:9 并标 dropped 由上层提示用户已被降级处理。
function normaliseCanvasAspect(
  raw: unknown
): { ratio: "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9" | "9:21"; dropped?: true } {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  switch (v) {
    case "9:16":
      return { ratio: "9:16" };
    case "1:1":
      return { ratio: "1:1" };
    case "4:3":
      return { ratio: "4:3" };
    case "3:4":
      return { ratio: "3:4" };
    case "21:9":
      return { ratio: "21:9" };
    case "9:21":
      return { ratio: "9:21" };
    case "16:9":
      return { ratio: "16:9" };
    default:
      return { ratio: "16:9", dropped: true };
  }
}

// 内部视频创建 handler 提成常量：/api/canvas-video 与上游 /api/v1/videos（文件底部适配层）两条路径共用同一套计费+供应商管线
const canvasVideoTaskCreate = async (req: any, res: any) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "未登录", message: "未登录" });

    const body = req.body || {};
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return res.status(400).json({ error: "提示词不能为空", message: "提示词不能为空" });
    for (const key of ["images", "videos", "audios"]) {
      const list = body[key] ?? [];
      if (!Array.isArray(list) || list.length > 32) return res.status(400).json({error: "参考素材格式或数量无效"});
      for (const item of list) await authorizeMediaReference(typeof item === "string" ? item : item?.url, assertCurrentMediaOwner);
    }

    // ① 定位 vendor/model —— 兼容纯 modelName 与 `${vendorId}:${modelName}` 两形态(忽略不可靠的 provider_id 占位字段如 comfly/volcengine)
    const rawModelField =
      typeof body.model === "string" && body.model.trim() ? String(body.model).trim() : "";
    const bareModelName = rawModelField.includes(":")
      ? rawModelField.split(/:(.+)/)[1]
      : rawModelField;

    // 先 probe 至少存在一个启用中的 vendor,否则 getVendorApiConfig 在空集下会抛 TypeError(undefined.inputValues)
    const anyVendorOn = await u.db("o_vendorConfig").where("enable", 1).first();
    if (!anyVendorOn) {
      return res.status(400).json({
        error: "尚未在管理面板启用任何 AI 供应商,请联系管理员先勾选并配置 API Key 再试",
        message: "尚未在管理面板启用任何 AI 供应商,请联系管理员先勾选并配置 API Key 再试",
      });
    }

    const resolvedVideoModel = (await resolveUserCatalogModel(Number(userId), bareModelName, "video", !bareModelName)).model.modelName;
    const cfg = await getVendorApiConfig(resolvedVideoModel);
    const vm = cfg && cfg.model;
    if (!vm || vm.type !== "video") {
      console.warn(`[canvas-video] 视频模型匹配失败: raw=${rawModelField || "<empty>"}, normalized=${bareModelName || "<empty>"}, matched=${vm?.modelName || "<none>"}, type=${vm?.type || "<none>"}`);
      return res.status(400).json({
        error: `视频模型未匹配：${bareModelName || "未选择模型"}。请在管理面板确认该模型类型为 video，并重新选择`,
        message: `视频模型未匹配：${bareModelName || "未选择模型"}。请在管理面板确认该模型类型为 video，并重新选择`,
      });
    }
    if (cfg!.vendorId !== "newapi") return res.status(400).json({ error: "视频生成只允许使用 NewAPI 模型", message: "视频生成只允许使用 NewAPI 模型" });

    if (/^seedance2\.[05]-(line1(?:-fast)?|full(?:-fast)?)(?:-xoi)?$/.test(String(vm.modelName))) {
      if ([...(body.images || []), ...(body.videos || []), ...(body.audios || [])].some(item => localMediaReference(typeof item === "string" ? item : item.url))) providerMediaOrigin();
      const enums = vm.enums || {};
      const resolution = String(body.resolution || "").toLowerCase().replace(/^(480|720|1080)$/, "$1p");
      const duration = Number(body.duration);
      if (!enums.duration?.map(String).includes(String(duration)) || !enums.resolution?.map(String).includes(resolution)) {
        return res.status(400).json({ error: "当前时长或清晰度不在模型支持范围，请重新选择后生成" });
      }
      if (body.aspect_ratio && !enums.aspect_ratio?.includes(body.aspect_ratio)) return res.status(400).json({ error: "当前画幅比例不在模型支持范围" });
      for (const key of ["images", "videos", "audios"] as const) {
        const list = Array.isArray(body[key]) ? body[key] : [];
        if (list.length > (vm.referenceLimits?.[key] ?? 0)) return res.status(400).json({ error: `该模型最多支持 ${vm.referenceLimits?.[key] ?? 0} 个${({ images: "参考图", videos: "参考视频", audios: "参考音频" })[key]}` });
        // These native upstream routes require retrievable URLs; never silently drop local media.
        if (list.some((item: any) => !/^https?:\/\//i.test(typeof item === "string" ? item : item?.url || ""))) return res.status(400).json({ error: "该线路的参考素材需要公网地址，请上传至对象存储后重试；本次未提交、未扣费" });
      }
      body.resolution = resolution;
    }

    // ② 积分门禁：提交即 atomic reserve（serene-splashing-pebble.md 计费重构 · 配套评审探针对抗审视）
    //   替换原“probe 仅探不上账→上游成功后才实扣”的延后扣模式为“submit 瞬间事务预扣 N 锁额度＋后台任一路径经 CAS 仲裁退款”，
    //   既满足“一点 API 生成就扣／不成则归还”心智，又令前端 xoi-bridge.pickCost 可嗅探 submit 响应顶层 cost 秒级弹金卡根治迟到体感。
    //   audit 维度(vendor_id/model_name 列)由 checkAndDeductPoints 内部依 ctx 自动写 o_points_log 无需额外维护。
    const pricingCtx = { vendorId: String(cfg!.vendorId!), modelName: String(vm.modelName!) };
    const taskId = req.__mediaJob?.taskId || `v_${u.uuid()}`;
    const reserve = await reservePoints({
      userId,
      requestId: `canvas-video:${taskId}`,
      scene: "canvas.video",
      action: "video_generate",
      description: "画布视频生成",
      pricingCtx,
      referenceType: "canvas_task",
      referenceId: taskId,
      metadata: { duration: body.duration, resolution: body.resolution, audio: Boolean(body.generate_audio) },
    });
    if (!reserve.success) {
      return res.status(400).json({ error: reserve.message!, message: reserve.message! });
    }

    // ③ 取号入册即时响应(fire-and-forget)；顶层附 cost 快照供前端 pickCost 点击秒级唤金卡（balance 为快照非权威最新,UI 展示余额请另调 refreshProfile）.
    if(!req.__mediaJob){
      const modelKey=`${cfg!.vendorId}:${vm.modelName}`;
      const job=await mediaQueue.enqueue("video",taskId,Number(userId),getGatewayRequestContext()?.billingId||"",queueRequest("video",{...body,model:modelKey}),{model:modelKey,modelKey,prompt,sourceId:body.source_id,nodeId:body.node_id},body.clientTaskId||body.client_task_id);
      return res.json({task_id:job.id,status:job.status,pointsDeducted:null,queueMessage:"已进入等待队列，尚未提交上游；实际调用时按用量结算"});
    }
    res.json({
      task_id: taskId,
      pointsDeducted: reserve.deducted && reserve.deducted > 0 ? reserve.deducted : null,
      balance: await getUserPoints(userId),
    });

    // per-task CAS 终态仲裁器（P-agent P0①必修项）：watchdog／async-catch／async-success 三路并发争抢唯一终态写入权；
    //   settled flag 位于各 mutator 首句 JS 单线程下任一方独占置位杜绝交错漏检；
    //   反向白嫖守卫靠 videoDeliveredMarkers 核验已落盘 artifacts 防“近超时出货被错退”（R1 场景守护）.
    const watchdogTimerRef = { timer: setTimeout(() => {}, 0) }; // 占位待真实看守钟赋值覆盖
    const termState = { settled: false as boolean };

    async function finalizeOk(resultPayload: any): Promise<boolean> {
      if (termState.settled) return false;                  // 输家静默退出禁动 Map/timer/db
      termState.settled = true;
      clearTimeout(watchdogTimerRef.timer);
      await canvasVideoTasks.set(taskId, { status: "succeeded", result: resultPayload });
      void capturePoints(reserve).catch((settleError: any) => {
        console.error(`[canvas-video] 任务 ${taskId} 结算异常:`, settleError?.message || settleError);
      });
      return true;
    }

    async function finalizeFail(reason: string): Promise<boolean> {
      if (termState.settled) return false;                  // 已被他方裁定放弃一切后续副作用
      termState.settled = true;
      clearTimeout(watchdogTimerRef.timer);

      if (videoDeliveredMarkers.has(taskId)) {
        // artifact 已落盘视为实质交付成立：维持 succeeded 附 warning 表明曾疑超时不退款防 reverse 白嫖
        const cur = await canvasVideoTasks.get(taskId);
        const baseResult: any = cur?.result ?? {};
        const prevWarns: string[] = Array.isArray(baseResult.warnings) ? [...baseResult.warnings] : [];
        prevWarns.push(`upstream slow near deadline (${reason})`);
        await canvasVideoTasks.set(taskId, { status: "succeeded", result: { ...baseResult, warnings: prevWarns } });
        await capturePoints(reserve);
        console.warn(`[canvas-video] 任务 ${taskId} 近超时但已交付成功标注 warning`);
        return true;
      }

      // 空手而归标 failed 并条件全额退款（refundPoints 遇 points<=0 会 throw 故 deducted<=0 短路跳过免中断主流程）
      const state = await canvasVideoTasks.get(taskId);
      // A timeout is not proof of upstream failure. Preserve the remote identity for GET-only recovery.
      await canvasVideoTasks.set(taskId, { status: state?.upstreamId || /超时|timeout|network|socket|ECONN/i.test(reason) ? "unknown" : "failed", error: reason });
      if (reserve.success && (reserve.deducted || 0) > 0) {
        try {
          await releasePoints(reserve, reason.includes("超时") ? "画布视频超时退还" : "画布视频失败退还");
          console.log(`[canvas-video] 任务 ${taskId} 退款 ${reserve.deducted} 积分(${reason})`);
        } catch (refErr: any) {
          console.error(`[canvas-video] 任务 ${taskId} 退款异常:`, refErr.message);
        }
      }
      return true;
    }

    clearTimeout(watchdogTimerRef.timer);                   // 弃占位启用真看守钟
    watchdogTimerRef.timer = setTimeout(() => void finalizeFail("视频生成超时（34分钟），结果待核对").catch(console.error), CANVAS_VIDEO_TIMEOUT_MS);

    await (async () => {
      try {
        // ④ ref→base64 白名单桥接:imgArr 恒按 image 角色/vidArr 按 video/audArr 按 audio(payload 位置已编码意图无需扩展名推断)
        const imgArr: any[] = Array.isArray(body.images) ? body.images : [];
        const vidArr: any[] = Array.isArray(body.videos) ? body.videos : [];
        const audArr: any[] = Array.isArray(body.audios) ? body.audios : [];
        const candItems = [
          ...imgArr.map((r: any) => ({
            url: typeof r === "string" ? r : r && r.url,
            kind: "image" as const,
          })),
          ...vidArr.map((s: any) => ({ url: s, kind: "video" as const })),
          ...audArr.map((s: any) => ({ url: s, kind: "audio" as const })),
        ];
        const refs = (
          await Promise.all(
            candItems.map(async (c) => resolveCanvasMediaRef(String(c.url ?? ""), c.kind, /^seedance2\.[05]-(line1(?:-fast)?|full(?:-fast)?)(?:-xoi)?$/.test(String(vm.modelName))))
          )
        ).filter(Boolean) as Array<{ type: "image" | "audio" | "video"; base64: string }>;
        if (refs.length !== candItems.length) throw new Error("参考素材读取失败，任务未提交到上游，请检查素材后重试");

        // ⑤ VideoConfig 构造(duration/resolution 以 selectedModel.durationResolutionMap 权威档位为准防远端拒收非法参数)
        const drmEntry =
          Array.isArray(vm.durationResolutionMap) && vm.durationResolutionMap.length > 0
            ? vm.durationResolutionMap[0]
            : null;
        const userDuration = Number(body.duration);
        const finalDuration =
          Number.isFinite(userDuration) && userDuration > 0
            ? userDuration
            : Number(Array.isArray(drmEntry?.duration) ? drmEntry?.duration?.[0] : NaN) || 5;
        const finalResolution =
          (typeof body.resolution === "string" && body.resolution) ||
          (Array.isArray(drmEntry?.resolution) ? drmEntry?.resolution?.[0] : "") ||
          "";

        // 设置项诚实度审计:UI 勾选的增强开关多数无对应管道位(各 vendor 模板自取所需字段、VideoConfig 七字段子集不收它们);
        // 与其彻底静默丢不如显式登记告警,既打后端日志便于排查又以 result.warnings 回吐前端二次提示避免误以为生效。
        const unsupportedWarnings: string[] = [];
        ["enhance_prompt", "enable_upsample", "watermark", "camerafixed", "multimodal"].forEach((f) => {
          if (Boolean(body[f])) unsupportedWarnings.push(`${f}=on`);
        });
        if (normaliseCanvasAspect(body.aspect_ratio).dropped)
          unsupportedWarnings.push(`aspect_ratio='${String(body.aspect_ratio ?? "")}'不支持已降级16:9`);
        if (typeof vm.audio === "boolean" && !vm.audio && Boolean(body.generate_audio))
          unsupportedWarnings.push("audio=on(当前型号不支持音频)");
        if (unsupportedWarnings.length)
          console.warn("[canvas-video] 忽略不受支持的设置项:", unsupportedWarnings.join("; "));

        const runCfg: any = {
          duration: finalDuration,
          resolution: finalResolution,
          aspectRatio: normaliseCanvasAspect(body.aspect_ratio).ratio,
          prompt,
          audio: typeof vm.audio === "boolean" ? vm.audio : Boolean(body.generate_audio),
          mode: body.mode === "first-last" ? ["startEndRequired"] : Array.isArray(vm.mode) ? vm.mode : [],
          ...(body.mode === "first-frame" ? { frameMode: "first-frame" } : {}),
        };
        if (refs.length > 0) runCfg.referenceList = refs;

        // ⑥ pipeline 执行 + OSS 落盘出料(save=path 落本地 fs mkdir -p/auto-strip dataURL prefix;outUrl 拼 /oss 同源代理沿 image-tasks:600 口径 Vite/nginx 反代到位)
        const vid = u.Ai.Video(`${cfg!.vendorId}:${vm.modelName}`);
        runCfg.onSubmitted = async (upstreamId: string) => {
          await canvasVideoTasks.set(taskId, { status: "running", upstreamId });
        };
        await vid.run(runCfg);
        const relSavePath = `/canvas/video/${userId}/${u.uuid()}.mp4`;
        await vid.save(relSavePath);
        const outUrl = `/oss${relSavePath}`;

        videoDeliveredMarkers.add(taskId);
        // ⑦ 收尾：登记落盘标志供 CAS 反向白嫖守卫核验,删原 success-time 二次扣除(已在②预扣过 N 锁额度),
        //   终态写入收敛至 finalizeOk 经 termState 互斥封顶,根除 watchdog↔main-flow 双向覆写遗留 bug 及双 toast/双扣隐患.
        const succResult: Record<string, unknown> = {
          status: "succeeded",
          videos: [{ url: outUrl }],
          url: outUrl,
          ...(unsupportedWarnings.length ? { warnings: [...unsupportedWarnings] } : {}),
        };
        if (await finalizeOk(succResult)) {
          console.log(`[canvas-video] 任务 ${taskId} 完成: ${outUrl}`);
        }
      } catch (e: any) {
        console.error("[canvas-video] 任务失败:", e.message);
        // 经 CAS 闸门裁决：无 artifacts 则条件全额退款(已在②预扣的部分返还)，已落盘则升格 succeeded 防 reverse 白嫖(R1 场景守护)
        await finalizeFail(e.message || String(e));
      } finally {
        videoDeliveredMarkers.delete(taskId);
      }
    })().catch((error: any) => console.error(`[canvas-video] 任务 ${taskId} 状态落库异常:`, error?.message || error));
  } catch (e: any) {
    console.error("[canvas-video] 请求处理异常:", e.message);
    if(!res.headersSent)res.status(e.status||500).json({ error: e.message || String(e), message: e.message || String(e) });else throw e;
  }
};

router.post("/canvas-video", canvasVideoTaskCreate);
registerMediaHandler("image",job=>runQueuedRoute(canvasImageTaskCreate,job));
registerMediaHandler("video",job=>runQueuedRoute(canvasVideoTaskCreate,job));

/* ============================================================
 * 上游画布编辑器视频通道适配（/api/v1/videos*）
 * ------------------------------------------------------------
 * 上游 video.ts 在登录态（账号代理）下走一组独立约定：
 *   POST   /api/v1/videos            创建（body: {model, prompt, seconds, size, aspect_ratio, images, videos, audios, first_frame...}）
 *   GET    /api/v1/videos/:id?model= 轮询（data.status: processing|completed|failed, video_url, progress）
 *   GET    /api/v1/videos/:id/content  成片二进制（302 到同源 /oss 落盘件即可）
 *   GET    /api/v1/async-result/:id   通用异步结果轮询（视频同形）
 *   GET|DELETE /api/v1/video-tasks[/:id] 任务列表/删除（内存任务表，列表给空即可）
 * 信封 {code, msg, data}；unwrapVideoResponse 见上游 services/api/video.ts:786。
 * 与内部 /api/canvas-video（{task_id}/{status,result,error}）同一套计费与供应商管线，两种路径两种信封。
 * ============================================================ */

const videoTaskToUpstream = (id: string, t: { status: string; result?: any; error?: string }, model?: unknown) => {
  const completed = t.status === "succeeded";
  const videoUrl: string = t.result?.url || t.result?.videos?.[0]?.url || "";
  return {
    id,
    task_id: id,
    model: typeof model === "string" ? model : undefined,
    status: completed ? "completed" : t.status === "running" ? "processing" : t.status,
    progress: completed ? 100 : 0,
    video_url: videoUrl || undefined,
    url: videoUrl || undefined,
    error: t.error ? { message: t.error } : undefined,
    warnings: Array.isArray(t.result?.warnings) ? t.result.warnings : undefined,
  };
};

const wrapVideoCreated = (handler: any) => async (req: any, res: any) => {
  const json = res.json.bind(res);
  res.json = (payload: any) => {
    if (payload && typeof payload.task_id === "string") {
      return json({
        code: 0,
        msg: "",
        data: { id: payload.task_id, task_id: payload.task_id, status: payload.status || "queued", progress: 0, model: req.body?.model },
        points_deducted: payload.pointsDeducted ?? null,
        balance: payload.balance,
      });
    }
    return json(payload);
  };
  return handler(req, res);
};

router.post("/v1/videos", wrapVideoCreated(async (req: any, res: any) => {
  req.body = canvasVideoRequest(req.body || {}, req.headers);
  await canvasVideoTaskCreate(req, res);
}));

router.get("/v1/videos/:task_id", async (req: any, res: any) => {
  // 轮询/查询接口禁止 ETag 304：客户端 !response.ok 会当成失败，节点会永远转圈。
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate"); res.removeHeader("ETag");
  const t = await recoverGatewayVideo(canvasVideoTasks, req.params.task_id, Number((req as any).user?.id));
  if (!t) return res.status(404).json({ code: 1, msg: "任务不存在或已过期", data: null });
  res.json({ code: 0, msg: "", data: videoTaskToUpstream(req.params.task_id, t, req.query.model) });
});

router.get("/v1/videos/:task_id/content", async (req: any, res: any) => {
  const t = await recoverGatewayVideo(canvasVideoTasks, req.params.task_id, Number(req.user?.id));
  const url: string = t?.result?.url || t?.result?.videos?.[0]?.url || "";
  if (t?.status !== "succeeded" || !url) return res.status(404).json({ code: 1, msg: "成片尚未就绪", data: null });
  // 只放行 http(s) 成品地址（存库值异常时不得把用户重定向到任意协议/地址）
  if (!/^https?:\/\//i.test(url)) return res.status(404).json({ code: 1, msg: "成片地址无效", data: null });
  res.redirect(url);
});

router.get("/v1/async-result/:task_id", async (req: any, res: any) => {
  // 轮询/查询接口禁止 ETag 304：客户端 !response.ok 会当成失败，节点会永远转圈。
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate"); res.removeHeader("ETag");
  const t = await recoverGatewayVideo(canvasVideoTasks, req.params.task_id, Number(req.user?.id));
  if (!t) return res.status(404).json({ code: 1, msg: "任务不存在或已过期", data: null });
  res.json({ code: 0, msg: "", data: videoTaskToUpstream(req.params.task_id, t, req.query.model) });
});

router.get("/v1/video-tasks", async (_req: any, res: any) => {
  // 轮询/查询接口禁止 ETag 304：客户端 !response.ok 会当成失败，节点会永远转圈。
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate"); res.removeHeader("ETag");
  const tasks = await canvasVideoTasks.listForUser(Number(_req.user?.id));
  res.json({ code: 0, msg: "", data: tasks.map(t => ({ ...videoTaskToUpstream(t.id, { ...t, status: t.status ?? "unknown" }), recovery_required: t.recoveryRequired, error: t.recoveryRequired ? { message: "服务重启，查询原任务即可；请勿重复提交" } : undefined })) });
});

router.delete("/v1/video-tasks/:task_id", async (_req: any, res: any) => {
  if (!await canvasVideoTasks.deleteForUser(_req.params.task_id, Number(_req.user?.id))) return res.status(404).json({ code: 1, msg: "任务不存在或尚未完成", data: null });
  res.json({ code: 0, msg: "", data: null });
});

// GET /api/canvas-video/:task_id — 前端轮询查任务状态(对称 /api/canvas-image-tasks/:task_id @643 内存 Map 查表风格)
router.get("/canvas-video/:task_id", async (req, res) => {
  // 轮询/查询接口禁止 ETag 304：客户端 !response.ok 会当成失败，节点会永远转圈。
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate"); res.removeHeader("ETag");
  const t = await recoverGatewayVideo(canvasVideoTasks, req.params.task_id, Number((req as any).user?.id));
  if (!t) return res.status(404).json({ error: "任务不存在或已过期" });
  res.json(t);
});

// POST /api/ai/upload — 上传文件
router.post("/ai/upload", (req, res) => {
  res.status(404).json({ message: "暂不支持" });
});

// POST /api/ai/import-local-image
router.post("/ai/import-local-image", (req, res) => {
  res.status(404).json({ message: "暂不支持" });
});

// POST /api/upload — 通用上传
router.post("/upload", (req, res) => {
  res.status(404).json({ message: "暂不支持" });
});

// POST /api/cloud-video/upload
router.post("/cloud-video/upload", (req, res) => {
  res.status(404).json({ message: "暂不支持" });
});

// POST /api/online-image
router.post("/online-image", (req, res) => {
  res.status(404).json({ message: "暂不支持" });
});

// POST /api/runninghub/upload-asset
router.post("/runninghub/upload-asset", (req, res) => {
  res.status(404).json({ message: "暂不支持" });
});

// GET /api/image-task-query
router.get("/image-task-query", (req, res) => {
  res.json({ status: "unknown" });
});

// GET /api/smart-canvas/prompt-templates
router.get("/smart-canvas/prompt-templates", (req, res) => {
  res.json({ templates: [], source: "" });
});

// GET /api/download-output — 代理下载/预览输出图片
// 原项目（Python FastAPI）有此端点，画布用它来预览和下载生成的图片
router.get("/download-output", async (req, res) => {
  // 全局 /api 鉴权中间件已要求 token；这里再显式确认一次，防止将来路由被前移到鉴权
  // 之前时，这个「受限公网抓取代理」意外变成匿名可用的开放代理。
  if (!(req as any).user) return res.status(401).json({ error: "未登录" });
  try {
    const url = String(req.query.url || "");
    const name = String(req.query.name || "output.jpg");
    const inline = req.query.inline === "1" || req.query.inline === "true";
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");

    if (!url) {
      return res.status(400).json({ error: "缺少 url 参数" });
    }

    // 本地路径（/oss/... 或 /assets/...）：从 OSS 目录读取文件
    if (url.startsWith("/oss/") || url.startsWith("/assets/")) {
      // 去掉前缀 /oss/ 或 /assets/，得到 OSS 相对路径
      const relPath = url
        .replace(/^\/oss\//, "")
        .replace(/^\/assets\//, "");
      try {
        const buffer = await u.oss.getFile(relPath);
        const ext = relPath.split(".").pop()?.toLowerCase() || "jpg";
        const mimeMap: Record<string, string> = {
          jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
          gif: "image/gif", webp: "image/webp", bmp: "image/bmp",
          svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm",
          mov: "video/quicktime", mp3: "audio/mpeg", wav: "audio/wav",
        };
        const contentType = safeInlineMediaType(mimeMap[ext] || "application/octet-stream");
        res.setHeader("Content-Type", contentType);
        res.setHeader(
          "Content-Disposition",
          inline
            ? `inline; filename="${encodeURIComponent(name)}"`
            : `attachment; filename="${encodeURIComponent(name)}"`
        );
        res.setHeader("Cache-Control", "private, no-store");
        return res.send(buffer);
      } catch (e: any) {
        console.error("[download-output] 读取本地文件失败:", relPath, e.message);
        return res.status(404).json({ error: "文件不存在" });
      }
    }

    // 外部 URL：代理请求。仅公网地址（safeUrl：内网/localhost/DNS rebinding 全拦），
    // 且有独立限流 —— 它本质是个受限的公网抓取代理，不能无成本滥用。
    if (url.startsWith("http://") || url.startsWith("https://")) {
      await new Promise<void>((resolve, reject) => sharedRateLimiter("download-output-proxy", 60_000, 30, (r) => String((r as any).user?.id || r.ip))(req, res, (err?: unknown) => err ? reject(err as Error) : resolve()));
      try {
        const { buffer, contentType: upstreamType } = await fetchBinaryWithLimit(url);
        const contentType = safeInlineMediaType(upstreamType);
        res.setHeader("Content-Type", contentType);
        res.setHeader(
          "Content-Disposition",
          inline
            ? `inline; filename="${encodeURIComponent(name)}"`
            : `attachment; filename="${encodeURIComponent(name)}"`
        );
        return res.send(buffer);
      } catch (e: any) {
        console.error("[download-output] 代理请求失败:", url, e.message);
        return res.status(e.status === 400 ? 400 : 502).json({ error: e.status === 400 ? "不允许访问该地址" : "代理请求失败" });
      }
    }

    return res.status(400).json({ error: "不支持的 URL 格式" });
  } catch (e: any) {
    // 安全（2026-10-26 审计 R-E）：不把原始 e.message 回给前端（可能夹带内部路径/上游细节），细节只进服务端日志。
    console.error("[download-output] 错误:", e.message);
    return res.status(500).json({ error: "下载服务暂时不可用，请稍后重试" });
  }
});

export default router;
