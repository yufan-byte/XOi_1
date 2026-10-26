<template>
  <section class="one-stop-redirect" role="status">
    <span class="loading-dot"></span>
    <p>正在打开 AI 一站式漫剧…</p>
    <a class="manual-link" :href="'/one-stop/#' + target">没有自动跳转？点这里手动进入</a>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
const route = useRoute();
// 独立页面模式：整窗跳转到 one-stop SPA 自身路由；左侧导航自带「返回导演创作」回到主应用。
const page = (value: unknown) =>
  typeof value === 'string' && /^\/comic(?:\/(?:assets|[A-Za-z0-9][A-Za-z0-9_-]{0,159}))?$/.test(value) ? value : '/comic';
const target = computed(() => page(route.query.page));
onMounted(() => {
  window.location.replace('/one-stop/#' + target.value);
});
</script>
<style scoped>
.one-stop-redirect{position:absolute;inset:0;background:#f8f8f6;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px;color:#888578;font-size:13px}
.loading-dot{width:24px;height:24px;border:2px solid #ece5d9;border-top-color:#c55d30;border-radius:50%;animation:turn 1s linear infinite}
.manual-link{color:#9a5638;text-decoration:none;border:1px solid #e5dfd4;border-radius:10px;padding:9px 15px;background:#fff}
@keyframes turn{to{transform:rotate(360deg)}}
</style>
