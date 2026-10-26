<template>
  <t-dialog attach="body" v-model:visible="visible" class="platformWelcome" placement="center" width="min(1040px, calc(100vw - 32px))" :header="false" :footer="false" :close-btn="false" :close-on-overlay-click="false" @close="dismiss">
    <div class="welcomeLayout">
      <div class="welcomeVisual">
        <img :src="welcomeArt" alt="从故事、角色到分镜与成片的创作画布" loading="eager" fetchpriority="high" decoding="async" />
        <div class="welcomeVisualCopy"><span>XOi CREATIVE STUDIO</span><h2>每一个想法，<br />都有自己的银幕。</h2><p>故事 · 画面 · 镜头 · 作品</p></div>
        <span class="welcomeVisualFoot">YOUR NEXT STORY STARTS HERE</span>
      </div>
      <section class="welcomeContent" aria-labelledby="welcomeTitle">
        <button class="welcomeClose" type="button" aria-label="关闭平台介绍" @click="dismiss">×</button>
        <span class="welcomeEyebrow">欢迎来到 XOi 导演台</span>
        <h1 id="welcomeTitle">让灵感，<br /><em>成为作品。</em></h1>
        <p class="welcomeLead">把故事写下来，把画面连起来。用 AI 推进创作，在同一个平台完成从想法到成片的旅程。</p>
        <div class="welcomeChoices" role="group" aria-label="选择创作入口">
          <button v-for="item in entries" :key="item.path" type="button" :class="{ selected: selected === item.path }" :aria-pressed="selected === item.path" @click="selected = item.path">
            <span class="welcomeIcon"><component :is="item.icon" size="20" /></span><span><strong>{{ item.name }}</strong><small>{{ item.description }}</small></span><span class="welcomeChoiceArrow" aria-hidden="true">↗</span>
          </button>
        </div>
        <div class="welcomeActions"><button class="welcomeStart" type="button" @click="start">开始创作 <span aria-hidden="true">→</span></button><button class="welcomeSkip" type="button" @click="dismiss">先逛逛工作台</button></div>
        <p class="welcomeNote">随时可从账号菜单里的「平台介绍」重新查看。</p>
      </section>
    </div>
  </t-dialog>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import welcomeArt from "@/assets/home-workflow/platform-welcome.webp";
const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ done: [] }>();
const router = useRouter();
const selected = ref("/aiAssistant");
const entries = [
  { path: "/aiAssistant", name: "智能创作", description: "描述想法，让 AI 帮你规划与创作", icon: "i-sparkle" },
  { path: "/project", name: "剧本创作", description: "小说改编、剧本、角色与分镜逐步推进", icon: "i-movie-board" },
  { path: "/canvas", name: "无限画布", description: "把参考、图片和视频放在同一张画布", icon: "i-edit" },
  { path: "/director3d", name: "白模预演工作台", description: "安排人物与机位，设计镜头和关键帧", icon: "i-reel" },
];
function dismiss() { visible.value = false; emit("done"); }
function start() { const path = selected.value; dismiss(); void router.push(path); }
</script>
<style lang="scss" scoped>
:deep(.platformWelcome .t-dialog) { padding: 0; overflow: hidden; border: 1px solid #e8e1d7; border-radius: 24px; background: #fffcf7; box-shadow: 0 30px 100px #15111f40; }
:deep(.platformWelcome .t-dialog__body) { padding: 0; max-height: calc(100dvh - 64px); overflow-y: auto; }
.welcomeLayout { display: grid; grid-template-columns: .85fr 1fr; color: #2d2926; }
.welcomeVisual { position: relative; min-height: 610px; overflow: hidden; isolation: isolate; background: #17132b; }
.welcomeVisual img { position: absolute; width: 100%; height: 100%; object-fit: cover; object-position: 68% center; z-index: -2; }
.welcomeVisual::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg,#0d0d2340 15%,#0c092054 45%,#0a081aed 100%); z-index: -1; }
.welcomeVisualCopy { position: absolute; bottom: 96px; padding: 36px; color: #fff; }
.welcomeVisualCopy span { font-size: 10px; letter-spacing: .18em; color: #e7d2b7; }
.welcomeVisualCopy h2 { margin: 18px 0; font-size: clamp(25px,3vw,35px); line-height: 1.4; font-weight: 600; letter-spacing: -.03em; }
.welcomeVisualCopy p { font-size: 12px; color: #cec4db; letter-spacing: .16em; }
.welcomeVisualFoot { position: absolute; bottom: 30px; left: 36px; font-size: 9px; color: #b0a8be; letter-spacing: .16em; }
.welcomeContent { position: relative; padding: 42px 40px 26px; }
.welcomeClose { position: absolute; top: 18px; right: 18px; display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 50%; background: #eee9e1; color: #726a60; font-size: 22px; cursor: pointer; }
.welcomeEyebrow { color: #b86a37; font-size: 11px; letter-spacing: .12em; }
h1 { margin: 15px 0; font-size: clamp(30px,3.4vw,44px); line-height: 1.18; letter-spacing: -.04em; font-weight: 650; }
h1 em { font-style: normal; color: #d97637; }
.welcomeLead { font-size: 13px; line-height: 1.85; color: #7b736b; margin: 0 0 22px; }
.welcomeChoices { display: grid; gap: 8px; }
.welcomeChoices button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px; border: 1px solid #e8e2d9; border-radius: 12px; background: #fffdf9; color: #3c342b; text-align: left; cursor: pointer; transition: border-color .15s, background .15s; }
.welcomeChoices button.selected { border-color: #d99763; background: #fff2e5; }
.welcomeChoices button:hover { border-color: #d99763; }
.welcomeIcon { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 10px; background: #f2ece4; color: #a16c42; }
.welcomeChoices strong { display: block; font-size: 13px; font-weight: 650; }
.welcomeChoices small { display: block; margin-top: 4px; font-size: 11px; line-height: 1.5; color: #8a8075; }
.welcomeChoiceArrow { margin-left: auto; font-size: 17px; color: #bb9270; }
.welcomeActions { display: flex; gap: 14px; align-items: center; margin-top: 22px; }
.welcomeStart { display: flex; justify-content: space-between; gap: 24px; align-items: center; border: 0; padding: 13px 22px; border-radius: 10px; background: #292623; color: #fffaf3; font-size: 13px; cursor: pointer; }
.welcomeStart:hover { background: #514238; }
.welcomeSkip { border: 0; background: transparent; font-size: 12px; color: #8e8176; cursor: pointer; }
.welcomeNote { margin: 18px 0 0; color: #a1978c; font-size: 10px; }
button:focus-visible { outline: 2px solid #bd6b35; outline-offset: 3px; }
@media(max-width: 700px) { .welcomeLayout { grid-template-columns: 1fr; } .welcomeVisual { min-height: 170px; } .welcomeVisualCopy { bottom: 0; padding: 22px; } .welcomeVisualCopy h2 { font-size: 23px; margin: 8px 0 0; } .welcomeVisualCopy h2 br { display: none; } .welcomeVisualCopy p,.welcomeVisualFoot { display: none; } .welcomeContent { padding: 28px 22px 22px; } h1 { font-size: 32px; } }
</style>

<style lang="scss">
.platformWelcome .t-dialog, .t-dialog.platformWelcome { padding: 0 !important; overflow: hidden; border: 1px solid #e8e1d7; border-radius: 24px; background: #fffcf7; box-shadow: 0 30px 100px #15111f40; }
.platformWelcome .t-dialog__body { padding: 0 !important; max-height: calc(100dvh - 64px); overflow-y: auto; }
</style>
