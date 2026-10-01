<template>
  <div class="settings-page">
    <div class="settings-head"><div><span class="eyebrow">系统 / 平台配置</span><h2>系统设置</h2><p>策略保存在服务端，保存后对新请求生效。</p></div>
      <t-button :loading="saving" :disabled="loading || !dirty" @click="save">保存修改</t-button>
    </div>
    <t-alert v-if="loadError" theme="error" :message="loadError"><template #operation><t-button variant="text" @click="load">重试</t-button></template></t-alert>
    <t-loading :loading="loading">
      <section class="setting-card">
        <div class="card-title"><div><h3>平台策略</h3><p>{{ dirty ? '有尚未保存的修改' : savedAt ? '最近保存：' + savedAt : '当前服务端配置' }}</p></div></div>
        <div class="setting-row"><div><b>开放用户注册</b><small>关闭后服务端拒绝新账号注册</small></div><t-switch v-model="form.registrationOpen" :disabled="loading || saving" /></div>
        <div class="setting-row"><div><b>新用户赠送积分</b><small>新账号创建时发放一次，并记录积分流水；不追溯已有用户</small></div><t-input-number v-model="form.welcomePoints" :disabled="loading || saving" :min="0" :max="100000" :decimal-places="0" /></div>
        <div class="setting-row"><div><b>维护模式</b><small>暂停注册和普通用户的新创作请求；已有任务继续处理，查询、支付和管理员操作保留</small></div><t-switch v-model="form.maintenance" :disabled="loading || saving" /></div>
      </section>
      <section class="setting-card" style="margin-top:16px"><div class="card-title"><div><h3>高级设置</h3><p>供应商、工作流模型与个人账号安全</p></div></div>
        <div class="advanced-grid"><button @click="openAdvanced('vendorConfig')"><b>供应商配置</b><small>模型与服务凭据</small></button><button @click="openAdvanced('loginConfig')"><b>账号安全</b><small>修改个人密码</small></button><button @click="openAdvanced('agentConfog')"><b>Agent 配置</b><small>智能工作流模型</small></button></div>
      </section>
    </t-loading>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import axios from '@/utils/axios';
import settingStore from '@/stores/setting';
const store = settingStore();
const form = reactive({ registrationOpen: true, welcomePoints: 0, maintenance: false });
const loading = ref(true), saving = ref(false), loadError = ref(''), savedAt = ref('');
const snapshot = ref('');
const dirty = computed(() => snapshot.value !== JSON.stringify(form));
async function load() {
  loading.value = true; loadError.value = '';
  try {
    const response = await axios.get('/admin/settings');
    Object.assign(form, response.data);
    snapshot.value = JSON.stringify(form);
  } catch { loadError.value = '配置加载失败，当前值尚未确认，请重试'; }
  finally { loading.value = false; }
}
async function save() {
  if (saving.value || loading.value || loadError.value) return;
  if (!Number.isInteger(form.welcomePoints) || form.welcomePoints < 0 || form.welcomePoints > 100000) {
    window.$message?.error?.('赠送积分须为 0–100000 的整数'); return;
  }
  saving.value = true;
  try {
    const response = await axios.put('/admin/settings', { ...form });
    Object.assign(form, response.data);
    snapshot.value = JSON.stringify(form); savedAt.value = new Date().toLocaleTimeString('zh-CN');
    window.$message?.success?.('平台策略已保存');
  } catch (error: any) { window.$message?.error?.(error.message || '保存失败，修改未生效'); }
  finally { saving.value = false; }
}
function openAdvanced(menu: string) { store.activeMenu = menu; store.showSetting = true; }
onMounted(load);
</script>
<style scoped lang="scss">
.settings-page{padding:28px 32px 38px;color:#152238}.settings-head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:22px}.eyebrow{font-size:11px;font-weight:750;letter-spacing:.12em;color:#ef6c35}.settings-head h2{margin:8px 0 5px;font-size:25px;letter-spacing:-.035em}.settings-head p{margin:0;color:#8993a5;font-size:13px}.saved{display:flex;align-items:center;gap:7px;color:#16885d;font-size:12px;opacity:0;transition:.2s}.saved.show{opacity:1}.saved i{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#e5f8ef;font-style:normal}.settings-layout{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:18px}.settings-main{display:flex;flex-direction:column;gap:16px}.setting-card,.status-card,.tip-card{border:1px solid #e8ebf1;border-radius:17px;background:#fff;box-shadow:0 8px 25px rgba(31,45,72,.04)}.setting-card{padding:20px 22px}.card-title{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:9px}.card-title h3{margin:0;font-size:15px}.card-title p{margin:5px 0 0;color:#99a2b0;font-size:11px}.card-mark{padding:6px 9px;border-radius:8px;font-size:10px;font-weight:700}.card-mark.orange{color:#e86b31;background:#fff0e7}.card-mark.violet{color:#7667d9;background:#efedff}.card-mark.blue{color:#3278ca;background:#e9f3ff}.setting-row{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:16px 0;border-top:1px solid #f0f2f5}.setting-row div{display:flex;flex-direction:column;gap:4px}.setting-row b{font-size:13px;color:#27344a}.setting-row small{font-size:11px;color:#99a2b0}.advanced-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:15px}.advanced-grid button{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:14px;border:1px solid #eef0f4;border-radius:12px;background:#fafbfc;text-align:left;cursor:pointer;transition:.2s}.advanced-grid button:hover{border-color:#f1c0a4;background:#fff8f4;transform:translateY(-1px)}.advanced-grid button>span{color:#e86b31;font-size:16px}.advanced-grid button b{font-size:12px;color:#27344a}.advanced-grid button small{font-size:10px;color:#99a2b0}.advanced-grid button i{position:absolute;right:12px;bottom:13px;color:#b0b8c3;font-style:normal}.settings-side{display:flex;flex-direction:column;gap:14px}.status-card{padding:19px}.status-top{display:flex;align-items:center;gap:8px;font-size:14px;color:#1c8e60}.pulse{width:8px;height:8px;border-radius:50%;background:#23ae73;box-shadow:0 0 0 4px #e2f8ed}.status-card p{margin:13px 0 15px;font-size:11px;line-height:1.6;color:#8f99a8}.status-line{display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid #f0f2f5;font-size:11px;color:#7e8999}.status-line strong{color:#1b9c67}.tip-card{display:flex;gap:10px;padding:16px;background:#fffbf4;border-color:#f7e7c6}.tip-card>span{color:#e6a33c;font-size:17px}.tip-card b{font-size:11px;color:#936a27}.tip-card p{margin:6px 0 0;font-size:10px;line-height:1.6;color:#aa8a55}.reset-btn{border:1px dashed #e1e5ea;background:transparent;border-radius:11px;padding:10px;color:#8d97a5;font-size:11px;cursor:pointer}.reset-btn:hover{color:#d46137;border-color:#efb99b}@media(max-width:850px){.settings-layout{grid-template-columns:1fr}.settings-side{display:grid;grid-template-columns:1fr 1fr}.reset-btn{grid-column:1/-1}}@media(max-width:560px){.settings-page{padding:20px 15px}.settings-head{align-items:flex-start;flex-direction:column;gap:10px}.advanced-grid{grid-template-columns:1fr}.settings-side{display:flex}}
</style>
