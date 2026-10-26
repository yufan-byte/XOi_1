<template>
  <div class="mediaLibrary">
    <div class="mediaLibraryHeader">
      <div class="headerTitle">
        <div>
          <h3 class="mediaLibraryTitle">素材库</h3>
          <span class="mediaLibraryHint">{{ mediaCount }} 项素材 · 单击加入时间线</span>
        </div>
      </div>
      <div class="mediaLibraryActions">
        <input ref="fileInputRef" class="nativeFileInput" type="file" accept="video/*,audio/*,image/*" multiple @change="handleLocalFiles" />
        <button type="button" class="mediaImportBtn" @click="openFilePicker"><i-upload size="16" />导入本地素材</button>
      </div>
      <div class="mediaLibraryGroups" aria-label="素材库分组">
        <button type="button" :class="{ active: activeGroup === 'media' }" @click="selectGroup('media')">素材</button>
        <button type="button" :class="{ active: activeGroup === 'tools' }" @click="selectGroup('tools')">字幕与效果</button>
      </div>
      <div class="mediaLibraryTabs">
        <button
          v-for="tab in visibleTabs"
          :key="tab.id"
          type="button"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id">
          <component :is="tab.icon" theme="outline" size="15" />
          <span>{{ tab.id === 'video' ? '分镜视频' : tab.id === 'media' ? '本地视频' : tab.label }}</span>
        </button>
      </div>
    </div>

    <div class="mediaLibraryContent">
      <div v-if="emptyTab" class="mediaLibraryEmpty">
        <span class="mediaEmptyIcon"><i-upload theme="outline" size="22" /></span>
        <strong>{{ emptyTabTitle }}</strong>
        <p>{{ activeTab === 'video' ? '分镜视频会自动出现在这里；也可以直接导入自己的素材开始剪辑。' : '从电脑导入素材后，单击卡片即可加入时间线。' }}</p>
        <button type="button" @click="openFilePicker">导入素材 <span>→</span></button>
      </div>
      <!-- 分镜视频 -->
      <div v-if="activeTab === 'video'" class="mediaList">
        <div
          v-for="item in videoItems"
          :key="item.id"
          class="mediaItem"
          draggable="true"
          @click="handlePick(item)" role="button" tabindex="0" :aria-label="'添加 ' + item.name + ' 到时间线'" @keydown.enter.stop="handlePick(item)" @keydown.space.stop.prevent="handlePick(item)"
          @dragstart="handleDragStart($event, item)"
          @dragend="handleDragEnd">
          <div class="mediaItemPreview">
            <t-image v-if="item.thumbnail" :src="item.thumbnail" fit="cover" class="mediaItemThumbnail" />
            <component v-else :is="item.icon" theme="outline" size="18" />
            <div v-if="item.loading" class="mediaItemLoading">
              <t-loading size="small" />
            </div>
          </div>
          <div class="mediaItemInfo">
            <div class="selected" v-if="item.selected">
              <i-check-one theme="filled" size="16" fill="#000000" />
            </div>
            <div class="mediaItemName">
              <t-popup :content="item.name">
                {{ item.name }}
              </t-popup>
            </div>
            <t-tag v-if="item.duration" size="small" theme="default" variant="light">{{ formatDuration(item.duration) }}</t-tag>
          </div>
        </div>
      </div>
      <!-- 媒体素材 -->
      <div v-if="activeTab === 'media'" class="mediaList">
        <div
          v-for="item in mediaItems"
          :key="item.id"
          class="mediaItem"
          draggable="true"
          @click="handlePick(item)" role="button" tabindex="0" :aria-label="'添加 ' + item.name + ' 到时间线'" @keydown.enter.stop="handlePick(item)" @keydown.space.stop.prevent="handlePick(item)"
          @dragstart="handleDragStart($event, item)"
          @dragend="handleDragEnd">
          <div class="mediaItemPreview">
            <t-image v-if="item.thumbnail" :src="item.thumbnail" fit="cover" class="mediaItemThumbnail" />
            <component v-else :is="item.icon" theme="outline" size="18" />
            <div v-if="item.loading" class="mediaItemLoading">
              <t-loading size="small" />
            </div>
          </div>
          <div class="mediaItemInfo">
            <div class="mediaItemName">
              <t-popup :content="item.name">
                {{ item.name }}
              </t-popup>
            </div>
            <t-tag v-if="item.duration" size="small" theme="default" variant="light">{{ formatDuration(item.duration) }}</t-tag>
          </div>
        </div>
      </div>

      <!-- 图片素材 -->
      <div v-if="activeTab === 'image'" class="mediaList">
        <div
          v-for="item in imageItems"
          :key="item.id"
          class="mediaItem"
          draggable="true"
          @click="handlePick(item)" role="button" tabindex="0" :aria-label="'添加 ' + item.name + ' 到时间线'" @keydown.enter.stop="handlePick(item)" @keydown.space.stop.prevent="handlePick(item)"
          @dragstart="handleDragStart($event, item)"
          @dragend="handleDragEnd">
          <div class="mediaItemPreview">
            <t-image v-if="item.thumbnail" :src="item.thumbnail" fit="cover" class="mediaItemThumbnail" />
            <component v-else :is="item.icon" theme="outline" size="18" />
            <div v-if="item.loading" class="mediaItemLoading">
              <t-loading size="small" />
            </div>
          </div>
          <div class="mediaItemInfo">
            <div class="mediaItemName">
              <t-popup :content="item.name">
                {{ item.name }}
              </t-popup>
            </div>
          </div>
        </div>
      </div>

      <!-- 转场效果 -->
      <div v-if="activeTab === 'transition'" class="transitionList">
        <div
          v-for="transition in transitionItems"
          :key="transition.id"
          class="transitionItem"
          draggable="true"
          @click="handlePick(transition)" role="button" tabindex="0" :aria-label="'添加 ' + transition.name + ' 到时间线'" @keydown.enter.stop="handlePick(transition)" @keydown.space.stop.prevent="handlePick(transition)" @dragstart="handleDragStart($event, transition)"
          @dragend="handleDragEnd">
          <div class="transitionItemPreview">
            <span class="transitionItemIcon"><component :is="transition.icon" theme="outline" size="18" /></span>
          </div>
          <div class="transitionItemName">
            <t-popup :content="transition.name">
              {{ transition.name }}
            </t-popup>
          </div>
        </div>
      </div>

      <!-- 特效 -->
      <div v-if="activeTab === 'effect'" class="effectList">
        <div
          v-for="effect in effectItems"
          :key="effect.id"
          class="effectItem"
          draggable="true"
          @click="handlePick(effect)" role="button" tabindex="0" :aria-label="'添加 ' + effect.name + ' 到时间线'" @keydown.enter.stop="handlePick(effect)" @keydown.space.stop.prevent="handlePick(effect)" @dragstart="handleDragStart($event, effect)"
          @dragend="handleDragEnd">
          <div class="effectItemPreview">
            <component :is="effect.icon" theme="outline" size="18" />
          </div>
          <div class="effectItemName">
            <t-popup :content="effect.name">
              {{ effect.name }}
            </t-popup>
          </div>
        </div>
      </div>

      <!-- 滤镜 -->
      <div v-if="activeTab === 'filter'" class="filterList">
        <div
          v-for="filter in filterItems"
          :key="filter.id"
          class="filterItem"
          draggable="true"
          @click="handlePick(filter)" role="button" tabindex="0" :aria-label="'添加 ' + filter.name + ' 到时间线'" @keydown.enter.stop="handlePick(filter)" @keydown.space.stop.prevent="handlePick(filter)" @dragstart="handleDragStart($event, filter)"
          @dragend="handleDragEnd">
          <div class="filterItemPreview">
            <component :is="filter.icon" theme="outline" size="18" />
          </div>
          <div class="filterItemName">
            <t-popup :content="filter.name">
              {{ filter.name }}
            </t-popup>
          </div>
        </div>
      </div>

      <!-- 音频 -->
      <div v-if="activeTab === 'audio'" class="audioList">
        <div
          v-for="audio in audioItems"
          :key="audio.id"
          class="audioItem"
          draggable="true"
          @click="handlePick(audio)" role="button" tabindex="0" :aria-label="'添加 ' + audio.name + ' 到时间线'" @keydown.enter.stop="handlePick(audio)" @keydown.space.stop.prevent="handlePick(audio)"
          @dragstart="handleDragStart($event, audio)"
          @dragend="handleDragEnd">
          <div class="audioItemPreview">
            <i-music theme="outline" size="18" />
            <div v-if="audio.loading" class="mediaItemLoading">
              <t-loading size="small" />
            </div>
          </div>
          <div class="audioItemInfo">
            <div class="audioItemName">
              <t-popup :content="audio.name">
                {{ audio.name }}
              </t-popup>
            </div>
            <t-tag v-if="audio.duration" size="small" theme="default" variant="light">{{ formatDuration(audio.duration) }}</t-tag>
          </div>
        </div>
      </div>

      <!-- 字幕/文本 -->
      <div v-if="activeTab === 'text'" class="textList">
        <div
          v-for="text in textItems"
          :key="text.id"
          class="textItem"
          draggable="true"
          @click="handlePick(text)" role="button" tabindex="0" :aria-label="'添加 ' + text.name + ' 到时间线'" @keydown.enter.stop="handlePick(text)" @keydown.space.stop.prevent="handlePick(text)" @dragstart="handleDragStart($event, text)"
          @dragend="handleDragEnd">
          <div class="textItemPreview">
            <span class="textItemContent">{{ text.preview }}</span>
          </div>
          <div class="textItemName">
            <t-popup :content="text.name">
              {{ text.name }}
            </t-popup>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { extractVideoThumbnails, extractAudioWaveform } from "vue-clip-track";
import {
  type MediaItem,
  type AudioItem,
  getTextItems,
  getTransitionItems,
  getEffectItems,
  getFilterItems,
  getLibraryTabs,
  formatDuration,
} from "./utils/mediaData";

const props = withDefaults(
  defineProps<{
    initialVideoItems?: MediaItem[];
    initialMediaItems?: MediaItem[];
    initialAudioItems?: AudioItem[];
    initialImageItems?: MediaItem[];
  }>(),
  {
    initialVideoItems: () => [],
    initialMediaItems: () => [],
    initialAudioItems: () => [],
    initialImageItems: () => [],
  },
);

const activeTab = ref("video");
const fileInputRef = ref<HTMLInputElement | null>(null);
const localUrls = new Set<string>();

/** 让剪辑台空状态也能直接唤起同一个导入器，避免用户先猜“素材库”在哪。 */
function openFilePicker() {
  fileInputRef.value?.click();
}
defineExpose({ openFilePicker });

/** 单击 = 追加到主轨末尾。剪辑台里"能点就上轨"比"必须拖"顺手得多（拖拽仍保留，用来定位置） */
const emit = defineEmits<{ (e: "pick", item: any): void }>();
function handlePick(item: any) {
  emit("pick", { ...item, sourceUrl: item.url || item.id });
}

const tabs = getLibraryTabs();
const mediaTabIds = new Set(["video", "media", "image", "audio"]);
const activeGroup = computed(() => mediaTabIds.has(activeTab.value) ? "media" : "tools");
const visibleTabs = computed(() => tabs.filter((tab) => activeGroup.value === "media" ? mediaTabIds.has(tab.id) : !mediaTabIds.has(tab.id)));
function selectGroup(group: "media" | "tools") {
  activeTab.value = group === "media" ? "video" : "text";
}

const videoItems = ref<MediaItem[]>([...props.initialVideoItems]);
const mediaItems = ref<MediaItem[]>([...props.initialMediaItems]);
const audioItems = ref<AudioItem[]>([...props.initialAudioItems]);
const imageItems = ref<MediaItem[]>([...props.initialImageItems]);
const textItems = ref(getTextItems());
const mediaCount = computed(() => videoItems.value.length + mediaItems.value.length + imageItems.value.length + audioItems.value.length);
const emptyTab = computed(() => (activeTab.value === "video" && !videoItems.value.length)
  || (activeTab.value === "media" && !mediaItems.value.length)
  || (activeTab.value === "image" && !imageItems.value.length)
  || (activeTab.value === "audio" && !audioItems.value.length));
const emptyTabTitle = computed(() => activeTab.value === "video" ? "还没有分镜视频" : "这里还没有素材");

// 监听 props 变化，同步更新本地数据并加载缩略图/波形
watch(
  () => props.initialVideoItems,
  (newItems) => {
    videoItems.value = [...newItems];
    if (newItems.length > 0) {
      loadVideoThumbnails();
    }
  },
);

watch(
  () => props.initialMediaItems,
  (newItems) => {
    mediaItems.value = [...newItems];
    if (newItems.length > 0) {
      loadVideoThumbnails();
    }
  },
);

watch(
  () => props.initialAudioItems,
  (newItems) => {
    audioItems.value = [...newItems];
    if (newItems.length > 0) {
      loadAudioWaveforms();
    }
  },
);

watch(
  () => props.initialImageItems,
  (newItems) => {
    imageItems.value = [...newItems];
    if (newItems.length > 0) {
      loadImageThumbnails();
    }
  },
);
const transitionItems = ref(getTransitionItems());
const effectItems = ref(getEffectItems());
const filterItems = ref(getFilterItems());

/**
 * 本地素材先进入浏览器素材箱，不依赖 AI 生成，也不上传服务器。
 * 用户确认需要协作或跨设备时，再通过项目素材的上传链路持久化。
 */
async function handleLocalFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  if (!files.length) return;
  for (const file of files) {
    const url = URL.createObjectURL(file);
    localUrls.add(url);
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (file.type.startsWith("video/")) {
      mediaItems.value.unshift({ id, type: "video", name: file.name, duration: 0, icon: "i-video", color: "#7559d6", url, loading: true });
      activeTab.value = "media";
    } else if (file.type.startsWith("audio/")) {
      audioItems.value.unshift({ id, type: "audio", name: file.name, duration: 0, url, loading: true });
      activeTab.value = "audio";
    } else if (file.type.startsWith("image/")) {
      imageItems.value.unshift({ id, type: "image", name: file.name, duration: 5, icon: "i-pic", color: "#e97945", url, loading: true });
      activeTab.value = "image";
    }
  }
  await Promise.all([loadVideoThumbnails(), loadAudioWaveforms(), loadImageThumbnails()]);
  input.value = "";
  window.$message.success(`已导入 ${files.length} 个本地素材，可单击加入时间线`);
}

onBeforeUnmount(() => {
  localUrls.forEach((url) => URL.revokeObjectURL(url));
  localUrls.clear();
});

// 加载视频缩略图和时长
async function loadVideoThumbnails() {
  for (const item of mediaItems.value) {
    try {
      const result = await extractVideoThumbnails(item.url, { count: 10, width: 120 });
      item.duration = result.duration;
      item.thumbnails = result.thumbnails;
      item.thumbnail = result.thumbnails[0] || "";
      item.loading = false;
    } catch (error) {
      console.error(`Failed to load thumbnails for ${item.name}:`, error);
      item.loading = false;
      item.duration = 5; // 默认时长
    }
  }
  for (const item of videoItems.value) {
    try {
      const result = await extractVideoThumbnails(item.url, { count: 10, width: 120 });
      item.duration = result.duration;
      item.thumbnails = result.thumbnails;
      item.thumbnail = result.thumbnails[0] || "";
      item.loading = false;
    } catch (error) {
      console.error(`Failed to load thumbnails for ${item.name}:`, error);
      item.loading = false;
      item.duration = 5; // 默认时长
    }
  }
}

// 加载图片缩略图
async function loadImageThumbnails() {
  for (const item of imageItems.value) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          item.thumbnail = item.url;
          item.loading = false;
          resolve();
        };
        img.onerror = reject;
        img.src = item.url;
      });
    } catch (error) {
      console.error(`Failed to load image ${item.name}:`, error);
      item.loading = false;
    }
  }
}

// 加载音频波形数据
async function loadAudioWaveforms() {
  for (const item of audioItems.value) {
    try {
      const result = await extractAudioWaveform(item.url, { samples: 50 });
      item.duration = result.duration;
      item.waveformData = result.waveformData;
      item.loading = false;
    } catch (error) {
      console.error(`Failed to load waveform for ${item.name}:`, error);
      item.loading = false;
      item.duration = 30; // 默认时长
    }
  }
}

function handleDragStart(event: DragEvent, item: any) {
  if (!event.dataTransfer) return;

  // 设置拖拽数据，包含完整的媒体信息
  const dragData = {
    ...item,
    sourceUrl: item.url || item.id,
  };
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("application/json", JSON.stringify(dragData));
  event.dataTransfer.setData("text/plain", item.name);

  // 添加拖拽样式
  if (event.target instanceof HTMLElement) {
    event.target.classList.add("dragging");
  }
}

function handleDragEnd(event: DragEvent) {
  if (event.target instanceof HTMLElement) {
    event.target.classList.remove("dragging");
  }
}

// 组件挂载时加载媒体数据
onMounted(() => {
  // 延迟加载，避免阻塞 UI
  setTimeout(() => {
    loadVideoThumbnails();
    loadAudioWaveforms();
    loadImageThumbnails();
  }, 100);
});
</script>

<style lang="scss" scoped>
%flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.mediaLibrary {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 10px;
  overflow: hidden;

  .mediaLibraryHeader {
    flex-shrink: 0;
    padding: 16px 14px 12px;
    border-bottom: 1px solid var(--td-border-level-1-color);
    background: var(--td-bg-color-container);

    .headerTitle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 14px;

      .mediaLibraryTitle {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        color: var(--td-text-color-primary);
        letter-spacing: -0.01em;
      }

      .mediaLibraryHint {
        display: block;
        margin-top: 3px;
        color: var(--td-text-color-placeholder);
        font-size: 11px;
        line-height: 17px;
      }
    }

    .nativeFileInput { display: none; }
    .mediaImportBtn {
      display: flex; align-items: center; justify-content: center; gap: 7px;
      width: 100%; height: 38px; border: 1px solid #f4c7b6; border-radius: 8px;
      background: #fff6f2; color: #df6842; font-size: 12px; font-weight: 650;
      cursor: pointer; transition: background .16s ease, border-color .16s ease;
      &:hover { background: #ffece5; border-color: #ec986f; }
    }

    .mediaLibraryGroups {
      display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px;
      margin-top: 15px; padding: 3px; border-radius: 9px; background: #f3f2ef;
      button {
        height: 31px; border: 0; border-radius: 7px; background: transparent;
        color: #8a867f; font-size: 12px; font-weight: 600; cursor: pointer;
        &.active { background: #fff; color: #262522; box-shadow: 0 1px 4px rgba(26, 24, 20, .08); }
      }
    }

    .mediaLibraryTabs {
      display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px;
      margin-top: 11px;
      button {
        display: flex; align-items: center; gap: 6px; min-width: 0; height: 32px;
        padding: 0 8px; border: 1px solid transparent; border-radius: 7px;
        background: transparent; color: #67645f; font-size: 11px; font-weight: 550;
        cursor: pointer; text-align: left; white-space: nowrap;
        span { overflow: hidden; text-overflow: ellipsis; }
        &:hover { background: #f7f5f2; }
        &.active { border-color: #ffded0; background: #fff2eb; color: #e56637; font-weight: 680; }
      }
    }
  }

  .mediaLibraryContent {
    flex: 1;
    overflow-y: auto;
    padding: 14px;
    background: #fff;

    .mediaLibraryEmpty {
      display: flex; flex-direction: column; align-items: center; text-align: center;
      margin-top: clamp(24px, 12vh, 80px); padding: 0 8px;
      .mediaEmptyIcon { display: grid; place-items: center; width: 44px; height: 44px; margin-bottom: 12px; border-radius: 13px; background: #f8f6f3; color: #a9a29a; }
      strong { font-size: 13px; font-weight: 660; color: #57534e; }
      p { margin: 7px 0 12px; color: #9b968e; font-size: 11px; line-height: 1.65; }
      button { padding: 0; border: 0; background: transparent; color: #e66e43; font-size: 11px; font-weight: 660; cursor: pointer; }
      button span { margin-left: 3px; }
    }

    &::-webkit-scrollbar {
      width: 4px;
    }
    &::-webkit-scrollbar-thumb {
      background: var(--td-scrollbar-color);
      border-radius: 2px;
    }

    // 媒体/图片列表
    .mediaList {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;

      .mediaItem {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px;
        background: var(--td-bg-color-container);
        border: 2px solid transparent;
        border-radius: 12px;
        cursor: grab;
        transition: all 0.2s;
        position: relative;
        &:hover {
          border-color: var(--td-brand-color-10);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
        }

        &.dragging {
          opacity: 0.6;
          cursor: grabbing;
          transform: scale(0.95);
        }

        .mediaItemPreview {
          width: 36px;
          height: 36px;
          @extend %flex-center;
          background: rgba(102, 126, 234, 0.1);
          border-radius: 8px;
          flex-shrink: 0;
          position: relative;
          overflow: hidden;

          .mediaItemThumbnail {
            width: 100%;
            height: 100%;
            object-fit: cover;
            position: absolute;
            inset: 0;
            border-radius: 8px;
          }

          .mediaItemLoading {
            position: absolute;
            inset: 0;
            @extend %flex-center;
            background: rgba(0, 0, 0, 0.4);
            border-radius: 8px;
          }
        }

        .mediaItemInfo {
          flex: 1;
          min-width: 0;
          .selected {
            position: absolute;
            top: 0px;
            right: 2px;
            z-index: 1;
          }
          .mediaItemName {
            font-size: 12px;
            font-weight: 400;
            color: var(--td-text-color-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.4;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
          }
        }
      }
    }

    // 转场列表
    .transitionList {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;

      .transitionItem {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px;
        background: var(--td-bg-color-container);
        border: 2px solid transparent;
        border-radius: 12px;
        cursor: grab;
        transition: all 0.2s;

        &:hover {
          border-color: var(--td-brand-color-10);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
        }

        &.dragging {
          opacity: 0.6;
          cursor: grabbing;
          transform: scale(0.95);
        }

        .transitionItemPreview {
          width: 36px;
          height: 36px;
          @extend %flex-center;
          background: rgba(102, 126, 234, 0.1);
          border-radius: 8px;
          font-size: 18px;
          flex-shrink: 0;
        }

        .transitionItemName {
          font-size: 12px;
          font-weight: 400;
          color: var(--td-text-color-primary);
          line-height: 1.4;
        }
      }
    }

    // 特效列表
    .effectList {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;

      .effectItem {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px;
        background: var(--td-bg-color-container);
        border: 2px solid transparent;
        border-radius: 12px;
        cursor: grab;
        transition: all 0.2s;

        &:hover {
          border-color: var(--td-brand-color-10);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
        }

        &.dragging {
          opacity: 0.6;
          cursor: grabbing;
          transform: scale(0.95);
        }

        .effectItemPreview {
          width: 36px;
          height: 36px;
          @extend %flex-center;
          background: rgba(102, 126, 234, 0.1);
          border-radius: 8px;
          flex-shrink: 0;
        }

        .effectItemName {
          font-size: 12px;
          font-weight: 400;
          color: var(--td-text-color-primary);
          line-height: 1.4;
        }
      }
    }

    // 滤镜列表
    .filterList {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;

      .filterItem {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px;
        background: var(--td-bg-color-container);
        border: 2px solid transparent;
        border-radius: 12px;
        cursor: grab;
        transition: all 0.2s;

        &:hover {
          border-color: var(--td-brand-color-10);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
        }

        &.dragging {
          opacity: 0.6;
          cursor: grabbing;
          transform: scale(0.95);
        }

        .filterItemPreview {
          width: 36px;
          height: 36px;
          @extend %flex-center;
          background: rgba(102, 126, 234, 0.1);
          border-radius: 8px;
          flex-shrink: 0;
        }

        .filterItemName {
          font-size: 12px;
          font-weight: 400;
          color: var(--td-text-color-primary);
          line-height: 1.4;
        }
      }
    }

    // 音频列表
    .audioList {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;

      .audioItem {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px;
        background: var(--td-bg-color-container);
        border: 2px solid transparent;
        border-radius: 12px;
        cursor: grab;
        transition: all 0.2s;

        &:hover {
          border-color: var(--td-brand-color-10);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
        }

        &.dragging {
          opacity: 0.6;
          cursor: grabbing;
          transform: scale(0.95);
        }

        .audioItemPreview {
          width: 36px;
          height: 36px;
          @extend %flex-center;
          background: rgba(102, 126, 234, 0.1);
          border-radius: 8px;
          flex-shrink: 0;
          position: relative;

          .mediaItemLoading {
            position: absolute;
            inset: 0;
            @extend %flex-center;
            background: rgba(0, 0, 0, 0.4);
            border-radius: 8px;
          }
        }

        .audioItemInfo {
          flex: 1;
          min-width: 0;

          .audioItemName {
            font-size: 12px;
            font-weight: 400;
            color: var(--td-text-color-primary);
            line-height: 1.4;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        }
      }
    }

    // 文本列表
    .textList {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
      .textItem {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px;
        background: var(--td-bg-color-container);
        border: 2px solid transparent;
        border-radius: 12px;
        cursor: grab;
        transition: all 0.2s;

        &:hover {
          border-color: var(--td-brand-color-10);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
        }

        &.dragging {
          opacity: 0.6;
          cursor: grabbing;
          transform: scale(0.95);
        }

        .textItemPreview {
          width: 36px;
          height: 36px;
          @extend %flex-center;
          background: rgba(102, 126, 234, 0.1);
          border-radius: 8px;
          flex-shrink: 0;

          .textItemContent {
            font-size: 14px;
            font-weight: 600;
            color: var(--td-brand-color-10);
          }
        }

        .textItemName {
          font-size: 12px;
          font-weight: 400;
          color: var(--td-text-color-primary);
          line-height: 1.4;
        }
      }
    }
  }
}
</style>
