<template>
  <div class="points-management">
    <div class="page-intro">
      <div>
        <div class="eyebrow">运营中心 / 资产管理</div>
        <h1>积分与计费</h1>
        <p>管理用户余额、人工补发、消费流水与基础价格。所有变更都会经过服务端校验并留下记录。</p>
      </div>
      <div class="intro-status"><span></span>数据实时同步</div>
    </div>
    <section class="content-card points-overview">
      <div class="section-head">
        <div>
          <h2>积分总览</h2>
          <p>余额、发放和消耗数据按当前账号范围汇总</p>
        </div>
        <t-space class="action-bar">
          <t-button theme="primary" @click="openAllocate()">
            <template #icon><t-icon name="add" /></template>
            分配积分
          </t-button>
          <t-button theme="default" @click="fetchData">
            <template #icon><t-icon name="refresh" /></template>
            刷新数据
          </t-button>
        </t-space>
      </div>
      <!-- 统计卡片 -->
      <t-row :gutter="16" class="stats-row">
        <t-col :span="3">
          <t-card :bordered="false" class="stat-card">
            <div class="stat-mark">U</div>
            <div class="stat-title">用户总数</div>
            <div class="stat-value">{{ stats.users }}</div>
          </t-card>
        </t-col>
        <t-col :span="3">
          <t-card :bordered="false" class="stat-card">
            <div class="stat-mark">+</div>
            <div class="stat-title">总积分发放</div>
            <div class="stat-value">{{ stats.total_points }}</div>
          </t-card>
        </t-col>
        <t-col :span="3">
          <t-card :bordered="false" class="stat-card">
            <div class="stat-mark">−</div>
            <div class="stat-title">已消费积分</div>
            <div class="stat-value">{{ stats.consumed_points }}</div>
          </t-card>
        </t-col>
        <t-col :span="3">
          <t-card :bordered="false" class="stat-card">
            <div class="stat-mark">¥</div>
            <div class="stat-title">充值积分</div>
            <div class="stat-value">{{ stats.recharged_points }}</div>
          </t-card>
        </t-col>
      </t-row>

      <div class="table-section">
        <div class="table-title"><div><h3>用户积分账户</h3><p>查看余额与会员层级，必要时可补发积分或查阅流水</p></div></div>
        <t-table
          :data="users"
          :columns="columns"
          :loading="loading"
          :pagination="pagination"
          @page-change="onPageChange"
          row-key="id"
        >
        <template #member_level="{ row }">
          <t-tag :theme="getMemberLevelTheme(row.member_level)" variant="light">
            {{ getMemberLevelText(row.member_level) }}
          </t-tag>
        </template>
        <template #created_at="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
        <template #operation="{ row }">
          <t-space>
            <t-link theme="primary" @click="viewUserLog(row)">查看流水</t-link>
            <t-link theme="primary" @click="openAllocate(row)">分配积分</t-link>
          </t-space>
        </template>
        </t-table>
      </div>
    </section>

    <!-- 分配积分弹窗 -->
    <t-dialog
      v-model:visible="showAllocateDialog"
      header="分配积分"
      :confirm-btn="{ loading: allocating, disabled: allocating }"
      :close-on-overlay-click="!allocating"
      :on-confirm="handleAllocate"
    >
      <t-form :data="allocateForm" label-width="100px">
        <t-form-item label="用户">
          <t-select v-model="allocateForm.user_id" :options="userOptions" placeholder="选择用户" />
        </t-form-item>
        <t-form-item label="积分数量">
          <t-input-number v-model="allocateForm.points" :min="1" />
        </t-form-item>
        <t-form-item label="备注">
          <t-input v-model="allocateForm.description" placeholder="可选" />
        </t-form-item>
      </t-form>
    </t-dialog>

    <!-- 用户流水弹窗 -->
    <t-dialog
      v-model:visible="showLogDialog"
      header="积分流水"
      width="800px"
      :footer="false"
    >
      <t-table
        :data="userLogs"
        :columns="logColumns"
        :loading="logLoading"
        :pagination="logPagination"
        @page-change="onLogPageChange"
        row-key="id"
      >
        <template #type="{ row }">
          <t-tag :theme="getTypeTheme(row.type)" variant="light">
            {{ getTypeText(row.type) }}
          </t-tag>
        </template>
        <template #amount="{ row }">
          <span :class="{ 'text-red': row.amount < 0, 'text-green': row.amount > 0 }">
            {{ row.amount > 0 ? '+' : '' }}{{ row.amount }}
          </span>
        </template>
        <template #created_at="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
      </t-table>
    </t-dialog>

    <!-- 积分定价管理 -->
    <section class="content-card pricing-section">
      <div class="section-head compact">
        <div>
          <h2>基础计费价格</h2>
          <p>这里定义操作的基础积分；供应商和模型倍率请在“定价规则”中维护。</p>
        </div>
      </div>
      <t-table
        :data="prices"
        :columns="priceColumns"
        :loading="pricesLoading"
        row-key="id"
      >
        <template #points="{ row }">
          <t-input-number
            v-model="row.points"
            :min="0"
            size="small"
            style="width: 100px"
            @change="handlePriceChange(row)"
          />
        </template>
        <template #operation="{ row }">
          <t-link theme="primary" @click="savePrice(row)">保存</t-link>
        </template>
      </t-table>
    </section>

    <!-- 充值套餐管理 -->
    <section class="content-card pricing-section package-section">
      <div class="section-head compact">
        <div>
          <h2>充值套餐</h2>
          <p>用户购买时使用这里的套餐快照；修改只影响新订单，不影响历史订单。</p>
        </div>
        <t-button theme="primary" size="small" @click="openPackage()">新增套餐</t-button>
      </div>
      <t-table :data="packages" :columns="packageColumns" :loading="packagesLoading" row-key="id">
        <template #price="{ row }">¥{{ Number(row.price || 0).toFixed(2) }}</template>
        <template #points="{ row }">{{ row.points }}<span v-if="row.bonus"> + {{ row.bonus }} 赠送</span></template>
        <template #grant_level="{ row }">{{ row.grant_level ? `${row.grant_level} / ${row.grant_vip_days || 0}天` : '纯积分包' }}</template>
        <template #operation="{ row }"><t-link theme="primary" @click="openPackage(row)">编辑</t-link></template>
      </t-table>
    </section>

    <t-dialog v-model:visible="packageDialog" header="充值套餐" :footer="false" width="560px">
      <t-form :data="packageForm" label-align="top">
        <t-form-item label="套餐名称"><t-input v-model="packageForm.name" /></t-form-item>
        <t-row :gutter="12"><t-col :span="6"><t-form-item label="价格（元）"><t-input-number v-model="packageForm.price" :min="0.01" :decimal-places="2" style="width:100%" /></t-form-item></t-col><t-col :span="6"><t-form-item label="基础积分"><t-input-number v-model="packageForm.points" :min="1" style="width:100%" /></t-form-item></t-col></t-row>
        <t-row :gutter="12"><t-col :span="6"><t-form-item label="赠送积分"><t-input-number v-model="packageForm.bonus" :min="0" style="width:100%" /></t-form-item></t-col><t-col :span="6"><t-form-item label="排序"><t-input-number v-model="packageForm.sort_order" :min="0" style="width:100%" /></t-form-item></t-col></t-row>
        <t-row :gutter="12"><t-col :span="6"><t-form-item label="会员等级"><t-select v-model="packageForm.grant_level" clearable><t-option value="standard" label="标准会员"/><t-option value="premium" label="高级会员"/></t-select></t-form-item></t-col><t-col :span="6"><t-form-item label="会员天数"><t-input-number v-model="packageForm.grant_vip_days" :min="0" style="width:100%" /></t-form-item></t-col></t-row>
        <t-form-item label="套餐说明"><t-textarea v-model="packageForm.description" :autosize="{minRows:2}" /></t-form-item>
        <div class="package-dialog-actions"><t-button variant="base" @click="packageDialog=false">取消</t-button><t-button theme="primary" :loading="packageSaving" @click="savePackage">保存套餐</t-button></div>
      </t-form>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import axios from '@/utils/axios';
import { MessagePlugin, type PrimaryTableCol, type TableRowData } from 'tdesign-vue-next';

// 格式化时间：后端存的是 UTC ISO 字符串，展示时转本地时间
function formatTime(v: any): string {
  if (!v) return '--';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 统计数据
const stats = ref({
  users: 0,
  total_points: 0,
  consumed_points: 0,
  recharged_points: 0,
  gifted_points: 0,
  refunded_points: 0,
  action_stats: [],
  member_stats: []
});

// 用户列表
const users = ref<any[]>([]);
const loading = ref(false);
const pagination = ref({
  current: 1,
  pageSize: 20,
  total: 0
});

// 表格列定义
const columns: PrimaryTableCol<TableRowData>[] = [
  { colKey: 'id', title: 'ID', width: 80 },
  { colKey: 'name', title: '用户名', width: 150 },
  { colKey: 'points', title: '积分', width: 120 },
  { colKey: 'member_level', title: '会员等级', width: 120 },
  { colKey: 'created_at', title: '注册时间', width: 180 },
  { colKey: 'operation', title: '操作', width: 150, fixed: 'right' }
];

// 用户选项
const userOptions = computed(() => {
  return users.value.map(u => ({ label: u.name, value: u.id }));
});

// 分配积分
const allocating = ref(false);
const allocationRequestId = ref("");
const showAllocateDialog = ref(false);
const allocateForm = ref({
  user_id: undefined as number | undefined,
  points: 100,
  description: ''
});

// 用户流水
const showLogDialog = ref(false);
const currentUser = ref<any>(null);
const userLogs = ref<any[]>([]);
const logLoading = ref(false);
const logPagination = ref({
  current: 1,
  pageSize: 20,
  total: 0
});

const logColumns = [
  { colKey: 'id', title: 'ID', width: 80 },
  { colKey: 'type', title: '类型', width: 100 },
  { colKey: 'action', title: '操作', width: 150 },
  { colKey: 'amount', title: '积分变动', width: 120 },
  { colKey: 'description', title: '描述', width: 200 },
  { colKey: 'created_at', title: '时间', width: 180 }
];

// 获取数据
async function fetchData() {
  loading.value = true;
  try {
    const [statsRes, usersRes] = await Promise.all([
      axios.get('/setting/pointsConfig/admin/dashboard'),
      axios.get('/setting/pointsConfig/admin/users', {
        params: {
          page: pagination.value.current,
          limit: pagination.value.pageSize
        }
      })
    ]);

    // axios拦截器已返回response.data，所以直接访问
    if (statsRes.code === 200) {
      stats.value = statsRes.data;
    }
    if (usersRes.code === 200) {
      users.value = usersRes.data.users;
      pagination.value.total = usersRes.data.pagination.total;
    }
  } catch (e) {
    console.error('获取数据失败:', e);
    MessagePlugin.error('获取数据失败');
  } finally {
    loading.value = false;
  }
}

// 翻页
function onPageChange(pageInfo: any) {
  pagination.value.current = pageInfo.current;
  pagination.value.pageSize = pageInfo.pageSize;
  fetchData();
}

// 分配积分
async function handleAllocate() {
  if (allocating.value) return;
  if (!allocateForm.value.user_id || allocateForm.value.points <= 0) {
    MessagePlugin.warning('请选择用户并输入积分数量');
    return;
  }
  try {
    allocating.value = true;
    const res = await axios.post('/setting/pointsConfig/adminAllocate/allocate', { ...allocateForm.value, request_id: allocationRequestId.value });
    if (res.code === 200) {
      MessagePlugin.success('分配成功');
      showAllocateDialog.value = false;
      fetchData();
    } else {
      MessagePlugin.error(res.message || '分配失败');
    }
  } catch (e: any) {
    MessagePlugin.error(e.message || '分配失败');
  } finally { allocating.value = false; }
}

// 打开分配弹窗
function openAllocate(user?: any) {
  allocationRequestId.value = crypto.randomUUID();
  allocateForm.value = {
    user_id: user?.id || null,
    points: 100,
    description: ''
  };
  showAllocateDialog.value = true;
}

// 查看用户流水
async function viewUserLog(user: any) {
  currentUser.value = user;
  logPagination.value.current = 1;
  showLogDialog.value = true;
  await fetchUserLog();
}

async function fetchUserLog() {
  if (!currentUser.value) return;
  logLoading.value = true;
  try {
    const res = await axios.get(`/setting/pointsConfig/admin/user/${currentUser.value.id}/log`, {
      params: {
        page: logPagination.value.current,
        limit: logPagination.value.pageSize
      }
    });
    if (res.code === 200) {
      userLogs.value = res.data.logs;
      logPagination.value.total = res.data.pagination.total;
    }
  } catch (e) {
    console.error('获取流水失败:', e);
    MessagePlugin.error('获取流水失败');
  } finally {
    logLoading.value = false;
  }
}

function onLogPageChange(pageInfo: any) {
  logPagination.value.current = pageInfo.current;
  logPagination.value.pageSize = pageInfo.pageSize;
  fetchUserLog();
}

// 积分定价管理
const prices = ref<any[]>([]);
const pricesLoading = ref(false);

const priceColumns = [
  { colKey: 'id', title: 'ID', width: 80 },
  { colKey: 'action', title: '操作类型', width: 150 },
  { colKey: 'points', title: '积分消耗', width: 150 },
  { colKey: 'description', title: '说明', width: 200 },
  { colKey: 'operation', title: '操作', width: 100 },
];

const packages = ref<any[]>([]);
const packagesLoading = ref(false);
const packageSaving = ref(false);
const packageDialog = ref(false);
const packageForm = ref<any>({ id: null, name: '', price: 20, points: 200, bonus: 0, sort_order: 0, description: '', grant_level: null, grant_vip_days: 0 });
const packageColumns = [
  { colKey: 'name', title: '套餐名称', width: 160 },
  { colKey: 'price', title: '价格', width: 110 },
  { colKey: 'points', title: '积分', width: 170 },
  { colKey: 'grant_level', title: '会员权益', width: 160 },
  { colKey: 'sort_order', title: '排序', width: 80 },
  { colKey: 'operation', title: '操作', width: 90 },
];

async function fetchPrices() {
  pricesLoading.value = true;
  try {
    const res = await axios.get('/setting/pointsConfig/prices');
    if (res.code === 200) {
      prices.value = res.data;
    }
  } catch (e) {
    console.error('获取定价失败:', e);
  } finally {
    pricesLoading.value = false;
  }
}

function handlePriceChange(row: any) {
  // 实时更新
}

async function savePrice(row: any) {
  try {
    const res = await axios.put(`/setting/pointsConfig/prices/${row.id}`, {
      points: row.points,
      description: row.description
    });
    if (res.code === 200) {
      MessagePlugin.success('更新成功');
    } else {
      MessagePlugin.error(res.message || '更新失败');
    }
  } catch (e) {
    MessagePlugin.error('更新失败');
  }
}

async function fetchPackages() {
  packagesLoading.value = true;
  try {
    const res = await axios.get('/setting/pointsConfig/purchase/packages');
    if (res.code === 200) packages.value = res.data || [];
  } catch (e) {
    MessagePlugin.error('获取套餐失败');
  } finally {
    packagesLoading.value = false;
  }
}

function openPackage(row?: any) {
  packageForm.value = row ? { ...row } : { id: null, name: '', price: 20, points: 200, bonus: 0, sort_order: packages.value.length + 1, description: '', grant_level: null, grant_vip_days: 0 };
  packageDialog.value = true;
}

async function savePackage() {
  const form = packageForm.value;
  if (!form.name?.trim() || !form.price || !form.points) {
    MessagePlugin.warning('请填写套餐名称、价格和积分');
    return;
  }
  packageSaving.value = true;
  try {
    const payload = { ...form, name: form.name.trim(), price: Number(form.price), points: Number(form.points), bonus: Number(form.bonus || 0), sort_order: Number(form.sort_order || 0), grant_vip_days: Number(form.grant_vip_days || 0) };
    const res = form.id
      ? await axios.put(`/setting/pointsConfig/purchase/package/${form.id}`, payload)
      : await axios.post('/setting/pointsConfig/purchase/package', payload);
    if (res.code !== 200) throw new Error(res.message || '保存失败');
    MessagePlugin.success(form.id ? '套餐已更新' : '套餐已创建');
    packageDialog.value = false;
    await fetchPackages();
  } catch (e: any) {
    MessagePlugin.error(e.message || '保存套餐失败');
  } finally {
    packageSaving.value = false;
  }
}

// 会员等级相关
function getMemberLevelTheme(level: string): "default" | "primary" | "danger" | "warning" | "success" {
  const themes: Record<string, "default" | "primary" | "danger" | "warning" | "success"> = {
    free: 'default',
    standard: 'warning',
    premium: 'success'
  };
  return themes[level] || 'default';
}

function getMemberLevelText(level: string) {
  const texts: Record<string, string> = {
    free: '非会员',
    standard: '标准会员',
    premium: '高级会员'
  };
  return texts[level] || level;
}

// 流水类型相关
function getTypeTheme(type: string): "default" | "primary" | "danger" | "warning" | "success" {
  const themes: Record<string, "default" | "primary" | "danger" | "warning" | "success"> = {
    consume: 'danger',
    recharge: 'success',
    gift: 'warning',
    refund: 'default'
  };
  return themes[type] || 'default';
}

function getTypeText(type: string) {
  const texts: Record<string, string> = {
    consume: '消费',
    recharge: '充值',
    gift: '赠送',
    refund: '退款'
  };
  return texts[type] || type;
}

onMounted(() => {
  fetchData();
  fetchPrices();
  fetchPackages();
});
</script>

<style scoped lang="scss">
.points-management {
  padding: 24px clamp(16px, 3vw, 32px) 32px;
  color: #182033;

  .page-intro {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 4px;
  }
  .eyebrow {
    color: #f2762e;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .08em;
  }
  h1 { margin: 5px 0 0; font-size: 24px; line-height: 1.2; letter-spacing: -.02em; }
  .page-intro p { margin: 7px 0 0; color: rgba(24, 32, 51, .55); font-size: 13px; }
  .intro-status {
    display: inline-flex; align-items: center; gap: 8px; padding: 7px 11px;
    border: 1px solid rgba(16, 185, 129, .16); border-radius: 999px;
    color: #087f5b; background: rgba(16, 185, 129, .07); font-size: 12px; font-weight: 600; white-space: nowrap;
  }
  .intro-status span { width: 7px; height: 7px; border-radius: 50%; background: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,.14); }

  /* 主卡片 */
  :deep(.t-card) {
    background: #fff;
    border: 1px solid rgba(15, 23, 42, .07);
    border-radius: 16px;
    box-shadow: 0 5px 24px rgba(15, 23, 42, .055);
    .t-card__header {
      border-bottom: 1px solid rgba(15, 23, 42, .06);
      padding: 16px 24px;
      .t-card__title {
        font-weight: 600;
        font-size: 18px;
      }
    }
    .t-card__body {
      padding: 20px 24px;
    }
  }
}

.stats-row {
  margin-bottom: 20px;
}

  .stat-card {
  background: #fffaf6 !important;
  color: #182033;
  border-radius: 12px !important;
  border: 1px solid rgba(102, 116, 216, .12) !important;
  transition: transform .2s ease, box-shadow .2s ease;
  overflow: hidden; position: relative;
  box-shadow: none !important;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: #f2762e;
  }

  .package-section { margin-top: 20px; }
  .package-dialog-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:8px; }

  &::after {
    content: '';
    position: absolute;
    top: -30%;
    right: -30%;
    width: 80%;
    height: 80%;
    background: radial-gradient(circle, rgba(102, 116, 216, .10) 0%, transparent 70%);
    pointer-events: none;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(15, 23, 42, .08) !important;
  }

  .stat-title {
    font-size: 13px;
    color: rgba(24, 32, 51, .55);
    margin-bottom: 10px;
    font-weight: 500;
    position: relative;
    z-index: 1;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 800;
    color: #182033;
    position: relative;
    z-index: 1;
  }
}

.stat-mark {
  position: absolute; top: 16px; right: 18px; z-index: 1;
  display: grid; place-items: center; width: 30px; height: 30px;
  border-radius: 9px; color: #f2762e; background: rgba(242,118,46,.10);
  font-size: 11px; font-weight: 800;
}

@keyframes shimmer {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

@media (max-width: 640px) {
  .points-management .page-intro { align-items: flex-start; flex-direction: column; }
  .points-management .page-intro p { line-height: 1.6; }
}

.action-bar {
  margin-bottom: 16px;
  :deep(.t-button) {
    border-radius: 10px;
    font-weight: 500;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    &:hover {
      transform: translateY(-2px);
    }
    &.t-button--theme-primary {
      background: #f2762e;
      border: none;
      color: #fff;
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.35);
      &:hover {
        box-shadow: 0 8px 24px rgba(102, 126, 234, 0.45);
      }
    }
  }
}

/* 表格 */
:deep(.t-table) {
  background: var(--material-thin);
  backdrop-filter: var(--blur-heavy);
  -webkit-backdrop-filter: var(--blur-heavy);
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--material-border-light);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);

  .t-table__header {
    background: rgba(242, 118, 46, 0.06);
    th {
      font-size: 13px;
      font-weight: 600;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      padding: 14px 16px;
    }
  }

  .t-table__body {
    tr {
      transition: all 0.2s ease;
      &:hover {
        background: rgba(242, 118, 46, 0.06) !important;
      }
      td {
        border-bottom: 1px solid rgba(0, 0, 0, 0.04);
        padding: 12px 16px;
      }
    }
    tr:nth-child(even) {
      background: transparent;
    }
  }

  .t-table__content {
    &::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.12);
      border-radius: 3px;
      &:hover {
        background: rgba(0, 0, 0, 0.2);
      }
    }
  }
}

/* 标签 */
:deep(.t-tag) {
  border-radius: 8px;
  font-weight: 500;
}

/* 链接 */
:deep(.t-link) {
  font-weight: 500;
  transition: all 0.2s ease;
  &:hover {
    opacity: 0.8;
  }
}

/* 对话框 */
:deep(.t-dialog) {
  border-radius: 20px;
  background: var(--material-thick);
  backdrop-filter: var(--blur-heavy);
  -webkit-backdrop-filter: var(--blur-heavy);
  border: 1px solid var(--material-border-medium);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  overflow: hidden;
  .t-dialog__header {
    font-weight: 600;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding: 16px 24px;
  }
  .t-dialog__body {
    padding: 20px 24px;
  }
  .t-input,
  .t-select,
  .t-input-number {
    border-radius: 10px;
    background: var(--material-regular);
    border: 1px solid var(--material-border-light);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    &:focus-within {
      border-color: #f2762e;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
    }
  }
  .t-button--theme-primary {
    background: #f2762e;
    border: none;
    color: #fff;
    border-radius: 10px;
    font-weight: 500;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    &:hover {
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
      transform: translateY(-1px);
    }
  }
}

.text-red {
  color: #e34d59;
  font-weight: 600;
}

.text-green {
  color: #00a870;
  font-weight: 600;
}

/* 商用运营台：白底内容区、单一蓝色操作强调、减少装饰干扰 */
.points-management {
  background: #f6f7fb;
  min-height: 100%;
  .content-card {
    margin-top: 20px;
    padding: 22px;
    border: 1px solid #e7eaf1;
    border-radius: 16px;
    background: #fff;
    box-shadow: 0 8px 28px rgba(27, 39, 64, .045);
  }
  .section-head {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
    margin-bottom: 20px;
    h2 { margin: 0; font-size: 17px; line-height: 1.4; color: #182033; }
    p { margin: 5px 0 0; font-size: 12px; color: #7a8497; }
    &.compact { margin-bottom: 16px; }
  }
  .table-section { margin-top: 8px; }
  .table-title { padding: 4px 0 14px; h3 { margin: 0; font-size: 14px; } p { margin: 4px 0 0; color: #8992a3; font-size: 12px; } }
  :deep(.t-card.stat-card) {
    min-height: 116px; background: #fff !important; border-color: #e7eaf1 !important;
    box-shadow: none !important;
    &:nth-child(2) .stat-mark { background: #eaf3ff; color: #2176d2; }
  }
  :deep(.t-button--theme-primary) { background: #f2762e !important; box-shadow: 0 5px 12px rgba(242,118,46,.2) !important; }
  :deep(.t-table) { border-color: #e7eaf1; box-shadow: none; background: #fff; }
  :deep(.t-table__header th) { background: #fafbfc; color: #657084; font-size: 12px; }
  :deep(.t-table__body tr:hover td) { background: #fff7f0 !important; }
}

@media (max-width: 640px) {
  .points-management .content-card { padding: 16px; }
  .points-management .section-head { flex-direction: column; }
}
</style>
