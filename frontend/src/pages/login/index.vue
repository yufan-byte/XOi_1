<template>
  <div class="loginPage" ref="heroRef">
    <!-- 兜底纯色基 -->
    <div class="loginBg"></div>

    <!-- Canvas 墨水擦除彩蛋 -->
    <canvas class="loginMask" v-if="enableInkMask" ref="canvasRef"></canvas>

    <!-- Miora 风 Hero 扁横幅卡(独立成框,置于登录卡之上并与之分离) -->
    <section class="home-v2-hero__stage" aria-label="创作能力概览">
      <div class="home-v2-hero__bg" aria-hidden="true"></div>
      <div class="hero-platform-bar">
        <div class="hero-platform-brand"><img src="@/assets/XOI_logo.png" alt="XOi" /><span>XOi 创作平台</span></div>
        <button type="button" class="hero-platform-login" @click="showLogin = true">登录 / 开始创作 <span>→</span></button>
      </div>

      <video
        v-for="clip in heroPreviews"
        :key="clip.key"
        class="home-v2-hero__preview"
        :data-state="heroVideoKey === clip.key ? 'visible' : 'hidden'"
        autoplay
        loop
        playsinline
        muted
        preload="auto"
        disablepictureinpicture=""
        tabindex="-1"
        aria-hidden="true"
      >
        <source :src="cdnBase + clip.mov" type='video/quicktime; codecs="hvc1"' />
        <source :src="cdnBase + clip.webm" type='video/webm; codecs="vp9"' />
      </video>

      <div
        class="home-v2-hero__tags"
        :data-state="heroTagsVisible ? 'visible' : 'hidden'"
        aria-hidden="true"
      >
        <span class="home-v2-hero__tag" style="left: 85.7988%; top: 5.71429%; width: 6.27219%; --op: 0.85;">视频</span>
        <span class="home-v2-hero__tag" style="left: 89.2308%; top: 26.2857%; width: 6.86391%;">品牌</span>
        <span class="home-v2-hero__tag" style="left: 76.568%; top: 13.1429%; width: 6.50888%; --op: 0.55;">海报</span>
        <span class="home-v2-hero__tag" style="left: 83.787%; top: 46.8571%; width: 9.94083%;">视觉 ID</span>
        <span class="home-v2-hero__tag" style="left: 90.0592%; top: 67.4286%; width: 8.04734%;">图像</span>
      </div>

      <div class="home-v2-hero__tabs" role="tablist">
        <div class="home-v2-hero__tabs-bgs"></div>
        <button
          v-for="t in heroTabs"
          :key="t.category"
          type="button"
          role="tab"
          :aria-selected="activeCategory === t.category"
          :class="['home-v2-hero__tab', { 'is-active': activeCategory === t.category }]"
          :data-category="t.category"
          @click="toggleCategory(t.category)"
        >
          <span class="home-v2-hero__tab-icon" v-html="t.icon"></span>
          <span class="home-v2-hero__tab-label">{{ t.label }}</span>
        </button>
      </div>
    </section>

    <section class="creation-hero" aria-label="XOi 创作平台介绍">
      <div class="hero-copy">
        <span class="hero-kicker">XOi CREATIVE STUDIO</span>
        <h1>让灵感，变成完整作品。</h1>
        <p>从一句创意开始，让 AI、专业 Skills 与你的导演判断一起完成故事、画面与成片。</p>
        <button type="button" class="hero-primary" @click="showLogin = true"><i-movie-board /> 登录开始创作 <span>→</span></button>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <span class="orb orb-one"></span><span class="orb orb-two"></span>
        <div class="visual-card card-back"><span>IDEA → STORY</span><strong>灵感<br>生长</strong></div>
        <div class="visual-card card-front"><span>DIRECT / CREATE / IMAGINE</span><strong>XOi</strong><small>你的 AI 创作搭档</small></div>
      </div>
    </section>

    <section class="landing-intro" aria-label="XOi 创作平台能力">
      <div class="landing-copy">
        <span class="landing-kicker">ONE CREATIVE WORKSPACE</span>
        <h1>把灵感变成完整作品</h1>
        <p>一站式漫剧、对话创作、导演台与无限画布，在一个工作空间里完成从想法到成片。</p>
        <button type="button" class="landing-cta" @click="showLogin = true">登录，开始创作 <span>→</span></button>
      </div>
      <div class="landing-entry-grid">
        <article v-for="entry in landingEntries" :key="entry.title" class="landing-entry" :class="entry.tone">
          <span class="entry-icon"><component :is="entry.icon" /></span>
          <strong>{{ entry.title }}</strong>
          <small>{{ entry.desc }}</small>
        </article>
      </div>
      <div class="landing-resource-strip">
        <div><span>MY CREATIVE SPACE</span><strong>能力、灵感和资产，都在你的创作空间里</strong></div>
        <div class="resource-pill"><i-toolkit /><span><b>Skills</b><small>可组合的专业工作流</small></span></div>
        <div class="resource-pill"><i-receive /><span><b>资产</b><small>画布中持续积累的素材</small></span></div>
      </div>
    </section>

    <section class="creative-showcase visual-showcase" aria-label="视觉风格方案">
      <div class="showcase-heading">
        <div><span>VISUAL STYLE LIBRARY</span><h2>视觉风格方案</h2></div>
        <p>选择画面质感、色彩与美术方向，让角色、场景和每一个镜头保持统一的视觉语言。</p>
      </div>
      <div class="showcase-viewport">
        <div class="showcase-track visual-track">
          <article v-for="(item, index) in visualStyleLoop" :key="`${item.name}-${index}`" class="showcase-card" :aria-hidden="index >= visualStyles.length">
            <img :src="item.image" :alt="index < visualStyles.length ? item.name : ''" loading="lazy" decoding="async" />
            <div class="showcase-card-copy"><span>视觉风格</span><strong>{{ item.name }}</strong></div>
          </article>
        </div>
      </div>
    </section>

    <section class="creative-showcase director-showcase" aria-label="导演叙事方案">
      <div class="showcase-heading">
        <div><span>DIRECTOR'S STORY LANGUAGE</span><h2>导演叙事方案</h2></div>
        <p>选择节奏、镜头语言与叙事基调，从喜剧、悬疑到史诗，为每一种故事建立清晰的导演方法。</p>
      </div>
      <div class="showcase-viewport">
        <div class="showcase-track director-track">
          <article v-for="(item, index) in directorStyleLoop" :key="`${item.name}-${index}`" class="showcase-card" :aria-hidden="index >= directorStyles.length">
            <img :src="item.image" :alt="index < directorStyles.length ? item.name : ''" loading="lazy" decoding="async" />
            <div class="showcase-card-copy"><span>导演叙事</span><strong>{{ item.name }}</strong></div>
          </article>
        </div>
      </div>
    </section>

    <section class="landing-section workflow-section">
      <div class="section-heading"><span>FROM IDEA TO SCREEN</span><h2>一句话，开始一部作品</h2><p>把复杂的制作流程拆成清晰的创作阶段，每一步都保留你的判断。</p></div>
      <div class="workflow-grid">
        <article v-for="(step, index) in workflowSteps" :key="step.title" class="workflow-card">
          <div class="workflow-visual">
            <img :src="step.image" :alt="`${step.title}创作阶段示意图`" loading="lazy" decoding="async" />
          </div>
          <div class="workflow-copy"><b>0{{ index + 1 }}</b><h3>{{ step.title }}</h3><p>{{ step.desc }}</p></div>
        </article>
      </div>
    </section>

    <section class="landing-section why-section">
      <div class="section-heading"><span>WHY XOi</span><h2>为真正的创作者而设计</h2><p>不是把更多按钮堆在一起，而是让每个创作决定都能自然地向下一步推进。</p></div>
      <div class="why-grid"><article v-for="reason in whyReasons" :key="reason.title"><strong>{{ reason.title }}</strong><p>{{ reason.desc }}</p></article></div>
    </section>

    <section class="final-cta"><div><span>READY WHEN YOU ARE</span><h2>从一个想法开始，做出完整作品。</h2></div><button type="button" @click="showLogin = true">登录，进入 XOi <span>→</span></button></section>

    <!-- 居中登录卡(独立成框,经二次打磨) -->
    <div v-if="showLogin" class="loginModal" @click.self="showLogin = false">
    <div class="loginShell">
    <section class="loginVisual" aria-hidden="true">
      <div class="loginVisualGlow"></div>
      <div class="loginVisualOrb orb-main"></div>
      <div class="loginVisualOrb orb-small"></div>
      <div class="loginVisual-card card-a"><span>IDEA / STORY / FRAME</span><strong>创作<br>正在发生</strong><small>XOi Creative Studio</small></div>
      <div class="loginVisual-card card-b"><span>YOUR AI CREATIVE PARTNER</span><b>XOi</b></div>
      <div class="loginVisualCopy"><span>ONE WORKSPACE FOR CREATORS</span><h2>从一个想法<br>开始一部作品。</h2><p>对话、Skills、导演台与无限画布，陪你把灵感推进到成片。</p></div>
    </section>
    <div class="loginCard">
      <button class="loginClose" type="button" aria-label="关闭" @click="showLogin = false">×</button>
      <div class="cardHeader">
        <div class="cardLogoWrap">
          <img src="@/assets/XOI_logo.png" alt="XOi" class="cardLogo" />
          <span class="cardLogoRing" aria-hidden="true"></span>
        </div>
        <h2>欢迎回来</h2>
        <p>登录以继续使用 XOi 创作平台</p>
        <div class="auth-switch" role="tablist">
          <button type="button" :class="{ active: authMode === 'login' }" @click="authMode = 'login'">登录</button>
          <button type="button" :class="{ active: authMode === 'register' }" @click="authMode = 'register'">创建账号</button>
        </div>
      </div>
      <div v-if="authMode === 'login'" class="cardForm">
        <t-alert
          v-if="errorMsg"
          theme="error"
          :message="errorMsg"
          class="loginAlert"
          :close="true"
          @close="errorMsg = ''"
        />
        <div class="formGroup">
          <label class="formLabel" for="login-username">用户名</label>
          <t-input
            id="login-username"
            v-model="form.username"
            :placeholder="$t('login.username')"
            size="large"
            class="formInput"
            autocomplete="username"
          >
            <template #prefix-icon>
              <t-icon name="user" />
            </template>
          </t-input>
        </div>
        <div class="formGroup">
          <label class="formLabel" for="login-password">密码</label>
          <t-input
            id="login-password"
            v-model="form.password"
            type="password"
            :placeholder="$t('login.password')"
            size="large"
            class="formInput"
            autocomplete="current-password"
            @keyup.enter="handleLogin"
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
            @keyup.enter="handleLogin"
          >
            <template #prefix-icon>
              <t-icon name="lock-on" />
            </template>
          </t-input>
        </div>

        <t-button
          class="loginBtn"
          theme="primary"
          size="large"
          block
          :loading="loading"
          @click="handleLogin"
        >
          {{ $t('login.login') }}
        </t-button>
        <div class="registerTip">
          新伙伴？
          <a href="javascript:void(0)" @click="authMode = 'register'; errorMsg = ''">创建账号</a>
        </div>
      </div>
      <div v-else class="cardForm">
        <t-alert v-if="errorMsg" theme="error" :message="errorMsg" class="loginAlert" :close="true" @close="errorMsg = ''" />
        <div class="formGroup"><label class="formLabel" for="register-username">用户名</label><t-input id="register-username" v-model="registerForm.username" placeholder="用户名（3–20 个字符）" size="large" autocomplete="username" /></div>
        <div class="formGroup"><label class="formLabel" for="register-password">密码</label><t-input id="register-password" v-model="registerForm.password" type="password" placeholder="密码（至少 6 位）" size="large" autocomplete="new-password" /></div>
        <div class="formGroup"><label class="formLabel" for="register-confirm-password">确认密码</label><t-input id="register-confirm-password" v-model="registerForm.confirmPassword" type="password" placeholder="再次输入密码" size="large" autocomplete="new-password" @keyup.enter="handleRegister" /></div>
        <div v-if="needCaptcha" class="captchaGroup formGroup"><div class="captchaBox"><img v-if="captcha.svg" class="captchaImg" alt="图形验证码" :src="'data:image/svg+xml;base64,' + btoaSafe(captcha.svg)" @click="refreshCaptcha" /><button type="button" class="captchaRefreshBtn" @click="refreshCaptcha">↻</button></div><t-input v-model="captcha.input" placeholder="填写图中数字" size="large" maxlength="8" /></div>
        <t-button class="loginBtn" theme="primary" size="large" block :loading="loading" @click="handleRegister">创建账号</t-button>
        <div class="registerTip">已有账号？<a href="javascript:void(0)" @click="authMode = 'login'">返回登录</a></div>
      </div>
    </div>
    </div>
    </div>

    <footer class="loginFooter">© 2026 XOi. All rights reserved.</footer>

    <!-- 设置弹窗(API 地址等部署级项不再暴露于登录门前;
         后续若有需求宜迁入登录后工作台的管理员专属设置区统一治理) -->
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import Router from "@/router/index.ts";
import axios from "@/utils/axios";
import userStore from "@/stores/user";
import style90sJapan from "@/assets/visual-presets/style-90s-japan.png";
import styleGuochao2d from "@/assets/visual-presets/style-guochao-2d.png";
import styleFlatDesign from "@/assets/visual-presets/style-flat-design.png";
import styleUrbanRomance from "@/assets/visual-presets/style-urban-romance-anime.png";
import style3dAnimation from "@/assets/visual-presets/style-3d-animation.png";
import styleGuofeng3d from "@/assets/visual-presets/style-guofeng-3d.png";
import styleClay from "@/assets/visual-presets/style-clay-stopmotion.png";
import styleGuofengCyber from "@/assets/visual-presets/style-guofeng-cyber.png";
import styleRealAncient from "@/assets/visual-presets/style-real-ancient.png";
import styleRealUrbanCinematic from "@/assets/visual-presets/style-real-urban-cinematic.png";
import styleRealUrban from "@/assets/visual-presets/style-real-urban.png";
import workflowIdea from "@/assets/home-workflow/workflow-idea.png";
import workflowCollaborate from "@/assets/home-workflow/workflow-collaborate.png";
import workflowDirect from "@/assets/home-workflow/workflow-direct.png";
import workflowCanvas from "@/assets/home-workflow/workflow-canvas.png";
const uStore = userStore();

const loading = ref(false);
const showLogin = ref(false);
const errorMsg = ref("");
const heroRef = ref(null);
const canvasRef = ref(null);

const form = ref({
  username: "",
  password: "",
});
const authMode = ref("login");
const registerForm = ref({ username: "", password: "", confirmPassword: "" });

/* ====== 图形验证码态 · 联动后端凭据反爆破闸门 ======
 *   后端契约(F7 推论): 触发态走非2xx ── POST /api/login/login 返 HTTP461,
 *     body.data 内带 { requireCaptcha:true, reason, captchaId, captchaSvg, hint };
 *   公开取码端点 GET /api/login/captcha 返标准 success 壳,data 为 { id, svg }。
 */
const needCaptcha = ref(false);
const captcha = ref({ id: "", input: "", svg: "" });
const landingEntries = [
  { title: "一站式漫剧", desc: "从故事设定到分镜成片", icon: "i-movie-board", tone: "orange" },
  { title: "对话创作", desc: "与 AI 对话并调用 Skills", icon: "i-magic", tone: "violet" },
  { title: "导演台", desc: "掌控镜头、场景与节奏", icon: "i-movie-board", tone: "blue" },
  { title: "无限画布", desc: "自由组织灵感与视觉资产", icon: "i-sketch", tone: "green" },
];
const workflowSteps = [
  { title: "输入创意", desc: "一句话、一个角色或一段素材，都可以成为起点。", image: workflowIdea },
  { title: "对话共创", desc: "与 AI 对话推进故事，Skills 负责专业方法。", image: workflowCollaborate },
  { title: "导演调度", desc: "在导演台里掌控镜头、节奏、角色和场景。", image: workflowDirect },
  { title: "画布成片", desc: "把图片、视频和灵感放进无限画布持续迭代。", image: workflowCanvas },
];
const whyReasons = [
  { title: "创作过程可控", desc: "每一步都能查看、修改和回退，不让黑盒替你做决定。" },
  { title: "能力可以组合", desc: "把 Skills 像专业搭档一样接入对话，适配不同创作任务。" },
  { title: "灵感不会丢失", desc: "灵感、任务、画布资产和项目统一沉淀在你的空间里。" },
];
const skillsOrigin = window.location.port === "50188" ? `${window.location.protocol}//${window.location.hostname}:10588` : window.location.origin;
const visualStyles = [
  { name: "90年代日式动画", image: style90sJapan },
  { name: "国风二次元新国潮", image: styleGuochao2d },
  { name: "2D扁平风", image: styleFlatDesign },
  { name: "成熟都市言情二次元动画", image: styleUrbanRomance },
  { name: "3D 动画渲染", image: style3dAnimation },
  { name: "国风3D", image: styleGuofeng3d },
  { name: "定格动画黏土", image: styleClay },
  { name: "国风赛博3D", image: styleGuofengCyber },
  { name: "真人古风写实", image: styleRealAncient },
  { name: "真人都市影像", image: styleRealUrbanCinematic },
  { name: "真人都市写实", image: styleRealUrban },
];
const directorStyles = [
  ["喜剧搞笑", "story_skills/Comedy_humor/images/title.png"],
  ["青春成长", "story_skills/Coming_of_age/images/title.png"],
  ["家庭温情", "story_skills/Family_warmth/images/title.png"],
  ["历史史诗", "story_skills/Historical_epic/images/title.png"],
  ["恐怖灵异", "story_skills/Horror_supernatural/images/title.png"],
  ["热血少年", "story_skills/Hot_blooded_action/images/title.png"],
  ["悬疑推理", "story_skills/Mystery_thriller/images/title.png"],
  ["心理博弈", "story_skills/Psychological_drama/images/title.png"],
  ["科幻末世", "story_skills/Scifi_post_apocalypse/images/title.png"],
  ["甜宠言情", "story_skills/Sweet_romance_novel/images/title.png"],
  ["都市职场", "story_skills/Urban_workplace_drama/images/title.png"],
  ["古风仙侠", "story_skills/Xianxia_fantasy/images/title.png"],
].map(([name, path]) => ({ name, image: `${skillsOrigin}/skills/${path}` }));
const visualStyleLoop = [...visualStyles, ...visualStyles];
const directorStyleLoop = [...directorStyles, ...directorStyles];

// SVG 字符串 base64 编码作 <img> src;Unicode 安全版防 svg-captcha 输出偶有非 ASCII 致 btoa 抛错
function btoaSafe(str) {
  try {
    return window.btoa(unescape(encodeURIComponent(str)));
  } catch (_) {
    return "";
  }
}

/** 把响应体里层 payload 的验码字段搬进本地 state 并令 UI 展开 */
function applyCaptchaPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  needCaptcha.value = true;
  // 兼容两种 key 名形: 失败附载 {captchaId,captchaSvg} / 刷新直供 {id,svg}
  captcha.value.id = payload.captchaId || payload.id || "";
  captcha.value.svg = payload.captchaSvg || payload.svg || "";
}

async function refreshCaptcha() {
  try {
    const resp = await axios.get("/login/captcha"); // success 拦截器已剥一层 → resp 即 ApiResponse
    applyCaptchaPayload(resp.data);
    captcha.value.input = "";
  } catch (_) {
    /* 刷新失败静默忽略以免打断用户填写节奏 */
  }
}

function resetCaptchaState() {
  needCaptcha.value = false;
  captcha.value = { id: "", input: "", svg: "" };
}

// 登录
const handleLogin = () => {
  errorMsg.value = "";
  if (!form.value.username || !form.value.password) {
    errorMsg.value = "请输入用户名和密码";
    return;
  }
  if (needCaptcha.value && !captcha.value.input.trim()) {
    errorMsg.value = "请填写图中数字验证码后再提交";
    return;
  }

  const payload = { username: form.value.username, password: form.value.password };
  if (needCaptcha.value) {
    payload.captchaId = captcha.value.id;
    payload.captchaInput = captcha.value.input.trim();
  }

  loading.value = true;
  axios
    .post("/login/login", payload)
    .then(({ data }) => {
      // 成功登录 ── 后端 releaseHolds 已清场,前端同步复位 UI 回归基线免码常态
      resetCaptchaState();
      uStore.setUser({ token: data.token, id: String(data.id), display_id: data.display_id, role: data.role || "user", name: data.name });
      Router.push("/aiAssistant");
      window.$message.success("登录成功");
    })
    .catch((e) => {
      // F7 铁律:「需验码」语义必须经非2xx(HTTP461)由 failure 拦截器捕获,
      // 否则 success 直吞致信号丢失触发空 token 登录灾难。
      const body = e && typeof e === "object" ? e : null;
      if (body?.data?.requireCaptcha || body?.code === 461) {
        applyCaptchaPayload(body?.data || {});
        captcha.value.input = "";
        errorMsg.value =
          body?.data?.hint ||
          "多次尝试验证身份，请识别图中数字并在下方输入后再提交。";
        return;
      }
      errorMsg.value = e.message || "登录失败，请重试";
    })
    .finally(() => {
      loading.value = false;
    });
};

const handleRegister = () => {
  errorMsg.value = "";
  const { username, password, confirmPassword } = registerForm.value;
  if (!username || !password) return (errorMsg.value = "请填写用户名和密码");
  if (username.length < 3 || username.length > 20) return (errorMsg.value = "用户名长度须为 3–20 个字符");
  if (password !== confirmPassword) return (errorMsg.value = "两次密码输入不一致");
  if (password.length < 6) return (errorMsg.value = "密码长度至少 6 位");
  if (needCaptcha.value && !captcha.value.input.trim()) return (errorMsg.value = "请填写图中数字验证码后再提交");
  const payload = { username, password };
  if (needCaptcha.value) {
    payload.captchaId = captcha.value.id;
    payload.captchaInput = captcha.value.input.trim();
  }
  loading.value = true;
  axios.post("/login/register", payload).then(({ data }) => {
    resetCaptchaState();
    uStore.setUser({ token: data.token, id: String(data.id), display_id: data.display_id, role: data.role || "user", name: data.name });
    Router.push("/aiAssistant");
    window.$message.success("注册成功");
  }).catch((e) => {
    const body = e && typeof e === "object" ? e : null;
    if (body?.data?.requireCaptcha || body?.code === 461) {
      applyCaptchaPayload(body?.data || {});
      captcha.value.input = "";
      errorMsg.value = body?.data?.hint || "操作频繁，请识别图中数字并在下方输入后再提交。";
      return;
    }
    errorMsg.value = e.message || "注册失败，请稍后再试";
  }).finally(() => { loading.value = false; });
};

const goRegister = () => Router.push("/register");

/* ============================================================
 *  Miora 风 Hero 试装 · 第四轮定型
 * ------------------------------------------------------------
 *  · Hero 横幅卡与登录卡各自独立成框,纵向叠列留呼吸间隙
 *  · 浮标回退到总览组文案(视频·品牌·海报·视觉ID·图像)
 *  · 登录卡二次精修:Logo 光环衬底/焦点紫晕/按钮抬升等
 *  · 墨水擦除保持34%薄纱仅游走于负空间,不入前台二框
 * ============================================================ */
const enableInkMask = ref(false);

/* ───────── 顶栏 auto-hide 控制台 ─────────
   常态以 translateY(-135%) 潜出屏外·opacity归零并禁指针以防误触翻译键;
   光标探入顶部一道宽揭示带即即时下沉现身,撤离则经短暂缓冲再上滑回收。
   弃纯-CSS-hover 法改走全局 mousemove 坐标判定之缘由:t-dropdown 的语种弹板被
     teleport 到 <body> 外、脱出 .topBar 子树边界,若仅依 :hover 维系显形会令用户
     「正挑选语言」途中一旦指针越过顶栏本体矩边即刻触发收缩、体验崩坏;
     全局监听无关 DOM 归属可稳保整条顶部交互横贯线持续可见。
   REVEAL_BAND 取 130 ≈ topBar 实占(padT18+logoH30+padB18=66)+ 下拉面板常驻高度余量,
     保证悬停译项展开期间仍落入“维持显现”域不遭误判离散去 */
const TOPBAR_REVEAL_BAND = 130;
const TOPBAR_HIDE_DELAY = 600;
const topBarVisible = ref(false);
// 注:本 <script setup> 非 lang="ts",故此处禁任何冒号-类型/尖括号泛型·否则 @babel/parser 抛 Missing semicolon 编译阻断
let _tbHideTimer;
let _lastTopBarY = -1;
function ensureTopBarVisible() {
  clearTimeout(_tbHideTimer);
  if (!topBarVisible.value) topBarVisible.value = true;
}
function scheduleTopBarHide() {
  clearTimeout(_tbHideTimer);
  _tbHideTimer = setTimeout(
    () => {
      topBarVisible.value = false;
    },
    TOPBAR_HIDE_DELAY,
  );
}
function _onTopBarMouseMove(e) {
  // 进带立显·出带走延后再敛;逐帧重置定时器使连续下行不再抖动闪缩
  if (_lastTopBarY !== e.clientY && e.clientY <= TOPBAR_REVEAL_BAND) ensureTopBarVisible();
  else scheduleTopBarHide();
  _lastTopBarY = e.clientY;
}
onMounted(() =>
  window.addEventListener("mousemove", _onTopBarMouseMove, { passive: true }),
);
onUnmounted(() => {
  window.removeEventListener("mousemove", _onTopBarMouseMove);
  clearTimeout(_tbHideTimer);
});
const cdnBase = "https://static.d.gtimg.com/miora/61195146/assets/";

const heroPreviews = [
  { key: "default", mov: "hero-preview-default-Dwy9OQA7.mov", webm: "hero-preview-default-C0Xr9ycv.webm" },
  { key: "branding", mov: "hero-preview-branding-CB1kAJBB.mov", webm: "hero-preview-branding-DIE1e9zd.webm" },
  { key: "video", mov: "hero-preview-video-wjxm4V1u.mov", webm: "hero-preview-video-D8m2Az5k.webm" },
  { key: "commerce", mov: "hero-preview-commerce-CqbaE5O2.mov", webm: "hero-preview-commerce-B-4vWTq8.webm" },
  { key: "gaming", mov: "hero-preview-gaming-7TAFgrXY.mov", webm: "hero-preview-gaming-DaxGqf4F.webm" },
  // webApps 暂借 default 片头(Miora 原站亦缺其专属素材)
  { key: "webApps", mov: "hero-preview-default-Dwy9OQA7.mov", webm: "hero-preview-default-C0Xr9ycv.webm" },
];

const ICON_PALETTE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"></path><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle></svg>`;
const ICON_FILM = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" rx="2" ry="2" width="18" height="18"></rect><line x1="7" y1="3" x2="7" y2="21"></line><line x1="17" y1="3" x2="17" y2="21"></line><line x1="3" y1="7.5" x2="21" y2="7.5"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="16.5" x2="21" y2="16.5"></line></svg>`;
const ICON_SHOPPING_BAG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 10a4 4 0 0 1-8 0"></path><path d="M3.103 6.034h17.794"></path><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"></path></svg>`;
const ICON_GAMEPAD_2 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="11" x2="10" y2="11"></line><line x1="8" y1="9" x2="8" y2="13"></line><line x1="15" y1="12" x2="15.01" y2="12"></line><line x1="18" y1="10" x2="18.01" y2="10"></line><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"></path></svg>`;
const ICON_MONITOR_SMARTPHONE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="16" y="12" rx="2" ry="2" width="6" height="10"></rect><path d="M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8"></path><path d="M10 19v-3.96 3.15"></path><path d="M7 19h5"></path></svg>`;

const heroTabs = [
  { category: "branding", label: "品牌设计", icon: ICON_PALETTE },
  { category: "video", label: "影视创意", icon: ICON_FILM },
  { category: "commerce", label: "电商广告", icon: ICON_SHOPPING_BAG },
  { category: "gaming", label: "互动游戏", icon: ICON_GAMEPAD_2 },
  { category: "webApps", label: "网页应用", icon: ICON_MONITOR_SMARTPHONE },
];

const activeCategory = ref(null);
const heroVideoKey = computed(() =>
  activeCategory.value == null ? "default" : String(activeCategory.value)
);
const heroTagsVisible = computed(() => activeCategory.value == null);

function toggleCategory(category) {
  activeCategory.value = activeCategory.value === category ? null : category;
}

// Canvas 墨水遮罩效果（鼠标划过擦除）
function useHeroMask(hero, canvas) {
  if (!hero || !canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const MASK = "252, 250, 248";
  const R_START = 8;
  const R_END = 128;
  const R_VARY = 0.45;
  const LIFETIME = 520;
  const STAMP_STEP = 12;
  const MAX_STAMPS = 160;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  // 雾纱浓度:取约三分之一以避免整屏被近乎纯白的涂层刷平致画面发闷
  const MASK_ALPHA = 0.34;

  let raf = 0;
  let running = false;
  let lastX = null;
  let lastY = null;
  const stamps = [];

  function resize() {
    const rect = hero.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    canvas.width = Math.round(width * DPR);
    canvas.height = Math.round(height * DPR);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(${MASK}, ${MASK_ALPHA})`;
    ctx.fillRect(0, 0, width, height);
  }

  function addStamp(x, y) {
    stamps.push({
      born: performance.now(),
      rmax: R_END * (1 - R_VARY / 2 + Math.random() * R_VARY),
      seed: Math.random() * 1000,
      x,
      y,
    });
    if (stamps.length > MAX_STAMPS) stamps.shift();
  }

  function stampAlong(x, y) {
    if (lastX == null || lastY == null) {
      addStamp(x, y);
    } else {
      const dx = x - lastX;
      const dy = y - lastY;
      const dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(dist / STAMP_STEP));
      for (let i = 1; i <= steps; i += 1) {
        addStamp(lastX + (dx * i) / steps, lastY + (dy * i) / steps);
      }
    }
    lastX = x;
    lastY = y;
  }

  function carveInk(x, y, r, alpha, seed) {
    const gradient = ctx.createRadialGradient(x, y, r * 0.25, x, y, r);
    gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
    gradient.addColorStop(0.58, `rgba(0,0,0,${alpha * 0.9})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    const segments = 32;
    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const wobble =
        1 +
        Math.sin(angle * 3.1 + seed) * 0.08 +
        Math.sin(angle * 7.3 + seed * 0.37) * 0.045;
      const radius = r * wobble;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function loop() {
    const now = performance.now();
    const width = canvas.width / DPR;
    const height = canvas.height / DPR;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(${MASK}, ${MASK_ALPHA})`;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "destination-out";

    for (let i = stamps.length - 1; i >= 0; i -= 1) {
      const t = (now - stamps[i].born) / LIFETIME;
      if (t >= 1) {
        stamps.splice(i, 1);
        continue;
      }
      const ease = 1 - Math.pow(1 - t, 3);
      const radius = R_START + (stamps[i].rmax - R_START) * ease;
      const alpha = 1 - t * t;
      carveInk(stamps[i].x, stamps[i].y, radius, alpha, stamps[i].seed);
    }

    if (running || stamps.length) {
      raf = requestAnimationFrame(loop);
    } else {
      raf = 0;
    }
  }

  function start() {
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function onMouseEnter(event) {
    running = true;
    const rect = hero.getBoundingClientRect();
    lastX = event.clientX - rect.left;
    lastY = event.clientY - rect.top;
    stampAlong(lastX, lastY);
    start();
  }

  function onMouseMove(event) {
    const rect = hero.getBoundingClientRect();
    stampAlong(event.clientX - rect.left, event.clientY - rect.top);
    start();
  }

  function onMouseLeave() {
    running = false;
    lastX = null;
    lastY = null;
    start();
  }

  resize();
  window.addEventListener("resize", resize);
  hero.addEventListener("mouseenter", onMouseEnter);
  hero.addEventListener("mousemove", onMouseMove);
  hero.addEventListener("mouseleave", onMouseLeave);

  return () => {
    window.cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    hero.removeEventListener("mouseenter", onMouseEnter);
    hero.removeEventListener("mousemove", onMouseMove);
    hero.removeEventListener("mouseleave", onMouseLeave);
  };
}

let cleanup = null;

onMounted(() => {
  if (enableInkMask.value && heroRef.value && canvasRef.value) {
    cleanup = useHeroMask(heroRef.value, canvasRef.value);
  }
});

onUnmounted(() => {
  if (cleanup) cleanup();
});
</script>

<style lang="scss" scoped>
.loginPage {
  position: relative;
  width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 弃纵向居中·改靠上使整组紧随固定 topBar 排列而非被均分空间压至屏央 */
  justify-content: flex-start;
  gap: 30px;
  /* 上内距收敛至恰等 fixed topBar 实占高(padT18+logoH30+padB18=66)
     ⇒ home-v2-hero__stage 卡顶端正好贴住顶栏底沿达成"整体往上、二者齐平";
     下边距 56 兜底呼吸·段间 gap 由上方 30px 维持故 loginCard 随之上抬同一幅度 */
  padding: 0 20px 56px;
  background: #090b12;
}

// 底层场景 双轨兜底:Miora 截图层(:before)置上,载入即现其影;
// 一旦签名失效落空则自动透出手绘极光式多重径向色场承托,绝无露白尴尬。
// ⚠️ 该截图系 Miora 带签名临时外链数日内将失效且涉版权,
//    定稿须置换为 frontend/public 下自托管的自有合规底图。
.loginBg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  background-color: #090b12;
  background-image:
    linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px),
    radial-gradient(60% 55% at 15% 15%, rgba(93, 63, 255, .28), transparent 70%),
    radial-gradient(55% 60% at 86% 18%, rgba(255, 104, 42, .22), transparent 70%),
    radial-gradient(60% 65% at 54% 96%, rgba(0, 183, 196, .17), transparent 72%),
    linear-gradient(135deg, #0a0c15 0%, #111225 52%, #0b111b 100%);
  background-size: 52px 52px, 52px 52px, auto, auto, auto, auto;
}

// 截图层:加载失败即空缺,交下方极光色场接管
.loginBg::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,.42) 100%);
}

// 统一品牌薄罩:两态皆施以淡化色调收口一致
.loginBg::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(11, 12, 24, 0.12) 0%,
    rgba(11, 12, 24, 0.28) 55%,
    rgba(5, 8, 14, 0.48) 100%
  );
}

// Canvas 墨水遮罩(z=1 夹于 bg 与前景二框之间,令擦痕隐入台后不可见台前;
// pointer-events:none 维持以免阻断交互)
.loginMask {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

// 顶栏
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

  /* auto-hide 默认态·整体上移潜出屏外兼禁指针以免误触;
     显形出场过渡接管原 bar-appear 入场动画(后者"开机必演"与本处"开机即藏"语义互斥故撤除),
     实际唤起由 JS 写 is-revealed 类驱动(见 script 内 _onTopBarMouseMove 全局监听),
     并保留 :hover 与 :focus-within 两路兜底分别补全指针驻空时的滞后感与键盘 Tab 的无障碍可达性 */
  height: 68px;
  padding: 14px 28px;
  background: linear-gradient(180deg, rgba(8,10,18,.86), rgba(8,10,18,.42));
  border-bottom: 1px solid rgba(255,255,255,.08);
  backdrop-filter: blur(20px);

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
      color: rgba(255, 255, 255, 0.9);
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
      color: #f4f4f8;
    }
  }
}

.topLoginBtn { background: linear-gradient(135deg,#ff7a24,#ff4f76); border: 0; box-shadow: 0 8px 22px rgba(255,91,66,.28); }

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

/* ===================== Miora 风 Hero 扁横幅卡 ===================== */
.home-v2-hero__stage {
  position: relative;
  z-index: 2;
  width: calc(100% + 40px);
  height: 164px;
  margin-top: 0;
  margin-left: -20px;
  border-radius: 0 0 28px 28px;
  overflow: hidden;
  isolation: isolate;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-top: 0;
  box-shadow:
    0 18px 50px rgba(0, 0, 0, 0.22),
    0 0 60px rgba(108, 78, 255, 0.1);
  animation: hero-drop-in 0.55s cubic-bezier(0.16, 1, 0.3, 1);
}
.hero-platform-bar { position:absolute; inset:0 0 auto; z-index:7; display:flex; align-items:center; justify-content:space-between; height:58px; padding:0 22px 0 28px; background:linear-gradient(180deg,rgba(8,10,18,.72),rgba(8,10,18,.12)); border-bottom:1px solid rgba(255,255,255,.1); }
.hero-platform-brand { display:flex; align-items:center; gap:10px; color:#fff; font-size:14px; font-weight:650; letter-spacing:.01em; }.hero-platform-brand img { width:32px; height:32px; object-fit:contain; }.hero-platform-login { display:inline-flex; align-items:center; gap:9px; padding:9px 15px; border:1px solid rgba(255,255,255,.22); border-radius:999px; background:rgba(255,255,255,.12); color:#fff; font-size:12px; font-weight:650; cursor:pointer; backdrop-filter:blur(10px); }.hero-platform-login:hover { background:rgba(255,255,255,.2); }.hero-platform-login span { color:#ff9a68; font-size:16px; }

@keyframes hero-drop-in {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.home-v2-hero__bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(80% 150% at 86% 15%, rgba(255, 103, 44, .28), transparent 62%),
    radial-gradient(90% 140% at 12% 90%, rgba(86, 76, 255, .35), transparent 66%),
    linear-gradient(135deg, rgba(19, 20, 42, .94), rgba(20, 25, 48, .76));
  opacity: .72;
  box-shadow: inset 0 -1px rgba(255,255,255,.1);
}

.home-v2-hero__brand {
  position: absolute;
  left: 34px;
  top: 64%;
  transform: translateY(-50%);
  width: clamp(48px, 6vw, 68px);
  height: auto;
  object-fit: contain;
  opacity: 0.86;
  z-index: 3;
  pointer-events: none;
  filter:
    drop-shadow(0 6px 18px rgba(122, 104, 196, 0.22))
    drop-shadow(0 0 26px rgba(110, 156, 236, 0.16));
  animation: miora-brand-float 6s ease-in-out infinite alternate;
}

@keyframes miora-brand-float {
  from {
    transform: translateY(calc(-50% - 2px));
  }
  to {
    transform: translateY(calc(-50% + 2px));
  }
}

.home-v2-hero__preview {
  position: absolute;
  inset: 58px 0 0;
  width: 100%;
  height: calc(100% - 58px);
  /* contain 保 Miora 片头整帧可见·免遭 845×175 扁横幅的 cover 式横向切断;
     余隙代偿:因 stage 框比远扁于片源纵宽比,左右两翼会露底,然此处非硬黑边而是
     底层 home-v2-hero__bg 紫-蓝径向渐变衬底(video 仅 opacity:.72 半叠其上)观感柔顺可纳;
     如嫌空隙过大宜同步抬升 stage 高度逼近片源纵横而非退回 cover 牺牲 completeness */
  object-fit: contain;
  /* 锚至 heroTabs 最末一枚「网页应用」所在列位一带(非卡缘死右);
     该 tab 条乃 absolute 居中悬浮且自体窄于卡片(gap/padding 内驱非满栏),
     故末枚实测横坐标落点约处三四分之三之境而非极右缘;
     此值为据布局推断的设计估值,行宽剧变致 tab 重排时容 ±几%飘移·欲像素级钉死须改走 JS 取 rect 反注变量 */
  object-position: 76% 50%;
  pointer-events: none;
  opacity: 0;
  z-index: 2;
  transform: scale(1.02);
  transition:
    opacity 0.65s cubic-bezier(0.4, 0.05, 0.15, 1),
    transform 0.9s cubic-bezier(0.4, 0.05, 0.15, 1);
  will-change: opacity, transform;

  &[data-state="visible"] {
    opacity: 0.72;
    transform: scale(1);
    animation: miora-zoom-slow 26s ease-in-out infinite alternate;
  }

  &[data-state="hidden"] {
    opacity: 0;
  }
}

@keyframes miora-zoom-slow {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.06);
  }
}

.home-v2-hero__tags {
  position: absolute;
  right: 0;
  top: 58px;
  width: 100%;
  height: calc(100% - 58px);
  z-index: 4;
  pointer-events: none;
  transition: opacity 0.5s ease;

  &[data-state="hidden"] {
    opacity: 0;
  }
}

.home-v2-hero__tag {
  --op: 1;
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: clamp(18px, 1.7vh, 23px);
  padding: 0 clamp(6px, 0.85vw, 11px);
  font-size: clamp(9px, 0.85vw, 12px);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #443a40;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.66);
  border: 1px solid rgba(148, 134, 204, 0.38);
  box-shadow: 0 5px 14px rgba(80, 70, 130, 0.16);
  backdrop-filter: blur(10px) saturate(160%);
  -webkit-backdrop-filter: blur(10px) saturate(160%);
  animation: miora-tag-pop 0.7s ease both;
  opacity: var(--op);
}

@keyframes miora-tag-pop {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: var(--op, 1);
    transform: translateY(0);
  }
}

.home-v2-hero__tabs {
  position: absolute;
  left: 50%;
  bottom: 9px;
  transform: translateX(-50%);
  z-index: 6;
  display: flex;
  align-items: flex-end;
  gap: 3px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.66);
  border: 1px solid rgba(154, 144, 198, 0.26);
  box-shadow: 0 10px 26px rgba(80, 70, 130, 0.18);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  max-width: calc(100% - 24px);

  &-bgs {
    /* 占位槽位 */
  }
}

.home-v2-hero__tab {
  appearance: none;
  -webkit-appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  height: clamp(28px, 3.2vh, 36px);
  padding: 0 clamp(10px, 1.05vw, 16px);
  border: none;
  border-radius: 999px;
  cursor: pointer;
  font-family: inherit;
  font-size: clamp(10px, 0.98vw, 12.5px);
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #6b6788;
  background: transparent;
  white-space: nowrap;
  transition:
    color 0.25s ease,
    background 0.25s ease,
    transform 0.25s ease,
    box-shadow 0.25s ease;

  &:hover {
    color: #463f66;
    background: rgba(126, 114, 214, 0.14);
  }

  &.is-active {
    color: #ffffff;
    background: linear-gradient(135deg, #7a72d6, #6993ec);
    box-shadow: 0 6px 18px rgba(106, 102, 216, 0.36);
    transform: translateY(-1px);
  }
}

.home-v2-hero__tab-icon {
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  line-height: 0;

  :deep(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-v2-hero__preview,
  .home-v2-hero__brand,
  .home-v2-hero__tag,
  .home-v2-hero__stage {
    animation-duration: 0.001ms !important;
  }
}

@media (max-width: 820px) {
  .home-v2-hero__stage { width: calc(100% + 40px); height: 148px; margin-top: 0; border-radius: 0 0 20px 20px; }
  .home-v2-hero__brand { left: 20px; }
}

/* ===================== 居中登录卡(二次精修版) ===================== */
.creation-hero { position:relative; z-index:2; display:grid; grid-template-columns:1.05fr .95fr; width:min(1180px,94vw); min-height:360px; overflow:hidden; border:1px solid rgba(255,255,255,.14); border-radius:30px; background:linear-gradient(120deg,rgba(26,19,39,.94),rgba(32,18,34,.78)); box-shadow:0 28px 80px rgba(0,0,0,.28); }
.hero-copy { position:relative; z-index:2; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; padding:52px 58px; }.hero-kicker { margin-bottom:18px; color:#ff9a68; font-size:11px; font-weight:700; letter-spacing:.2em; }.hero-copy h1 { margin:0; max-width:560px; color:#fff; font-size:clamp(38px,5vw,66px); line-height:1.02; letter-spacing:-.055em; }.hero-copy p { max-width:510px; margin:20px 0 28px; color:rgba(255,255,255,.64); font-size:15px; line-height:1.8; }.hero-primary { display:inline-flex; align-items:center; gap:9px; padding:12px 18px; border:0; border-radius:999px; background:linear-gradient(135deg,#ff792d,#ff4d6d); color:#fff; font-weight:650; cursor:pointer; box-shadow:0 10px 24px rgba(255,92,54,.25); }.hero-primary span { margin-left:8px; font-size:18px; }
.hero-visual { position:relative; min-height:360px; overflow:hidden; background:radial-gradient(circle at 72% 35%,rgba(255,105,41,.38),transparent 28%),radial-gradient(circle at 26% 76%,rgba(93,72,255,.42),transparent 34%); }.hero-visual::after { content:""; position:absolute; inset:12% 9%; border:1px solid rgba(255,255,255,.14); border-radius:50%; transform:rotate(-18deg) scaleY(.55); box-shadow:0 0 0 24px rgba(255,255,255,.025),0 0 0 48px rgba(255,255,255,.018); }.orb { position:absolute; border-radius:50%; filter:blur(2px); }.orb-one { width:190px; height:190px; right:17%; top:18%; background:linear-gradient(145deg,#ffb565,#e85524); box-shadow:inset -25px -28px 50px rgba(63,13,0,.32),0 20px 50px rgba(255,93,40,.2); }.orb-two { width:100px; height:100px; left:10%; bottom:9%; background:#684dff; opacity:.8; filter:blur(13px); }.visual-card { position:absolute; z-index:2; display:flex; flex-direction:column; justify-content:space-between; width:210px; height:250px; padding:22px; border:1px solid rgba(255,255,255,.25); border-radius:22px; backdrop-filter:blur(15px); box-shadow:0 25px 45px rgba(0,0,0,.28); }.visual-card span { color:rgba(255,255,255,.76); font-size:9px; letter-spacing:.13em; }.visual-card strong { color:#fff; font-size:50px; line-height:.9; letter-spacing:-.07em; }.visual-card small { color:rgba(255,255,255,.66); }.card-back { right:43%; top:60px; transform:rotate(-9deg); background:rgba(117,58,255,.28); }.card-front { right:10%; top:48px; transform:rotate(8deg); background:linear-gradient(145deg,rgba(255,137,55,.78),rgba(68,16,4,.5)); }
.landing-intro {
  position: relative;
  z-index: 2;
  width: min(1180px, 94vw);
  padding: 34px 38px 30px;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(28, 27, 53, .88), rgba(17, 24, 43, .72));
  box-shadow: 0 24px 70px rgba(0,0,0,.22), inset 0 1px rgba(255,255,255,.08);
  backdrop-filter: blur(20px);
}
.landing-copy { max-width: 700px; }
.landing-kicker { color:#ff7417; font-size:11px; font-weight:700; letter-spacing:.18em; }
.landing-copy h1 { margin:10px 0 10px; color:#fff; font-size:clamp(32px,5vw,58px); line-height:1.04; letter-spacing:-.05em; }
.landing-copy p { margin:0; color:rgba(255,255,255,.64); font-size:15px; line-height:1.8; }
.landing-cta { display:inline-flex; align-items:center; gap:12px; margin-top:20px; padding:11px 18px; border:0; border-radius:999px; background:#ff7417; color:#fff; font-weight:650; cursor:pointer; box-shadow:0 10px 22px rgba(255,116,23,.22); }
.landing-cta span { font-size:18px; }
.landing-entry-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:28px; }
.landing-entry { display:flex; flex-direction:column; min-height:138px; padding:18px; border-radius:18px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.1); }
.landing-entry .entry-icon { display:grid; place-items:center; width:42px; height:42px; margin-bottom:16px; border-radius:13px; font-size:20px; }
.landing-entry strong { color:#fff; font-size:16px; }
.landing-entry small { margin-top:7px; color:rgba(255,255,255,.55); font-size:12px; line-height:1.5; }
.landing-entry.orange .entry-icon { color:#f36b12; background:#fff0e5; }
.landing-entry.violet .entry-icon { color:#7654e8; background:#f0ebff; }
.landing-entry.blue .entry-icon { color:#2478db; background:#e8f3ff; }
.landing-entry.green .entry-icon { color:#149b76; background:#e5f8f1; }
.landing-resource-strip { display:grid; grid-template-columns:1.5fr 1fr 1fr; gap:12px; align-items:center; margin-top:14px; padding:14px; border-radius:18px; background:rgba(245,245,249,.82); }
.landing-resource-strip > div:first-child { padding:0 10px; }
.landing-resource-strip > div:first-child span { color:#ff7417; font-size:10px; font-weight:700; letter-spacing:.13em; }
.landing-resource-strip > div:first-child strong { display:block; margin-top:5px; color:#3a3a43; font-size:13px; }
.resource-pill { display:flex; align-items:center; gap:10px; padding:11px 13px; border-radius:13px; background:#fff; color:#ff7417; }
.resource-pill > span { display:flex; flex-direction:column; }
.resource-pill b { color:#33333b; font-size:13px; }
.resource-pill small { margin-top:3px; color:#92929b; font-size:11px; }
.creative-showcase { position:relative; z-index:2; width:min(1180px,94vw); padding:36px 0 34px; overflow:hidden; border:1px solid rgba(96,94,156,.14); border-radius:28px; background:linear-gradient(135deg,rgba(255,255,255,.82),rgba(241,240,255,.76) 56%,rgba(255,241,232,.72)); box-shadow:0 24px 70px rgba(71,81,127,.13); }
.showcase-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:30px; padding:0 38px 25px; }
.showcase-heading > div { flex:none; }
.showcase-heading span { color:#e56a38; font-size:10px; font-weight:750; letter-spacing:.18em; }
.showcase-heading h2 { margin:9px 0 0; color:#293149; font-size:clamp(27px,4vw,43px); line-height:1.05; letter-spacing:-.045em; }
.showcase-heading p { max-width:510px; margin:0; color:#68758d; font-size:13px; line-height:1.75; }
.showcase-viewport { position:relative; overflow:hidden; mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent); -webkit-mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent); }
.showcase-track { display:flex; width:max-content; gap:14px; padding:4px 7px 10px; animation:showcaseMarquee 62s linear infinite; will-change:transform; }
.director-track { animation-name:showcaseMarqueeReverse; animation-duration:72s; }
.showcase-viewport:hover .showcase-track { animation-play-state:paused; }
.showcase-card { position:relative; width:196px; aspect-ratio:4/5; flex:none; overflow:hidden; border-radius:19px; background:#dfe3ec; box-shadow:0 13px 30px rgba(44,50,77,.14); transform:translateZ(0); }
.showcase-card img { display:block; width:100%; height:100%; object-fit:cover; transition:transform .5s cubic-bezier(.16,1,.3,1); }
.showcase-card:hover img { transform:scale(1.045); }
.showcase-card::after { content:""; position:absolute; inset:38% 0 0; background:linear-gradient(transparent,rgba(10,14,25,.86)); pointer-events:none; }
.showcase-card-copy { position:absolute; z-index:1; left:16px; right:16px; bottom:15px; display:flex; flex-direction:column; gap:5px; color:#fff; }
.showcase-card-copy span { color:rgba(255,255,255,.72); font-size:9px; font-weight:700; letter-spacing:.14em; }
.showcase-card-copy strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:15px; font-weight:650; text-shadow:0 2px 12px rgba(0,0,0,.28); }
@keyframes showcaseMarquee { to { transform:translateX(calc(-50% - 7px)); } }
@keyframes showcaseMarqueeReverse { from { transform:translateX(calc(-50% - 7px)); } to { transform:translateX(0); } }
.landing-section { position:relative; z-index:2; width:min(1180px,94vw); padding:42px 38px; border-top:1px solid rgba(255,255,255,.12); }
.section-heading span { color:#ff7b37; font-size:10px; font-weight:750; letter-spacing:.18em; }
.section-heading h2 { margin:10px 0 8px; color:#fff; font-size:clamp(28px,4vw,46px); letter-spacing:-.045em; }
.section-heading p { max-width:620px; margin:0; color:rgba(255,255,255,.58); font-size:14px; line-height:1.8; }
.workflow-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:26px; }
.workflow-card { min-height:310px; padding:10px; border:1px solid rgba(255,255,255,.11); border-radius:22px; background:rgba(255,255,255,.065); box-shadow:inset 0 1px rgba(255,255,255,.08); overflow:hidden; }
.workflow-copy { padding:17px 10px 12px; }.workflow-card b { color:#ff7b37; font-size:11px; letter-spacing:.14em; }.workflow-card h3 { margin:7px 0 0; color:#fff; font-size:17px; }.workflow-card p { margin:7px 0 0; color:rgba(255,255,255,.55); font-size:12px; line-height:1.6; }
.workflow-visual { position:relative; height:174px; overflow:hidden; border-radius:15px; background:#e9edf6; box-shadow:inset 0 0 0 1px rgba(70,80,120,.08); }
.workflow-visual img { display:block; width:100%; height:100%; object-fit:cover; transition:transform .65s cubic-bezier(.16,1,.3,1); }
.workflow-card:hover .workflow-visual img { transform:scale(1.045); }
.why-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:26px; }.why-grid article { padding:24px; border-radius:18px; background:linear-gradient(135deg,rgba(111,91,255,.2),rgba(255,255,255,.05)); border:1px solid rgba(255,255,255,.1); }.why-grid strong { color:#fff; font-size:17px; }.why-grid p { margin:10px 0 0; color:rgba(255,255,255,.56); font-size:13px; line-height:1.75; }
.final-cta { position:relative; z-index:2; display:flex; align-items:center; justify-content:space-between; gap:20px; width:min(1180px,94vw); margin:8px 0 20px; padding:30px 36px; border:1px solid rgba(255,255,255,.14); border-radius:22px; background:linear-gradient(100deg,rgba(255,91,60,.18),rgba(96,74,255,.2)); }.final-cta span { color:#ff9463; font-size:10px; font-weight:700; letter-spacing:.16em; }.final-cta h2 { margin:8px 0 0; color:#fff; font-size:clamp(22px,3vw,34px); letter-spacing:-.04em; }.final-cta button { flex:none; padding:13px 18px; border:0; border-radius:999px; background:#fff; color:#20212b; font-weight:700; cursor:pointer; }.final-cta button span { margin-left:9px; color:#ff6b31; font-size:18px; }
.loginModal { position:fixed; inset:0; z-index:20; display:grid; place-items:center; padding:20px; background:rgba(5,7,14,.56); backdrop-filter:blur(10px); }
.loginShell { display:grid; grid-template-columns:minmax(360px, 1.12fr) minmax(360px, .88fr); width:min(980px, 96vw); max-height:min(680px, calc(100vh - 40px)); overflow:hidden; border:1px solid rgba(255,255,255,.16); border-radius:26px; background:#12131e; box-shadow:0 30px 100px rgba(0,0,0,.45); }
.loginVisual { position:relative; min-height:560px; overflow:hidden; background:radial-gradient(circle at 76% 22%,rgba(255,113,50,.36),transparent 28%),radial-gradient(circle at 22% 82%,rgba(90,72,255,.42),transparent 35%),linear-gradient(145deg,#17152c,#241526 56%,#121824); }
.loginVisual::after { content:""; position:absolute; inset:12% 9%; border:1px solid rgba(255,255,255,.13); border-radius:50%; transform:rotate(-18deg) scaleY(.52); box-shadow:0 0 0 22px rgba(255,255,255,.025),0 0 0 44px rgba(255,255,255,.018); }
.loginVisualGlow { position:absolute; inset:0; background:linear-gradient(145deg,transparent 35%,rgba(255,92,49,.2) 70%,transparent); mix-blend-mode:screen; }
.loginVisualOrb { position:absolute; border-radius:50%; filter:blur(2px); }.orb-main { width:250px;height:250px;right:9%;top:18%;background:linear-gradient(145deg,#ffb66b,#e84e2b);box-shadow:inset -32px -35px 65px rgba(55,8,0,.35),0 25px 60px rgba(255,92,46,.25); }.orb-small{width:90px;height:90px;left:10%;bottom:19%;background:#6752ff;filter:blur(14px);opacity:.82}
.loginVisual-card { position:absolute; z-index:2; display:flex; flex-direction:column; justify-content:space-between; border:1px solid rgba(255,255,255,.25); border-radius:18px; color:#fff; backdrop-filter:blur(14px); box-shadow:0 22px 50px rgba(0,0,0,.28); }.loginVisual-card span { color:rgba(255,255,255,.72); font-size:8px; letter-spacing:.12em; }.loginVisual-card.card-a { width:180px;height:220px;right:26%;top:74px;padding:20px;transform:rotate(-8deg);background:rgba(103,77,255,.25); }.loginVisual-card.card-a strong { font-size:38px;line-height:.95;letter-spacing:-.07em; }.loginVisual-card.card-a small { color:rgba(255,255,255,.62); }.loginVisual-card.card-b { width:142px;height:120px;right:4%;bottom:80px;padding:17px;transform:rotate(8deg);background:linear-gradient(145deg,rgba(255,132,61,.72),rgba(68,17,8,.52)); }.loginVisual-card.card-b b { font-size:45px; letter-spacing:-.08em; }.loginVisualCopy { position:absolute; z-index:3; left:30px; right:30px; bottom:27px; }.loginVisualCopy span { color:#ff9b6d; font-size:9px; font-weight:700; letter-spacing:.16em; }.loginVisualCopy h2 { margin:9px 0 8px; color:#fff; font-size:27px; line-height:1.08; letter-spacing:-.045em; }.loginVisualCopy p { max-width:310px; margin:0; color:rgba(255,255,255,.58); font-size:12px; line-height:1.6; }
.loginModal .loginCard { max-height:calc(100vh - 40px); }
.loginClose { position:absolute; top:12px; right:16px; z-index:2; width:30px; height:30px; border:0; border-radius:50%; background:#f2f2f5; color:#666; font-size:22px; line-height:1; cursor:pointer; }
@media (max-width: 820px) { .landing-entry-grid { grid-template-columns:repeat(2,1fr); } .landing-resource-strip { grid-template-columns:1fr; } }
@media (max-width: 520px) { .landing-intro { padding:24px 20px; } .landing-entry-grid { grid-template-columns:1fr 1fr; } }
@media (max-width: 760px) { .workflow-grid { grid-template-columns:repeat(2,1fr); } .why-grid { grid-template-columns:1fr; } .final-cta { align-items:flex-start; flex-direction:column; padding:26px 24px; } }
@media (max-width: 820px) { .creation-hero { grid-template-columns:1fr; } .hero-visual { min-height:270px; } .hero-copy { padding:40px 30px 24px; } }
@media (max-width: 760px) { .loginShell { grid-template-columns:1fr; max-height:calc(100vh - 24px); } .loginVisual { display:none; } .loginCard { min-width:0; } }
@media (max-width: 760px) { .creative-showcase { padding-top:28px; }.showcase-heading { align-items:flex-start; flex-direction:column; gap:12px; padding:0 24px 22px; }.showcase-card { width:156px; border-radius:16px; }.showcase-card-copy { left:12px; right:12px; bottom:12px; }.showcase-card-copy strong { font-size:13px; } }
@media (prefers-reduced-motion: reduce) { .showcase-track { animation-play-state:paused; }.showcase-viewport { overflow-x:auto; mask-image:none; -webkit-mask-image:none; } }

/* XOi light creative direction: photography studio / short-drama workspace */
.loginPage { background:#edf1f8; color:#252936; }
.home-v2-hero__stage,.creation-hero,.landing-intro,.creative-showcase,.landing-section,.final-cta { width:min(1680px,calc(100vw - 56px)); }
.landing-section { box-sizing:border-box; }
.loginBg { background-color:#edf1f8; background-image:linear-gradient(rgba(73,93,140,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(73,93,140,.055) 1px,transparent 1px),radial-gradient(62% 50% at 12% 8%,rgba(157,183,255,.5),transparent 70%),radial-gradient(55% 62% at 88% 16%,rgba(255,190,151,.42),transparent 70%),radial-gradient(62% 60% at 56% 100%,rgba(209,194,255,.4),transparent 70%),linear-gradient(135deg,#f8f9fd,#e8edf8 58%,#eef0fb); background-size:48px 48px,48px 48px,auto,auto,auto,auto; }
.loginBg::before { background:radial-gradient(ellipse at center,transparent 15%,rgba(55,67,100,.08) 100%); }.loginBg::after { background:linear-gradient(135deg,rgba(255,255,255,.24),rgba(220,227,245,.08)); }
.home-v2-hero__stage { border-color:rgba(74,89,137,.16); box-shadow:0 20px 55px rgba(69,83,129,.16),0 0 80px rgba(126,114,214,.12); }
.home-v2-hero__bg { background:radial-gradient(80% 150% at 86% 15%,rgba(255,143,92,.42),transparent 62%),radial-gradient(90% 140% at 12% 90%,rgba(115,133,255,.46),transparent 66%),linear-gradient(135deg,rgba(246,248,255,.96),rgba(222,230,250,.86)); opacity:.94; }
.hero-platform-bar { background:linear-gradient(180deg,rgba(255,255,255,.8),rgba(255,255,255,.2)); border-color:rgba(77,91,135,.12); }.hero-platform-brand { color:#2f3850; }.hero-platform-login { border-color:rgba(104,93,201,.2); background:rgba(255,255,255,.64); color:#504a84; box-shadow:0 8px 22px rgba(80,93,145,.12); }
.home-v2-hero__tag { color:#4d5470; background:rgba(255,255,255,.68); border-color:rgba(104,116,179,.25); box-shadow:0 5px 14px rgba(80,93,145,.12); }.home-v2-hero__tabs { background:rgba(255,255,255,.68); border-color:rgba(104,116,179,.2); box-shadow:0 10px 26px rgba(80,93,145,.13); }.home-v2-hero__tab { color:#6c7089; }.home-v2-hero__tab:hover { color:#4d4b7f; background:rgba(126,114,214,.12); }
.creation-hero { background:linear-gradient(120deg,rgba(246,242,255,.94),rgba(255,239,229,.9)); border-color:rgba(96,94,156,.14); box-shadow:0 24px 70px rgba(74,77,124,.16); }.hero-copy h1 { color:#252b3e; }.hero-copy p { color:#657087; }.hero-kicker { color:#e56a38; }
.landing-intro { background:linear-gradient(135deg,rgba(255,255,255,.76),rgba(240,239,255,.72)); border-color:rgba(106,113,169,.16); box-shadow:0 24px 70px rgba(71,81,127,.14),inset 0 1px rgba(255,255,255,.9); }.landing-copy h1 { color:#262c40; }.landing-copy p { color:#69748d; }.landing-entry { background:rgba(255,255,255,.7); border-color:rgba(89,103,157,.1); box-shadow:0 10px 26px rgba(79,91,143,.07); }.landing-entry strong { color:#2c3346; }.landing-entry small { color:#78839a; }.landing-resource-strip { background:rgba(232,235,247,.7); }.landing-resource-strip > div:first-child strong { color:#464e67; }.resource-pill { background:rgba(255,255,255,.8); }
.landing-section { border-color:rgba(77,91,135,.15); }.section-heading h2 { color:#293149; }.section-heading p { color:#68758d; }.workflow-card { background:rgba(255,255,255,.68); border-color:rgba(89,103,157,.13); box-shadow:0 12px 30px rgba(79,91,143,.06); }.workflow-card h3 { color:#30384e; }.workflow-card p { color:#718099; }.why-grid article { background:linear-gradient(135deg,rgba(224,218,255,.72),rgba(255,255,255,.5)); border-color:rgba(89,103,157,.13); }.why-grid strong { color:#30384e; }.why-grid p { color:#6d7890; }.final-cta { background:linear-gradient(100deg,rgba(255,221,199,.72),rgba(218,215,255,.72)); border-color:rgba(89,103,157,.15); }.final-cta h2 { color:#2c3348; }
@media(max-width:760px){.home-v2-hero__stage,.creation-hero,.landing-intro,.creative-showcase,.landing-section,.final-cta{width:calc(100vw - 28px)}.workflow-grid{grid-template-columns:1fr}.workflow-card{min-height:290px}}
.loginCard {
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  width: auto;
  min-width: 360px;
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

  // 右上角的轻量注册入口提示
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
.auth-switch { display:flex; gap:24px; margin-top:20px; border-bottom:1px solid rgba(120,110,170,.14); }.auth-switch button { position:relative; padding:0 2px 10px; border:0; background:transparent; color:#9995ad; font-size:13px; cursor:pointer; }.auth-switch button.active { color:#5e56c9; font-weight:650; }.auth-switch button.active::after { content:""; position:absolute; right:0; bottom:-1px; left:0; height:2px; border-radius:2px; background:#6b63e6; }

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

  .loginAlert {
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

  .loginBtn {
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

  .registerTip {
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

  /* === 图形验证码组(凭据反爆破弹窗式 · 沿用家族 focus 紫晕皮) === */
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
  .home-v2-hero__stage {
    width: 92vw;
    height: 92px;
    border-radius: 16px;
  }

  .loginCard {
    padding: 30px 24px 26px;
  }
}

// 底部版权
.loginFooter {
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
