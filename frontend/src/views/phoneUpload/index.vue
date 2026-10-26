<template>
  <main class="mobileTransfer">
    <small>XOi · 手机传图</small><h1>把手机图片传到电脑</h1>
    <p>请使用电脑端相同的账号。上传仅保存素材，不调用模型、不消耗积分。</p>
    <t-alert v-if="error" theme="error" :message="error" />
    <t-alert v-if="valid" theme="info" message="PNG / JPG / WebP / GIF，每张最多 10MB；窗口有效期 10 分钟。" />
    <label :class="{ disabled: busy || !valid }" class="pickImages">{{ busy ? '正在安全上传…' : '选择手机图片' }}<input :disabled="busy || !valid" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple @change="upload" /></label>
    <strong v-if="uploaded">已传回 {{ uploaded }} 张，请在电脑端选择使用</strong>
    <t-button variant="outline" :disabled="busy" @click="check">重新检查上传窗口</t-button>
  </main>
</template>
<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import axios from "@/utils/axios";
import { uploadWorkspaceFile, assertWorkspaceOwner } from "@/utils/workspace";
const id = String(useRoute().query.session || ""), owner = localStorage.getItem("userId") || "";
const error = ref(""), busy = ref(false), valid = ref(false), uploaded = ref(0);
let expiresAt = 0;
async function check() {
  valid.value = false; error.value = "";
  try {
    if (!/^[a-f0-9]{48}$/.test(id)) throw new Error("请先在电脑端打开手机上传窗口，再扫描二维码");
    const response: any = await axios.get(`/workspace/upload-sessions/${id}`, { preserveHttpError: true } as any);
    expiresAt = response.data.expiresAt; valid.value = Date.now() < expiresAt; uploaded.value = response.data.files.length;
    if (!valid.value) throw new Error("二维码已过期，请在电脑端重新打开上传窗口");
  } catch (e: any) { error.value = e.response?.data?.message || e.message || "请确认登录了相同账号，且上传窗口未关闭"; }
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement, files = [...(input.files || [])]; input.value = "";
  if (busy.value || !valid.value || !files.length) return;
  busy.value = true; error.value = "";
  try {
    if (files.length + uploaded.value > 10) throw new Error("每个上传窗口最多传 10 张图片");
    for (const file of files) {
      assertWorkspaceOwner(owner);
      if (Date.now() >= expiresAt) throw new Error("二维码已过期，请重新扫码");
      if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} 超过 10MB，请先压缩`);
      if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) throw new Error("请转换为 PNG / JPG / WebP / GIF 格式（不支持 HEIC）");
      const asset = await uploadWorkspaceFile(owner, file);
      await axios.post(`/workspace/upload-sessions/${id}/files`, { url: asset.url, name: asset.name }, { preserveHttpError: true } as any);
      uploaded.value++;
    }
  } catch (e: any) { error.value = e.response?.data?.message || e.message || "上传失败，已传回的图片仍保留，可重试"; }
  finally { busy.value = false; }
}
onMounted(check);
</script>
<style scoped>
.mobileTransfer { max-width:440px; margin:10vh auto; padding:28px 22px; display:flex; flex-direction:column; gap:20px; }
h1 { margin:0; font-size:26px; line-height:1.4; } p { margin:0; line-height:1.8; color:var(--td-text-color-secondary); font-size:14px; }
.pickImages { display:block; padding:20px; background:var(--td-brand-color); color:white; border-radius:18px; text-align:center; font-weight:600; cursor:pointer; }
.pickImages.disabled { opacity:.5; cursor:not-allowed; } input { display:none; }
</style>
