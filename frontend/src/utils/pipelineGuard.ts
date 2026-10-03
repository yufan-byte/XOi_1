import { DialogPlugin } from "tdesign-vue-next";
import type { Router } from "vue-router";

/**
 * 影视流水线的前置校验（把「静默失败」改成「明确提示」）。
 *
 * 这里只做判断与提示，**不请求接口** —— 调用方用自己已经加载好的实时数据来问。
 * 这样零额外往返，也不会因为守卫多拉一次数据而拖慢页面；更不会像用 project.progress
 * 那样读到过期计数（刚在上一页提取完资产就跳过来，缓存里的 total 还是 0）。
 */

/**
 * 进入「角色场景」前的校验：项目里还没有角色/场景资产时，提示并引导回剧本整理页提取。
 * @param hasAssets 当前页实时加载到的资产数 > 0
 * @returns true 表示可以继续留在本页
 */
export function guardCornerScape(router: Router, hasAssets: boolean): boolean {
  if (hasAssets) return true;

  const dialog = DialogPlugin.confirm({
    header: "还没有角色 / 场景资产",
    body: "角色、场景和道具是在「剧本整理」页从分集剧本里提取出来的。先去那里选中剧本点「提取资产」，再回来出图。",
    confirmBtn: "去剧本整理",
    cancelBtn: "留在本页",
    onConfirm: () => {
      dialog.destroy();
      router.push("/script");
    },
    onClose: () => dialog.destroy(),
  });
  return false;
}

export interface ProductionGuardInput {
  /** 项目的分集剧本数 */
  scriptCount: number;
  /** 角色/场景资产总数（含派生资产） */
  assetTotal: number;
  /** 已出图的资产数 */
  assetDone: number;
}

/**
 * 进入「分镜成片」前的校验：
 * ① 没有任何分集剧本 → 拦回去整理剧本（没有剧本就没有分镜，进去只是个空台子）；
 * ② 有资产但一张图都没出 → 弹确认框（**允许继续，但必须让用户知道会失去角色一致性**）。
 * @returns true 表示可以继续
 */
export function guardProduction(router: Router, input: ProductionGuardInput): boolean {
  const { scriptCount, assetTotal, assetDone } = input;

  if (scriptCount === 0) {
    const dialog = DialogPlugin.confirm({
      header: "还没有分集剧本",
      body: "分镜是由分集剧本拆解出来的。先去「剧本整理」把内容整理成分集剧本，再回来做分镜。",
      confirmBtn: "去剧本整理",
      cancelBtn: "留在本页",
      onConfirm: () => {
        dialog.destroy();
        router.push("/script");
      },
      onClose: () => dialog.destroy(),
    });
    return false;
  }

  if (assetTotal > 0 && assetDone === 0) {
    const dialog = DialogPlugin.confirm({
      header: "角色 / 场景图尚未生成",
      body: `${assetTotal} 个角色/场景资产都还没有出图。继续生成分镜会拿不到形象参考，角色一致性、场景连续性可能明显崩坏。建议先去「角色场景」批量出图。`,
      confirmBtn: "仍然继续",
      cancelBtn: "去角色场景",
      theme: "warning",
      onCancel: () => {
        dialog.destroy();
        router.push("/cornerScape");
      },
      onClose: () => dialog.destroy(),
    });
    return false;
  }

  return true;
}

/**
 * 项目类型守卫：小说型页面（导入素材）对剧本创作型项目没有意义 —— 没有原文可导。
 * 直接输 URL 进来会产出错配数据。返回 true 表示类型匹配、可以留在本页。
 */
export function guardProjectType(router: Router, projectType: string | null | undefined, expected: "novel" | "script"): boolean {
  if (!projectType || projectType === expected) return true;

  const expectedLabel = expected === "novel" ? "小说改编" : "剧本创作";
  const currentLabel = projectType === "novel" ? "小说改编" : "剧本创作";
  const goTo = expected === "novel" ? "/script" : "/novel";

  const dialog = DialogPlugin.confirm({
    header: "这个页面不属于当前项目类型",
    body: `当前项目是「${currentLabel}」型，与「${expectedLabel}」页面对不上。`,
    confirmBtn: "去对应页面",
    cancelBtn: "留在本页",
    onConfirm: () => {
      dialog.destroy();
      router.push(goTo);
    },
    onClose: () => dialog.destroy(),
  });
  return false;
}
