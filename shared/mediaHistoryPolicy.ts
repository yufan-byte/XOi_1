/** Generation history is not an expiring browser cache. No retroactive TTL is enabled here. */
export const MEDIA_HISTORY_POLICY = {
  version: 1,
  recordRetentionDays: null,
  automaticGeneratedMediaCleanup: false,
  recommendedTemporaryMediaDays: 30,
  cleanupNoticeDays: 7,
  browserCacheLimit: 200,
  summary: "任务记录按账号保存在云端，长期保留，不因超过 200 条而删除。",
  mediaNotice: "目前未启用生成素材的自动到期删除。建议及时下载原文件；若以后启用临时素材清理，至少保留 30 天，并提前至少 7 天在站内说明。项目素材按项目生命周期保留。",
} as const;
