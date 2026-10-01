<template>
  <div class="registerPage" ref="heroRef">
    <!-- 兜底纯色基 -->
    <div class="registerBg"></div>

    <!-- Canvas 墨水擦除彩蛋 -->
    <canvas class="registerMask" v-if="enableInkMask" ref="canvasRef"></canvas>

    <!-- 顶栏(与登录页同款:左品牌标 · 右语言切,不含部署级设置入口) -->
    <div class="topBar">
      <div class="topBarLogo">
        <img src="@/assets/XOI_logo.png" alt="XOi" class="topBarLogoImg" />
        <span class="topBarBrand">XOi 创作平台</span>
      </div>
      <div class="topBarActions">
        <t-dropdown :options="langOptions" trigger="click" @click="handleChangeLang">
          <t-button shape="circle" theme="default" size="small">
            <template #icon>
              <i-translate theme="outline" size="16" />
            </template>
          </t-button>
        </t-dropdown>
      </div>
    </div>

    <!-- 居中注册卡(与登录卡同一套玻璃质感皮) -->
    <div class="registerCard">
      <div class="cardHeader">
        <div class="cardLogoWrap">
          <img src="@/assets/XOI_logo.png" alt="XOi" class="cardLogo" />
          <span class="cardLogoRing" aria-hidden="true"></span>
        </div>
        <h2>创建账号</h2>
        <p>加入 XOi，开启 AI 创作</p>
      </div>

      <div class="cardForm">
        <t-alert
          v-if="errorMsg"
          theme="error"
          :message="errorMsg"
          class="regAlert"
          :close="true"
          @close="errorMsg = ''"
        />
        <div class="formGroup">
          <label class="formLabel" for="register-username">用户名</label>
          <t-input
            id="register-username"
            v-model="form.username"
            placeholder="用户名（3–20 个字符）"
            size="large"
            autocomplete="username"
            @keyup.enter="handleRegister"
          >
            <template #prefix-icon>
              <t-icon name="user" />
            </template>
          </t-input>
        </div>
        <div class="formGroup">
          <label class="formLabel" for="register-password">密码</label>
          <t-input
            id="register-password"
            v-model="form.password"
            type="password"
            placeholder="密码（至少 6 位）"
            size="large"
            autocomplete="new-password"
            @keyup.enter="handleRegister"
          >
            <template #prefix-icon>
              <t-icon name="lock-on" />
            </template>
          </t-input>
        </div>
        <div class="formGroup">
          <label class="formLabel" for="register-confirm-password">确认密码</label>
          <t-input
            id="register-confirm-password"
            v-model="form.confirmPassword"
            type="password"
            placeholder="再次输入密码"
            size="large"
            autocomplete="new-password"
            @keyup.enter="handleRegister"
          >
            <template #prefix-icon>
              <t-icon name="lock-on" />
            </template>
          </t-input>
        </div>

        <!-- 凭据反爆破 · 数字图形验证码组(仅于 needCaptcha 态浮现,沿用家族 focus 紫晕皮) -->
        <div v-if="needCaptcha" class="captchaGroup formGroup">
          <div class="captchaBox">
            <img
              v-if="captcha.svg"
              class="captchaImg"
              alt="图形验证码"
              draggable="false"
              title="点击图片换一张"
              :src="'data:image/svg+xml;base64,' + btoaSafe(captcha.svg)"
              @click="refreshCaptcha"
            />
            <button
              type="button"
              tabindex="-1"
              class="captchaRefreshBtn"
              title="换一张"
              @click="refreshCaptcha"
            >
              ↻
            </button>
          </div>
          <t-input
            v-model="captcha.input"
            placeholder="填写图中数字"
            size="large"
            maxlength="8"
            autocomplete="off"
            @keyup.enter="handleRegister"
          >
            <template #prefix-icon>
              <t-icon name="lock-on" />
            </template>
          </t-input>
        </div>

        <t-button
          class="registerBtn"
          theme="primary"
          size="large"
          block
          :loading="loading"
          @click="handleRegister"
        >
          {{ loading ? "提交中…" : "注册" }}
        </t-button>
        <div class="backTip">
          新伙伴？
          <a href="javascript:void(0)" @click="goLogin">已有账号前去登录</a>
        </div>
      </div>
    </div>

    <footer class="registerFooter">© 2026 XOi. All rights reserved.</footer>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import Router from "@/router/index.ts";
import axios from "@/utils/axios";
import userStore from "@/stores/user";
import { languageList, cachedLocale } from "@/locales";
// 墨水擦除彩蛋实现抽取至 @/utils/useInkMask,与本站登录页共用一份,
// 以保证两端观感参数(MASK_ALPHA=.34 半透薄纱 + 径向衰减挖洞)严格一致。
import { useInkMask } from "@/utils/useInkMask";

const { locale } = useI18n();
const uStore = userStore();
const langOptions = languageList.map((item) => ({
  content: item.label,
  value: item.value,
}));
const handleChangeLang = (data) => {
  locale.value = data.value;
  cachedLocale.value = data.value;
};

const enableInkMask = ref(true);
const heroRef = ref(null);
const canvasRef = ref(null);

const loading = ref(false);
const errorMsg = ref("");

const form = ref({
  username: "",
  password: "",
  confirmPassword: "",
});

/* ====== 图形验证码态 · 联动后端凭据反爆破闸门 ======
 *   后端契约(F7 推论):触发态走非2xx ── POST /api/login/register 返 HTTP461,
 *   body.data 带 {requireCaptcha:true,captchaId,captchaSvg,hint};
 *   公开端点 GET /api/login/captcha success.data 为 {id,svg}。
 */
const needCaptcha = ref(false);
const captcha = ref({ id: "", input: "", svg: "" });

function btoaSafe(str) {
  try {
    return window.btoa(unescape(encodeURIComponent(str)));
  } catch (_) {
    return "";
  }
}
function applyCaptchaPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  needCaptcha.value = true;
  captcha.value.id = payload.captchaId || payload.id || "";
  captcha.value.svg = payload.captchaSvg || payload.svg || "";
}
async function refreshCaptcha() {
  try {
    const resp = await axios.get("/login/captcha");
    applyCaptchaPayload(resp.data);
    captcha.value.input = "";
  } catch (_) {
    /* 刷新失败静默忽略 */
  }
}
function resetCaptchaState() {
  needCaptcha.value = false;
  captcha.value = { id: "", input: "", svg: "" };
}

const goLogin = () => Router.push("/login");

const handleRegister = () => {
  errorMsg.value = "";
  if (!form.value.username || !form.value.password) {
    errorMsg.value = "请填写用户名和密码";
    return;
  }
  if (form.value.username.length > 0 && (form.value.username.length < 3 || form.value.username.length > 20)) {
    errorMsg.value = "用户名长度须为 3–20 个字符";
    return;
  }
  if (form.value.password !== form.value.confirmPassword) {
    errorMsg.value = "两次密码输入不一致";
    return;
  }
  if (form.value.password.length < 6) {
    errorMsg.value = "密码长度至少 6 位";
    return;
  }
  if (needCaptcha.value && !captcha.value.input.trim()) {
    errorMsg.value = "请填写图中数字验证码后再提交";
    return;
  }

  loading.value = true;
  const reqBody = {
    username: form.value.username,
    password: form.value.password,
  };
  if (needCaptcha.value) {
    reqBody.captchaId = captcha.value.id;
    reqBody.captchaInput = captcha.value.input.trim();
  }

  axios
    .post("/login/register", reqBody)
    .then(({ data }) => {
      resetCaptchaState();
      uStore.setUser({ token: data.token, id: String(data.id), display_id: data.display_id, role: data.role || "user", name: data.name });
      Router.push("/aiAssistant");
      window.$message.success("注册成功");
    })
    .catch((e) => {
      // F7 铁律:「需验码」语义必须经非2xx(HTTP461)经 failure 拦截器捕获
      const body = e && typeof e === "object" ? e : null;
      if (body?.data?.requireCaptcha || body?.code === 461) {
        applyCaptchaPayload(body?.data || {});
        captcha.value.input = "";
        errorMsg.value =
          body?.data?.hint ||
          "操作频繁，请识别图中数字并在下方输入后再提交。";
        return;
      }
      const msg = e.message || "注册失败，请稍后再试";
      errorMsg.value = msg;
      window.$message.error(msg);
    })
    .finally(() => {
      loading.value = false;
    });
};

let cleanup = null;

onMounted(() => {
  if (enableInkMask.value && heroRef.value && canvasRef.value) {
    cleanup = useInkMask(heroRef.value, canvasRef.value);
  }
});

onUnmounted(() => {
  cleanup?.();
});
</script>

<style lang="scss" scoped>
.registerPage {
  position: relative;
  width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 30px;
  padding: 84px 20px 56px;
  background: var(--td-bg-color-page, #eef1f6);
}

/* ===================== 底层场景 =====================
 * 与登录页同源的双轨兜底底座:Miora 截图层(:before)在上加载即现其影;
 * 签名失效落空则自动透出手绘式多重径向色场承托绝无露白尴尬。
 * ⚠️ 该截图系 Miora 带签名临时外链数日内将失效且涉版权,
 *    定稿须置换为 frontend/public 下自托管的自有合规底图,
 *    登录/注册两侧届时一并统一切换相对路径彻底脱钩外链依赖。
 */
.registerBg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  background-color: #d9e1f1;
  background-image:
    radial-gradient(58% 48% at 80% 12%, rgba(198, 172, 250, 0.52) 0%, transparent 62%),
    radial-gradient(72% 62% at 10% 24%, rgba(148, 186, 248, 0.46) 0%, transparent 64%),
    radial-gradient(85% 82% at 44% 56%, rgba(255, 250, 238, 0.34) 0%, transparent 68%),
    radial-gradient(76% 66% at 90% 94%, rgba(166, 138, 234, 0.4) 0%, transparent 64%),
    radial-gradient(70% 58% at 16% 98%, rgba(174, 212, 238, 0.36) 0%, transparent 62%),
    linear-gradient(135deg, #f4f4fc 0%, #e8ecf7 46%, #d8dfee 100%);
}

.registerBg::before {
  content: "";
  position: absolute;
  inset: 0;
  background: url('https://sign.miorausercontent.com/img/100000000014434/2026/03/12/eyhkbkrkbsO2Us7VPe1A6/1773301143697-7kkck28qikp.png?sign=fd6ab21c6efc8539b74b5019688b622d&t=1786908519&imageMogr2/quality/85/format/webp')
    center / cover no-repeat;
}

.registerBg::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(244, 246, 252, 0.3) 0%,
    rgba(216, 224, 240, 0.24) 50%,
    rgba(204, 213, 235, 0.2) 100%
  );
}

/* Canvas 墨水遮罩(z=1 夹于 bg 与前景卡片之间令擦痕隐入台后不可见台前;
   pointer-events:none 维持以免阻断前景交互 —— 此项乃旧版残缺实现之根因) */
.registerMask {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

/* 顶栏(同款) */
.topBar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 26px;
  animation: bar-appear 0.5s cubic-bezier(0.16, 1, 0.3, 1);

  .topBarLogo {
    display: flex;
    align-items: center;
    gap: 10px;

    .topBarLogoImg {
      width: 30px;
      height: 30px;
      object-fit: contain;
    }

    .topBarBrand {
      font-size: 15px;
      font-weight: 600;
      color: rgba(70, 65, 97, 0.85);
    }
  }

  .topBarActions {
    display: flex;
    gap: 8px;

    :deep(.t-button--variant-outline),
    :deep(.t-button--variant-text) {
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.62);
      border-color: rgba(118, 108, 188, 0.22);
      color: #464160;
    }
  }
}

@keyframes bar-appear {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ===================== 居中注册卡(与登录卡同一套二次精修版皮) ===================== */
.registerCard {
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  width: min(90vw, 436px);
  max-height: calc(100vh - 112px);
  overflow-y: auto;
  background: linear-gradient(180deg, #ffffff 0%, #fafaff 100%);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.88);
  border-radius: 22px;
  padding: 36px 38px 30px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.98),
    0 22px 58px rgba(58, 50, 108, 0.18),
    0 6px 16px rgba(58, 50, 108, 0.09);
  animation: card-rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;

  // 左上的轻量反向入口提示(回到登录)
  .closeHint {
    appearance: none;
    border: none;
    background: transparent;
    cursor: pointer;
    align-self: flex-end;
    margin-bottom: 4px;
    margin-top: -8px;
    font-family: inherit;
    font-size: 11.5px;
    color: rgba(106, 99, 136, 0.74);
    text-decoration: underline;
    text-decoration-color: rgba(126, 114, 214, 0.4);
    text-underline-offset: 3px;

    &:hover {
      color: #6b63e6;
      text-decoration-color: #6b63e6;
    }
  }
}

@keyframes card-rise {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.cardHeader {
  text-align: center;
  margin-bottom: 24px;

  .cardLogoWrap {
    position: relative;
    width: 64px;
    height: 64px;
    display: inline-grid;
    place-items: center;
    margin-bottom: 14px;

    .cardLogo {
      position: relative;
      z-index: 2;
      width: 42px;
      height: 42px;
      object-fit: contain;
    }

    .cardLogoRing {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background:
        radial-gradient(
          closest-side,
          rgba(122, 114, 214, 0.34) 0%,
          rgba(110, 156, 236, 0.16) 58%,
          rgba(110, 156, 236, 0) 100%
        );
      filter: blur(0.5px);
      animation: ring-pulse 4.5s ease-in-out infinite alternate;
    }
  }

  h2 {
    font-size: 22px;
    font-weight: 700;
    color: #33304a;
    margin: 0 0 6px;
    letter-spacing: -0.01em;
  }

  p {
    font-size: 13.5px;
    color: #807ca0;
    margin: 0;
    letter-spacing: 0.01em;
  }
}

@keyframes ring-pulse {
  from {
    transform: scale(0.86);
    opacity: 0.85;
  }
  to {
    transform: scale(1.06);
    opacity: 1;
  }
}

.cardForm {
  display: flex;
  flex-direction: column;
  gap: 13px;

  .regAlert {
    margin-bottom: 2px;
    border-radius: 10px;
  }

  .formGroup {
    .formLabel {
      display: block;
      margin: 0 0 6px 2px;
      color: #514d6d;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    :deep(.t-input) {
      border-radius: 13px;
      height: 47px;
      background: #fcfcff;
      border-color: rgba(176, 168, 210, 0.32);
      transition:
        border-color 0.2s ease,
        box-shadow 0.2s ease,
        background 0.2s ease;
    }

    :deep(.t-input.t-is-focus),
    :deep(.t-input--focused) {
      border-color: rgba(245, 116, 0, 0.72);
      background: #ffffff;
      box-shadow: 0 0 0 4px rgba(245, 116, 0, 0.14);
    }
  }

  .registerBtn {
    margin-top: 6px;
    height: 47px;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.02em;
    border-radius: 13px;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;

    &:hover:not(:disabled):not(:deep([disabled])) {
      transform: translateY(-1px);
      box-shadow: 0 10px 22px rgba(106, 102, 216, 0.32);
    }
  }

  .backTip {
    text-align: center;
    font-size: 12.5px;
    color: #88849b;
    margin-top: 4px;

    a {
      color: #6b63e6;
      text-decoration: none;
      font-weight: 500;
      margin-left: 2px;

      &:hover {
        text-decoration: underline;
      }
    }
  }

  /* === 图形验证码组(凭据反爆破弹窗式 · 沿用家族 focus 紫晕皮,与登录页同款) === */
  .captchaGroup.formGroup {
    display: flex;
    flex-direction: column;
    gap: 10px;

    .captchaBox {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 47px;
      padding: 4px;
      background: #fcfcff;
      border-radius: 13px;
      border: 1px solid rgba(176, 168, 210, 0.32);

      .captchaImg {
        height: 38px;
        width: auto;
        display: block;
        border-radius: 6px;
        cursor: pointer;
        user-select: none;
        -webkit-user-drag: none;
        flex-shrink: 0;
      }

      .captchaRefreshBtn {
        appearance: none;
        border: none;
        background: rgba(126, 114, 214, 0.12);
        color: #6b63e6;
        width: 32px;
        height: 32px;
        min-width: 32px;
        border-radius: 50%;
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
        transition:
          transform 0.25s ease,
          background 0.25s ease;

        &:hover {
          transform: rotate(-90deg);
          background: rgba(126, 114, 214, 0.24);
        }
      }
    }
  }
}

@media (max-width: 480px) {
  .registerCard {
    padding: 30px 24px 26px;
  }
}

// 底部版权
.registerFooter {
  position: fixed;
  bottom: 20px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 12px;
  color: rgba(70, 65, 97, 0.62);
  z-index: 100;
}
</style>
