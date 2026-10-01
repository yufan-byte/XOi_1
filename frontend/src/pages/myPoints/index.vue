<template>
  <div class="myPoints">
    <div class="page-head">
      <div><div class="eyebrow">账户中心 / 资产记录</div><h1>积分明细</h1><p>查看账户余额与每一笔积分变动。</p></div>
      <div class="account-status"><span></span>账户状态正常</div>
    </div>

    <div class="stats-cards">
      <div class="stat-card balance-card">
        <div class="stat-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z"/>
          </svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">当前余额</div>
          <div class="stat-value">{{ balance }}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon income">↑</div>
        <div class="stat-info">
          <div class="stat-label">本页获取</div>
          <div class="stat-value">{{ totalIncome }}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon expense">↓</div>
        <div class="stat-info">
          <div class="stat-label">本页消费</div>
          <div class="stat-value">{{ totalExpense }}</div>
        </div>
      </div>
    </div>

    <section class="ledger-card">
      <div class="ledger-head">
        <div><h2>积分流水</h2><p>共 {{ pagination.total }} 条记录，按时间从近到远排列。</p></div>
        <div class="filter-bar">
          <t-select v-model="filterType" placeholder="全部类型" clearable style="width: 140px" @change="fetchData">
        <t-option value="consume" label="消费" />
        <t-option value="gift" label="赠送" />
        <t-option value="recharge" label="充值" />
        <t-option value="checkin" label="签到" />
        <t-option value="refund" label="退款" />
        <t-option value="member" label="会员" />
          </t-select>
          <t-button theme="default" @click="fetchData">
        <template #icon><t-icon name="refresh" /></template>
        刷新
          </t-button>
        </div>
      </div>

      <div class="table-wrapper">
      <t-table
        :data="logs"
        :columns="columns"
        :loading="loading"
        :pagination="pagination"
        @page-change="onPageChange"
        row-key="id"
        hover
      >
        <template #type="{ row }">
          <t-tag :theme="getTypeTheme(row.type)" variant="light">
            {{ getTypeText(row.type) }}
          </t-tag>
        </template>
        <template #amount="{ row }">
          <span :class="{ 'text-green': row.amount > 0, 'text-red': row.amount < 0 }">
            {{ row.amount > 0 ? '+' : '' }}{{ row.amount }}
          </span>
        </template>
        <template #created_at="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
      </t-table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import axios from '@/utils/axios';

// 格式化时间：后端存的是 UTC ISO 字符串，展示时转本地时间
function formatTime(v: any): string {
  if (!v) return '--';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const loading = ref(false);
const logs = ref<any[]>([]);
const balance = ref(0);
const filterType = ref('');

const pagination = ref({
  current: 1,
  pageSize: 20,
  total: 0,
});

const columns = [
  { colKey: 'type', title: '类型', width: 100 },
  { colKey: 'action', title: '操作', width: 150 },
  { colKey: 'amount', title: '积分变动', width: 120 },
  { colKey: 'description', title: '描述', width: 250 },
  { colKey: 'created_at', title: '时间', width: 180 },
];

// 统计
const totalIncome = computed(() => {
  return logs.value
    .filter(l => l.amount > 0)
    .reduce((sum, l) => sum + l.amount, 0);
});

const totalExpense = computed(() => {
  return Math.abs(logs.value
    .filter(l => l.amount < 0)
    .reduce((sum, l) => sum + l.amount, 0));
});

async function fetchData() {
  loading.value = true;
  try {
    // 获取余额
    const balanceRes = await axios.get('/setting/pointsConfig/balance');
    if (balanceRes.code === 200) {
      balance.value = balanceRes.data.points;
    }

    // 获取流水
    const logRes = await axios.get('/setting/pointsConfig/log', {
      params: {
        page: pagination.value.current,
        limit: pagination.value.pageSize,
        type: filterType.value || undefined,
      }
    });
    if (logRes.code === 200) {
      logs.value = logRes.data.logs;
      pagination.value.total = logRes.data.pagination.total;
    }
  } catch (e) {
    console.error('获取积分数据失败:', e);
  } finally {
    loading.value = false;
  }
}

function onPageChange(pageInfo: any) {
  pagination.value.current = pageInfo.current;
  pagination.value.pageSize = pageInfo.pageSize;
  fetchData();
}

function getTypeTheme(type: string): "default" | "primary" | "danger" | "warning" | "success" {
  const themes: Record<string, "default" | "primary" | "danger" | "warning" | "success"> = {
    consume: 'danger',
    recharge: 'success',
    gift: 'warning',
    checkin: 'success',
    refund: 'default',
    member: 'primary',
  };
  return themes[type] || 'default';
}

function getTypeText(type: string) {
  const texts: Record<string, string> = {
    consume: '消费',
    recharge: '充值',
    gift: '赠送',
    checkin: '签到',
    refund: '退款',
    member: '会员',
  };
  return texts[type] || type;
}

onMounted(() => {
  fetchData();
});
</script>

<style scoped lang="scss">
.myPoints {
  padding: 28px clamp(16px, 3vw, 32px) 32px;
  height: 100%;
  overflow-y: auto;
  background: #f7f8fa;
}

.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:24px;.eyebrow{color:#1d5fd1;font-size:11px;font-weight:700;letter-spacing:.08em;}h1{margin:5px 0 0;color:#182033;font-size:25px;letter-spacing:-.02em;}p{margin:6px 0 0;color:#7a8495;font-size:13px;}.account-status{display:inline-flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid #d8f1e8;border-radius:999px;background:#f1fbf7;color:#0d887b;font-size:12px;font-weight:600;white-space:nowrap;span{width:7px;height:7px;border-radius:50%;background:#12a594;}}}

.stats-cards {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 18px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e2e6ed;
  box-shadow: none;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  }

  &.balance-card {
    position: relative;
    overflow: hidden;
    background: linear-gradient(135deg, #0b1638 0%, #183d8f 58%, #2563eb 100%);
    color: white;
    border-color: #182033;

    &::before { content:''; position:absolute; inset:0; opacity:.22; background-image:linear-gradient(rgba(255,255,255,.26) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.26) 1px,transparent 1px); background-size:26px 26px; mask-image:linear-gradient(90deg,transparent,black); }
    &::after { content:''; position:absolute; width:180px; height:180px; right:-66px; top:-88px; border-radius:50%; background:radial-gradient(circle,rgba(112,189,255,.72),transparent 66%); }

    .stat-icon,.stat-info { position:relative; z-index:1; }
    .stat-icon { background:rgba(255,255,255,.16); color:#fff; box-shadow:inset 0 0 0 1px rgba(255,255,255,.18); }
    .stat-label { color:rgba(255,255,255,.72) !important; opacity:1; }
    .stat-value { color:#fff !important; text-shadow:0 3px 12px rgba(0,0,0,.2); }
  }
}

.stat-icon {
  width: 38px;
  height: 38px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e8f0ff;
  color: #1d5fd1;
  font-size: 20px;
  font-weight: 700;

  &.income {
    background: rgba(0, 168, 112, 0.1);
    color: #00a870;
  }

  &.expense {
    background: rgba(227, 77, 89, 0.1);
    color: #e34d59;
  }
}

.stat-info {
  .stat-label {
    font-size: 13px;
    color: rgba(0, 0, 0, 0.45);
    margin-bottom: 4px;
  }

  .stat-value {
    font-size: 24px;
    font-weight: 700;
    color: rgba(0, 0, 0, 0.88);
  }
}

.ledger-card{padding:18px;border:1px solid #e2e6ed;border-radius:12px;background:#fff;box-shadow:none;}.ledger-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px;h2{margin:0;color:#182033;font-size:16px;}p{margin:5px 0 0;color:#7a8495;font-size:12px;}}.filter-bar{display:flex;align-items:center;gap:8px;}

.table-wrapper {
  border-radius: 9px;
  border: 1px solid #e7eaf0;
  box-shadow: none;
  overflow: hidden;
  padding: 4px;
}

.text-green {
  color: #00a870;
  font-weight: 600;
}

.text-red {
  color: #e34d59;
  font-weight: 600;
}

:deep(.t-table) {
  background: transparent;

  .t-table__header {
    background: #fafbfc;

    th {
      font-size: 13px;
      font-weight: 600;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }
  }

  .t-table__body {
    tr {
      transition: background 0.2s;

      &:hover {
        background: #f6f9ff !important;
      }

      td {
        border-bottom: 1px solid rgba(0, 0, 0, 0.03);
        padding: 12px 16px;
      }
    }
  }
}

:deep(.t-tag) {
  border-radius: 6px;
  font-weight: 500;
}

@media(max-width:640px){.page-head,.ledger-head{align-items:flex-start;flex-direction:column;}.stats-cards{flex-direction:column;}.filter-bar{width:100%;}.filter-bar :deep(.t-select),.filter-bar :deep(.t-button){flex:1;}}
</style>
