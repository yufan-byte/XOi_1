<template>
  <div class="about">
    <t-card bordered :style="{ width: '100%' }" class="logoCard">
      <div class="f">
        <img src="@/assets/XOI_logo.png" alt="XOi Logo" class="logo" />
        <div class="appName">
          <div class="name">XOi</div>
          <div class="data">{{ $t("settings.about.slogan") }}</div>
          <div class="version">
            <t-tag theme="primary" shape="round" size="small" style="padding: 10px">v{{ version }}</t-tag>
          </div>
        </div>
      </div>
    </t-card>

    <div class="codeRepository">
      <span>{{ $t("settings.about.codeRepository") }}</span>
      <t-card bordered :style="{ width: '100%' }" class="logoCard">
        <div class="ac jb" style="cursor: pointer" @click="openLink('https://github.com/yufan-byte')">
          <div class="f">
            <div class="github">
              <i-github fill="#000" theme="outline" size="22" class="c" style="width: 100%; height: 100%" />
            </div>
            <div style="margin-left: 15px">
              <div>
                <span style="font-size: 15px; font-weight: 900">{{ $t("settings.about.githubRepo") }}</span>
              </div>
              <div>
                <span style="font-size: 12px; color: #666">https://github.com/yufan-byte</span>
              </div>
            </div>
          </div>
          <i-right theme="outline" size="18" />
        </div>
      </t-card>
    </div>

    <div class="license">
      <span>{{ $t("settings.about.license") }}</span>
      <t-card bordered :style="{ width: '100%' }" class="logoCard">
        <div class="ac jb">
          <div class="f">
            <div class="data">
              <i-notes fill="#000" theme="outline" size="20" class="c" style="width: 100%; height: 100%" />
            </div>
            <div style="margin-left: 15px">
              <div>
                <span style="font-size: 15px; font-weight: 900">{{ $t("settings.about.licenseName") }}</span>
              </div>
              <div>
                <span style="font-size: 12px; color: #666">{{ $t("settings.about.licenseDesc") }}</span>
              </div>
            </div>
          </div>
        </div>
      </t-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import store from "@/stores/index";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const { version } = storeToRefs(store());

function openLink(url: string) {
  window.open(url, "_blank");
}

onMounted(async () => {
  const { data } = await axios.get("/other/getVersion");
  version.value = data;
});
</script>

<style lang="scss" scoped>
.about {
  .logoCard {
    padding: 15px;
    .logo {
      width: 72px;
      height: 72px;
      border-radius: 16px;
      background-color: #ececec;
    }
    .appName {
      width: 90%;
      margin-left: 20px;
      .name {
        font-weight: 900;
        font-size: 20px;
      }
      .data {
        margin-top: 5px;
        font-size: 12px;
        color: #666;
      }
      .version {
        margin-top: 5px;
        font-size: 14px;
        color: #666;
      }
    }
  }
  .logoCard {
    margin-top: 5px;
  }
  span {
    font-size: 12px;
    font-weight: 500;
  }
  .codeRepository {
    margin-top: 15px;
    .github {
      width: 50px;
      height: 50px;
      border-radius: 8px;
      background-color: #ececec;
    }
  }
  .license {
    margin-top: 15px;
    .data {
      width: 50px;
      height: 50px;
      border-radius: 8px;
      background-color: #ececec;
    }
  }
}
</style>
