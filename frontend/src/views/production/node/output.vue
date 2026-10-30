<template>
  <t-card class="outputNode" :class="{ fluid: standalone }">
    <div class="titleBar" :class="{ dragHandle: !standalone, pr: !standalone }">
      <DirectorNodeHeading node-id="output" step="07" label="FINAL CUT" title="成片" description="预览与交付当前集的最终作品" />
      <t-tag v-if="items && items.length" size="small" theme="success" variant="light">{{ items.length }} 个</t-tag>
      <t-button size="small" variant="outline" class="nowheel nodrag" @click.stop="goEditor">打开剪辑台 ↗</t-button>
      <Handle v-if="!standalone" :id="props.handleIds!.target" type="target" :position="Position.Left" style="left: calc(-1 * var(--td-comp-paddingLR-xl))" />
    </div>

    <div class="content nowheel nodrag">
      <div v-if="!items || items.length === 0" class="outputEmpty" @click.stop="goEditor">
        <div class="emptyIcon"><i-movie theme="outline" size="26" /></div>
        <div class="emptyTitle">还没有成片</div>
        <div class="emptyDesc">到「剪辑台」合成导出，成片会自动存档到这里，项目资产库里也能找到</div>
        <span class="emptyAction">去剪辑台合成 <i-right theme="outline" size="13" /></span>
      </div>
      <div v-else class="outputList">
        <div v-for="item in items" :key="item.id" class="outputItem">
          <video class="outputVideo" :src="item.url" controls preload="metadata"></video>
          <div class="outputInfo">
            <div class="outputName" :title="item.name">{{ item.name }}</div>
            <div class="outputMeta">
              <span v-if="item.resolution">{{ item.resolution }}</span>
              <span v-if="item.duration">{{ Math.round(item.duration) }}s</span>
              <span v-if="item.size">{{ (item.size / 1024 / 1024).toFixed(1) }}MB</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </t-card>
</template>

<script setup lang="ts">
import DirectorNodeHeading from "./DirectorNodeHeading.vue";
import { Handle, Position } from "@vue-flow/core";
import type { Ref } from "vue";
import { useRoute, useRouter } from "vue-router";

interface OutputItem {
  id: number;
  name: string;
  url: string;
  duration: number;
  size: number;
  resolution: string;
  createTime: number;
}

const props = defineProps<{
  id?: string;
  items?: OutputItem[];
  handleIds?: {
    target: string;
  };
  standalone?: boolean;
}>();

const router = useRouter();
const route = useRoute();
// 与视频工作台节点同源的当前分集上下文（production/index.vue provide）
const episodesId = inject<Ref<number>>("episodesId", ref(0));

/** 空态整卡可点：进入当前项目剪辑，并自动装配该分集的分镜。 */
function goEditor() {
  const returnTo = router.resolve({ path: "/production", query: { ...route.query, view: "canvas" } }).fullPath;
  router.push({ path: "/editor", query: { projectId: route.query.projectId, episode: String(episodesId.value), returnTo } });
}
</script>

<style lang="scss" scoped>
.outputNode {
  width: 360px;
  user-select: text;
  cursor: default;

  &.fluid {
    width: 100%;
  }

  .titleBar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    cursor: grab;
    user-select: none;

    .title {
      width: fit-content;
      padding: 5px 10px;
      color: #fff;
      border-radius: 8px 0;
      font-size: 16px;
      background: linear-gradient(135deg, #ff8847, #f26432);
    }
  }

  .content {
    .outputEmpty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 22px 18px;
      border: 1px dashed rgba(245, 116, 0, 0.28);
      border-radius: 12px;
      background: linear-gradient(160deg, #fffaf6, #fff);
      text-align: center;
      cursor: pointer;
      transition: all 0.22s ease;

      &:hover {
        border-color: rgba(245, 116, 0, 0.55);
        background: #fff5ee;
        transform: translateY(-1px);

        .emptyAction { background: #f57400; color: #fff; }
      }

      .emptyIcon {
        display: grid;
        place-items: center;
        width: 46px;
        height: 46px;
        border-radius: 13px;
        color: #e26500;
        background: rgba(245, 116, 0, 0.1);
      }

      .emptyTitle {
        margin-top: 2px;
        font-size: 14px;
        font-weight: 650;
        color: var(--td-text-color-primary, #242321);
      }

      .emptyDesc {
        max-width: 280px;
        font-size: 11.5px;
        line-height: 1.6;
        color: var(--td-text-color-placeholder, #8d8796);
      }

      .emptyAction {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        margin-top: 6px;
        padding: 5px 14px;
        border-radius: 999px;
        background: rgba(245, 116, 0, 0.12);
        color: #c25a22;
        font-size: 12px;
        font-weight: 600;
        transition: all 0.2s ease;
      }
    }

    .outputList {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .outputItem {
      border: 1px solid rgba(0, 0, 0, 0.06);
      border-radius: 10px;
      overflow: hidden;
      background: #fff;

      .outputVideo {
        display: block;
        width: 100%;
        max-height: 200px;
        background: #000;
      }

      .outputInfo {
        padding: 8px 10px;

        .outputName {
          font-size: 13px;
          font-weight: 600;
          color: var(--td-text-color-primary, #292733);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .outputMeta {
          display: flex;
          gap: 8px;
          margin-top: 4px;
          font-size: 11px;
          color: var(--td-text-color-placeholder, #8d8796);
        }
      }
    }
  }
}
</style>
