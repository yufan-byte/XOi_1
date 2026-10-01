<template>
  <div class="admin-users-page">
    <div class="pageHead">
      <div>
        <div class="eyebrow">运营中心 / 账号管理</div>
        <h1 class="title">{{ $t("workbench.menu.userManage") }}</h1>
        <p class="sub">{{ $t("workbench.menu.userManageSub") }} · 角色与账号状态均可追溯</p>
      </div>
      <div class="headStatus"><span></span>账号服务正常</div>
    </div>
    <!-- 直接复用设置抽屉内的用户管理组件，零改动双场景共用 -->
    <UserManage />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import UserManage from "@/components/setting/components/userManage.vue";

const { t } = useI18n();
void t;
</script>

<style lang="scss" scoped>
.admin-users-page {
  padding: 0 clamp(16px, 3vw, 32px) 32px;
  display: flex;
  flex-direction: column;
}

.pageHead {
  padding-top: 24px;
  margin-bottom: 18px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;

  .title {
    margin: 4px 0 0;
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #0f1729;
  }

  .sub {
    display: block;
    margin: 7px 0 0;
    opacity: 0.58;
    font-size: 13px;
    color: rgba(15, 23, 42, 0.55);
  }
}

.eyebrow {
  color: #6674d8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
}

.headStatus, .intro-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
  border: 1px solid rgba(16, 185, 129, .16);
  border-radius: 999px;
  color: #087f5b;
  background: rgba(16, 185, 129, .07);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.headStatus span, .intro-status span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, .14);
}

@media (max-width: 640px) {
  .pageHead { align-items: flex-start; flex-direction: column; }
}
</style>
