<template>
  <main class="viralPage">
    <section class="hero" aria-labelledby="viral-title">
      <div class="heroCopy">
        <div class="eyebrow">创作工具 <span>/</span> 视频与图片</div>
        <h1 id="viral-title">爆款复刻<span>从参考，到你的作品</span></h1>
        <p>拆解好内容的结构与镜头，用你的商品和品牌重新表达。</p>
      </div>
      <ol class="heroFlow" aria-label="复刻流程"><li><span>01</span>上传参考</li><li><span>02</span>编辑分镜</li><li><span>03</span>逐镜生成</li><li><span>04</span>剪辑导出</li></ol>
    </section>

    <nav class="moduleTabs" aria-label="爆款复刻能力">
      <button v-for="item in modules" :key="item.key" :disabled="working" :class="{ active: activeModule === item.key }" @click="activeModule = item.key">
        <span class="tabIcon"><t-icon :name="item.key === 'oneclick' ? 'film' : item.key === 'reverse' ? 'search' : item.key === 'image' ? 'image' : 'play-circle'" /></span>
        <span class="tabText"><strong>{{ item.title }}</strong><small>{{ item.subtitle }}</small></span>
        <span class="tabArrow">↗</span>
      </button>
    </nav>

    <section v-if="activeModule !== 'motion' && (catalogLoading || catalogError || readinessIssues.length)" class="modelReadiness" role="status">
      <t-icon :name="catalogError ? 'error-circle' : 'info-circle'" />
      <div><strong>{{ catalogLoading ? '正在检查模型能力…' : catalogError ? '模型目录暂时连接不上' : '还差一步，配置好模型即可开始' }}</strong><p>{{ catalogError || readinessIssues.join('；') }}<template v-if="!catalogLoading && !catalogError">。未就绪阶段不会提交 AI 请求或扣费。</template></p><small v-if="!catalogLoading && !catalogError">接入模型不等于支持所有用途；管理员需在渠道与模型资料中确认对应输入能力和规格。本地抽帧仍可免费使用。</small></div>
      <button type="button" :disabled="catalogLoading" @click="retryCatalog">{{ catalogLoading ? '检查中' : '重新检查' }}</button>
    </section>

    <section class="workspace">
      <div class="workPanel">
        <header class="panelHeader">
          <div>
            <span class="stepTag">{{ activeModule === 'motion' ? '免费本地工具' : '创作工作区' }}</span>
            <h2>{{ activeMeta.title }}</h2>
            <p>{{ activeMeta.description }}</p>
          </div>
          <span class="privacyBadge">草稿与素材保存到账号云端 · AI 会读取参考素材</span>
        </header>

        <div v-if="activeModule === 'oneclick'" class="toolBody">
          <div class="draftToolbar"><span role="status">{{ storageStatus }} · 不会自动发起生成</span><button :disabled="working || restoring" @click="newDraft">＋ 新建任务</button></div>
          <fieldset :disabled="working || restoring" class="settingsFieldset">
          <div class="linkResolver">
            <div class="resolverIcon">↗</div>
            <div class="resolverMain">
              <div class="resolverHeading"><strong>粘贴分享链接，一键获取对标视频</strong><span>抖音 · Bilibili · 视频直链</span></div>
              <div class="resolverInput"><t-input v-model="oneclick.shareLink" size="large" placeholder="可直接粘贴整段分享文案，系统会自动识别其中的链接" @enter="resolveRemote('oneclick')" /><t-button size="large" variant="outline" :loading="resolving === 'oneclick'" @click="resolveRemote('oneclick')">获取视频</t-button></div>
              <div v-if="oneclick.remote" class="resolvedSource">
                <img v-if="oneclick.remote.cover" :src="oneclick.remote.cover" />
                <div class="resolvedFallback" v-else>▶</div>
                <div><span>{{ platformName(oneclick.remote.platform) }}</span><strong>{{ oneclick.remote.title }}</strong><small>{{ oneclick.remote.duration ? formatTime(oneclick.remote.duration) : '时长将在读取后获取' }}</small></div>
                <button @click="clearRemote('oneclick')">更换</button>
              </div>
            </div>
          </div>
          <div class="sourceDivider"><span>或者上传本地素材</span></div>
          <div class="sourceGrid">
            <UploadCard title="对标视频" hint="MP4 / WebM，建议 5–60 秒；素材会保存到账号云端" accept="video/mp4,video/webm" :file="oneclick.video || (oneclick.videoAsset && { name: oneclick.videoAsset.name, size: oneclick.videoAsset.bytes })" kind="video" required @change="setLocalVideo('oneclick', $event)" />
            <UploadCard title="商品或品牌图" hint="用于替换原片主体，可选" accept="image/*" :file="oneclick.product || (oneclick.productAsset && { name: oneclick.productAsset.name, size: oneclick.productAsset.bytes })" kind="image" @change="oneclick.product = $event; oneclick.productAsset = undefined" />
          </div>
          <div class="phoneUploadEntry"><t-button variant="outline" @click="phoneUploadOpen = true">手机扫码传商品图</t-button><small>同账号登录 · 图片自动传回这里 · 不调用 AI</small></div>
          <div class="settingsCard">
            <div class="settingsTitle"><strong>生成设置</strong><span>模型变化时，价格提示会同步更新</span></div>
            <div class="modelGrid three">
              <label><span>① 视频理解模型</span><model-select v-model="oneclick.visionModel" type="text" capability="vision" size="large" placeholder="选择视觉理解模型" /></label>
              <label><span>② 分镜生图模型</span><model-select v-model="oneclick.imageModel" type="image" capability="reference" size="large" placeholder="选择参考图模型" /></label>
              <label><span>③ 视频生成模型</span><model-select v-model="oneclick.videoModel" type="video" capability="reference" size="large" placeholder="选择图生视频模型" /><small v-if="oneclick.videoModel && !completeVideoSpec">当前型号缺少已确认的时长、清晰度或比例，暂不提交视频。</small></label>
            </div>
            <div class="inlineSettings">
              <label><span>默认单镜时长</span><t-select v-model="oneclick.seconds" :disabled="!videoSpec.durations.length"><t-option v-for="value in videoSpec.durations" :key="value" :value="value" :label="`${value} 秒`" /></t-select></label>
              <label><span>画面比例</span><t-select v-model="oneclick.ratio" :disabled="!videoSpec.ratios.length"><t-option v-for="value in videoSpec.ratios" :key="value" :value="value" :label="value" /></t-select></label>
              <label><span>清晰度</span><t-select v-model="oneclick.resolution" :disabled="!videoSpec.resolutions.length"><t-option v-for="value in videoSpec.resolutions" :key="value" :value="value" :label="value" /></t-select></label>
            </div>
            <div class="inlineSettings">
              <label class="checkRow"><input v-model="oneclick.pace" type="checkbox" /><span><strong>爆款节奏</strong><small>全部镜头压成 5 秒快切，节奏更密</small></span></label>
              <label><span>目标市场（出海）</span><t-select v-model="oneclick.market" clearable><t-option v-for="value in MARKETS" :key="value" :value="value" :label="value" /></t-select></label>
              <label><span>文案语言（出海）</span><t-select v-model="oneclick.language" clearable><t-option v-for="value in LANGUAGES" :key="value" :value="value" :label="value" /></t-select></label>
            </div>
            <small class="specNote">每阶段单独确认费用。规格缺失的模型不提交；更换模型后请检查镜头时长。出海选项只在拆解阶段注入文案与表达习惯。</small>
          </div>

          <div v-if="shots.length" class="pipelineResult">
            <div class="resultHeading"><div><span class="liveDot"></span><strong>已拆出 {{ shots.length }} 个镜头</strong><button type="button" class="miniAction" :disabled="working || restoring" @click="addShot">＋ 加一镜</button></div><span>{{ oneclickSummary }}</span></div>
            <details class="promptPreview">
              <summary>提示词预览（提交前核对，不发请求）</summary>
              <div class="previewBody">
                <p><b>拆解阶段</b>：视觉模型看抽帧，输出分镜 JSON。</p>
                <p v-for="shot in shots" :key="`pp-${shot.id}`"><b>镜 {{ shot.no }} 故事板</b>：{{ boardPrompt(shot) }}</p>
                <p><b>成片阶段</b>：每镜用故事板图生视频，prompt = 场景 + 运镜 + 文案，要求与首帧一致。</p>
              </div>
            </details>
            <div class="voiceRow">
              <model-select v-model="voiceModel" type="audio" size="small" placeholder="选择语音合成模型" />
              <t-button size="small" variant="outline" :disabled="working || !voiceModel" @click="generateVoiceover">生成口播配音</t-button>
              <small>对有文案的镜头逐镜合成配音 · 与视频分开计费</small>
            </div>
            <div v-if="completedClips === shots.length && shots.length > 1" class="sequencePlayer">
              <div class="spHead"><strong>连播预览</strong><span>自动接播全部镜头 · 共 {{ totalSeconds }} 秒</span>
                <div class="spActions">
                  <button type="button" @click="toggleSequence">{{ sequencePlaying ? "暂停" : "连播" }}</button>
                  <button type="button" :disabled="sequenceIndex <= 0" @click="jumpSequence(sequenceIndex - 1)">‹</button>
                  <button type="button" :disabled="sequenceIndex >= shots.length - 1" @click="jumpSequence(sequenceIndex + 1)">›</button>
                  <button type="button" @click="downloadAllClips">下载全部片段</button>
                </div>
              </div>
              <div class="spStage">
                <video ref="sequenceVideoRef" :key="shots[sequenceIndex]?.id" :src="shots[sequenceIndex]?.clip" controls :autoplay="sequencePlaying" @ended="onSequenceEnded"></video>
                <audio v-if="shots[sequenceIndex]?.ttsUrl" ref="sequenceAudioRef" :src="shots[sequenceIndex]?.ttsUrl"></audio>
              </div>
              <div class="spChips">
                <button v-for="(shot, i) in shots" :key="`sp-${shot.id}`" type="button" :class="{ active: i === sequenceIndex }" @click="jumpSequence(i)">{{ i + 1 }}</button>
                <label v-if="hasAnyTts"><input v-model="sequenceWithTts" type="checkbox" />同步配音</label>
              </div>
            </div>
            <div class="shotRail">
              <article v-for="shot in shots" :key="shot.id" class="shotCard">
                <div class="shotPreview">
                  <video v-if="shot.clip" :src="shot.clip" controls muted></video>
                  <img v-else-if="shot.board || shot.frame" :src="shot.board || shot.frame" />
                  <div v-else class="shotPlaceholder">{{ String(shot.no).padStart(2, '0') }}</div>
                  <span>{{ shot.status }}</span>
                </div>
                <strong>镜头 {{ shot.no }} <span>{{ shot.seconds }} 秒</span></strong>
                <template v-if="!shot.board && !shot.taskId && !['unknown', 'submitting'].includes(shot.boardState || '')">
                  <label>时长<t-select v-model="shot.seconds"><t-option v-for="value in videoSpec.durations" :key="value" :value="value" :label="`${value} 秒`" /></t-select></label>
                  <label>画面<textarea v-model="shot.scene" rows="3" maxlength="3000" /></label>
                  <label>运镜<textarea v-model="shot.camera" rows="2" maxlength="1000" /></label>
                  <label>文案／旁白<textarea v-model="shot.copy" rows="2" maxlength="2000" /></label>
                </template>
                <div v-else class="shotDetails"><p>{{ shot.scene }}</p><small>运镜 · {{ shot.camera }}</small><p v-if="shot.copy">文案 · {{ shot.copy }}</p></div>
                <p v-if="shot.error" class="shotError" role="alert">{{ shot.error }}</p>
                <div class="shotActions">
                  <button v-if="shot.clip" @click="downloadUrl(shot.clip!, `镜头-${shot.no}.mp4`)">下载片段</button>
                  <button type="button" class="dangerAction" :disabled="working || restoring" @click="removeShot(shot.id)">删除镜头</button>
                </div>
              </article>
            </div>
          </div>
          </fieldset>

          <footer class="actionBar">
            <div class="costStack">
              <strong>1 元 = 10 积分 · 确认后才提交</strong>
              <span>{{ shots.length }} 镜 · 共 {{ totalSeconds }} 秒 · {{ completedClips }} 个视频完成{{ oneclick.pace ? " · 爆款节奏" : "" }}{{ oneclick.market !== "不限" || oneclick.language !== "不限" ? ` · 出海（${oneclick.market}／${oneclick.language}）` : "" }}</span>
              <small>{{ boardCandidates(shots).length }} 张故事板待生成，{{ videoCandidates(shots).length }} 段视频待提交。已完成不重复生成。</small>
              <small>分析按文字与图片实际用量结算；本流程以故事板图生视频，不额外计参考视频 ×1.5。</small>
            </div>
            <div class="stageActions">
              <t-button v-if="pendingClips" variant="outline" :disabled="working" @click="resumePending">查询 {{ pendingClips }} 个已有任务（不重新生成）</t-button>
              <t-button v-if="!shots.length" theme="primary" :loading="working" :disabled="restoring || catalogLoading || !selectedVisionReady" @click="startOneclick">{{ selectedVisionReady ? '拆解视频并编辑分镜' : '需先配置视觉理解模型' }}</t-button>
              <t-button v-else-if="boardCandidates(shots).length" theme="primary" :loading="working" :disabled="!selectedImageReady" @click="generateAllBoards">查看报价 · 生成缺少的故事板</t-button>
              <t-button v-else-if="shots.every(s => s.board) && videoCandidates(shots).length" theme="primary" :loading="working" :disabled="!completeVideoSpec" @click="generateAllVideos">查看报价 · 生成未完成的视频</t-button>
              <t-button v-if="completedClips === shots.length && shots.length" theme="primary" :disabled="working" @click="openEditor">进入剪辑并导出完整视频</t-button>
              <button v-if="working" @click="stopRequested = true">停止后续镜头（已提交任务继续）</button>
            </div>
          </footer>
        </div>

        <div v-else-if="activeModule === 'reverse'" class="toolBody">
          <div class="linkResolver">
            <div class="resolverIcon">↗</div>
            <div class="resolverMain">
              <div class="resolverHeading"><strong>从分享链接读取视频</strong><span>支持抖音 / B站分享文案和视频直链</span></div>
              <div class="resolverInput"><t-input v-model="reverse.shareLink" size="large" placeholder="粘贴链接或整段分享文案" @enter="resolveRemote('reverse')" /><t-button size="large" variant="outline" :loading="resolving === 'reverse'" @click="resolveRemote('reverse')">获取视频</t-button></div>
              <div v-if="reverse.remote" class="resolvedSource">
                <img v-if="reverse.remote.cover" :src="reverse.remote.cover" /><div class="resolvedFallback" v-else>▶</div>
                <div><span>{{ platformName(reverse.remote.platform) }}</span><strong>{{ reverse.remote.title }}</strong><small>{{ reverse.remote.duration ? formatTime(reverse.remote.duration) : '已就绪' }}</small></div>
                <button @click="clearRemote('reverse')">更换</button>
              </div>
            </div>
          </div>
          <div class="sourceDivider"><span>或者上传本地素材</span></div>
          <UploadCard title="上传对标视频" hint="系统会在浏览器中均匀抽取关键帧，再交给所选模型分析" accept="video/*" :file="reverse.video" kind="video" wide required @change="setLocalVideo('reverse', $event)" />
          <div class="settingsCard compactCard">
            <div class="modelGrid two">
              <label><span>分析模型</span><model-select v-model="reverse.model" type="text" capability="vision" size="large" placeholder="选择支持视觉理解的模型" /></label>
              <label><span>分析深度</span><t-select v-model="reverse.depth" size="large"><t-option :value="6" label="快速 · 6 帧" /><t-option :value="9" label="标准 · 9 帧" /><t-option :value="12" label="精细 · 12 帧" /></t-select><small>帧数越多，镜头与节奏判断越细</small></label>
            </div>
          </div>
          <div v-if="reverseResult" class="analysisResult">
            <div class="analysisTop"><span>AI 拆解结果</span><button @click="copyReversePrompt">复制完整提示词</button></div>
            <div class="analysisGrid">
              <article v-for="item in reverseCards" :key="item.label"><small>{{ item.label }}</small><p>{{ item.value || '—' }}</p></article>
            </div>
            <div class="promptBox"><small>可复用提示词</small><p>{{ reverseResult.prompt || reverseResult.prompt_en }}</p></div>
          </div>
          <footer class="actionBar">
            <div class="costStack"><strong>分析费用 · 1 元 = 10 积分</strong><small>按文本与图片实际用量结算，不以视频大小估算 Token。提交前确认。</small></div>
            <t-button size="large" theme="primary" :loading="working" :disabled="!reverseReady" @click="runReverse">{{ reverseReady ? '开始视频反推' : '需先配置视觉理解模型' }} <span class="buttonArrow">→</span></t-button>
          </footer>
        </div>

        <div v-else-if="activeModule === 'image'" class="toolBody">
          <div class="sourceGrid">
            <UploadCard title="参考爆款图" hint="保留构图、氛围与视觉节奏" accept="image/*" :file="imageJob.reference" kind="image" required @change="imageJob.reference = $event" />
            <UploadCard title="你的商品图" hint="主体清晰、背景简洁效果更好" accept="image/*" :file="imageJob.product" kind="image" required @change="imageJob.product = $event" />
          </div>
          <div class="modeChooser">
            <button v-for="mode in imageModes" :key="mode.key" :class="{ active: imageJob.mode === mode.key }" @click="imageJob.mode = mode.key"><span>{{ mode.icon }}</span><strong>{{ mode.name }}</strong><small>{{ mode.desc }}</small></button>
          </div>
          <div class="settingsCard compactCard">
            <div class="modelGrid two">
              <label><span>图片生成模型</span><model-select v-model="imageJob.model" type="image" capability="reference" :reference-count="2" size="large" placeholder="选择支持两张参考图的模型" /></label>
              <label><span>补充要求（可选）</span><t-input v-model="imageJob.requirement" size="large" placeholder="如：保留橙色包装，适配小红书封面" /></label>
            </div>
          </div>
          <div v-if="imageResult" class="imageResult">
            <img :src="imageResult" alt="图片复刻结果" />
            <div><strong>复刻完成</strong><p>你可以下载结果，或继续调整模式和要求再次生成。</p><t-button variant="outline" @click="downloadUrl(imageResult, 'xoi-image-replicate.png')">下载图片</t-button></div>
          </div>
          <footer class="actionBar">
            <div class="costStack"><strong>生成费用</strong><ModelCostHint :model="bareModel(imageJob.model)" type="image" /><small>最终费用由 NewAPI 按所选模型实际结算。</small></div>
            <t-button size="large" theme="primary" :loading="working" :disabled="!imageReplicateReady" @click="runImageReplicate">{{ imageReplicateReady ? '生成复刻图' : '需先配置多图参考模型' }} <span class="buttonArrow">→</span></t-button>
          </footer>
        </div>

        <div v-else class="toolBody">
          <UploadCard title="上传动作参考视频" hint="素材只在浏览器本地抽帧，不上传模型、不扣费" accept="video/*" :file="motion.video" kind="video" wide required @change="motion.video = $event" />
          <div class="motionIntro">
            <div><span>01</span><strong>本地解析</strong><p>读取视频时长并均匀提取动作关键帧。</p></div>
            <div><span>02</span><strong>动作序列</strong><p>生成可视化序列，方便选择关键姿势。</p></div>
            <div><span>03</span><strong>作为参考</strong><p>下载关键帧，后续可送进画布或视频工作流。</p></div>
          </div>
          <div v-if="motionFrames.length" class="motionFrames"><article v-for="frame in motionFrames" :key="frame.time"><img :src="frame.url" /><span>{{ formatTime(frame.time) }}</span></article></div>
          <footer class="actionBar">
            <div class="costStack"><strong>本地工具 · 0 积分（¥0）</strong><small>仅提取关键帧，不生成深度图或骨骼，不调用 AI 模型。</small></div>
            <t-button size="large" theme="primary" :loading="working" @click="runMotionCapture">捕捉动作关键帧 <span class="buttonArrow">→</span></t-button>
          </footer>
        </div>
      </div>

      <aside class="historyPanel">
        <section v-if="savedDrafts.length" class="savedDrafts"><strong>可继续的复刻任务</strong><button v-for="draft in savedDrafts" :key="draft.id" :disabled="working || restoring" @click="openDraft(draft.id)"><span>{{ draft.title }}</span><small>{{ draft.shots }} 镜 · {{ draft.completed }} 完成 · 打开</small></button></section>
        <div class="historyTitle"><div><small>你的创作记录</small><strong>最近任务</strong></div><button v-if="history.length" @click="clearHistory">清空</button></div>
        <div v-if="!history.length" class="emptyHistory"><span>⌁</span><strong>还没有复刻任务</strong><p>完成的分析与生成记录会留在这里，方便继续创作。</p></div>
        <div v-else class="historyList">
          <article v-for="item in history" :key="item.id">
            <span class="historyIcon">{{ moduleByKey(item.module).icon }}</span>
            <div><strong>{{ item.title }}</strong><small>{{ item.summary }}</small><time>{{ item.createdAt }}</time></div>
            <em :class="item.status">{{ item.status === 'success' ? '完成' : '失败' }}</em>
          </article>
        </div>
        <div class="principleCard"><span>✦</span><strong>不是复制，是可控重创</strong><p>参考内容只帮助理解结构、镜头和节奏。请确保上传素材拥有合法使用权。</p></div>
      </aside>
    </section>
    <PhoneUploadDialog v-model:visible="phoneUploadOpen" @received="receivePhoneImage" />
  </main>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, reactive, ref, watch, onMounted, onBeforeUnmount, toRaw } from "vue";
import { MessagePlugin, DialogPlugin } from "tdesign-vue-next";
import { useRouter } from "vue-router";
import { formatPointsFromYuan } from "@/utils/points";
import { boardCandidates, videoCandidates, videoSettings, normalizeShots, validateVideo, validateImageReferences, supportsVision, supportsReference, submitBoard, submitVideo, pollVideoOnce, generationQuoteLines, sumQuotes, type ReplicateShot, type WorkflowModel, type QuoteLine, type WorkflowApi } from "./workflow";
import { saveDraft, loadDraft, listDrafts, type ReplicateDraft } from "./storage";
import axios from "@/utils/axios";
import PhoneUploadDialog from "@/components/PhoneUploadDialog.vue";
import { downloadWorkspaceFile, type CloudAsset } from "@/utils/workspace";
import ModelSelect from "@/components/modelSelect.vue";
import ModelCostHint from "@/components/ModelCostHint.vue";
import { modelCatalog as sharedCatalog } from "@/utils/modelCatalog";
import { canUseReferenceImages } from "@/utils/modelCapabilities";
import { bareModel, captureVideoFrames, downloadUrl, fileToDataUrl, formatTime, parseJsonContent, type CapturedFrame } from "./utils";

type ModuleKey = "oneclick" | "reverse" | "motion" | "image";
interface HistoryItem { id: string; module: ModuleKey; title: string; summary: string; status: "success" | "error"; createdAt: string }
type Shot = ReplicateShot;
interface RemoteSource { platform: "douyin" | "bilibili" | "direct"; title: string; cover?: string; duration?: number; sourceUrl: string; originalUrl: string }

const modules = [
  { key: "oneclick" as const, icon: "▦", title: "一键复刻", subtitle: "拆解 → 分镜 → 成片", tag: "FULL PIPELINE", description: "完整复刻工作流：理解爆款结构、生成品牌故事板，再输出视频片段。" },
  { key: "reverse" as const, icon: "⌘", title: "爆款视频反推", subtitle: "还原镜头与提示词", tag: "VIDEO REVERSE", description: "从关键帧、节奏、运镜、光线和风格中，反推出可复用的生成提示词。" },
  { key: "motion" as const, icon: "◎", title: "动作关键帧", subtitle: "本地提取 · 不扣积分", tag: "LOCAL FRAMES", description: "本地提取动作关键帧，不进行深度或骨骼估计。" },
  { key: "image" as const, icon: "▣", title: "图片复刻", subtitle: "换商品不换质感", tag: "IMAGE REMAKE", description: "参考爆款构图与氛围，将画面主体替换成你的商品或品牌视觉。" },
];
const activeModule = ref<ModuleKey>("oneclick");
const activeMeta = computed(() => moduleByKey(activeModule.value));
const working = ref(false);
const resolving = ref<"oneclick" | "reverse" | "">("");
const oneclick = reactive<{video?: File; product?: File; productAsset?: CloudAsset; videoAsset?: CloudAsset; shareLink: string; remote?: RemoteSource; visionModel: string; imageModel: string; videoModel: string; seconds: number; ratio: string; resolution: string; stepwise: boolean; pace: boolean; market: string; language: string}>({ shareLink: "", visionModel: "", imageModel: "", videoModel: "", seconds: 5, ratio: "9:16", resolution: "720p", stepwise: true, pace: false, market: "", language: "" });
// 出海本地化：市场与语言注入拆解 prompt（对齐造物 ecom-hub 的 8 地区 / 8 语言口径）
const MARKETS = ["不限", "东南亚", "日本", "韩国", "北美", "欧洲", "中东", "拉美"];
const LANGUAGES = ["不限", "英语", "日语", "韩语", "泰语", "越南语", "印尼语", "西班牙语"];
function nearestDuration(target: number): number {
  const list = videoSpec.value.durations.length ? videoSpec.value.durations : [target];
  return list.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best), list[0]);
}
/** 分镜提示词统一由这里拼，提交与「提示词预览」共用同一份文案 */
function boardPrompt(shot: Shot): string {
  return `原创商业短视频故事板，第 ${shot.no} 镜。场景：${shot.scene}。运镜：${shot.camera}。文案：${shot.copy}。保持专业广告质感、画面干净、主体一致，不生成水印和无意义文字。`;
}
const phoneUploadOpen = ref(false);
function receivePhoneImage(asset: CloudAsset) { oneclick.product = undefined; oneclick.productAsset = asset; }
const reverse = reactive<{video?: File; shareLink: string; remote?: RemoteSource; model: string; depth: number}>({ shareLink: "", model: "", depth: 9 });
const motion = reactive<{video?: File}>({});
const imageJob = reactive<{reference?: File; product?: File; model: string; mode: string; requirement: string}>({ model: "", mode: "replace", requirement: "" });
const shots = ref<Shot[]>([]);
const oneclickSummary = ref("");
const oneclickStage = ref<"analyze" | "boards" | "videos" | "done">("analyze");
const reverseResult = ref<Record<string, any> | null>(null);
const imageResult = ref("");
const motionFrames = ref<CapturedFrame[]>([]);
const router = useRouter();
const owner = localStorage.getItem("userId") || "";
const draftId = ref<string>(crypto.randomUUID());
const workflowApi: WorkflowApi = {
  post: (path, body, config) => axios.post(path, body, { ...config, preserveHttpError: true } as any),
  get: (path, config) => axios.get(path, { ...config, preserveHttpError: true } as any),
};
const restoring = ref(true);
const storageStatus = ref("正在读取账号草稿");
const savedDrafts = ref<Awaited<ReturnType<typeof listDrafts>>>([]);
const modelCatalog = ref<WorkflowModel[]>([]);
const catalogLoading = ref(true);
const catalogError = ref("");
const selectedVisionReady = computed(() => modelCatalog.value.some(m => m.modelName === bareModel(oneclick.visionModel) && supportsVision(m)));
const selectedImageReady = computed(() => modelCatalog.value.some(m => m.modelName === bareModel(oneclick.imageModel) && m.type === 'image' && supportsReference(m)));
const reverseReady = computed(() => modelCatalog.value.some(m => m.modelName === bareModel(reverse.model) && supportsVision(m)));
const imageReplicateReady = computed(() => modelCatalog.value.some(m => m.modelName === bareModel(imageJob.model) && m.type === 'image' && canUseReferenceImages(m, 2)));
const selectedVideo = computed(() => modelCatalog.value.find(m => m.modelName === bareModel(oneclick.videoModel)));
const videoSpec = computed(() => videoSettings(selectedVideo.value));
const completeVideoSpec = computed(() => !!selectedVideo.value && supportsReference(selectedVideo.value) && !!videoSpec.value.durations.length && !!videoSpec.value.resolutions.length && !!videoSpec.value.ratios.length);
const readinessIssues = computed(() => {
  if (catalogLoading.value || catalogError.value || activeModule.value === 'motion') return [];
  const issues: string[] = [];
  if ((activeModule.value === 'oneclick' || activeModule.value === 'reverse') && !modelCatalog.value.some(supportsVision)) issues.push('缺少已确认支持看图的视觉理解模型');
  if (activeModule.value === 'oneclick') {
    if (!modelCatalog.value.some(m => m.type === 'image' && supportsReference(m))) issues.push('缺少参考图生图模型');
    if (!modelCatalog.value.some(m => { const spec = videoSettings(m); return m.type === 'video' && supportsReference(m) && spec.durations.length && spec.resolutions.length && spec.ratios.length; })) issues.push('图生视频的时长、清晰度或比例资料尚未齐全');
  }
  if (activeModule.value === 'image' && !modelCatalog.value.some(m => m.type === 'image' && canUseReferenceImages(m, 2))) issues.push('图片复刻需要支持至少两张参考图的模型');
  return issues;
});
const totalSeconds = computed(() => shots.value.reduce((sum, s) => sum + Number(s.seconds || 0), 0));
const completedClips = computed(() => shots.value.filter(s => s.clip).length);
const pendingClips = computed(() => shots.value.filter(s => s.taskId && !s.clip).length);
let stopRequested = false;
let alive = true;
let draftSaveTimer: ReturnType<typeof setTimeout> | undefined;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let saveQueue = Promise.resolve();
let draftRevision = 0;
function requireOwner() {
  requireValue(owner && owner === localStorage.getItem("userId"), "登录状态已变化，请重新打开页面");
  requireValue(alive && !stopRequested, "已停止后续任务，已提交任务不会取消");
}
function snapshot(): ReplicateDraft {
  return { id: draftId.value, owner, title: oneclick.remote?.title || oneclick.video?.name || oneclickSummary.value || "复刻任务", updatedAt: Date.now(), summary: oneclickSummary.value, stage: oneclickStage.value,
    shots: JSON.parse(JSON.stringify(shots.value)), settings: { visionModel: oneclick.visionModel, imageModel: oneclick.imageModel, videoModel: oneclick.videoModel, seconds: oneclick.seconds, resolution: oneclick.resolution, ratio: oneclick.ratio, stepwise: true },
    product: oneclick.product ? toRaw(oneclick.product) : undefined, video: oneclick.video ? toRaw(oneclick.video) : undefined, productAsset: oneclick.productAsset ? toRaw(oneclick.productAsset) : undefined, videoAsset: oneclick.videoAsset ? toRaw(oneclick.videoAsset) : undefined };
}
function checkpoint(): Promise<void> {
  clearTimeout(draftSaveTimer);
  const draft = snapshot();
  const write = saveQueue.catch(() => {}).then(async () => { draft.revision = draftRevision; draftRevision = await saveDraft(draft); if (alive) { storageStatus.value = "已保存到云端 · 同账号可跨设备继续"; const summary = { id: draft.id, title: draft.title, updatedAt: Date.now(), shots: draft.shots.length, completed: draft.shots.filter(s => s.clip).length }; savedDrafts.value = [summary, ...savedDrafts.value.filter(item => item.id !== draft.id)]; } });
  saveQueue = write.catch(error => { storageStatus.value = apiError(error); throw error; });
  // The caller must observe a storage failure before any billable submission.
  return saveQueue;
}
async function openDraft(id: string) {
  if (working.value) return;
  restoring.value = true;
  try {
    await saveQueue.catch(() => {});
    const draft = await loadDraft(owner, id);
    if (!draft) throw new Error("任务不存在或不属于当前账号");
    draftRevision = draft.revision || 0; draftId.value = draft.id; shots.value = draft.shots; oneclickSummary.value = draft.summary; oneclickStage.value = draft.stage;
    Object.assign(oneclick, draft.settings, { video: draft.video, product: draft.product, productAsset: draft.productAsset, videoAsset: draft.videoAsset, remote: draft.videoAsset ? { platform: "direct", title: draft.videoAsset.name, sourceUrl: draft.videoAsset.url, originalUrl: draft.videoAsset.url } : undefined, shareLink: "" });
    storageStatus.value = draft.conflictCopyId ? "已打开云端版本 · 本机修改保留为独立副本，请从任务列表核对" : draft.cloudPending ? "本机有待同步修改 · 联网保存后可继续生成" : "已恢复云端草稿 · 原视频任务可继续查询";
    if (draft.conflictCopyId) savedDrafts.value = await listDrafts(owner);
    localStorage.setItem(`xoi:viral-current:${owner}`, id);
    clearTimeout(pollTimer);
  } catch (error) { MessagePlugin.error(apiError(error)); }
  finally { restoring.value = false; }
}
async function newDraft() {
  try {
    if (shots.value.length) await checkpoint();
    restoring.value = true;
    clearTimeout(pollTimer); draftRevision = 0; draftId.value = crypto.randomUUID(); shots.value = []; oneclickSummary.value = ""; oneclickStage.value = "analyze";
    oneclick.video = undefined; oneclick.product = undefined; oneclick.productAsset = undefined; oneclick.videoAsset = undefined; oneclick.remote = undefined; oneclick.shareLink = "";
    await checkpoint();
  } catch (error) { MessagePlugin.error(apiError(error)); }
  finally { restoring.value = false; }
}
function confirmAction(header: string, body: string): Promise<boolean> {
  return new Promise(resolve => {
    const dialog = DialogPlugin.confirm({ header, body, confirmBtn: "确认并提交", cancelBtn: "返回修改", closeOnOverlayClick: false,
      onConfirm: () => { dialog.destroy(); resolve(true); }, onClose: () => { dialog.destroy(); resolve(false); } });
  });
}
async function confirmQuote(stage: "boards" | "videos", lines: QuoteLine[]) {
  if (!lines.length) return false;
  const quotes = [];
  for (const line of lines) { requireOwner(); const response: any = await axios.post("/model-catalog/quote", { model: line.model, params: line.params }); quotes.push(response.data); }
  const total = sumQuotes(quotes);
  const label = stage === "boards" ? "故事板" : "视频片段";
  return confirmAction(`${label}费用确认`, `本阶段仅生成 ${lines.length} 个未完成镜头，预计 ${formatPointsFromYuan(total.yuan)}（¥${total.yuan.toLocaleString("zh-CN", { maximumFractionDigits: 4 })}）。1 元 = 10 积分。${stage === "videos" ? `清晰度 ${oneclick.resolution}，时长按每镜分别计算。` : "每镜一张参考图。"}最终按实际用量结算；不会重做已完成镜头。`);
}
async function runStage(action: () => Promise<void>) {
  if (working.value || restoring.value) return;
  working.value = true; stopRequested = false;
  try {
    requireOwner();
    const run = async () => { requireOwner(); await action(); };
    if (navigator.locks) await navigator.locks.request(`xoi:viral:${owner}:${draftId.value}`, { ifAvailable: true }, async lock => { if (!lock) throw new Error("此任务正在另一个标签页运行，请勿重复提交"); await run(); });
    else throw new Error("当前浏览器不支持安全任务锁，请使用新版 Chrome 或 Edge");
  } catch (error) { MessagePlugin.error(apiError(error)); }
  finally { working.value = false; }
}
async function refreshCatalog(force = true) {
  catalogLoading.value = true; catalogError.value = '';
  try {
    const rows = await sharedCatalog.get(force);
    if (!alive) return;
    modelCatalog.value = rows.map(row => ({ ...row, modelName: row.modelName || row.value }));
    const choose = (test: (model: WorkflowModel) => boolean) => { const row = modelCatalog.value.find(test); return row ? `newapi:${row.modelName}` : ''; };
    // Only initialize blank choices. Never silently replace a user's saved model.
    if (!oneclick.visionModel) oneclick.visionModel = choose(supportsVision);
    if (!reverse.model) reverse.model = choose(supportsVision);
    if (!oneclick.imageModel) oneclick.imageModel = choose(m => m.type === 'image' && supportsReference(m));
    if (!imageJob.model) imageJob.model = choose(m => m.type === 'image' && canUseReferenceImages(m, 2));
    if (!oneclick.videoModel) oneclick.videoModel = choose(m => m.type === 'video' && supportsReference(m));
  } catch (error) { if (alive) catalogError.value = '无法读取当前账号的模型能力，请重新检查'; throw error; }
  finally { if (alive) catalogLoading.value = false; }
}
async function retryCatalog() { try { await refreshCatalog(); } catch { /* Inline retry remains visible. */ } }
function requireCapability(value: string, kind: "vision" | "reference") {
  const model = modelCatalog.value.find(m => m.modelName === bareModel(value));
  requireValue(model && (kind === "vision" ? supportsVision(model) : supportsReference(model)), kind === "vision" ? "请选择已确认支持看图的视觉模型" : "请选择已确认支持参考图的模型");
}
watch(() => [oneclick, shots.value, oneclickSummary.value, oneclickStage.value], () => {
  if (restoring.value || !owner || !alive) return;
  storageStatus.value = "保存中…"; clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => { void checkpoint().catch(() => {}); }, 400);
}, { deep: true });
watch(videoSpec, () => {
  const spec = videoSpec.value;
  if (spec.durations.length && !spec.durations.includes(oneclick.seconds)) oneclick.seconds = spec.durations[0];
  if (spec.resolutions.length && !spec.resolutions.includes(oneclick.resolution)) oneclick.resolution = spec.resolutions[0];
  if (spec.ratios.length && !spec.ratios.includes(oneclick.ratio)) oneclick.ratio = spec.ratios[0];
});
onMounted(async () => {
  const modelsReady = refreshCatalog(false).catch(() => {});
  try {
    if (owner) { savedDrafts.value = await listDrafts(owner); const id = localStorage.getItem(`xoi:viral-current:${owner}`) || savedDrafts.value[0]?.id; if (id) await openDraft(id); }
    if (!savedDrafts.value.length) storageStatus.value = "编辑后自动保存到账号云端";
  } catch (error) { storageStatus.value = "草稿存储不可用，请重试"; MessagePlugin.error(apiError(error)); }
  finally { await modelsReady; restoring.value = false; }
});
onBeforeUnmount(() => { alive = false; stopRequested = true; clearTimeout(pollTimer); clearTimeout(draftSaveTimer); if (owner && !restoring.value) void checkpoint().catch(() => {}); });
const imageModes = [
  { key: "replace", icon: "↔", name: "主体替换", desc: "保留构图，替换商品" },
  { key: "composition", icon: "⊞", name: "构图借鉴", desc: "借用布局，重新设计" },
  { key: "scene", icon: "◫", name: "场景迁移", desc: "保留商品，更换氛围" },
  { key: "fullset", icon: "✦", name: "全套复刻", desc: "构图、场景、质感重创" },
];

const history = ref<HistoryItem[]>(loadHistory());
const reverseCards = computed(() => [
  { label: "主体", value: reverseResult.value?.subject }, { label: "动作", value: reverseResult.value?.action },
  { label: "场景", value: reverseResult.value?.scene }, { label: "运镜", value: reverseResult.value?.camera },
  { label: "光线", value: reverseResult.value?.lighting }, { label: "视觉风格", value: reverseResult.value?.style },
]);

const UploadCard = defineComponent({
  props: { title: String, hint: String, accept: String, file: Object, kind: String, wide: Boolean, required: Boolean },
  emits: ["change"],
  setup(props, { emit }) {
    const input = ref<HTMLInputElement>();
    return () => h("button", { type: "button", class: ["uploadCard", props.wide && "wide", props.file && "hasFile"], onClick: () => input.value?.click(), onDragover: (e: DragEvent) => e.preventDefault(), onDrop: (e: DragEvent) => { e.preventDefault(); const file = e.dataTransfer?.files?.[0]; if (file) emit("change", file); } }, [
      h("input", { ref: input, type: "file", accept: props.accept, hidden: true, onChange: (event: Event) => emit("change", (event.target as HTMLInputElement).files?.[0]) }),
      h("span", { class: "uploadGlyph" }, props.kind === "video" ? "▶" : "＋"),
      h("div", [h("strong", `${props.title}${props.required ? " *" : ""}`), h("p", props.file ? (props.file as File).name : props.hint), props.file ? h("small", `${((props.file as File).size / 1024 / 1024).toFixed(1)} MB · 点击替换`) : h("small", "点击选择或拖拽到这里")]),
      props.file ? h("em", "已就绪") : null,
    ]);
  },
});

function moduleByKey(key: ModuleKey) { return modules.find((item) => item.key === key) || modules[0]; }
function loadHistory(): HistoryItem[] { try { return JSON.parse(localStorage.getItem(`xoi:viral-history:${owner}`) || "[]"); } catch { return []; } }
function addHistory(item: Omit<HistoryItem, "id" | "createdAt">) {
  history.value.unshift({ ...item, id: crypto.randomUUID(), createdAt: new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) });
  history.value = history.value.slice(0, 20);
  localStorage.setItem(`xoi:viral-history:${owner}`, JSON.stringify(history.value));
}
function clearHistory() { history.value = []; localStorage.removeItem(`xoi:viral-history:${owner}`); }
function platformName(platform: RemoteSource["platform"]) { return platform === "douyin" ? "抖音" : platform === "bilibili" ? "Bilibili" : "视频直链"; }
function clearRemote(target: "oneclick" | "reverse") { if (target === "oneclick") oneclick.remote = undefined; else reverse.remote = undefined; }
function setLocalVideo(target: "oneclick" | "reverse", file?: File) {
  if (file && (!file.type.startsWith("video/") || file.size > 100 * 1024 * 1024)) return MessagePlugin.warning("请选择 100MB 以内的视频文件");
  if (target === "oneclick") { oneclick.video = file; oneclick.videoAsset = undefined; oneclick.remote = undefined; }
  else { reverse.video = file; reverse.remote = undefined; }
}
async function resolveRemote(target: "oneclick" | "reverse") {
  const state = target === "oneclick" ? oneclick : reverse;
  if (!state.shareLink.trim()) return MessagePlugin.warning("请粘贴抖音、B站分享文案或视频直链");
  try {
    resolving.value = target;
    const response: any = await axios.post("/viral/resolve", { input: state.shareLink });
    const data = response?.data || response;
    if (!data?.sourceUrl) throw new Error("解析接口没有返回视频地址");
    state.remote = data as RemoteSource;
    state.video = undefined;
    MessagePlugin.success(`已获取${platformName(data.platform)}视频`);
  } catch (error) { MessagePlugin.error(apiError(error)); }
  finally { resolving.value = ""; }
}
function requireValue(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function apiError(error: any) { return error?.response?.data?.message || error?.response?.data?.msg || error?.message || "请求失败，请稍后重试"; }
function generatedUrl(response: any) { return response?.data?.[0]?.url || response?.data?.[0]?.b64_json && `data:image/png;base64,${response.data[0].b64_json}` || response?.url || ""; }

async function chatJson(model: string, messages: any[], maxTokens = 1800) {
  const response: any = await axios.post("/v1/chat/completions", { model: bareModel(model), messages, temperature: 0.35, max_tokens: maxTokens, response_format: { type: "json_object" } });
  return parseJsonContent(response?.choices?.[0]?.message?.content ?? response?.data?.choices?.[0]?.message?.content);
}

async function runReverse() {
  if (working.value) return;
  working.value = true;
  try {
    stopRequested = false; await refreshCatalog(); requireCapability(reverse.model, "vision");
    if (!await confirmAction("视频分析费用确认", "将上传抽样关键帧进行视觉分析，不读取音轨。按所选模型的文本与图片实际用量计费；目前图片 Token 无可靠完整预估。1 元 = 10 积分。确认后才会调用模型。")) return;
    const source = reverse.remote?.sourceUrl || reverse.video;
    requireValue(source, "请粘贴分享链接获取视频，或上传本地视频"); requireValue(reverse.model, "请选择分析模型"); working.value = true;
    const { duration, frames } = await captureVideoFrames(source, reverse.depth);
    const content = [{ type: "text", text: `分析这个 ${duration.toFixed(1)} 秒视频的关键帧。只输出 JSON：{subject,action,scene,camera,lighting,style,duration,prompt,prompt_en,negative}。prompt 必须是可以直接用于视频生成的中文提示词，包含主体、动作、场景、镜头、光线、节奏。` }, ...frames.map((frame) => ({ type: "image_url", image_url: { url: frame.url } }))];
    reverseResult.value = await chatJson(reverse.model, [{ role: "system", content: "你是专业广告导演和 AI 视频提示词工程师。基于连续关键帧做结构化反推，不要照搬品牌标识或受保护角色。" }, { role: "user", content }]);
    addHistory({ module: "reverse", title: reverse.remote?.title || reverse.video?.name || "视频反推", summary: `${duration.toFixed(1)} 秒 · ${reverse.depth} 帧分析`, status: "success" });
    MessagePlugin.success("视频反推完成");
  } catch (error) { addHistory({ module: "reverse", title: reverse.remote?.title || reverse.video?.name || "视频反推", summary: apiError(error), status: "error" }); MessagePlugin.error(apiError(error)); }
  finally { working.value = false; }
}

async function copyReversePrompt() {
  const value = reverseResult.value?.prompt || reverseResult.value?.prompt_en || "";
  await navigator.clipboard.writeText(value); MessagePlugin.success("提示词已复制");
}

async function runImageReplicate() {
  if (working.value) return;
  try {
    requireValue(imageJob.reference, "请上传参考爆款图"); requireValue(imageJob.product, "请上传商品图"); requireValue(imageJob.model, "请选择图片模型"); working.value = true;
    const [reference, product] = await Promise.all([fileToDataUrl(imageJob.reference), fileToDataUrl(imageJob.product)]);
    const mode = imageModes.find((item) => item.key === imageJob.mode)!;
    stopRequested = false; await refreshCatalog(); requireCapability(imageJob.model, "reference"); requireOwner();
    validateImageReferences(modelCatalog.value.find(m => m.modelName === bareModel(imageJob.model)), 2);
    const quoted: any = await axios.post("/model-catalog/quote", { model: bareModel(imageJob.model), params: { n: 1 } });
    const cost = sumQuotes([quoted.data]);
    if (!await confirmAction("复刻图片费用确认", `预计 ${formatPointsFromYuan(cost.yuan)}（¥${cost.yuan.toLocaleString("zh-CN", { maximumFractionDigits: 4 })}），1 元 = 10 积分，最终按实际用量结算。`)) return;
    requireOwner();
    const prompt = `商业视觉重创任务。第一张图是构图和氛围参考，第二张图是必须保留身份特征的商品。模式：${mode.name}（${mode.desc}）。不要复制参考图中的商标、文字和受保护角色。请输出专业成品图。${imageJob.requirement ? `补充要求：${imageJob.requirement}` : ""}`;
    const response: any = await axios.post("/v1/images/generations", { model: bareModel(imageJob.model), prompt, n: 1, response_format: "url", images: [reference, product] });
    imageResult.value = generatedUrl(response);
    if (!imageResult.value) throw new Error("模型没有返回可用图片");
    addHistory({ module: "image", title: `${mode.name} · ${imageJob.product.name}`, summary: bareModel(imageJob.model), status: "success" });
    MessagePlugin.success("图片复刻完成");
  } catch (error) { addHistory({ module: "image", title: "图片复刻", summary: apiError(error), status: "error" }); MessagePlugin.error(apiError(error)); }
  finally { working.value = false; }
}

async function analyzeOneclick() {
  const source = oneclick.remote?.sourceUrl || oneclick.video;
  requireValue(source, "请粘贴分享链接获取视频，或上传本地对标视频"); requireValue(oneclick.visionModel, "请选择视频理解模型");
  const guessedDuration = oneclick.remote?.duration || (oneclick.video ? durationGuess(oneclick.video) : 32);
  const { duration, frames } = await captureVideoFrames(source, Math.max(6, Math.min(12, Math.round(guessedDuration / 4) || 8)));
  const localeNote = oneclick.market !== "不限" || oneclick.language !== "不限"
    ? `屏幕文案/旁白使用${oneclick.language === "不限" ? "原视频同语言" : oneclick.language}，面向${oneclick.market === "不限" ? "原市场" : oneclick.market}市场的受众表达习惯。`
    : "";
  const result: any = await chatJson(oneclick.visionModel, [
    { role: "system", content: "你是爆款短视频导演。把参考视频拆成可重拍的原创分镜，不照搬品牌、台词或受保护角色。严格输出 JSON。" },
    { role: "user", content: [{ type: "text", text: `视频时长 ${duration.toFixed(1)} 秒。输出 {summary,shots:[{no,seconds,scene,camera,copy}]}。拆为 3-8 个关键镜头，每个镜头必须包含场景内容、运镜和屏幕文案/旁白。${localeNote}` }, ...frames.map((frame) => ({ type: "image_url", image_url: { url: frame.url } }))] },
  ], 2400);
  const resultShots = Array.isArray(result?.shots) ? result.shots : [];
  if (!resultShots.length) throw new Error("没有拆解出有效镜头，请重试");
  oneclickSummary.value = result.summary || `${duration.toFixed(1)} 秒参考视频`;
  shots.value = normalizeShots(resultShots, oneclick.seconds, videoSpec.value.durations).map((shot, index) => ({ ...shot, frame: frames[Math.min(Math.floor((index + 0.5) * frames.length / resultShots.length), frames.length - 1)]?.url }));
  // 爆款节奏：全部压成 5 秒级的快节奏短镜头（时长取模型支持的最近档位）
  if (oneclick.pace) shots.value = shots.value.map((s) => ({ ...s, seconds: nearestDuration(5) }));
  oneclickStage.value = "boards";
  await checkpoint();
}
function durationGuess(file: File) { return Math.max(20, Math.min(60, file.size / 500_000)); }
// —— 连播预览（对齐造物 SequencePlayer）：自动接播、段落跳转、配音同步、打包下载 ——
const sequenceIndex = ref(0);
const sequencePlaying = ref(false);
const sequenceWithTts = ref(true);
const sequenceVideoRef = ref<HTMLVideoElement | null>(null);
const sequenceAudioRef = ref<HTMLAudioElement | null>(null);
const voiceModel = ref("");
const hasAnyTts = computed(() => shots.value.some((s) => s.ttsUrl));
function jumpSequence(i: number) {
  sequenceIndex.value = Math.max(0, Math.min(shots.value.length - 1, i));
  sequencePlaying.value = true;
  void playSequenceCurrent();
}
async function playSequenceCurrent() {
  await nextTick();
  const video = sequenceVideoRef.value;
  if (video) { try { await video.play(); } catch { /* 自动播放被拦时用户手动点播放 */ } }
  const shot = shots.value[sequenceIndex.value];
  const audio = sequenceAudioRef.value;
  if (audio) {
    if (sequenceWithTts.value && shot?.ttsUrl) { audio.currentTime = 0; audio.play().catch(() => {}); }
    else audio.pause();
  }
}
function toggleSequence() {
  if (sequencePlaying.value) { sequenceVideoRef.value?.pause(); sequenceAudioRef.value?.pause(); sequencePlaying.value = false; }
  else { sequencePlaying.value = true; void playSequenceCurrent(); }
}
function onSequenceEnded() {
  if (sequenceIndex.value < shots.value.length - 1) jumpSequence(sequenceIndex.value + 1);
  else sequencePlaying.value = false;
}
async function downloadAllClips() {
  for (const shot of shots.value) {
    if (shot.clip) { downloadUrl(shot.clip, `镜头-${shot.no}.mp4`); await new Promise((r) => setTimeout(r, 400)); }
  }
}
/** 口播配音：对有文案的镜头逐镜走语音合成任务（带预算闸门与归属），完成后连播可同步播放 */
async function generateVoiceover() {
  await runStage(async () => {
    requireValue(voiceModel.value, "请选择语音合成模型");
    const targets = shots.value.filter((s) => s.copy && !s.ttsUrl && !s.ttsTaskId);
    if (!targets.length) throw new Error("没有可配音的镜头：需要镜头有文案，且未生成过配音");
    for (const shot of targets) {
      requireOwner();
      const created: any = await axios.post("/v1/canvas/audio-tasks", { request: { model: bareModel(voiceModel.value), input: shot.copy, response_format: "mp3" }, sourceId: `viral-${shot.id}` });
      shot.ttsTaskId = String(created.data?.data?.id || "");
      shot.ttsUrl = "";
      shot.status = "生成配音";
      await checkpoint();
    }
    for (const shot of shots.value.filter((s) => s.ttsTaskId && !s.ttsUrl)) {
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const r: any = await axios.get(`/v1/canvas/audio-tasks/${shot.ttsTaskId}`).catch(() => null);
        const d = r?.data?.data;
        if (d?.status === "succeeded") { shot.ttsUrl = String(d.result?.url || ""); shot.status = "配音完成"; break; }
        if (d?.status === "failed") throw new Error(d?.message || "配音生成失败，费用状态请核对积分明细");
        if (d?.status === "unknown") throw new Error("配音任务结果待核实，请勿重复提交，稍后刷新查看");
      }
      await checkpoint();
    }
    MessagePlugin.success("口播配音完成，连播时可同步播放");
  });
}

/** 手动补一镜：复制末镜结构、编号顺延（镜头可自由编辑，编辑后照常走报价与生成） */
function addShot() {
  const last = shots.value[shots.value.length - 1];
  const no = shots.value.length ? Math.max(...shots.value.map((s) => s.no)) + 1 : 1;
  shots.value = [...shots.value, { id: crypto.randomUUID(), no, seconds: nearestDuration(oneclick.seconds), scene: last?.scene || "", camera: last?.camera || "固定机位", copy: "", status: "待编辑" } as Shot];
  oneclickStage.value = shots.value.every((s) => s.board) ? "videos" : "boards";
  void checkpoint();
}
function removeShot(id: string) {
  shots.value = shots.value.filter((s) => s.id !== id).map((s, index) => ({ ...s, no: index + 1 }));
  if (!shots.value.length) oneclickStage.value = "analyze";
  void checkpoint();
}

async function generateAllBoards() {
  await runStage(async () => {
    await refreshCatalog(); requireCapability(oneclick.imageModel, "reference");
    const candidates = boardCandidates(shots.value);
    const imageModel = modelCatalog.value.find(m => m.modelName === bareModel(oneclick.imageModel));
    if (!oneclick.product && oneclick.productAsset) oneclick.product = await downloadWorkspaceFile(owner, oneclick.productAsset);
    for (const shot of candidates) validateImageReferences(imageModel, (oneclick.product ? 1 : 0) + (shot.frame ? 1 : 0));
    if (!await confirmQuote("boards", generationQuoteLines("boards", shots.value, oneclick.imageModel, oneclick.resolution))) return;
    const product = oneclick.product ? await fileToDataUrl(oneclick.product) : "";
    for (const shot of candidates) {
      requireOwner();
      await submitBoard(shot, { model: bareModel(oneclick.imageModel), prompt: boardPrompt(shot), n: 1, response_format: "url", images: [product, shot.frame].filter(Boolean) }, workflowApi, checkpoint);
    }
    if (shots.value.every(s => s.board)) { oneclickStage.value = "videos"; await checkpoint(); MessagePlugin.success("故事板已就绪，请确认视频报价后继续"); }
  });
}

async function createVideo(shot: Shot) {
  validateVideo(selectedVideo.value, shot, oneclick.resolution, oneclick.ratio); requireOwner();
  await submitVideo(shot, { model: oneclick.videoModel, prompt: `${shot.scene}。${shot.camera}。${shot.copy}。商业短视频，动作自然，主体稳定。`, seconds: shot.seconds, aspect_ratio: oneclick.ratio, resolution: oneclick.resolution, images: [shot.board] }, workflowApi, checkpoint);
}

async function generateAllVideos() {
  await runStage(async () => {
    await refreshCatalog();
    requireValue(shots.value.every(s => s.board), "故事板未全部完成，不提交视频");
    const candidates = videoCandidates(shots.value);
    for (const shot of candidates) validateVideo(selectedVideo.value, shot, oneclick.resolution, oneclick.ratio);
    if (!await confirmQuote("videos", generationQuoteLines("videos", shots.value, oneclick.videoModel, oneclick.resolution))) return;
    for (const shot of candidates) { requireOwner(); await createVideo(shot); }
    MessagePlugin.success("视频任务已提交，查询不会重新生成");
  });
  if (pendingClips.value && !stopRequested && alive) void resumePending();
}

async function startOneclick() {
  await runStage(async () => {
    await refreshCatalog(); requireCapability(oneclick.visionModel, "vision");
    requireValue(oneclick.remote?.sourceUrl || oneclick.video, "请上传对标视频或获取分享链接");
    if (!await confirmAction("拆解视频费用确认", "将上传抽样关键帧，按文本与图片实际用量计费，目前图片 Token 无可靠完整预估。1 元 = 10 积分。不读取音轨；完成后先编辑分镜，不自动生成图片或视频。")) return;
    requireOwner(); await analyzeOneclick(); MessagePlugin.success("已拆解，请先编辑分镜再确认生成费用");
  });
}

async function resumePending() {
  clearTimeout(pollTimer);
  await runStage(async () => {
    for (const shot of shots.value.filter(s => s.taskId && !s.clip)) { requireOwner(); await pollVideoOnce(shot, workflowApi, checkpoint); }
    if (shots.value.length && shots.value.every(s => s.clip)) { oneclickStage.value = "done"; await checkpoint(); MessagePlugin.success("所有片段就绪，可以进入剪辑导出"); }
  });
  if (alive && !stopRequested && pendingClips.value && !shots.value.some(s => s.error)) pollTimer = setTimeout(() => { void resumePending(); }, 5000);
}
async function openEditor() {
  try { await checkpoint(); await router.push({ path: "/editor", query: { mode: "standalone", draft: `viral-${owner}-${draftId.value}`, viralDraft: draftId.value, returnTo: "/viral-replicate" } }); }
  catch (error) { MessagePlugin.error(apiError(error)); }
}

async function runMotionCapture() {
  if (working.value) return;
  try { requireValue(motion.video, "请上传动作参考视频"); working.value = true; const result = await captureVideoFrames(motion.video, 12); motionFrames.value = result.frames; addHistory({ module: "motion", title: motion.video.name, summary: `${result.frames.length} 个动作关键帧 · 本地处理`, status: "success" }); MessagePlugin.success("动作关键帧捕捉完成"); }
  catch (error) { MessagePlugin.error(apiError(error)); } finally { working.value = false; }
}
</script>

<style scoped lang="scss">
.phoneUploadEntry { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin:16px 0; }
.phoneUploadEntry small { color:var(--td-text-color-secondary); }
.settingsFieldset { border:0; margin:0; padding:0; min-width:0; }
.settingsFieldset:disabled { opacity:.8; pointer-events:none; }
.draftToolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px; color:#827a87; font-size:12px; }
.draftToolbar button,.stageActions>button,.shotCard>button { border:1px solid #eddfd8; border-radius:9px; background:#fff6ef; color:#b45d37; padding:8px 12px; cursor:pointer; }
.specNote { display:block; color:#948b96; margin-top:12px; line-height:1.6; }
.stageActions { display:flex; flex-direction:column; gap:8px; flex:none; }
.shotCard label { display:block; margin-top:10px; color:#807787; font-size:11px; }
.shotCard textarea { box-sizing:border-box; display:block; width:100%; margin-top:5px; padding:8px; resize:vertical; border:1px solid #e6e0e8; border-radius:8px; font:inherit; color:#38313c; background:#fff; line-height:1.6; }
.shotCard textarea:focus { outline:2px solid #ffd1bc; border-color:#ed9c79; }
.shotCard .shotError { display:block; -webkit-line-clamp:unset; color:#b14d43; overflow-wrap:anywhere; }
.shotDetails { padding:7px 0; color:#756d7a; font-size:12px; line-height:1.6; }
.shotDetails p { margin:5px 0; white-space:pre-wrap; overflow-wrap:anywhere; }
.shotDetails small { color:#a296a8; }
.savedDrafts { display:flex; flex-direction:column; gap:8px; padding-bottom:20px; }
.savedDrafts button { display:flex; flex-direction:column; gap:5px; text-align:left; padding:12px; border:1px solid #ebe5ed; border-radius:12px; background:#fcfafc; cursor:pointer; }
.savedDrafts span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.savedDrafts small { color:#998d9e; }
.moduleTabs button:disabled { cursor:wait; }
.shotRail { grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))!important; }
.viralPage { --orange:#ff713f; --ink:#282631; --muted:#85808e; min-height:100%; padding:24px clamp(18px,2.2vw,36px) 56px; color:var(--ink); background:radial-gradient(circle at 84% 3%,rgba(255,180,139,.16),transparent 24%),#f7f7fa; }
.hero { position:relative; display:flex; min-height:230px; padding:38px 46px; overflow:hidden; border:1px solid #ece9ef; border-radius:28px; background:linear-gradient(118deg,#fff 0%,#faf8ff 52%,#fff0e8 100%); box-shadow:0 20px 60px rgba(48,37,61,.07); }
.hero::after { content:""; position:absolute; right:8%; top:-110px; width:400px; height:400px; border:1px solid rgba(255,113,63,.16); border-radius:50%; }
.heroCopy { position:relative; z-index:2; max-width:720px; }.eyebrow { display:flex; align-items:center; gap:10px; color:#ef6c3d; font-size:12px; font-weight:800; letter-spacing:.23em; }.eyebrow span { width:26px; height:2px; background:var(--orange); }.hero h1 { margin:16px 0 10px; font-size:clamp(32px,3vw,50px); letter-spacing:-.04em; }.hero p { margin:0; color:#74707c; font-size:16px; }.heroFlow { display:flex; align-items:center; gap:12px; margin-top:30px; font-size:13px; }.heroFlow span { padding:9px 13px; border-radius:10px; background:rgba(255,255,255,.78); border:1px solid #eee9ec; }.heroFlow b { color:#d4cdd2; }
.heroVisual { position:absolute; right:8%; top:34px; z-index:1; width:230px; height:170px; }.visualCard { position:absolute; width:130px; height:160px; padding:18px; box-sizing:border-box; border-radius:24px; color:#fff; box-shadow:0 22px 45px rgba(59,40,61,.2); }.cardBack { left:10px; top:10px; transform:rotate(-10deg); background:#393542; font-size:10px; letter-spacing:.16em; }.cardFront { right:10px; top:2px; transform:rotate(8deg); display:flex; flex-direction:column; justify-content:center; background:linear-gradient(145deg,#ff8e59,#fb5c3f); }.cardFront strong { font-size:35px; }.cardFront span { font-size:12px; letter-spacing:.2em; }.visualSpark { position:absolute; right:103px; top:61px; z-index:2; display:grid; place-items:center; width:42px; height:42px; border-radius:50%; color:#ff7040; background:white; box-shadow:0 8px 20px rgba(40,25,30,.15); }
.moduleTabs { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:18px 0; }.moduleTabs button { display:flex; align-items:center; gap:12px; min-width:0; padding:17px 18px; text-align:left; border:1px solid #e8e5eb; border-radius:18px; color:#77727d; background:rgba(255,255,255,.88); cursor:pointer; transition:.22s ease; }.moduleTabs button:hover { transform:translateY(-2px); box-shadow:0 12px 28px rgba(39,28,45,.08); }.moduleTabs button.active { color:#fff; border-color:#29262d; background:#29262d; box-shadow:0 14px 30px rgba(27,23,30,.18); }.tabIcon { display:grid; place-items:center; width:38px; height:38px; flex:none; border-radius:12px; color:#f16d3d; background:#fff1e9; font-size:20px; }.moduleTabs button.active .tabIcon { background:rgba(255,255,255,.12); color:#ff9367; }.tabText { display:flex; flex-direction:column; gap:3px; min-width:0; }.tabText strong { color:inherit; font-size:14px; }.tabText small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; color:#aaa4ae; }.tabArrow { margin-left:auto; opacity:.6; }
.workspace { display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:18px; align-items:start; }.workPanel,.historyPanel { border:1px solid #e9e6ec; border-radius:24px; background:#fff; box-shadow:0 18px 48px rgba(44,34,50,.055); }.workPanel { overflow:hidden; }.panelHeader { display:flex; justify-content:space-between; align-items:flex-start; gap:18px; padding:28px 30px 22px; border-bottom:1px solid #efedf1; }.panelHeader h2 { margin:8px 0 5px; font-size:25px; }.panelHeader p { margin:0; color:var(--muted); }.stepTag { color:#ee7141; font-size:10px; font-weight:800; letter-spacing:.2em; }.privacyBadge { padding:8px 11px; color:#77717c; border-radius:99px; background:#f6f4f6; font-size:11px; white-space:nowrap; }.toolBody { padding:24px 30px 0; }.sourceGrid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }.uploadCard { position:relative; display:flex; align-items:center; gap:16px; width:100%; min-height:122px; padding:22px; text-align:left; border:1.5px dashed #d8d2db; border-radius:18px; color:var(--ink); background:#fcfbfc; cursor:pointer; transition:.2s ease; }.uploadCard.wide { min-height:142px; }.uploadCard:hover { border-color:#ff9b76; background:#fffaf7; }.uploadCard.hasFile { border-style:solid; border-color:#ffd1bd; background:#fff8f4; }.uploadGlyph { display:grid; place-items:center; width:48px; height:48px; flex:none; border-radius:15px; color:#ee6c3c; background:#ffede3; font-size:18px; }.uploadCard strong { font-size:15px; }.uploadCard strong::first-letter { color:inherit; }.uploadCard p { max-width:480px; margin:6px 0 4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#77717d; }.uploadCard small { color:#aaa4ae; }.uploadCard em { margin-left:auto; padding:5px 9px; color:#2b9360; border-radius:99px; background:#eaf8f0; font-size:11px; font-style:normal; }
.linkResolver { display:flex; gap:15px; padding:20px; border:1px solid #ffd8c6; border-radius:18px; background:linear-gradient(120deg,#fffaf7,#fff5ee); }.resolverIcon { display:grid; place-items:center; width:46px; height:46px; flex:none; border-radius:14px; color:#fff; background:linear-gradient(145deg,#ff8b5c,#fb673d); box-shadow:0 10px 24px rgba(246,104,61,.22); font-size:20px; }.resolverMain { flex:1; min-width:0; }.resolverHeading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }.resolverHeading strong { font-size:14px; }.resolverHeading span { color:#a89288; font-size:11px; }.resolverInput { display:grid; grid-template-columns:minmax(0,1fr) 108px; gap:9px; }.resolverInput :deep(.t-input) { height:44px; border-color:#eadbd4; border-radius:11px; background:#fff; }.resolverInput :deep(.t-button) { height:44px; border-color:#ff9c78; border-radius:11px; color:#e96639; background:#fff; }.resolvedSource { display:grid; grid-template-columns:54px minmax(0,1fr) auto; gap:11px; align-items:center; margin-top:12px; padding:10px; border:1px solid #f1dfd6; border-radius:13px; background:#fff; }.resolvedSource img,.resolvedFallback { width:54px; height:45px; object-fit:cover; border-radius:9px; }.resolvedFallback { display:grid; place-items:center; color:#fff; background:#302c35; }.resolvedSource>div:nth-child(2) { display:flex; flex-direction:column; min-width:0; }.resolvedSource span { color:#f06c3d; font-size:9px; font-weight:800; }.resolvedSource strong { margin:2px 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }.resolvedSource small { color:#a39ca5; font-size:10px; }.resolvedSource button { border:0; color:#e76a3d; background:transparent; cursor:pointer; }.sourceDivider { display:flex; align-items:center; gap:12px; margin:15px 0; color:#aaa3ac; font-size:10px; }.sourceDivider::before,.sourceDivider::after { content:""; height:1px; flex:1; background:#efecf0; }
.settingsCard { margin-top:16px; padding:20px; border-radius:18px; background:#f8f7fa; }.compactCard { margin-bottom:2px; }.settingsTitle { display:flex; justify-content:space-between; margin-bottom:16px; }.settingsTitle span { color:#99939e; font-size:12px; }.modelGrid { display:grid; gap:14px; }.modelGrid.three { grid-template-columns:repeat(3,1fr); }.modelGrid.two { grid-template-columns:repeat(2,1fr); }.modelGrid label,.inlineSettings label { min-width:0; }.modelGrid label>span,.inlineSettings label>span { display:block; margin-bottom:8px; color:#5f5966; font-size:12px; font-weight:700; }.modelGrid label>small { display:block; margin-top:6px; color:#aaa4ae; font-size:11px; }.inlineSettings { display:grid; grid-template-columns:160px 180px 1fr; gap:16px; align-items:end; margin-top:17px; padding-top:16px; border-top:1px solid #e9e5eb; }.switchLabel { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding-bottom:5px; }.switchLabel span { width:100%; margin:0!important; }.switchLabel small { color:#9b959f; }
.modeChooser { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:16px; }.modeChooser button { display:grid; grid-template-columns:34px 1fr; grid-template-rows:auto auto; column-gap:9px; padding:15px; text-align:left; border:1px solid #e5e1e8; border-radius:15px; color:#4e4953; background:#fff; cursor:pointer; }.modeChooser button span { grid-row:1/3; display:grid; place-items:center; width:34px; height:34px; color:#ef6d3e; border-radius:10px; background:#fff0e8; }.modeChooser button small { margin-top:3px; color:#a19ba4; }.modeChooser button.active { border-color:#ff9c78; background:#fff8f4; box-shadow:0 8px 18px rgba(255,113,63,.09); }
.actionBar { display:flex; justify-content:space-between; align-items:center; gap:20px; margin:24px -30px 0; padding:18px 30px; border-top:1px solid #ebe8ed; background:linear-gradient(90deg,#fff,#fcfafc); }.costStack { display:flex; flex-direction:column; gap:4px; min-width:0; }.costStack>strong { font-size:13px; }.costStack>small { color:#aaa4ae; font-size:10px; }.costLines { display:flex; flex-wrap:wrap; gap:4px 14px; }.actionBar :deep(.t-button) { min-width:175px; height:46px; border-radius:13px; font-weight:700; }.buttonArrow { margin-left:9px; }
.pipelineResult,.analysisResult,.imageResult { margin-top:16px; padding:18px; border:1px solid #eee9ef; border-radius:18px; background:#fff; }.resultHeading,.analysisTop { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }.resultHeading>div { display:flex; align-items:center; gap:8px; }.resultHeading>span { color:#99939e; font-size:12px; }.liveDot { width:7px; height:7px; border-radius:50%; background:#2fbe76; box-shadow:0 0 0 4px #e4f7ed; }.shotRail { display:grid; grid-template-columns:repeat(auto-fill,minmax(165px,1fr)); gap:11px; }.shotCard { min-width:0; padding:8px; border-radius:14px; background:#f8f7f9; }.shotPreview { position:relative; height:112px; margin-bottom:9px; overflow:hidden; border-radius:10px; background:#e7e3e8; }.shotPreview img,.shotPreview video { width:100%; height:100%; object-fit:cover; }.shotPreview>span { position:absolute; left:7px; top:7px; padding:3px 6px; color:#fff; border-radius:6px; background:rgba(26,23,29,.72); font-size:9px; }.shotPlaceholder { display:grid; place-items:center; height:100%; color:#aaa3ae; font-size:30px; }.shotCard>strong { font-size:12px; }.shotCard>p { margin:5px 0; display:-webkit-box; overflow:hidden; color:#6e6872; font-size:11px; -webkit-line-clamp:2; -webkit-box-orient:vertical; }.shotCard>small { color:#aaa3ae; font-size:10px; }
.analysisTop span { font-size:15px; font-weight:700; }.analysisTop button,.historyTitle button { border:0; color:#e76a3d; background:transparent; cursor:pointer; }.analysisGrid { display:grid; grid-template-columns:repeat(3,1fr); gap:9px; }.analysisGrid article { padding:13px; border-radius:12px; background:#f7f6f8; }.analysisGrid small,.promptBox small { color:#9d97a0; }.analysisGrid p { margin:6px 0 0; font-size:12px; line-height:1.6; }.promptBox { margin-top:10px; padding:15px; border-radius:13px; background:#fff6f1; }.promptBox p { margin:8px 0 0; line-height:1.7; }.imageResult { display:flex; gap:18px; align-items:center; }.imageResult img { width:180px; height:150px; object-fit:cover; border-radius:13px; }.imageResult p { color:#817b85; }.motionIntro { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:16px; }.motionIntro div { padding:18px; border-radius:16px; background:#f8f7f9; }.motionIntro span { color:#f07343; font-size:11px; font-weight:800; }.motionIntro strong { display:block; margin:8px 0 5px; }.motionIntro p { margin:0; color:#8e8892; font-size:11px; }.motionFrames { display:grid; grid-template-columns:repeat(6,1fr); gap:8px; margin-top:16px; }.motionFrames article { position:relative; overflow:hidden; border-radius:11px; background:#222; }.motionFrames img { display:block; width:100%; aspect-ratio:16/10; object-fit:cover; filter:grayscale(.2); }.motionFrames span { position:absolute; right:5px; bottom:5px; padding:2px 5px; border-radius:5px; color:#fff; background:#000a; font-size:9px; }
.historyPanel { position:sticky; top:18px; padding:20px; }.historyTitle { display:flex; align-items:center; justify-content:space-between; padding-bottom:16px; border-bottom:1px solid #efedf0; }.historyTitle>div { display:flex; flex-direction:column; gap:4px; }.historyTitle small { color:#ef7040; font-size:9px; font-weight:800; letter-spacing:.18em; }.emptyHistory { display:flex; flex-direction:column; align-items:center; padding:48px 16px; text-align:center; }.emptyHistory>span { display:grid; place-items:center; width:48px; height:48px; margin-bottom:13px; border-radius:16px; color:#f07849; background:#fff0e7; font-size:24px; }.emptyHistory p { margin:8px 0 0; color:#a19ba5; font-size:11px; line-height:1.6; }.historyList { display:flex; flex-direction:column; max-height:480px; overflow:auto; }.historyList article { display:grid; grid-template-columns:36px 1fr auto; gap:10px; align-items:start; padding:14px 0; border-bottom:1px solid #f0edf1; }.historyIcon { display:grid; place-items:center; width:36px; height:36px; border-radius:11px; color:#ec7143; background:#fff0e8; }.historyList article>div { display:flex; flex-direction:column; min-width:0; }.historyList strong,.historyList small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.historyList strong { font-size:12px; }.historyList small,.historyList time { margin-top:3px; color:#99939c; font-size:10px; }.historyList em { padding:3px 6px; color:#2b9760; border-radius:99px; background:#e9f7ef; font-size:9px; font-style:normal; }.historyList em.error { color:#cf554f; background:#fff0ef; }.principleCard { margin-top:16px; padding:16px; border-radius:16px; color:#fff; background:linear-gradient(145deg,#332f39,#27242c); }.principleCard span { color:#ff8b5e; }.principleCard strong { display:block; margin:7px 0; font-size:12px; }.principleCard p { margin:0; color:#bbb4bf; font-size:10px; line-height:1.6; }
@media (max-width:1200px) { .workspace { grid-template-columns:1fr; }.historyPanel { position:static; }.historyList { display:grid; grid-template-columns:repeat(2,1fr); gap:0 20px; }.heroVisual { opacity:.55; }.modelGrid.three { grid-template-columns:1fr; } }
@media (max-width:800px) { .viralPage { padding:12px; }.hero { padding:26px 22px; }.heroVisual { display:none; }.heroFlow { flex-wrap:wrap; }.moduleTabs { grid-template-columns:1fr 1fr; }.workspace { display:block; }.historyPanel { margin-top:14px; }.sourceGrid,.modelGrid.two,.modeChooser,.analysisGrid,.motionIntro { grid-template-columns:1fr; }.inlineSettings { grid-template-columns:1fr 1fr; }.panelHeader { padding:22px; }.privacyBadge { display:none; }.toolBody { padding:18px 20px 0; }.actionBar { align-items:stretch; flex-direction:column; margin:20px -20px 0; padding:18px 20px; }.motionFrames { grid-template-columns:repeat(3,1fr); }.linkResolver { padding:16px; }.resolverIcon { display:none; }.resolverHeading { align-items:flex-start; flex-direction:column; gap:3px; }.resolverInput { grid-template-columns:1fr; } }
@media (max-width:600px) {
  .moduleTabs { gap:8px; }
  .moduleTabs button { display:grid; grid-template-columns:28px minmax(0,1fr); gap:8px; min-height:76px; padding:11px; align-items:center; }
  .moduleTabs .tabIcon { width:28px; height:28px; border-radius:9px; font-size:16px; }
  .moduleTabs .tabText strong { font-size:12px; line-height:1.5; word-break:normal; }
  .moduleTabs .tabArrow { display:none; }
  .panelHeader h2 { font-size:22px; }
  .inlineSettings { grid-template-columns:1fr; }
  .draftToolbar { align-items:flex-start; font-size:11px; }
  .draftToolbar button { flex:none; }
}
/* 工具优先：克制的标题、单层导航和安静的操作区。 */
.viralPage { --orange:#df6a35; --ink:#2f322d; --muted:#85887f; box-sizing:border-box; background:#f8f9f6; padding:22px clamp(20px,2.6vw,40px) 40px; }
.hero { min-height:0; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:22px; padding:10px 2px 24px; border:0; border-bottom:1px solid #e6e8e1; border-radius:0; background:none; box-shadow:none; overflow:visible; }
.hero::after { display:none; }
.heroCopy { max-width:none; }
.eyebrow { gap:9px; color:#8c9085; font-size:11px; font-weight:500; letter-spacing:0; }
.eyebrow span { width:auto; height:auto; color:#c5c8bf; background:none; }
.hero h1 { display:flex; flex-wrap:wrap; align-items:center; gap:14px; margin:9px 0 8px; font-size:28px; line-height:1.3; font-weight:700; letter-spacing:-.035em; }
.hero h1 span { color:#8d9186; font-size:12px; font-weight:400; letter-spacing:0; }
.hero p { font-size:13px; line-height:1.7; color:#818579; }
.heroFlow { display:flex; align-items:center; flex-wrap:nowrap; gap:18px; margin:0; padding:0; list-style:none; color:#74796c; font-size:11px; }
.heroFlow li { display:flex; align-items:center; gap:6px; white-space:nowrap; }
.heroFlow li > span { display:grid; place-items:center; width:23px; height:23px; padding:0; border:1px solid #e4e7de; border-radius:50%; background:#fff; color:#949a8a; font-size:9px; font-variant-numeric:tabular-nums; }
.heroFlow li:first-child > span { background:#fff1e7; border-color:#f3ddcc; color:#c97547; }
.moduleTabs { padding:5px; margin:20px 0 18px; gap:4px; border:1px solid #e7e9e2; border-radius:13px; background:#eef0ea; }
.moduleTabs button { padding:11px 14px; gap:10px; border:1px solid transparent; border-radius:9px; color:#7c8175; background:none; box-shadow:none; transition:background .16s,color .16s; }
.moduleTabs button:hover { transform:none; background:#e5e9df; box-shadow:none; }
.moduleTabs button.active { border-color:#e6e8e0; color:#33382d; background:#fff; box-shadow:0 1px 3px #353b2410; }
.tabIcon,.moduleTabs button.active .tabIcon { width:24px; height:28px; border-radius:0; background:none; color:#919886; font-size:19px; }
.moduleTabs button.active .tabIcon { color:#dc7948; }
.tabText strong { font-size:13px; font-weight:600; }
.tabText small { color:#94998c; font-size:10px; }
.tabArrow { display:none; }
.workspace { grid-template-columns:minmax(0,1fr) 258px; gap:18px; }
.workPanel,.historyPanel { border-color:#e7e9e1; border-radius:16px; box-shadow:0 2px 5px #343b2203; }
.panelHeader { padding:22px 24px 18px; gap:14px; border-color:#eef0e9; }
.panelHeader h2 { margin:6px 0; font-size:20px; letter-spacing:-.025em; }
.panelHeader p { font-size:12px; line-height:1.7; }
.stepTag { color:#999f90; font-size:10px; letter-spacing:.02em; font-weight:500; }
.privacyBadge { max-width:155px; padding:0; border-radius:0; background:none; font-size:10px; line-height:1.8; color:#a3a89a; white-space:normal; text-align:right; }
.toolBody { padding:20px 24px 0; }
.linkResolver { border-color:#e6e9df; border-radius:12px; background:#fafbf8; padding:16px; gap:12px; }
.resolverIcon { width:32px; height:32px; border-radius:9px; background:#eef0e9; color:#7c8870; box-shadow:none; font-size:17px; }
.resolverHeading strong { font-size:13px; font-weight:550; }
.resolverHeading span { color:#a0a597; font-size:10px; }
.uploadCard { min-height:110px; padding:18px; border-radius:12px; border-color:#dce1d3; background:#fdfefb; box-sizing:border-box; }
.uploadCard p { max-width:none; white-space:normal; font-size:11px; line-height:1.6; }
.uploadGlyph { width:36px; height:36px; border-radius:10px; color:#969e87; background:#f0f3e9; }
.settingsCard { border-radius:12px; box-shadow:none; background:#f8faf5; border-color:#e8ecdf; }
.settingsTitle span,.specNote { font-size:10px; line-height:1.7; }
.actionBar { margin:22px -24px 0; padding:18px 24px; border-color:#e8ece0; background:#fafbf8; }
.historyPanel { top:20px; }
.historyTitle small { letter-spacing:0; font-weight:400; color:#a1a897; }
.principleCard { border-radius:11px; background:#f7f9f2; border-color:#e9eedf; }
.modelReadiness { display:flex; align-items:flex-start; gap:10px; margin:0 0 18px; padding:14px 17px; border:1px solid #ecdfce; border-radius:12px; background:#fffcf6; color:#91744e; }
.modelReadiness > .t-icon { flex:none; font-size:17px; margin-top:2px; }
.modelReadiness > div { flex:1; min-width:0; }
.modelReadiness strong { font-size:12px; font-weight:550; }
.modelReadiness p { margin:4px 0 0; font-size:11px; line-height:1.7; }
.modelReadiness small { display:block; margin-top:4px; font-size:10px; color:#a3967e; line-height:1.7; }
.modelReadiness button { flex:none; padding:4px 0 4px 8px; border:0; background:none; color:#a77245; font:inherit; font-size:11px; cursor:pointer; }
.modelReadiness button:disabled { cursor:wait; opacity:.65; }
.moduleTabs button:focus-visible,.modelReadiness button:focus-visible { outline:2px solid #d9865f; outline-offset:2px; }
@media(max-width:1200px) { .workspace { grid-template-columns:1fr; } .heroFlow { gap:12px; } }
@media(max-width:800px) { .viralPage { padding:18px 16px 30px; } .hero { padding-bottom:18px; gap:17px; } .hero h1 { font-size:24px; gap:10px; } .heroFlow { width:100%; gap:0; justify-content:space-between; font-size:10px; } .heroFlow li { gap:4px; } .heroFlow li > span { width:19px; height:19px; } .moduleTabs { grid-template-columns:1fr 1fr; } .moduleTabs button { padding:10px; } .toolBody { padding:18px 18px 0; } .panelHeader { padding:18px; } .actionBar { margin:20px -18px 0; padding:16px 18px; } .modelReadiness { padding:12px; gap:8px; } .modelReadiness button { font-size:10px; } }
@media(prefers-reduced-motion:reduce) { .moduleTabs button { transition:none; } }

.miniAction{margin-left:10px;padding:3px 10px;border:1px solid #e2e3dd;border-radius:999px;background:#fff;color:#5f6158;font-size:11.5px;font-weight:600;cursor:pointer;transition:border-color .15s ease,color .15s ease}
.miniAction:hover{border-color:#c9cac1;color:#26271f}
.promptPreview{margin:10px 0 2px;border:1px solid #e6e7e1;border-radius:12px;background:#fafaf7}
.promptPreview summary{padding:9px 14px;font-size:12px;font-weight:640;color:#6f7068;cursor:pointer;list-style:none}
.promptPreview summary::before{content:"▸ ";}
.promptPreview[open] summary::before{content:"▾ "}
.previewBody{padding:2px 14px 12px;font-size:11.5px;line-height:1.75;color:#7c7d74;max-height:220px;overflow:auto}
.previewBody p{margin:4px 0}
.previewBody b{color:#4a4b43}
.checkRow{flex-direction:row!important;align-items:center;gap:9px!important}
.checkRow input{width:16px;height:16px;accent-color:#f0743e}
.checkRow span{display:flex;flex-direction:column;gap:1px}
.checkRow strong{font-size:13px;color:#3c3d35}
.checkRow small{font-size:11px;color:#90918a}
.shotActions{display:flex;gap:8px;margin-top:8px}
.shotActions button{padding:5px 12px;border:1px solid #e2e3dd;border-radius:8px;background:#fff;color:#5f6158;font-size:11.5px;cursor:pointer;transition:border-color .15s ease,color .15s ease}
.shotActions button:hover{border-color:#c9cac1}
.shotActions .dangerAction:hover{border-color:#e08a8a;color:#c0392b}
.shotCard strong .miniAction{margin-left:6px}

.voiceRow{display:flex;align-items:center;gap:10px;margin:2px 0 12px;flex-wrap:wrap}
.voiceRow small{color:#90918a;font-size:11px}
.sequencePlayer{display:flex;flex-direction:column;gap:10px;margin:4px 0 16px;padding:14px;border:1px solid #e6e7e1;border-radius:16px;background:#fff}
.spHead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.spHead strong{font-size:14px;color:#2c2d26}
.spHead>span{font-size:11.5px;color:#90918a}
.spActions{margin-left:auto;display:flex;gap:6px}
.spActions button{padding:5px 12px;border:1px solid #e2e3dd;border-radius:8px;background:#fff;color:#4c4d45;font-size:12px;font-weight:600;cursor:pointer;transition:border-color .15s ease,color .15s ease}
.spActions button:hover:not(:disabled){border-color:#c9cac1}
.spActions button:disabled{opacity:.4;cursor:not-allowed}
.spStage video{width:100%;max-width:420px;aspect-ratio:9/16;object-fit:contain;border-radius:12px;background:#111;color-scheme:dark}
.spChips{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.spChips button{min-width:28px;height:26px;padding:0 8px;border:1px solid #e2e3dd;border-radius:8px;background:#fff;color:#6f7068;font-size:12px;font-weight:650;cursor:pointer}
.spChips button.active{border-color:#f0743e;background:#f0743e;color:#fff}
.spChips label{display:inline-flex;align-items:center;gap:5px;margin-left:auto;font-size:11.5px;color:#6f7068;cursor:pointer}
.spChips input{accent-color:#f0743e}
</style>
