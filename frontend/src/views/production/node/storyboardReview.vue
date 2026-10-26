<template>
  <t-drawer
    v-model:visible="visible"
    header="联审分镜 · 逐镜检查画面与场景连贯性"
    size="86%"
    placement="right"
    :footer="false"
    destroy-on-close
    class="sbReviewDrawer">
    <div class="sbReview">
      <div class="rvIntro">
        <span>先对照固定布局与前镜末态，检查床、门窗、人物站位和动作。打开「对照检查」可保存设定、AI 看图并修正单镜。</span>
        <span class="rvMeta">{{ storyboard.length }} 镜 · {{ sceneGroups.length }} 个场景段</span>
      </div>

      <div class="filmStrip" ref="stripRef">
        <template v-for="(group, gi) in sceneGroups" :key="gi">
          <div v-if="gi > 0" class="sceneDivider" aria-hidden="true"><i></i><span>换场景</span><i></i></div>
          <div v-for="item in group.frames" :key="item.id" class="rvFrame" :class="{ picked: pickedIds.includes(item.id!), busy: regenerating.has(item.id!) }">
            <div class="rvSceneBar" :style="{ background: group.color }" :title="`场景段 ${gi + 1}${item.continuity?.sceneId ? ' · 场景 #' + item.continuity.sceneId : ''}`"></div>
            <label class="rvCheck">
              <input type="checkbox" :checked="pickedIds.includes(item.id!)" @change="togglePick(item.id!)" />
              <span>S{{ String(item.index + 1).padStart(2, "0") }}</span>
              <em>{{ item.duration || 0 }}s</em>
            </label>
            <div class="rvImage" @click="previewOne(item)">
              <t-image v-if="item.src" :src="item.src" fit="contain" class="rvImg" />
              <div v-else class="rvPlaceholder">
                <t-loading v-if="item.state === '生成中' || regenerating.has(item.id!)" size="small" />
                <span v-else-if="item.state === '生成失败'" style="color:#d5453a">生成失败</span>
                <span v-else>待生成</span>
              </div>
              <span class="rvContinuity" :class="item.continuity?.transition">
                {{ ({ cut: "同场景切镜", continue: "连续动作", new_scene: "换场景" } as Record<string, string>)[item.continuity?.transition || ""] || "独立镜头" }}
              </span>
            </div>
            <div class="rvPrompt" :title="item.prompt">{{ item.prompt || "（无提示词）" }}</div>
            <small style="padding:6px 10px;color:var(--td-text-color-secondary)">{{ item.continuity?.review ? '已有检查记录 · 打开核对是否过期' : '尚未记录衔接检查' }}</small>
            <div class="rvOps">
              <button type="button" @click="inspect(item.id!)">对照检查 / 修正</button>
              <button type="button" :disabled="regenerating.has(item.id!)" @click="regenerate([item.id!])">
                {{ regenerating.has(item.id!) ? "重画中…" : "重画这一镜" }}
              </button>
            </div>
          </div>
        </template>
      </div>

      <div class="rvFooter">
        <label class="rvPickAll">
          <input type="checkbox" :checked="allPicked" :indeterminate.prop="somePicked && !allPicked" @change="togglePickAll" />
          已选 {{ pickedIds.length }} 镜
        </label>
        <button type="button" class="ghost" :disabled="!pickedIds.length || regenerating.size > 0" @click="downloadStrip">下载拼接图</button>
        <button type="button" class="primary" :disabled="!pickedIds.length || regenerating.size > 0" @click="regenerate(pickedIds)">
          批量重画选中{{ pickedIds.length ? `（${pickedIds.length} 镜）` : "" }}
        </button>
        <button type="button" class="ghost done" @click="finishReview">返回制作</button>
      </div>
    </div>

    <t-image-viewer v-model:visible="previewVisible" :images="previewImages" />
    <ContinuityInspector v-model:visible="inspectorVisible" :storyboard-id="inspectedId" />
  </t-drawer>
</template>

<script setup lang="ts">
import type { Storyboard } from "../utils/flowBuilder";
import productionAgentStore from "@/stores/productionAgent";
import { LoadingPlugin } from "tdesign-vue-next";
import axios from "@/utils/axios";
import ContinuityInspector from '../components/ContinuityInspector.vue';

const props = defineProps<{ storyboard: Storyboard[] }>();
const visible = defineModel<boolean>("visible", { required: true });

const pickedIds = ref<number[]>([]);
const regenerating = ref<Set<number>>(new Set());
const previewVisible = ref(false);
const previewImages = ref<string[]>([]);
const inspectorVisible = ref(false), inspectedId = ref<number>();
function inspect(id: number) { inspectedId.value = id; inspectorVisible.value = true; }

const PALETTE = ["#e8935c", "#5b9afc", "#5bccb3", "#b78aec", "#e8a855", "#68c08c", "#d97b8f", "#8aa6c9"];

/** 场景分段：优先按 continuity.sceneId 分组；没有 sceneId 时仅以显式 new_scene 为界，
 *  无衔接标记的镜头默认视为同场景延续（逐镜分段会把胶片条切碎）。 */
const sceneGroups = computed(() => {
  const groups: { color: string; frames: (Storyboard & { index: number })[] }[] = [];
  let autoSceneId: number | null = null;
  props.storyboard.forEach((item, index) => {
    const continuity = item.continuity;
    const sceneId = continuity?.sceneId ?? null;
    const needNew = groups.length === 0
      || continuity?.transition === "new_scene"
      || (sceneId != null && autoSceneId !== sceneId);
    if (sceneId != null) autoSceneId = sceneId;
    if (needNew) groups.push({ color: PALETTE[groups.length % PALETTE.length], frames: [] });
    groups[groups.length - 1].frames.push({ ...item, index });
  });
  return groups;
});

function togglePick(id: number) {
  pickedIds.value = pickedIds.value.includes(id) ? pickedIds.value.filter((x) => x !== id) : [...pickedIds.value, id];
}
const allPicked = computed(() => props.storyboard.length > 0 && pickedIds.value.length === props.storyboard.filter((s) => s.id).length);
const somePicked = computed(() => pickedIds.value.length > 0);
function togglePickAll() {
  pickedIds.value = allPicked.value ? [] : props.storyboard.map((s) => s.id!).filter(Boolean);
}

function previewOne(item: Storyboard) {
  if (!item.src) return;
  previewImages.value = [item.src];
  previewVisible.value = true;
}

/** 单镜/批量重画：走智能体的分镜生图管线（带参考图一致性），完成前按钮锁定 */
async function regenerate(ids: number[]) {
  if (!ids.length) return;
  ids.forEach((id) => regenerating.value.add(id));
  try {
    await productionAgentStore().batchGenerateStoryboard(ids, true);
    window.$message?.success(`已提交 ${ids.length} 镜重画，生成完成后画面会自动更新`);
    pickedIds.value = pickedIds.value.filter((id) => !ids.includes(id));
  } catch (e: any) {
    window.$message?.error(e?.message || "重画提交失败，请重试");
  } finally {
    ids.forEach((id) => regenerating.value.delete(id));
  }
}

async function downloadStrip() {
  const allIds = (props.storyboard ?? []).filter((s) => s.src).map((s) => s.id!);
  if (!allIds.length) return window.$message?.warning("还没有已出图的分镜");
  LoadingPlugin(true);
  try {
    const res = await axios.post("/production/storyboard/downPreviewImage", { storyboardIds: pickedIds.value.length ? pickedIds.value : allIds }, { responseType: "blob" });
    const url = URL.createObjectURL(res as unknown as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storyboardImagePreview-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    window.$message?.error("拼接图下载失败");
  } finally {
    LoadingPlugin(false);
  }
}

function finishReview() {
  visible.value = false;
}
</script>

<style lang="scss" scoped>
.sbReview { display: flex; flex-direction: column; height: 100%; gap: 14px; }
.rvIntro { display: flex; align-items: center; justify-content: space-between; gap: 16px; color: #8d8177; font-size: 12.5px; line-height: 1.7; }
.rvMeta { flex: none; color: #b06a3d; font-weight: 650; }

.filmStrip { flex: 1; min-height: 0; display: flex; align-items: stretch; gap: 12px; overflow-x: auto; overflow-y: hidden; padding: 6px 2px 16px; }

.sceneDivider { flex: none; align-self: stretch; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: #b3a294; font-size: 11px; i { width: 1px; flex: 1; background: linear-gradient(180deg, transparent, #d8ccbe); } i:last-child { background: linear-gradient(180deg, #d8ccbe, transparent); } span { writing-mode: horizontal-tb; white-space: nowrap; padding: 3px 8px; border: 1px dashed #d8ccbe; border-radius: 999px; background: #faf6f1; } }

.rvFrame { flex: none; width: 216px; display: flex; flex-direction: column; border: 1px solid #ecdfd4; border-radius: 12px; background: #fff; overflow: hidden; transition: border-color .18s, box-shadow .18s; }
.rvFrame.picked { border-color: #ef9f70; box-shadow: 0 0 0 2px rgba(240, 130, 70, .16); }
.rvFrame.busy { opacity: .75; }
.rvSceneBar { height: 4px; flex: none; }
.rvCheck { display: flex; align-items: center; gap: 7px; padding: 8px 10px 0; cursor: pointer; input { width: 15px; height: 15px; accent-color: #e0641f; } span { color: #302b28; font-size: 12.5px; font-weight: 700; } em { font-style: normal; margin-left: auto; color: #a3988d; font-size: 11px; font-variant-numeric: tabular-nums; } }
.rvImage { position: relative; margin: 8px 10px 0; aspect-ratio: 16 / 10; border-radius: 8px; background: #f6f0e9; overflow: hidden; cursor: zoom-in; }
.rvImg { width: 100%; height: 100%; }
.rvPlaceholder { width: 100%; height: 100%; display: grid; place-items: center; color: #b3a294; font-size: 12px; }
.rvContinuity { position: absolute; left: 6px; bottom: 6px; padding: 2px 7px; border-radius: 6px; background: rgba(45, 38, 32, .68); color: #ffe3cd; font-size: 10px; &.new_scene { background: rgba(181, 74, 42, .85); } }
.rvPrompt { margin: 8px 10px 0; height: 48px; color: #8d8177; font-size: 11px; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rvOps { display: flex; flex-wrap:wrap; gap:6px; padding: 8px 10px 10px; margin-top: auto; button { flex: 1 1 100%; padding: 7px 0; border: 1px solid #e4d0bd; border-radius: 8px; background: #fff6ee; color: #c25a22; font-size: 12px; cursor: pointer; &:hover { background: #ffeede; } &:disabled { opacity: .5; cursor: default; } } }

.rvFooter { flex: none; display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid #eee2d8; border-radius: 12px; background: #fcf8f4; }
.rvPickAll { display: flex; align-items: center; gap: 7px; margin-right: auto; color: #6b5f55; font-size: 12.5px; cursor: pointer; input { width: 15px; height: 15px; accent-color: #e0641f; } }
.rvFooter button { padding: 9px 16px; border-radius: 9px; font-size: 12.5px; cursor: pointer; }
.rvFooter .primary { border: 0; background: linear-gradient(135deg, #f2803f, #e0641f); color: #fff; font-weight: 650; &:hover { filter: brightness(1.05); } &:disabled { opacity: .45; cursor: default; } }
.rvFooter .ghost { border: 1px solid #e4d6cb; background: #fff; color: #796252; &:hover { background: #fff4ec; } }
.rvFooter .done { border-color: #bcd6c5; color: #3f7d5b; background: #f2faf5; }
</style>
