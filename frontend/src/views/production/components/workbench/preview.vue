<template>
  <div class="previewContainer">
    <div class="mainContent">
      <!-- 左侧预览区域 -->
      <div class="previewArea">
        <div class="videoWrapper">
          <img v-if="currentShot?.filePath" :src="currentShot.filePath" :alt="currentShot.description" class="previewImage" />
          <div v-else class="placeholderImage">
            <i-pic theme="outline" size="48" fill="#999" />
            <span>{{ shotList.length ? $t("workbench.production.preview.noImage") : "还没有分镜" }}</span>
            <small>{{ shotList.length ? "先为当前镜头生成分镜图" : "回到分镜节点创建镜头后，这里会自动出现" }}</small>
          </div>
        </div>

        <div class="playerControls">
          <div class="controlButtons">
            <t-button theme="default" variant="text" size="small" shape="circle" @click="prevShot" :disabled="isFirstShot">
              <template #icon><i-go-start theme="outline" size="18" /></template>
            </t-button>
            <t-button theme="primary" variant="text" size="medium" shape="circle" @click="togglePlay" :disabled="!shotList.length">
              <template #icon>
                <component :is="isPlaying ? 'i-pause' : 'i-play'" theme="outline" size="22" />
              </template>
            </t-button>
            <t-button theme="default" variant="text" size="small" shape="circle" @click="nextShot" :disabled="isLastShot">
              <template #icon><i-go-end theme="outline" size="18" /></template>
            </t-button>
          </div>
          <div class="progressArea">
            <span class="timeLabel">{{ formatTime(currentElapsed) }}</span>
            <div class="progressBarWrapper" ref="progressBarRef" @mousedown="onProgressMouseDown">
              <div class="progressTrack">
                <div
                  v-for="(shot, index) in shotList"
                  :key="'seg-' + shot.id"
                  class="progressSegment"
                  :class="{ active: index === currentShotIndex, completed: index < currentShotIndex }"
                  :style="{ width: getSegmentWidth(index) + '%', left: getSegmentLeft(index) + '%' }"
                  @click.stop="jumpToShot(index)" />
                <div
                  v-for="(_, index) in shotList.slice(0, -1)"
                  :key="'div-' + index"
                  class="segmentDivider"
                  :style="{ left: getSegmentLeft(index + 1) + '%' }" />
                <div class="progressFill" :style="{ width: totalProgress + '%' }" />
                <div class="progressHandle" :style="{ left: totalProgress + '%' }" />
              </div>
            </div>
            <span class="timeLabel">{{ formatTime(totalDuration) }}</span>
          </div>
        </div>
      </div>

      <div class="infoPanel">
        <div class="infoSection">
          <div class="sectionTitle">
            <span class="titleIndicator" />
            {{ $t("workbench.production.preview.storyboardDesc") }}
          </div>
          <div class="sectionContent">
            【{{ $t("workbench.production.preview.serialNumber") }} {{ currentShotIndex + 1 }}】{{
              currentShot?.description || $t("workbench.production.preview.noDescription")
            }}
          </div>
        </div>

        <div class="infoSection">
          <div class="sectionTitle">
            <span class="titleIndicator" />
            {{ $t("workbench.production.preview.duration") }}
          </div>
          <div class="sectionContent">
            {{
              currentShot?.duration != null
                ? currentShot.duration + " " + $t("workbench.production.preview.seconds")
                : "3 " + $t("workbench.production.preview.seconds")
            }}
          </div>
        </div>

        <div class="infoSection">
          <div class="sectionTitle">
            <span class="titleIndicator" />
            {{ $t("workbench.production.preview.relatedAssets") }}
          </div>
          <div class="characterList">
            <div v-for="(char, index) in currentCharacters" :key="index" class="characterItem">
              <t-image :src="char.avatar" fit="cover" class="characterAvatar" :style="{ width: '80px', height: '80px', borderRadius: '8px' }" />
              <t-tag>
                {{ char.name }}（{{
                  char.type == "role"
                    ? $t("workbench.production.preview.role")
                    : char.type == "tool"
                      ? $t("workbench.production.preview.prop")
                      : $t("workbench.production.preview.scene")
                }}）
              </t-tag>
            </div>
            <div v-if="!currentCharacters.length" class="noCharacter">
              <t-tag theme="default" variant="light">{{ $t("workbench.production.preview.noCharacters") }}</t-tag>
            </div>
          </div>
        </div>
        <div class="infoSection">
          <div class="sectionTitle">
            <span class="titleIndicator" />
            {{ $t("workbench.production.preview.imagePrompt") }}
          </div>
          <div class="shootingTips">
            <template v-for="item in promptTips" :key="item.label">
              <div v-if="item.value" class="tipItem">
                <span class="tipLabel">{{ item.label }}：</span>
                <span class="tipValue">{{ item.value }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <div v-if="shotList.length" class="previewHintBar">
      <div><strong>快速预览是什么？</strong><span>按分镜顺序模拟播放节奏，只用于检查镜头时长、画面和顺序，不会生成视频。</span></div>
      <t-button theme="primary" size="small" @click="emit('go-generate')">下一步：生成视频</t-button>
    </div>
    <div v-else class="previewEmptyAction">
      <span>完成分镜图后，再回来检查整体节奏。</span>
    </div>

    <div class="shotListArea">
      <div class="shotListHeader">
        <div class="headerLeft">
          <t-checkbox v-model="selectAll" @change="handleSelectAll">{{ $t("workbench.production.preview.selectAll") }}</t-checkbox>
          <t-button theme="default" variant="text" size="small" @click="confirmRestoreSort">
            <template #icon><i-undo theme="outline" size="16" /></template>
            {{ $t("workbench.production.preview.restoreSort") }}
          </t-button>
        </div>
        <t-button theme="default" variant="text" size="small" class="exportBtn" @click="exportImage">
          <template #icon><i-download theme="outline" size="16" /></template>
          {{ $t("workbench.production.preview.exportImage") }}
        </t-button>
      </div>
      <div class="shotListWrapper" ref="shotListWrapperRef">
        <VueDraggable
          v-model="shotList"
          :animation="150"
          ghostClass="shotGhost"
          dragClass="shotDrag"
          :scroll="shotListWrapperRef"
          :scrollSensitivity="80"
          :scrollSpeed="10"
          :forceFallback="true"
          target=".shotList"
          @start="isDragging = true"
          @end="onDragEnd">
          <TransitionGroup type="transition" tag="div" :name="!isDragging ? 'shot-flip' : undefined" class="shotList">
            <div
              v-for="(shot, index) in shotList"
              :key="shot.id"
              class="shotItem"
              :class="{ active: currentShotIndex === index }"
              @click="selectShot(index)">
              <t-checkbox v-model="shot.selected" class="shotCheckbox" @click.stop @mousedown.stop />
              <div class="shotImageWrapper">
                <img v-if="shot.filePath" :src="thumbUrl(shot.filePath, 320)" :alt="shot.description" class="shotImage" loading="lazy" decoding="async" />
                <div v-else class="shotPlaceholder">
                  <i-pic theme="outline" size="24" fill="#999" />
                </div>
                <t-tag class="shotNumber" size="small" variant="dark">#{{ shot.id }}</t-tag>
              </div>
            </div>
          </TransitionGroup>
        </VueDraggable>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLocalStorage, useEventListener } from "@vueuse/core";
import { ref, computed, watch, nextTick, onUnmounted, type Ref } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { DialogPlugin } from "tdesign-vue-next";
import axios from "@/utils/axios";
import { thumbUrl } from "@/utils/mediaUrl";
import JSZip from "jszip";
import projectStore from "@/stores/project";
const { project } = storeToRefs(projectStore());
interface ShotCharacter {
  name: string;
  type: string;
  avatar?: string;
}

interface Shot {
  id: string;
  camera?: number;
  createTime?: number;
  description?: string;
  duration?: number;
  filePath?: string;
  frameMode?: number;
  mode: string;
  model: string;
  prompt?: string;
  resolution?: string;
  scriptId?: number;
  sound?: number;
  title?: string;
  selected?: boolean;
  characters?: ShotCharacter[];
}
const episodesId = inject<Ref<number>>("episodesId");
const emit = defineEmits<{ "go-generate": [] }>();

// 模拟分镜数据
const shotList = ref<Shot[]>([]);
onMounted(() => {
  getShotList();
});
//查询分镜数据
async function getShotList() {
  const { data } = await axios.post("/production/getStoryboardData", {
    projectId: project.value?.id,
    scriptId: episodesId!.value,
  });
  shotList.value = data;
}
const currentShot = computed(() => shotList.value[currentShotIndex.value] || null);
const currentCharacters = computed(() => currentShot.value?.characters || []);
const currentShotIndex = ref(0);
const selectAll = ref(false);
const shotListWrapperRef = ref<HTMLElement>();
const progressBarRef = ref<HTMLElement>();
const isDragging = ref(false);

// 播放状态
const isPlaying = ref(false);
const currentElapsed = ref(0);
let playTimer: ReturnType<typeof setInterval> | null = null;
const TICK_INTERVAL = 50;

const initialOrder = shotList.value.map((shot) => shot.id);

// ===== 计算属性 =====

const currentShotDuration = computed(() => currentShot.value?.duration ?? 3);
const isFirstShot = computed(() => currentShotIndex.value === 0);
const isLastShot = computed(() => currentShotIndex.value === shotList.value.length - 1);

const totalDuration = computed(() => shotList.value.reduce((sum, s) => sum + (s.duration ?? 3), 0));

const totalProgress = computed(() => {
  const elapsed = getCumulativeDuration(currentShotIndex.value) + currentElapsed.value;
  return Math.min((elapsed / totalDuration.value) * 100, 100);
});

const promptTips = computed(() => [
  { label: $t("workbench.production.preview.sceneDescription"), value: currentShot.value?.description },
  // { label: "运镜方式", value: currentShot.value?.camera != null ? String(currentShot.value.camera) : undefined },
  { label: $t("workbench.production.preview.promptLabel"), value: currentShot.value?.prompt },
]);

// ===== 工具函数 =====

const getDuration = (index: number) => shotList.value[index]?.duration ?? 3;

const getCumulativeDuration = (index: number) => {
  let sum = 0;
  for (let i = 0; i < index; i++) sum += getDuration(i);
  return sum;
};

const getSegmentWidth = (index: number) => (getDuration(index) / totalDuration.value) * 100;
const getSegmentLeft = (index: number) => (getCumulativeDuration(index) / totalDuration.value) * 100;

const formatTime = (seconds: number) => {
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

// ===== 播放控制 =====

const stopPlay = () => {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
  isPlaying.value = false;
};

const startPlay = () => {
  if (playTimer) return;
  isPlaying.value = true;
  playTimer = setInterval(() => {
    currentElapsed.value += TICK_INTERVAL / 1000;
    if (currentElapsed.value >= currentShotDuration.value) {
      if (!isLastShot.value) {
        currentElapsed.value = 0;
        currentShotIndex.value++;
        scrollToCurrentShot();
      } else {
        currentElapsed.value = currentShotDuration.value;
        stopPlay();
      }
    }
  }, TICK_INTERVAL);
};

const togglePlay = () => {
  if (isPlaying.value) return stopPlay();
  if (isLastShot.value && currentElapsed.value >= currentShotDuration.value) {
    currentShotIndex.value = 0;
    currentElapsed.value = 0;
  }
  startPlay();
};

onUnmounted(stopPlay);

// ===== 导航 =====

const goToShot = (index: number, shouldStopPlay = true) => {
  if (shouldStopPlay) stopPlay();
  currentShotIndex.value = index;
  currentElapsed.value = 0;
  scrollToCurrentShot();
};

const prevShot = () => {
  if (!isFirstShot.value) goToShot(currentShotIndex.value - 1);
};
const nextShot = () => {
  if (!isLastShot.value) goToShot(currentShotIndex.value + 1);
};
const jumpToShot = (index: number) => goToShot(index);
const selectShot = (index: number) => goToShot(index);

// ===== 进度条拖拽 =====

const onProgressMouseDown = (e: MouseEvent) => {
  const bar = progressBarRef.value;
  if (!bar) return;
  stopPlay();

  const seekTo = (event: MouseEvent) => {
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const targetTime = ratio * totalDuration.value;

    let cumulative = 0;
    for (let i = 0; i < shotList.value.length; i++) {
      const dur = getDuration(i);
      if (cumulative + dur > targetTime) {
        currentShotIndex.value = i;
        currentElapsed.value = targetTime - cumulative;
        scrollToCurrentShot();
        return;
      }
      cumulative += dur;
    }
    currentShotIndex.value = shotList.value.length - 1;
    currentElapsed.value = getDuration(shotList.value.length - 1);
  };

  seekTo(e);

  const onMouseUp = () => {
    document.removeEventListener("mousemove", seekTo);
    document.removeEventListener("mouseup", onMouseUp);
  };
  document.addEventListener("mousemove", seekTo);
  document.addEventListener("mouseup", onMouseUp);
};

// ===== 列表操作 =====

const scrollToCurrentShot = () => {
  nextTick(() => {
    const items = shotListWrapperRef.value?.querySelectorAll(".shotItem");
    (items?.[currentShotIndex.value] as HTMLElement)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  });
};

const handleSelectAll = (checked: boolean | string[]) => {
  const isChecked = Array.isArray(checked) ? checked.length > 0 : checked;
  shotList.value.forEach((shot) => (shot.selected = isChecked));
};
useEventListener(document, "keydown", (e: KeyboardEvent) => {
  if (e.code === "Space" && !e.repeat) {
    e.preventDefault();
    const data = shotList.value[currentShotIndex.value];
    if (data) {
      data.selected = !data.selected;
    }
  }
});

const confirmRestoreSort = () => {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.production.preview.restoreSort"),
    body: $t("workbench.production.preview.restoreSortConfirm"),
    onConfirm: () => {
      shotList.value.sort((a, b) => initialOrder.indexOf(a.id) - initialOrder.indexOf(b.id));
      dialog.destroy();
    },
    onClose: () => dialog.destroy(),
  });
};

watch(
  () => shotList.value.map((s) => s.selected),
  (selections) => {
    selectAll.value = selections.length > 0 && selections.every(Boolean);
  },
  { deep: true },
);

const onDragEnd = () => nextTick(() => (isDragging.value = false));

async function exportImage() {
  const selectedShots = shotList.value
    .filter((shot) => shot.selected)
    .map((shot) => ({
      id: shot.id,
      filePath: shot.filePath?.split("?")[0] || shot.filePath,
    }));
  if (selectedShots.length === 0) {
    DialogPlugin.alert({
      header: $t("workbench.production.preview.tip"),
      body: $t("workbench.production.preview.selectAtLeastOne"),
    });
    return;
  }
  const zip = new JSZip();
  const downloadPromises = selectedShots.map(async (shot) => {
    try {
      if (!shot.filePath) return;
      const response = await fetch(shot.filePath);
      const blob = await response.blob();
      zip.file(`分镜${shot.id}.${getFileExtension(shot.filePath)}`, blob);
    } catch (error) {
      console.error(`图片下载失败: ${shot.filePath}`, error);
    }
  });

  await Promise.all(downloadPromises);

  zip.generateAsync({ type: "blob" }).then((content) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = "分镜压缩包.zip";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  });
}
// 辅助方法：获取文件后缀
function getFileExtension(path: string) {
  const match = path.match(/\.(\w+)(?:\?|$)/);
  return match ? match[1] : "jpg";
}
</script>

<style lang="scss" scoped>
%flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.previewContainer {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
  gap: 16px;
  animation: fadeIn 300ms ease-out;

  .previewHintBar, .previewEmptyAction {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 12px 16px;
    border: 1px solid #e8e3f5;
    border-radius: 12px;
    background: #faf8ff;
    color: #777181;
    font-size: 12px;
  }
  .previewHintBar strong { display: block; margin-bottom: 2px; color: #5c478f; font-size: 12px; }
  .previewHintBar span { color: #8d8896; }
  .previewEmptyAction { justify-content: center; color: #9b96a4; }

  .mainContent {
    display: flex;
    flex: 1;
    gap: 24px;
    min-height: 0;

    .previewArea {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: var(--td-bg-color-secondarycontainer);
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid var(--td-border-level-1-color);
      transition: box-shadow 250ms ease;
      animation: fadeSlideIn 350ms ease-out;

      &:hover {
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      }

      .videoWrapper {
        width: 100%;
        flex: 1;
        @extend %flex-center;
        min-height: 0;

        .previewImage {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          transition: opacity 250ms ease;
        }

        .placeholderImage {
          @extend %flex-center;
          flex-direction: column;
          gap: 12px;
          color: var(--td-text-color-placeholder);
          font-size: 14px;
          small { color: #a09ca8; font-size: 12px; }
        }
      }

      .playerControls {
        width: 100%;
        flex-shrink: 0;
        padding: 10px 16px 12px;
        background: var(--td-bg-color-container);
        border-top: 1px solid var(--td-border-level-1-color);
        backdrop-filter: blur(8px);

        .controlButtons {
          @extend %flex-center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .progressArea {
          display: flex;
          align-items: center;
          gap: 10px;

          .timeLabel {
            font-size: 12px;
            color: var(--td-text-color-placeholder);
            font-variant-numeric: tabular-nums;
            min-width: 40px;
            text-align: center;
            user-select: none;
          }

          .progressBarWrapper {
            flex: 1;
            height: 20px;
            display: flex;
            align-items: center;
            cursor: pointer;

            .progressTrack {
              width: 100%;
              height: 6px;
              background: var(--td-bg-color-component);
              border-radius: 3px;
              position: relative;

              .progressSegment {
                position: absolute;
                top: 0;
                height: 100%;
                border-radius: 3px;
                transition: background 200ms ease;
                z-index: 1;
                &.completed {
                  background: var(--td-brand-color-light);
                }
                &.active {
                  background: var(--td-brand-color-10-5) !important;
                }
                &:hover {
                  background: var(--td-brand-color-10-3);
                }
              }

              .segmentDivider {
                position: absolute;
                top: -2px;
                width: 1.5px;
                height: calc(100% + 4px);
                background: var(--td-border-level-2-color);
                z-index: 3;
                transform: translateX(-50%);
                pointer-events: none;
              }

              .progressFill {
                position: absolute;
                top: 0;
                left: 0;
                height: 100%;
                background: var(--td-brand-color-10);
                border-radius: 3px;
                z-index: 2;
                transition: width 50ms linear;
                pointer-events: none;
              }

              .progressHandle {
                position: absolute;
                top: 50%;
                width: 14px;
                height: 14px;
                background: var(--td-bg-color-container);
                border: 2px solid var(--td-brand-color-10-10);
                border-radius: 50%;
                transform: translate(-50%, -50%);
                z-index: 4;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                transition:
                  left 50ms linear,
                  transform 150ms ease,
                  box-shadow 150ms ease;
                pointer-events: none;
                &:hover {
                  transform: translate(-50%, -50%) scale(1.3);
                  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
                }
              }
            }
          }
        }
      }
    }

    .infoPanel {
      width: 380px;
      flex-shrink: 0;
      overflow-y: auto;
      padding-right: 8px;
      animation: fadeSlideIn 400ms ease-out;

      &::-webkit-scrollbar {
        width: 5px;
      }
      &::-webkit-scrollbar-track {
        background: transparent;
      }
      &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        &:hover {
          background: rgba(255, 255, 255, 0.18);
        }
      }

      .infoSection {
        margin-bottom: 20px;
        padding-bottom: 16px;
        border-bottom: 1px solid var(--td-border-level-1-color);
        &:last-child {
          border-bottom: none;
        }

        .sectionTitle {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: var(--td-text-color-primary);
          margin-bottom: 12px;

          .titleIndicator {
            width: 3px;
            height: 14px;
            background: var(--td-brand-color-10);
            border-radius: 2px;
          }
        }

        .sectionContent {
          font-size: 14px;
          color: var(--td-text-color-secondary);
          line-height: 1.6;
        }

        .characterList {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;

          .characterItem {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
            transition: transform 200ms ease;
            &:hover {
              transform: translateY(-2px);
            }

            .characterAvatar {
              border: 2px solid var(--td-border-level-1-color);
              transition: border-color 200ms ease, box-shadow 200ms ease;
              &:hover {
                border-color: var(--td-brand-color);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
              }
            }
          }

          .noCharacter {
            padding: 8px 0;
          }
        }

        .characterDesc {
          margin-top: 12px;
          font-size: 13px;
          color: var(--td-text-color-placeholder);
          line-height: 1.5;
        }

        .shootingTips {
          display: flex;
          flex-direction: column;
          gap: 8px;

          .tipItem {
            font-size: 13px;
            color: var(--td-text-color-secondary);
            line-height: 1.6;
            padding: 6px 10px;
            border-radius: 8px;
            transition: background-color 150ms ease;
            &:hover {
              background: var(--td-bg-color-container-hover);
            }
            .tipLabel {
              color: var(--td-text-color-primary);
              font-weight: 500;
            }
          }
        }
      }
    }
  }

  .shotListArea {
    flex-shrink: 0;
    border-top: 1px solid var(--td-border-level-1-color);
    padding-top: 12px;
    animation: fadeSlideIn 450ms ease-out;

    .shotListHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      padding: 0 4px;

      .headerLeft {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .exportBtn {
        color: var(--td-brand-color-10-10);
        transition: transform 100ms ease;
        &:active {
          transform: scale(0.95);
        }
      }
    }

    .shotListWrapper {
      overflow-x: auto;
      &::-webkit-scrollbar {
        height: 6px;
      }
      &::-webkit-scrollbar-track {
        background: transparent;
      }
      &::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.12);
        border-radius: 3px;
        &:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      }

      .shotList {
        display: flex;

        .shotItem {
          flex-shrink: 0;
          width: 160px;
          margin-right: 12px;
          cursor: pointer;
          border-radius: 12px;
          overflow: hidden;
          border: 2px solid transparent;
          background: var(--td-bg-color-container);
          position: relative;
          transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease;

          &:hover {
            transform: translateY(-3px);
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.15);
          }
          &:active {
            transform: scale(0.97);
          }
          &.active {
            border-color: var(--td-brand-color-10-10);
            box-shadow: 0 0 0 2px rgba(var(--td-brand-color-rgb, 0, 82, 217), 0.2), 0 4px 12px rgba(var(--td-brand-color-rgb, 0, 82, 217), 0.1);
          }

          .shotCheckbox {
            position: absolute;
            top: 8px;
            left: 8px;
            z-index: 2;
          }

          .shotImageWrapper {
            position: relative;
            width: 100%;
            height: 100px;
            background: var(--td-bg-color-secondarycontainer);

            .shotImage {
              width: 100%;
              height: 100%;
              object-fit: cover;
              transition: transform 300ms ease;
            }

            .shotPlaceholder {
              width: 100%;
              height: 100%;
              @extend %flex-center;
            }

            .shotNumber {
              position: absolute;
              bottom: 6px;
              right: 6px;
              backdrop-filter: blur(8px);
              background: rgba(0, 0, 0, 0.45) !important;
              color: #fff !important;
              border: none !important;
            }
          }

          &:hover .shotImageWrapper .shotImage {
            transform: scale(1.05);
          }
        }
      }
    }
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>

<!-- Sortable.js 动态添加的 class 不受 scoped 影响，需要全局样式 -->
<style lang="scss">
.shotGhost {
  opacity: 0.5;
  background: var(--td-brand-color-light);
  border: 2px dashed var(--td-brand-color-10-10) !important;
}

.shotDrag {
  opacity: 0.9;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  transform: scale(1.02);
}

.shot-flip-move {
  transition: transform 0.5s cubic-bezier(0.55, 0, 0.1, 1);
}
</style>
