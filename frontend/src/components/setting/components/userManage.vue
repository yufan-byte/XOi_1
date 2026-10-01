<template>
  <t-loading :loading="loading">
    <div class="umWrap">
      <!-- 统计卡 -->
      <div class="kpiRow" v-if="users.length">
        <div class="kpiTile kpi-total">
          <div class="kpiIcon">总览</div>
          <div class="kpiBody"><div class="kpiNum">{{ stats.total }}</div><div class="kpiLabel">总用户</div></div>
        </div>
        <div class="kpiTile kpi-admin">
          <div class="kpiIcon">权限</div>
          <div class="kpiBody"><div class="kpiNum">{{ stats.admins }}</div><div class="kpiLabel">管理员</div></div>
        </div>
        <div class="kpiTile kpi-user">
          <div class="kpiIcon">用户</div>
          <div class="kpiBody"><div class="kpiNum">{{ stats.normal }}</div><div class="kpiLabel">普通用户</div></div>
        </div>
        <div class="kpiTile kpi-banned">
          <div class="kpiIcon">风险</div>
          <div class="kpiBody"><div class="kpiNum">{{ stats.banned }}</div><div class="kpiLabel">已封禁</div></div>
        </div>
      </div>

      <!-- 工具栏 -->
      <div class="tableLead">
        <div><h3>账号列表</h3><p>搜索、筛选并维护账号的角色与访问状态</p></div>
        <span>{{ pagedUsers.length }} 个匹配账号</span>
      </div>
      <div class="toolbar">
        <div class="tbLeft">
          <t-input
            v-model="searchKey"
            placeholder="搜索用户名…"
            clearable
            class="searchInput"
            @change="onSearch"
          >
            <template #prefix-icon><i-search /></template>
          </t-input>
          <t-radio-group v-model="filterRole" variant="default-filled" size="small" @change="resetPage">
            <t-radio-button value="">全部</t-radio-button>
            <t-radio-button value="admin">管理员</t-radio-button>
            <t-radio-button value="user">普通用户</t-radio-button>
          </t-radio-group>
          <t-radio-group v-model="filterStatus" variant="default-filled" size="small" @change="resetPage">
            <t-radio-button value="">全部</t-radio-button>
            <t-radio-button value="active">正常</t-radio-button>
            <t-radio-button value="banned">封禁</t-radio-button>
          </t-radio-group>
        </div>
        <div class="tbRight">共 {{ pagedUsers.length }} 条结果</div>
      </div>

      <!-- 表格 -->
      <div class="tableCard">
        <t-empty v-if="pagedUsers.length === 0 && !loading" description="没有匹配的用户" />
        <t-table
          v-else
          :data="pageData"
          :columns="columns"
          row-key="id"
          size="medium"
          :show-sort-column-bg="false"
          :stripe="false"
        >
          <template #id="{ row }"><span class="cellId">#{{ row.id }}</span></template>
          <template #name="{ row }">
            <div class="userCell">
              <span class="avatar" :style="avatarStyle(row.name)">{{ initialOf(row.name) }}</span>
              <span class="userName">{{ row.name || '未命名' }}</span>
            </div>
          </template>
          <template #role="{ row }">
            <t-select
              :class="['roleChip', row.role === 'admin' ? 'isAdmin' : 'isUser']"
              :value="row.role"
              size="small"
              @change="(val:any)=>handleRoleChange(row.id,val)"
            >
              <t-option value="user" label="普通用户" />
              <t-option value="admin" label="管理员" />
            </t-select>
          </template>
          <template #status="{ row }">
            <span class="statusPill" :class="row.status==='active'?'is-active':'is-banned'">
              <i class="dot"></i>{{ row.status === 'active' ? '正常':'已封禁'}}
            </span>
          </template>
          <template #created_at="{ row }">{{
            formatTime(row.created_at)
          }}</template>
          <template #op="{ row }">
            <t-button
              v-if="row.id!==currentUserId"
              class="opBtn"
              size="small"
              :theme="row.status==='active'?'danger':'success'"
              variant="outline"
              @click="handleStatusChange(row.id,row.status==='active'?'banned':'active')"
            >{{ row.status==='active'?'封禁':'解封' }}</t-button>
            <span v-else class="selfTag">当前账号</span>
          </template>
        </t-table>

        <!-- 分页器 -->
        <div class="pagerWrap" v-if="pagedUsers.length">
          <span class="pageInfo">第 {{ curPage }} / {{ totalPages }} 页</span>
          <t-pagination
            v-model="curPage"
            v-model:pageSize="pageSize"
            :total="pagedUsers.length"
            size="small"
            show-jumper
            :maxPageBtn="5"
          />
        </div>
      </div>
    </div>
  </t-loading>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";

interface User {
  id:number;name:string;role:string;status:string;created_at:string;
}
const users = ref<User[]>([]);
const loading = ref(false);
const currentUserId = computed(()=>Number(localStorage.getItem("userId")));

const columns=[
  {colKey:"id",title:"ID",width:80},
  {colKey:"name",title:"用户",width:220},
  {colKey:"role",title:"角色",width:150},
  {colKey:"status",title:"状态",width:110},
  {colKey:"created_at",title:"注册时间",width:190},
  {colKey:"op",title:"操作",width:120},
];

const stats=computed(()=>({
  total:users.value.length,
  admins:users.value.filter(u=>u.role==="admin").length,
  normal:users.value.filter(u=>u.role==="user").length,
  banned:users.value.filter(u=>u.status!=="active").length,
}));

// ===== 过滤与分页 =====
const searchKey=ref("");
const filterRole=ref("");
const filterStatus=ref("");
const curPage=ref(1);
const pageSize=ref(10);

function resetPage(){curPage.value=1;}
function onSearch(){resetPage();}

// 经过过滤后的全量数据（用于分页总数）
const pagedUsers=computed(()=>{
  const kw=searchKey.value.trim().toLowerCase();
  return users.value.filter(u=>{
    const okKw=!kw||(u.name||'').toLowerCase().includes(kw);
    const okRl=!filterRole.value||u.role===filterRole.value;
    const okSt=!filterStatus.value||
      (filterStatus.value==='active'?u.status==='active':u.status!=='active');
    return okKw&&okRl&&okSt;
  });
});
// 当前页切片
const pageData=computed(()=>{
  const start=(curPage.value-1)*pageSize.value;
  return pagedUsers.value.slice(start,start+pageSize.value);
});
const totalPages=computed(()=>Math.max(1,Math.ceil(pagedUsers.value.length/pageSize.value)));
// 数据变化时若当前页越界则回退
watch(totalPages,(tp)=>{if(curPage.value>tp)curPage.value=tp;});

// 头像色板
const PALETTE=[["#667eea","#764ba2"],["#f093fb","#f5576c"],["#4facfe","#00c6fb"],["#43e97b","#38b2ac"],["#fa709a","#fee140"],["#30cfd0","#7e57c2"]];
function hashStr(s:string){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h;}
function avatarStyle(name?:string){const idx=hashStr(name||"?")%PALETTE.length;const[a,b]=PALETTE[idx];return{background:`linear-gradient(135deg,${a},${b})`};}
function initialOf(name?:string){const n=(name||'').trim();return n?n.charAt(0).toUpperCase():'?';}
function formatTime(value?: string){
  if(!value) return '-';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return value;
  const pad = (n:number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function fetchUsers(){
  loading.value=true;
  try{
    const res=await axios.get("/setting/userManage/list");
    users.value=res.data||[];
  }catch(e:any){window.$message.error(e.message||'获取用户列表失败');}
  finally{loading.value=false;}
}
async function handleRoleChange(userId:number,role:string){
  try{
    await axios.post('/setting/userManage/updateRole',{userId,role});
    window.$message.success('角色更新成功');await fetchUsers();
  }catch(e:any){window.$message.error(e.message||'更新失败');}
}
async function handleStatusChange(userId:number,status:string){
  try{
    await axios.post('/setting/userManage/updateStatus',{userId,status});
    window.$message.success(status==='banned'?'已封禁':'已解封');await fetchUsers();
  }catch(e:any){window.$message.error(e.message||'操作失败');}
}
onMounted(fetchUsers);

watch([searchKey,filterRole,filterStatus],()=>resetPage());
</script>

<style lang="scss" scoped>
.umWrap {
  display:flex;flex-direction:column;gap:18px;

  /* ===== 统计卡 ===== */
  .kpiRow{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:14px;}
  .kpiTile{
    display:flex;align-items:center;gap:12px;padding:16px 18px;background:#fff;border-radius:var(--radius-md);border:1px solid rgba(15,23,42,.06);
    box-shadow:0 1px 3px rgba(15,23,42,.04),inset 0 1px 0 rgba(255,255,255,.8);
    transition:transform .25s cubic-bezier(.16,1,.3,1),box-shadow .25s ease;position:relative;overflow:hidden;
    &::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(#667eea,#764ba2);}
    &:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(102,126,234,.12);}
    .kpiIcon{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:11px;letter-spacing:.02em;font-weight:700;background:#eef0ff;color:#5965cc;box-shadow:none;flex-shrink:0;}
    .kpiNum{font-size:22px;font-weight:800;line-height:1.1;letter-spacing:-.02em;color:#0f1729;}
    .kpiLabel{font-size:11px;font-weight:600;margin-top:2px;color:rgba(15,23,42,.45);}
    &.kpi-admin::before{background:linear-gradient(#f59e0b,#ef4444);}
    &.kpi-admin .kpiIcon{background:#fff4dd;color:#b77900;box-shadow:none;}
    &.kpi-user .kpiIcon{background:#e8f2ff;color:#2563eb;box-shadow:none;}
    &.kpi-banned::before{background:linear-gradient(#94a3b8,#64748b);}
    &.kpi-banned .kpiIcon{background:#ffebee;color:#c43d4b;box-shadow:none;}
  }

  /* ===== 工具栏 ===== */
  .toolbar{
    display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;
    padding:14px 16px;background:#fff;border-radius:var(--radius-md);border:1px solid rgba(15,23,42,.06);
    box-shadow:0 1px 3px rgba(15,23,42,.04);
    .tbLeft{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
    .tbRight{font-size:13px;font-weight:500;color:rgba(15,23,42,.5);}

    /* 搜索框苹果风 */
    :deep(.searchInput){width:240px;}
    :deep(.searchInput.t-input){
      border-radius:999px !important;border:none !important;background:#f3f4fb !important;
      transition:all .22s cubic-bezier(.16,1,.3,1)!important;
      .t-input__inner{height:32px!important;line-height:32px!important;font-size:13px!important;}
      &:hover,&.t-is-focused,&.t-input--focused{background:#fff!important;box-shadow:0 0 0 2px rgba(245,116,0,.18),0 2px 8px rgba(15,23,42,.06)!important;}
      .t-input__suffix-icon,.t-icon-close-circle-filled{color:rgba(15,23,42,.35)!important;}
    }
    /* 分段切换器圆角化 */
    :deep(.t-radio-button){
      font-size:12px;font-weight:600;border-radius:0!important;transition:all .18s ease;
      --td-radius-default:8px;
    }
    :deep(.t-radio-group--variant-filled .t-radio-button:first-child){border-top-left-radius:8px!important;border-bottom-left-radius:8px!important;}
    :deep(.t-radio-group--variant-filled .t-radio-button:last-child){border-top-right-radius:8px;border-bottom-right-radius:8px;}
    :deep(.t-radio-group--variant-filled){padding:3px;background:#f3f4fb;border-radius:9px;}
    :deep(.t-radio-group--variant-filled .t-radio-button.t-is-checked){color:#5566d4;background:#fff!important;box-shadow:0 1px 4px rgba(15,23,42,.08)!important;}
  }

  /* ===== 表格卡片 ===== */
  .tableCard{
    border-radius:var(--radius-lg);overflow:hidden;background:#fff;border:1px solid rgba(15,23,42,.08);
    box-shadow:0 4px 24px rgba(15,23,42,.06);

    :deep(.t-table){background:transparent;}
    :deep(.t-table__header) th{
      padding:13px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
      color:rgba(15,23,42,.5);background:#fafbff;border-bottom:1px solid rgba(102,126,234,.18);
    }
    :deep(.t-table__body) tr{
      transition:background-color .18s ease;
      td{padding:13px 16px;font-size:13px;color:rgba(15,23,42,.82);border-bottom:1px solid rgba(15,23,42,.05);}
      &:last-of-type td{border-bottom:none;}
      &:hover td{background:rgba(102,126,234,.04)!important;}
    }

    /* 角色胶囊式下拉 —— 关键改造 */
    :deep(.roleChip.t-select),
    :deep(.t-select.roleChip){
      min-width:auto;width:max-content !important;border-radius:999px !important;
      height:28px !important;border:1px solid transparent !important;
      cursor:pointer;transition:all .2s cubic-bezier(.16,1,.3,1)!important;
      box-shadow:none!important;
      .t-input__inner{font-size:12px!important;font-weight:600!important;padding-right:20px;text-align:left;}
      .t-fake-arrow,.t-select__right-icon,.t-input__suffix{opacity:.55;}

      &.isAdmin{
        background:linear-gradient(135deg,rgba(245,158,11,.95),rgba(239,68,68,.92))!important;color:#fff!important;
        .t-input__inner{color:#fff!important;-webkit-text-fill-color:#fff!important;}
        .t-fake-arrow svg path[fill],.t-fake-arrow polygon,.t-icon-chevron-down{stroke:#fff!important;color:#fff!important;}
        &:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(245,158,11,.36)!important;}
      }
      &.isUser{
        background:linear-gradient(135deg,rgba(96,165,250,.92),rgba(37,99,235,.9))!important;color:#fff!important;
        .t-input__inner{color:#fff!important;-webkit-text-fill-color:#fff!important;}
        &:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(37,99,235,.34)!important;}
      }
    }

    /* ID 列、头像等保留前版 */
    .cellId{
      display:inline-block;min-width:34px;padding:2px 8px;border-radius:999px;background:rgba(102,126,234,.09);
      color:#5566d4;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;font-weight:700;text-align:center;
    }
    .userCell{display:inline-flex;align-items:center;gap:10px;}
    .avatar{
      width:30px;height:30px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;
      font-size:13px;font-weight:700;color:#fff;flex-shrink:0;box-shadow:0 2px 6px rgba(15,23,42,.18);user-select:none;
    }
    .userName{font-weight:600;color:#0f1729;}

    /* 操作按钮 */
    :deep(.opBtn.t-button){
      border-radius:999px !important;font-size:12px!important;font-weight:600!important;padding:0 14px!important;height:26px!important;min-height:auto;
      transition:all .22s cubic-bezier(.16,1,.3,1)!important;
      &:hover:not(:disabled){transform:translateY(-1px)!important;}
    }
    :deep(.opBtn.theme-danger:hover),:deep(.opBtn.t-button--theme-danger:hover){box-shadow:0 4px 12px rgba(225,29,72,.28)!important;}
    :deep(.opBtn.theme-success:hover),:deep(.opBtn.t-button--theme-success:hover){box-shadow:0 4px 12px rgba(16,185,129,.28)!important;}

    /* 分页区（表格下方兄弟元素） */
    .pagerWrap{
      display:flex;align-items:center;justify-content:flex-end;gap:14px;
      padding:14px 16px;border-top:1px solid rgba(15,23,42,.06);background:#fcfcfe;
      .pageInfo{font-size:13px;font-weight:500;color:rgba(15,23,42,.45);}
    }
    :deep(.t-pagination__btn),:deep(.t-pagination__number){
      border-radius:7px!important;transition:all .18s ease!important;border:1px solid transparent!important;
    }
    :deep(.t-pagination__number:hover){background:rgba(102,126,234,.08)!important;color:#5566d4!important;}
    :deep(.t-pagination__number.t-is-current){
      background:linear-gradient(135deg,#667eea,#764ba2)!important;color:#fff!important;border:none!important;
      box-shadow:0 2px 8px rgba(102,126,234,.32)!important;
    }
    :deep(.t-pagination__btn:hover){background:rgba(102,126,234,.08)!important;color:#5566d4!important;}
  }
}

/* 状态胶囊 */
.statusPill{
  display:inline-flex;align-items:center;gap:6px;padding:3px 10px 3px 8px;font-size:12px;font-weight:600;border-radius:999px;
  i.dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
  &.is-active{color:#059669;background:rgba(16,185,129,.12);i.dot{background:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.18);animation:pulse-dot 2s ease-in-out infinite;}}
  &.is-banned{color:#dc2626;background:rgba(239,68,68,.12);i.dot{background:#ef4444;}}
}
.selfTag{display:inline-block;padding:3px 12px;border-radius:999px;font-size:11px;font-weight:600;color:#5566d4;background:rgba(102,126,234,.1);border:1px dashed rgba(102,126,234,.35);}
@keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.65;transform:scale(1.25);}}

/* 与运营页统一为中性底色和单一品牌蓝，避免角色卡片过度装饰 */
.umWrap {
  .tableLead{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 2px 0;h3{margin:0;color:#182033;font-size:15px;}p{margin:4px 0 0;color:#7a8495;font-size:12px;}span{padding:4px 9px;border-radius:6px;background:#f1f4f8;color:#596579;font-size:12px;white-space:nowrap;}}
  .kpiTile { border-color: #e7eaf1; border-radius: 14px; box-shadow: none; }
  .kpiTile::before { background: #2563eb; }
  .kpiTile .kpiIcon { background: #eaf2ff; color: #2563eb; }
  .kpiTile.kpi-admin::before { background: #b7791f; }
  .kpiTile.kpi-admin .kpiIcon { background: #fff6df; color: #a66b11; }
  .kpiTile.kpi-user::before { background: #0f9b83; }
  .kpiTile.kpi-user .kpiIcon { background: #e8f8f3; color: #0f8b74; }
  .kpiTile.kpi-banned::before { background: #c2414a; }
  .kpiTile.kpi-banned .kpiIcon { background: #fff0f1; color: #c2414a; }
  .toolbar, .tableCard { border-color: #e7eaf1; box-shadow: 0 6px 22px rgba(27,39,64,.04); }
  .tableCard :deep(.t-table__header) th { background: #fafbfc; color: #657084; border-bottom-color: #e7eaf1; }
  .tableCard :deep(.t-table__body) tr:hover td { background: #f6f9ff !important; }
  .cellId { color: #2563eb; background: #eaf2ff; }
}
</style>
