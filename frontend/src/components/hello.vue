<template>
  <Transition name="modal">
    <div v-if="show" class="helloOverlay" @click.self="handleSkip">
      <div class="helloModal">
        <!-- 背景装饰 -->
        <div class="modalBg">
          <div class="bgOrb bgOrb-1"></div>
          <div class="bgOrb bgOrb-2"></div>
          <div class="bgOrb bgOrb-3"></div>
        </div>

        <!-- 关闭按钮 -->
        <button class="closeBtn" @click="handleSkip">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>

        <div class="helloGuide">
          <!-- 欢迎首页 -->
          <template v-if="currentStep === 0">
            <div class="welcomePage">
              <div class="logoContainer">
                <img src="@/assets/XOI_logo.png" alt="XOi Logo" class="welcomeLogo" />
                <div class="logoGlow"></div>
              </div>
              <h1 class="welcomeTitle">{{ $t("hello.welcomeTitle") }}</h1>
              <p class="welcomeDesc">{{ $t("hello.welcomeDesc") }}</p>
              <button class="primaryBtn" @click="currentStep = 1">
                <span>{{ $t("hello.startConfig") }}</span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <button class="textBtn" @click="handleSkip">{{ $t("hello.skip") }}</button>
              <div class="langBtn">
                <t-dropdown :options="langOptions" trigger="click" @click="handleChangeLang" :maxColumnWidth="150">
                  <button class="iconBtn">
                    <i-translate theme="outline" size="18" />
                  </button>
                </t-dropdown>
              </div>
            </div>
          </template>

          <!-- 配置步骤 -->
          <template v-else>
            <!-- 步骤指示器 -->
            <div class="stepIndicator">
              <div v-for="i in 3" :key="i" class="stepDot" :class="{ active: currentStep >= i, current: currentStep === i }">
                <div class="dotInner"></div>
              </div>
            </div>

            <div class="stepContent">
              <!-- Step 1: 配置模型服务 -->
              <div v-if="currentStep === 1" class="stepItem">
                <div class="stepIcon">
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" stroke-width="3"/>
                    <path d="M6 18H42" stroke="currentColor" stroke-width="3"/>
                    <circle cx="14" cy="14" r="2" fill="currentColor"/>
                    <circle cx="22" cy="14" r="2" fill="currentColor"/>
                    <circle cx="30" cy="14" r="2" fill="currentColor"/>
                    <rect x="14" y="24" width="20" height="8" rx="2" stroke="currentColor" stroke-width="2"/>
                  </svg>
                </div>
                <h2 class="stepTitle">{{ $t("hello.configModelTitle") }}</h2>
                <p class="stepDesc">{{ $t("hello.configModelDesc") }}</p>
                <div class="stepTip">
                  <div class="tipCard">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 1C4.13401 1 1 4.13401 1 8C1 11.866 4.13401 15 8 15C11.866 15 15 11.866 15 8C15 4.13401 11.866 1 8 1Z" stroke="currentColor" stroke-width="1.5"/>
                      <path d="M8 5V8.5M8 11V11.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                    <span>{{ $t('hello.configModelTip') }}</span>
                  </div>
                </div>
                <button class="primaryBtn" @click="openVendorConfig">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1L8 3M8 13L8 15M15 8L13 8M3 8L1 8M12.5 3.5L11 5M5 11L3.5 12.5M12.5 12.5L11 11M5 5L3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    <circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                  </svg>
                  <span>{{ $t("hello.configModelBtn") }}</span>
                </button>
              </div>

              <!-- Step 2: 配置 Agent -->
              <div v-if="currentStep === 2" class="stepItem">
                <div class="stepIcon">
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <circle cx="24" cy="16" r="8" stroke="currentColor" stroke-width="3"/>
                    <path d="M10 42C10 34.268 16.268 28 24 28C31.732 28 38 34.268 38 42" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                    <circle cx="36" cy="16" r="4" stroke="currentColor" stroke-width="2"/>
                    <path d="M40 30C40 26 38 24 36 24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </div>
                <h2 class="stepTitle">{{ $t("hello.configAgentTitle") }}</h2>
                <p class="stepDesc">{{ $t("hello.configAgentDesc") }}</p>
                <div class="stepTip">
                  <div class="tipCard">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 1C4.13401 1 1 4.13401 1 8C1 11.866 4.13401 15 8 15C11.866 15 15 11.866 15 8C15 4.13401 11.866 1 8 1Z" stroke="currentColor" stroke-width="1.5"/>
                      <path d="M8 5V8.5M8 11V11.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                    <span>{{ $t('hello.configAgentTip') }}</span>
                  </div>
                </div>
                <button class="primaryBtn" @click="openAgentConfig">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1L8 3M8 13L8 15M15 8L13 8M3 8L1 8M12.5 3.5L11 5M5 11L3.5 12.5M12.5 12.5L11 11M5 5L3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    <circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                  </svg>
                  <span>{{ $t("hello.configAgentBtn") }}</span>
                </button>
              </div>

              <!-- Step 3: 完成 -->
              <div v-if="currentStep === 3" class="stepItem">
                <div class="stepIcon success">
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="3"/>
                    <path d="M14 24L22 32L34 16" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
                <h2 class="stepTitle">{{ $t("hello.finishTitle") }}</h2>
                <p class="stepDesc">{{ $t("hello.finishDesc") }}</p>
                <div class="qrcodeBox">
                  <p class="qrcodeLabel">{{ $t("hello.qrcodeLabel") }}</p>
                  <img src="/2wm.png" alt="微信交流群" class="qrcodeImage" />
                </div>
              </div>
            </div>

            <!-- 底部按钮 -->
            <div class="guideFooter">
              <button v-if="currentStep > 1" class="outlineBtn" @click="currentStep--">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M13 8H3M3 8L7 4M3 8L7 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>{{ $t("hello.prevStep") }}</span>
              </button>
              <div class="footerRight">
                <button v-if="currentStep < 3" class="textBtn" @click="handleSkip">{{ $t("hello.skip") }}</button>
                <button v-if="currentStep < 3" class="primaryBtn" @click="currentStep++">
                  <span>{{ $t("hello.nextStep") }}</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button v-if="currentStep === 3" class="primaryBtn success" @click="handleFinish">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8L7 12L13 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <span>{{ $t("hello.finish") }}</span>
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import JSConfetti from "js-confetti";
import settingStore from "@/stores/setting";
import { languageList, cachedLocale } from "@/locales";
const { showSetting, activeMenu } = storeToRefs(settingStore());

const { locale } = useI18n();
const langOptions = languageList.map((item) => ({
  content: item.label,
  value: item.value,
}));
const handleChangeLang = (data: any) => {
  locale.value = data.value;
  cachedLocale.value = data.value;
};

// 使用 localStorage 记录是否已完成引导
// 只在第一次登录时显示，之后不再显示
const guideDone = useLocalStorage("helloGuideDone", false);
const show = ref(false);
const currentStep = ref(0);

// 检查是否需要显示引导
onMounted(() => {
  // 只有当 guideDone 为 false 时才显示
  if (!guideDone.value) {
    // 添加延迟，让页面先加载完成
    setTimeout(() => {
      show.value = true;
    }, 500);
  }
});

function openVendorConfig() {
  activeMenu.value = "vendorConfig";
  showSetting.value = true;
}

function openAgentConfig() {
  activeMenu.value = "agentConfog";
  showSetting.value = true;
}

function handleSkip() {
  guideDone.value = true;
  show.value = false;
}

function handleFinish() {
  guideDone.value = true;
  show.value = false;
  const jsConfetti = new JSConfetti();
  jsConfetti.addConfetti();
}
</script>

<style lang="scss" scoped>
/* 弹窗遮罩 */
.helloOverlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

/* 弹窗主体 */
.helloModal {
  position: relative;
  width: 90%;
  max-width: 520px;
  background: var(--material-thick);
  backdrop-filter: var(--blur-heavy);
  -webkit-backdrop-filter: var(--blur-heavy);
  border: 1px solid var(--material-border-medium);
  border-radius: 24px;
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.4),
    0 8px 32px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

/* 背景装饰 */
.modalBg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
}

.bgOrb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.2;
}

.bgOrb-1 {
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, #00d4ff, #0099ff);
  top: -60px;
  left: -60px;
  animation: orb-float-1 15s ease-in-out infinite;
}

.bgOrb-2 {
  width: 150px;
  height: 150px;
  background: radial-gradient(circle, #7b61ff, #a78bfa);
  bottom: -40px;
  right: -40px;
  animation: orb-float-2 18s ease-in-out infinite;
}

.bgOrb-3 {
  width: 120px;
  height: 120px;
  background: radial-gradient(circle, #00ffcc, #00d4ff);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation: orb-float-3 20s ease-in-out infinite;
}

@keyframes orb-float-1 {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(30px, 30px); }
}

@keyframes orb-float-2 {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(-20px, -20px); }
}

@keyframes orb-float-3 {
  0%, 100% { transform: translate(-50%, -50%) scale(1); }
  50% { transform: translate(-50%, -50%) scale(1.2); }
}

/* 关闭按钮 */
.closeBtn {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--material-thin);
  backdrop-filter: var(--blur-light);
  -webkit-backdrop-filter: var(--blur-light);
  border: 1px solid var(--material-border-light);
  border-radius: 10px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: 10;
}

.closeBtn:hover {
  background: var(--material-regular);
  color: var(--text-primary);
  transform: scale(1.05);
}

.closeBtn:active {
  transform: scale(0.95);
}

/* 内容区域 */
.helloGuide {
  position: relative;
  padding: 32px;
  z-index: 1;
}

/* 欢迎页面 */
.welcomePage {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
  position: relative;
}

.langBtn {
  position: absolute;
  bottom: 0;
  right: 0;
}

.iconBtn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--material-thin);
  backdrop-filter: var(--blur-light);
  -webkit-backdrop-filter: var(--blur-light);
  border: 1px solid var(--material-border-light);
  border-radius: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.iconBtn:hover {
  background: var(--material-regular);
  color: var(--text-primary);
}

/* Logo */
.logoContainer {
  position: relative;
  margin-bottom: 24px;
}

.welcomeLogo {
  width: 160px;
  height: auto;
  object-fit: contain;
  position: relative;
  z-index: 1;
}

.logoGlow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(0, 212, 255, 0.3), transparent);
  filter: blur(40px);
  animation: logo-pulse 3s ease-in-out infinite;
}

@keyframes logo-pulse {
  0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.1); }
}

.welcomeTitle {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 12px;
  background: linear-gradient(135deg, #00d4ff, #7b61ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.welcomeDesc {
  color: var(--text-secondary);
  font-size: 15px;
  margin: 0 0 32px;
  text-align: center;
  line-height: 1.6;
}

/* 主按钮 */
.primaryBtn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 28px;
  background: linear-gradient(135deg, #00d4ff, #7b61ff);
  border: none;
  border-radius: 14px;
  color: white;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 16px rgba(0, 212, 255, 0.3);
}

.primaryBtn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 212, 255, 0.4);
}

.primaryBtn:active {
  transform: translateY(0);
}

.primaryBtn.success {
  background: linear-gradient(135deg, #10b981, #059669);
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
}

.primaryBtn.success:hover {
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
}

/* 文字按钮 */
.textBtn {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 12px;
}

.textBtn:hover {
  color: var(--text-primary);
}

/* 轮廓按钮 */
.outlineBtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: transparent;
  border: 1px solid var(--material-border-medium);
  border-radius: 12px;
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.outlineBtn:hover {
  background: var(--material-thin);
  border-color: var(--material-border-heavy);
}

/* 步骤指示器 */
.stepIndicator {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 32px;
}

.stepDot {
  width: 32px;
  height: 4px;
  background: var(--material-border-light);
  border-radius: 2px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.stepDot.active {
  background: linear-gradient(135deg, #00d4ff, #7b61ff);
}

.stepDot.current {
  width: 48px;
}

/* 步骤内容 */
.stepContent {
  min-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stepItem {
  text-align: center;
  max-width: 400px;
  animation: step-appear 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes step-appear {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.stepIcon {
  margin-bottom: 20px;
  color: var(--accent-primary);
}

.stepIcon.success {
  color: #10b981;
}

.stepTitle {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--text-primary);
}

.stepDesc {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
  margin: 0 0 20px;
}

.stepTip {
  margin-bottom: 24px;
}

.tipCard {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(0, 212, 255, 0.1);
  border: 1px solid rgba(0, 212, 255, 0.2);
  border-radius: 10px;
  font-size: 13px;
  color: var(--text-secondary);
}

.tipCard svg {
  color: #00d4ff;
  flex-shrink: 0;
}

/* 二维码 */
.qrcodeBox {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.qrcodeLabel {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 12px;
}

.qrcodeImage {
  width: 180px;
  height: 180px;
  object-fit: contain;
  border-radius: 12px;
  border: 1px solid var(--material-border-light);
  padding: 8px;
  background: white;
}

/* 底部按钮 */
.guideFooter {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--material-border-light);
}

.footerRight {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

/* 过渡动画 */
.modal-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-leave-active {
  transition: all 0.2s ease;
}

.modal-enter-from {
  opacity: 0;
}

.modal-enter-from .helloModal {
  transform: scale(0.95) translateY(10px);
  filter: blur(10px);
}

.modal-leave-to {
  opacity: 0;
}

.modal-leave-to .helloModal {
  transform: scale(0.95);
  filter: blur(10px);
}
</style>
