import { createApp } from "vue";
import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import App from "./App.vue";
import router from "./router";
import i18n from "./locales";
import { installIcons } from "@/utils/icons";
import "@icon-park/vue-next/styles/index.css";

import "tdesign-vue-next/es/style/index.css";
import { LoadingDirective, LoadingPlugin } from "tdesign-vue-next";

import "@/utils/global";


import "md-editor-v3/lib/style.css";
import "splitpanes/dist/splitpanes.css";

import "./assets/main.scss";
import "./styles/theme.scss";
import "./styles/readability.scss";
import "../shared/styles/overlay-motion.css";

import { imageOptimizer } from '@/utils/imageOptimizer'
import { installBillingFetchGuard } from "@/utils/billingGate";
import {installSiteBrand} from "@/utils/siteBrand";
import {installAccountBoundary} from '@/utils/accountBoundary';
import {prepareMediaSession} from '../shared/mediaSession';
installAccountBoundary();
installBillingFetchGuard();
installSiteBrand();

const app = createApp(App);
app.use(imageOptimizer)
installIcons(app);
app.use(createPinia().use(piniaPluginPersistedstate));
app.use(router);
app.use(i18n);
app.use(LoadingPlugin);
app.directive("loading", LoadingDirective);
// Prepare private playback before any project thumbnails/videos are mounted.
void prepareMediaSession().catch(()=>{}).finally(()=>app.mount("#app"));
