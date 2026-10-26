<template>
  <Teleport to="body">
    <div class="work-mask" @click.self="close">
      <section ref="dialog" class="work-dialog" role="dialog" aria-modal="true" :aria-label="work.t || '灵感详情'" tabindex="-1" @keydown="onKeydown">
        <header class="work-header">
          <button type="button" class="work-back" :disabled="replicating" @click="close">← {{ origin === 'aiAssistant' ? '返回首页灵感' : '返回广场列表' }}</button>
          <div class="work-pagination">
            <span v-if="index >= 0">{{ index + 1 }} / {{ items.length }}</span>
            <button type="button" aria-label="上一个灵感" :disabled="index <= 0 || replicating" @click="navigate(-1)">‹</button>
            <button type="button" aria-label="下一个灵感" :disabled="index < 0 || index >= items.length - 1 || replicating" @click="navigate(1)">›</button>
            <button type="button" aria-label="关闭灵感详情" :disabled="replicating" @click="close">×</button>
          </div>
        </header>
        <div class="work-content">
          <div :key="`${work.src}:${work.id}`" class="work-media">
            <video v-if="work.k === 'video' || work.mk === 'video'" :src="work.u" controls autoplay muted loop playsinline @error="onMediaError" />
            <img v-else :src="work.u" :alt="work.t" @error="onMediaError" />
          </div>
          <div :key="`${work.src}:${work.id}`" class="work-body">
            <span class="work-kind">{{ kindLabel }}</span>
            <h2>{{ work.t || '未命名作品' }}</h2>
            <div class="work-meta"><span>作者 {{ work.n || '未署名' }}</span><span>{{ work.r }} 推荐 · {{ work.v }} 浏览</span></div>
            <p v-if="work.d" class="work-desc">{{ work.d }}</p>
            <details v-if="prompt && prompt !== work.d" class="work-prompt"><summary>查看提示词</summary><p>{{ prompt }}</p></details>
            <div class="work-actions">
              <p class="work-explanation">{{ work.src === 'canvas' ? '复刻会复制完整工作流到你的画布，可调整节点、模型和提示词。' : '使用提示词会填入创作输入框；带参考到画布会同时带上原作品素材。' }}</p>
              <button v-if="work.src === 'canvas'" type="button" class="work-primary" :disabled="replicating" @click="replicate(work)">{{ replicating ? '正在准备工作流…' : `复刻工作流（${work.nc || 0} 节点）` }}</button>
              <button v-else type="button" class="work-primary" :disabled="!prompt" @click="emit('use-prompt', prompt)">使用提示词</button>
              <button v-if="work.src !== 'canvas'" type="button" class="work-secondary" :disabled="!prompt" @click="canvasWithPrompt(work)">带参考到画布</button>
              <div class="work-extra">
                <button type="button" :disabled="!prompt" @click="copyPrompt">{{ copied ? '已复制 ✓' : '复制提示词' }}</button>
                <a :href="work.u" :download="work.id" target="_blank" rel="noopener">下载封面</a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { MessagePlugin } from "tdesign-vue-next";
import { squarePromptOf, type SquareItem } from "@/utils/square";
import { useSquareActions, type SquareOrigin } from "@/utils/squareActions";
const props = defineProps<{ work: SquareItem; items: SquareItem[]; origin: SquareOrigin }>();
const emit = defineEmits<{ close: []; navigate: [work: SquareItem]; 'use-prompt': [prompt: string] }>();
const { replicating, replicate, canvasWithPrompt } = useSquareActions(props.origin);
const dialog = ref<HTMLElement | null>(null);
const copied = ref(false);
const index = computed(() => props.items.findIndex(item => item.src === props.work.src && item.id === props.work.id));
const prompt = computed(() => squarePromptOf(props.work));
const kindLabel = computed(() => props.work.src === "canvas" ? "画布工作流" : props.work.src === "video" ? "视频灵感" : "图片灵感");
let previousFocus: HTMLElement | null = null;
let copyTimer: ReturnType<typeof setTimeout> | undefined;
function close() { if (!replicating.value) emit("close"); }
function navigate(step: number) {
  const item = props.items[index.value + step];
  if (!replicating.value && item) emit("navigate", item);
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") { event.preventDefault(); close(); }
  // Arrow keys keep their usual meaning inside inputs and video controls.
  if ((event.target as HTMLElement).closest("video, input, textarea, summary")) return;
  if (event.key === "ArrowLeft") { event.preventDefault(); navigate(-1); }
  if (event.key === "ArrowRight") { event.preventDefault(); navigate(1); }
  if (event.key === "Tab") {
    const focusable = [...(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], summary, video[controls]') || [])];
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.value)) { event.preventDefault(); first?.focus(); }
  }
}
async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(prompt.value); copied.value = true;
    clearTimeout(copyTimer); copyTimer = setTimeout(() => { copied.value = false; }, 2000);
  } catch { MessagePlugin.error("复制失败"); }
}
function onMediaError(event: Event) {
  const media = event.target as HTMLImageElement | HTMLVideoElement;
  const src = media.getAttribute("src") || "";
  if (src.startsWith("/api/media/") && media.dataset.retried !== "1") {
    media.dataset.retried = "1";
    media.setAttribute("src", `${src}${src.includes("?") ? "&" : "?"}_r=1`);
    if (media instanceof HTMLVideoElement) media.load();
    return;
  }
  media.style.visibility = "hidden"; media.parentElement?.classList.add("is-cover-failed");
}
watch(() => props.work, () => { copied.value = false; clearTimeout(copyTimer); }, { flush: "post" });
onMounted(async () => { previousFocus = document.activeElement as HTMLElement; await nextTick(); dialog.value?.focus({ preventScroll: true }); });
onBeforeUnmount(() => { clearTimeout(copyTimer); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); });
</script>

<style scoped>
.work-mask{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:24px;background:rgba(12,12,14,.58)}
.work-dialog{width:min(1100px,100%);max-height:90vh;overflow:hidden;border-radius:22px;background:#fff;color:#252529;box-shadow:0 24px 80px #0003;outline:none;display:flex;flex-direction:column}
.work-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #ececef;flex-shrink:0}
.work-header button{border:0;border-radius:9px;background:#f3f3f5;color:#515158;cursor:pointer;min-height:36px;padding:6px 12px;font:inherit;font-size:13px}
.work-pagination{display:flex;align-items:center;gap:7px;color:#909096;font-size:12px}.work-pagination button{min-width:36px;font-size:22px;line-height:1}
.work-content{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(300px,1fr);min-height:0;overflow:auto}
.work-media{position:relative;display:grid;place-items:center;background:#121216;min-height:360px;overflow:hidden}
.work-media img,.work-media video{display:block;width:100%;max-height:calc(90vh - 65px);object-fit:contain}.work-media.is-cover-failed::after{position:absolute;inset:0;display:grid;place-items:center;content:'封面暂不可用';color:#a7a7af;font-size:13px}
.work-body{display:flex;flex-direction:column;gap:14px;padding:28px;min-width:0;overflow-y:auto}.work-kind{align-self:flex-start;padding:5px 9px;border-radius:7px;background:#fff1e7;color:#d46922;font-size:12px}.work-body h2{margin:0;font-size:23px;line-height:1.4;overflow-wrap:anywhere}.work-meta{display:flex;flex-wrap:wrap;gap:10px;color:#93939b;font-size:12px}.work-desc,.work-prompt p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.8;color:#65656e}.work-prompt{font-size:13px;color:#686870}.work-prompt summary{cursor:pointer}.work-prompt p{margin-top:10px}
.work-actions{display:flex;flex-direction:column;gap:10px;margin-top:auto;padding-top:14px}.work-explanation{margin:0 0 4px;color:#92929b;font-size:12px;line-height:1.7}.work-primary,.work-secondary{padding:12px 15px;border-radius:11px;font:inherit;font-size:14px;font-weight:600;cursor:pointer}.work-primary{border:0;background:#ff7929;color:white}.work-secondary{border:1px solid #e8e8ec;background:#fff;color:#484850}.work-extra{display:flex;gap:18px;flex-wrap:wrap;padding-top:5px}.work-extra button,.work-extra a{border:0;background:none;padding:0;color:#888891;font-size:12px;text-decoration:none;cursor:pointer}
button:disabled{opacity:.5;cursor:default}button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid #ff7929;outline-offset:3px}
@media(max-width:800px){.work-mask{padding:12px}.work-content{grid-template-columns:1fr}.work-media{min-height:200px}.work-media img,.work-media video{max-height:42vh}.work-body{padding:20px}.work-header{padding:10px}.work-back{white-space:nowrap}.work-pagination{gap:4px}.work-pagination button{padding:5px;min-width:30px}.work-body h2{font-size:20px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style>
