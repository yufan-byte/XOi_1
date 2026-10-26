<template>
  <t-dialog :visible="visible" header="手机传图" :footer="false" width="420px" @update:visible="emit('update:visible', $event)">
    <div class="phonePair">
      <p>手机扫码后登录同一个 XOi 账号，图片会自动出现在这里。仅上传素材，不调用 AI，不消耗积分。</p>
      <t-alert v-if="localOnly" theme="warning" message="当前是本机地址，手机无法直接访问。部署到正式域名后可扫码；本地联调需配置手机可访问的站点地址。" />
      <img v-if="qr" :src="qr" width="220" height="220" alt="手机上传二维码" />
      <p v-if="session">有效期 10 分钟 · 最多 10 张 · 每张不超过 10MB</p>
      <t-alert v-if="error" theme="error" :message="error" />
      <t-button v-if="!session || error" :loading="loading" @click="start">{{ session ? '重试查询' : '生成上传二维码' }}</t-button>
      <div v-if="files.length" class="receivedImages">
        <button v-for="file in files" :key="file.url" @click="choose(file)"><img :src="file.url" :alt="file.name" /><span>使用这张</span></button>
      </div>
      <small v-else-if="session">等待手机上传…收到后点击图片即可使用</small>
    </div>
  </t-dialog>
</template>
<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import QRCode from "qrcode";
import axios from "@/utils/axios";
import type { CloudAsset } from "@/utils/workspace";
const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ 'update:visible': [boolean]; received: [CloudAsset] }>();
const session = ref<{ id: string; expiresAt: number }>();
const qr = ref(""), error = ref(""), loading = ref(false), files = ref<CloudAsset[]>([]);
const origin = String(import.meta.env.VITE_XOI_PUBLIC_ORIGIN || location.origin).replace(/\/$/, "");
const localOnly = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(origin).hostname);
let timer: ReturnType<typeof setTimeout> | undefined, generation = 0;
async function close() {
  generation++; clearTimeout(timer);
  const id = session.value?.id;
  session.value = undefined; qr.value = ""; files.value = []; error.value = "";
  if (id) await axios.delete(`/workspace/upload-sessions/${id}`).catch(() => {});
}
async function poll(version: number) {
  if (!props.visible || version !== generation || !session.value) return;
  try {
    if (Date.now() >= session.value.expiresAt) { await close(); error.value = "二维码已过期，请重新生成"; return; }
    if (!document.hidden) {
      const result: any = await axios.get(`/workspace/upload-sessions/${session.value.id}`, { preserveHttpError: true, timeout: 15000 } as any);
      if (version !== generation) return;
      files.value = result.data.files.map((file: any) => ({ ...file, type: /\.png$/.test(file.url) ? "image/png" : /\.webp$/.test(file.url) ? "image/webp" : /\.gif$/.test(file.url) ? "image/gif" : "image/jpeg" }));
      error.value = "";
    }
  } catch (e: any) { error.value = e.response?.data?.message || "查询失败，图片不会丢失；可重试"; }
  if (props.visible && version === generation) timer = setTimeout(() => void poll(version), error.value ? 10000 : 3000);
}
async function start() {
  if (loading.value) return;
  clearTimeout(timer); loading.value = true; error.value = "";
  const version = generation;
  try {
    if (!session.value) {
      const response: any = await axios.post("/workspace/upload-sessions", undefined, { preserveHttpError: true, timeout: 15000 } as any);
      if (!props.visible || version !== generation) { await axios.delete(`/workspace/upload-sessions/${response.data.id}`).catch(() => {}); return; }
      session.value = response.data;
    }
    qr.value = await QRCode.toDataURL(`${origin}/#/phone-upload?session=${session.value!.id}`, { width: 220, margin: 2 });
    await poll(version);
  } catch (e: any) { error.value = e.message || "无法创建上传窗口，请重试"; }
  finally { loading.value = false; }
}
function choose(file: CloudAsset) { emit("received", file); emit("update:visible", false); }
watch(() => props.visible, open => { if (open) void start(); else void close(); });
onBeforeUnmount(() => { void close(); });
</script>
<style scoped>
.phonePair { display:flex; flex-direction:column; align-items:center; gap:14px; text-align:center; color:var(--td-text-color-secondary); }
.phonePair p { margin:0; font-size:13px; line-height:1.8; }
.phonePair > img { border-radius:16px; border:1px solid var(--td-component-border); background:white; }
.receivedImages { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; width:100%; }
.receivedImages button { border:1px solid var(--td-component-border); background:var(--td-bg-color-container); border-radius:12px; overflow:hidden; cursor:pointer; padding:5px; color:var(--td-text-color-primary); }
.receivedImages img { width:100%; height:80px; object-fit:cover; border-radius:8px; }
</style>
