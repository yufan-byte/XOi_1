<template>
  <div class="admin-list-page">
    <header class="page-head">
      <div><span class="eyebrow">运营中心 / 交易管理</span><h2>订单与支付</h2><p>查看充值订单、支付渠道和到账状态。积分发放以服务端回调为准。</p></div>
      <t-button variant="outline" :loading="loading" @click="load"><template #icon><t-icon name="refresh" /></template>刷新</t-button>
    </header>
    <section class="stat-grid"><div class="stat-card"><small>累计成交订单</small><strong>{{ stats.paid }}</strong><span>已支付</span></div><div class="stat-card warning"><small>待支付订单</small><strong>{{ stats.pending }}</strong><span>等待回调或查单</span></div><div class="stat-card green"><small>累计收款</small><strong>¥{{ money(stats.revenue) }}</strong><span>已支付订单合计</span></div></section>
    <section class="panel">
      <div class="toolbar"><t-input v-model="search" clearable placeholder="订单号 / 用户名 / 三方单号" style="width:280px" @enter="refresh" /><t-select v-model="status" clearable placeholder="全部订单状态" style="width:170px" @change="refresh"><t-option value="pending" label="待支付" /><t-option value="paid" label="已支付" /><t-option value="expired" label="已过期" /><t-option value="refunded" label="已退款" /></t-select><t-button theme="primary" @click="refresh">查询</t-button></div>
      <t-table :data="orders" :columns="columns" :loading="loading" row-key="id" :hover="true"><template #out_trade_no="{ row }"><span class="mono">{{ row.out_trade_no }}</span></template><template #user_name="{ row }"><strong>{{ row.user_name || `用户#${row.user_id}` }}</strong></template><template #amount="{ row }">¥{{ money(row.amount) }}</template><template #status="{ row }"><t-tag :theme="statusTheme(row.status)" variant="light">{{ statusText(row.status) }}</t-tag></template><template #created_at="{ row }">{{ formatTime(row.created_at) }}</template><template #paid_at="{ row }">{{ formatTime(row.paid_at) }}</template></t-table>
      <div class="pager" v-if="pagination.total"><span>共 {{ pagination.total }} 条</span><t-pagination v-model:current="pagination.page" v-model:pageSize="pagination.limit" :total="pagination.total" size="small" @change="load" /></div><t-empty v-if="!loading && !orders.length" description="暂无订单" />
    </section>
  </div>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from "vue";
import axios from "@/utils/axios";
const loading=ref(false),search=ref(""),status=ref(""),orders=ref<any[]>([]); const stats=reactive({paid:0,pending:0,revenue:0}); const pagination=reactive({page:1,limit:20,total:0});
const columns=[{colKey:"out_trade_no",title:"商户订单号",width:205},{colKey:"user_name",title:"用户",width:140},{colKey:"package_name",title:"套餐",width:150},{colKey:"amount",title:"金额",width:95},{colKey:"channel",title:"渠道",width:90},{colKey:"status",title:"状态",width:100},{colKey:"created_at",title:"创建时间",width:170},{colKey:"paid_at",title:"支付时间",width:170}];
function money(v:any){return Number(v||0).toFixed(2)} function formatTime(v:any){if(!v)return "—";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString("zh-CN",{hour12:false})} function statusText(v:string){return ({pending:"待支付",paid:"已支付",expired:"已过期",refunded:"已退款"} as any)[v]||v||"未知"} function statusTheme(v:string){return ({pending:"warning",paid:"success",expired:"default",refunded:"danger"} as any)[v]||"default"} function refresh(){pagination.page=1;load()}
let requestVersion = 0;
onUnmounted(() => { requestVersion++; });
async function load(){const version = ++requestVersion;loading.value=true;try{const res=await axios.get("/admin/orders",{params:{page:pagination.page,limit:pagination.limit,search:search.value,status:status.value}});if(version !== requestVersion)return;orders.value=res.data?.orders||[];Object.assign(stats,res.data?.stats||{});Object.assign(pagination,res.data?.pagination||{});}catch(e:any){if(version !== requestVersion)return;window.$message?.error?.(e.message||"订单加载失败")}finally{if(version === requestVersion)loading.value=false}}
onMounted(load);
</script>
<style scoped lang="scss">
.admin-list-page{padding:28px 32px 38px;color:#152238}.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:22px}.eyebrow{font-size:11px;font-weight:750;letter-spacing:.12em;color:#ef6c35}.page-head h2{margin:8px 0 5px;font-size:25px}.page-head p{margin:0;color:#8993a5;font-size:13px}.stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px}.stat-card{padding:18px 20px;border:1px solid #e8ebf1;border-radius:16px;background:#fff;box-shadow:0 8px 25px rgba(31,45,72,.04)}.stat-card small,.stat-card span{display:block;color:#8993a5;font-size:11px}.stat-card strong{display:block;margin:6px 0 3px;color:#17243a;font-size:25px}.stat-card.warning strong{color:#c77b18}.stat-card.green strong{color:#17885c}.panel{border:1px solid #e8ebf1;border-radius:17px;background:#fff;overflow:hidden}.toolbar{display:flex;gap:10px;align-items:center;padding:18px 20px;border-bottom:1px solid #eef0f4;flex-wrap:wrap}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#536079}.pager{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-top:1px solid #eef0f4;color:#8a94a4;font-size:12px}@media(max-width:700px){.admin-list-page{padding:20px 15px}.page-head{align-items:flex-start;flex-direction:column}.stat-grid{grid-template-columns:1fr}.panel{overflow:auto}.toolbar,.pager{min-width:650px}}
</style>
