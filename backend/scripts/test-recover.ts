import "@/env";
import { recoverLateImage } from "@/lib/workspace/imageRecover";

/**
 * 手动验证「迟到结果反查」。
 * 用法：npx tsx scripts/test-recover.ts <userId> <taskId> [model]
 */
async function main() {
  const [userIdRaw, taskId, model = "newapi:gpt-image-2"] = process.argv.slice(2);
  const userId = Number(userIdRaw);
  if (!Number.isSafeInteger(userId) || userId <= 0 || !taskId) {
    console.error("用法：npx tsx scripts/test-recover.ts <userId> <taskId> [model]");
    process.exit(2);
  }
  const url = await recoverLateImage({ model, userId, taskId, since: Date.now() - 2 * 3600 * 1000 });
  console.log("反查结果:", url ?? "(未命中)");
  process.exit(0);
}
main().catch((e) => {
  console.error("失败:", e?.response?.status ?? "", e?.message || e);
  process.exit(1);
});
