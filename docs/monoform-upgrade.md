# 导演台（monoform）上游升级手册

> 适用对象：`frontend/monoform/`
> 上游：`MONOFORM · 素形白模预演工作台`（拿到源码包后按本文替换）

---

## 1. 目录约定

```
frontend/monoform/
├── upstream/          # 上游源码，原样入仓。只允许带 XOI-PATCH 标记的改动
│   ├── src/App.jsx  Viewport.jsx  ShotsPanel.jsx  rig.js  styles.css
│   ├── public/models/         # 人物白模（5.3MB）
│   └── public/branding/
├── xoi/               # XOi 定制层：独立文件，不依赖上游内部结构
│   ├── scene-key.js           # 多项目隔离（?key=）
│   ├── identity.js            # 启动前身份与工程归属核验
│   └── …
├── src/main.jsx       # 唯一入口：先核验身份，再渲染 upstream App
├── src/xoi-entry.css  # 主题入口（改上游 CSS 变量，不打 !important）
├── index.html
├── vite.config.js     # base:'./'，产物进 dist/
└── scripts/check-patches.mjs  # 构建前补丁自检
```

**产物去向**：`dist/` → 同步到 `frontend/public/monoform/`（iframe 加载路径与 `?key=` 契约不变，主站壳 `views/director3d/index.vue` 一行都不用改）。

---

## 2. 当前补丁清单

| 标记 | 文件 | 作用 | 漏了会怎样 |
|---|---|---|---|
| `XOI-PATCH:storage-key` | `upstream/src/App.jsx` | 把单项目常量换成 `?key=` 派生（`projectKey()` / `poseKey()`） | **所有场景塌成同一份**：打开场景 A 和 B 编辑的是同一块数据，功能看起来正常但数据串了 |

自检命令：`npm run check`（`npm run build` 已内置）。

新增补丁时**必须**同步更新 `scripts/check-patches.mjs` 的 `EXPECTED`，否则自检会报「未登记」。

---

## 3. 升级步骤

```bash
# 1) 备份当前 upstream（出问题能立刻回滚）
cd frontend/monoform
mv upstream upstream.bak.$(date +%Y%m%d)

# 2) 覆盖为新版源码（排除依赖、产物、体积大的教学视频）
rsync -a --exclude node_modules --exclude .git --exclude dist \
      --exclude 'public/tutorial' \
      /path/to/new-monoform/ upstream/

# 3) 重放补丁（按 §2 的表逐项做，每处都要带 XOI-PATCH 标记）
#    见 §4 的具体做法

# 4) 自检（漏补丁会在这里失败，构建被拦住）
npm run check

# 5) 构建
npm run build

# 6) 同步产物（先备份现网产物）
cd .. && mv public/monoform public/monoform.bak.$(date +%Y%m%d-%H%M)
cp -r monoform/dist public/monoform
#    保持 public/monoform/index.html 可被 /monoform/index.html 直接访问

# 7) 回归（见 §5）
```

---

## 4. 补丁重放做法

### 4.1 `XOI-PATCH:storage-key`

上游是三个模块级常量：

```js
const PROJECT_STORAGE_KEY = 'monoform-project'
const LEGACY_PROJECT_STORAGE_KEY = 'stageframe-project'
const CUSTOM_POSE_STORAGE_KEY = 'monoform-custom-poses'
```

改成：

```js
// 文件顶部
// XOI-PATCH:storage-key
import { projectKey, poseKey } from '../../xoi/scene-key.js'

// 常量区
// XOI-PATCH:storage-key —— 上游是单项目，本平台按 ?key= 做多项目隔离。
// 只在模块顶层求值一次：iframe 生命周期内 key 不会变。
const PROJECT_STORAGE_KEY = projectKey()
const LEGACY_PROJECT_STORAGE_KEY = 'stageframe-project'
const CUSTOM_POSE_STORAGE_KEY = poseKey()
// XOI-PATCH-END
```

**要点**：

- `?key=` 在 iframe 生命周期内不变，所以模块顶层求值一次是安全的
- `projectKey()` 的输出必须与旧注入脚本约定的 `monoform-project-${key}` 完全一致（云同步靠这个串起来）
- 若新版把 storage 访问散到了别处，**所有** `localStorage.getItem/setItem` 都要走 `projectKey()` / `poseKey()`

### 4.2 需要新增补丁的信号

升级后如果发现：

- 上游新增了别的 localStorage key → 都要按 `?key=` 隔离
- 上游改了 `projectData()` 的字段结构 → 同步 `shared/directorProject.ts` 的校验器（**这是后端拒收的闸门**）
- 上游改了导出/下载入口 → 需要暴露 `window.xoiDirectorScene.{checkpoint,captureFrame,importModel}` 给主站

---

## 5. 升级后必做的回归

按顺序，任何一步不过就别发布：

1. **多项目隔离**：账号 A 建两个场景，分别摆不同物体 → 来回切换 → 数据不能互相污染
2. **保存**：改一个物体 → 等"已自动保存" → 刷新 → 内容还在
3. **云同步**：关掉浏览器重开 → 场景仍在（这条要等 P1 的 scene-store 接好后才有）
4. **归属校验**：把 URL 的 `?key=` 改成别人的场景号 → 必须显示"这个工程不属于当前账号"
5. **带到画布**：截当前机位 → 画布出现参考图节点（选择器要按新 DOM 校准）
6. **导出**：导 PNG 和 MP4 各一次

---

## 6. 回滚

```bash
cd frontend
rm -rf public/monoform && mv public/monoform.bak.<时间戳> public/monoform
cd monoform && rm -rf upstream && mv upstream.bak.<时间戳> upstream
```

产物目录是静态文件，回滚不需要重启后端（浏览器硬刷新即可）。

---

## 7. 当前进度

| 阶段 | 状态 |
|---|---|
| **P0 源码入仓 + 多项目 key + 构建跑通** | ✅ 已完成（2026-10-24） |
| **P1 云同步 scene-store + 正式发布** | ✅ **已完成并上线（2026-10-24）** |
| P2 运镜预设 / 关键帧引导改 React 组件 + 主题暖橙 | 待做 |
| P3 `shared/` 校验器同步到 PROJECT_VERSION 16 | 待做（当前实测能过，只是没显式适配） |
| P4 场景图转白模（复用 GLB 导入通道） | 待做 |
| P5 机位预设 / 双视角 | 等上游下一个版本 |

### P1 实际结果（正式上线）

云同步重写为 `xoi/scene-store.js`，与旧 `xoi-scene-sync.js` 的关键差异：

| | 旧实现 | 新实现 |
|---|---|---|
| 拦截方式 | 改 `Storage.prototype.setItem`（全局） | 只包装 `localStorage.setItem`（实例级） |
| 触发保存 | `querySelector('.top-actions button')` 找「保存」再 click + 12 秒轮询 | **不需要**——上游自带 900ms 防抖自动保存，拦一次写入就够 |
| 状态显示 | 往 `body` 注入徽标 DOM | postMessage 交给宿主 |
| 版本判断 | 字符串逐字节比较 | **语义比较**（键排序后比较，见下） |
| DOM 依赖 | 8 处选择器 | 只剩 1 处（`.time-readout strong` 读帧号，读不到就当 0） |

**修掉的一个真 bug**：上游保存是把 state 重新组装再 `JSON.stringify`，字段顺序与云端原文不同。
逐字节比较会误判成"内容变了"，于是**每打开一次页面就白写一个新版本**（实测 revision 1→2）。
改成「键排序后比较」即可判定语义相同，不再空写。验证：连续打开两次，revision 稳定在 2。

### 验证记录

| 项 | 结果 |
|---|---|
| 多项目隔离 | `monoform-project-<sceneId>` 与 `monoform-custom-poses-<sceneId>` 都带场景号 ✅ |
| 云同步写入 | 首次打开 → `PUT` → 云端 `revision: 1`，`payload.schemaVersion: 1` ✅ |
| 云端读回 | 全新浏览器 profile（本地零数据）→ 拉到 65,501 字符工程 ✅ |
| 不空写版本 | 连续打开两次 revision 保持 2 ✅ |
| 线上产物 | `/monoform/` 下 JS/CSS/白模全部 200，UI 完整渲染，`status: saved` ✅ |
| 旧注入脚本 | 7 个全部退役，产物目录已无 `xoi-*.js` ✅ |

### 正式发布做了什么

```bash
cd frontend/monoform && npm run build && node scripts/publish.mjs
# public/monoform → 备份为 monoform.bak.<时间戳>，新产物就位
# 再同步到 backend/data/web/monoform（同样先备份旧目录）
```

现网 `/#/director3d` 已指向新产物，**用户刷新即生效**，后端无需重启。

### P0 实际结果

- 源码入仓 `frontend/monoform/upstream/`（App.jsx 2251 行 / Viewport 1336 行 / rig.js 等，删除 23MB 教学视频）
- `npm install`（72 包）+ `vite build` 通过，产物 7.7MB（含白模 5.3MB）
- 发布到 `frontend/public/monoform-next/` 做预览，**没有覆盖现网 `public/monoform/`**
- 隔离实证：同会话内读 localStorage 得到
  `monoform-project-director3d-u1-f941adc4-…` 与 `monoform-custom-poses-director3d-u1-f941adc4-…`，
  工程数据 6480 字符，两个 key 都正确带上场景号
- 踩到的坑：Vite 默认 publicDir 是项目根的 `public/`，上游资源在 `upstream/public/` 下，
  不显式指定 `publicDir: 'upstream/public'` 的话产物里没有 `models/`，3D 人物一加载就 404

### 为什么现在**不能**直接替换现网

新产物里没有 `xoi-scene-sync.js`，也就是**没有云端同步**。现在切过去，用户的场景只写浏览器本地，
换设备/清缓存就没了——这是功能倒退，不能上线。所以：

**P1（scene-store 云同步）是上线的硬前提，不是可选项。**

