# XOi Web

XOi AI 短剧创作平台的前端应用，基于 Vue 3、TypeScript、Vite、Pinia 和 TDesign 构建。

## 本地运行（统一入口）

在仓库根目录执行 `./start.sh`，网页、API 和实时连接统一使用 `http://localhost:12121`。不启动 Vite、nodemon 或调试监听进程。数据库和模型网关作为内部依赖保留。

修改前端后使用 `./stop.sh`、`./start.sh --build` 构建并更新网页。使用 `--skip-docker` 可复用已运行的数据库和网关。

## 本地快捷命令

```bash
yarn install
yarn dev
```

`dev` 和 `preview` 均复用 12121，不再启动独立的网页开发或预览服务器。代码更新后按下面的构建步骤生成网页，再同步到后端。

## 构建

```bash
yarn type-check
yarn build
```

生产构建产物位于 `dist/`，由后端服务或 Web 服务器托管。

## 主要模块

- 项目与剧本管理
- 角色、场景、道具和音视频资产管理
- 无限画布与分镜创作
- AI 编剧、导演和生产 Agent
- 视频时间线与导出
- 积分、会员和订单中心
- 多语言与系统设置

许可证和第三方依赖声明见仓库根目录及本目录中的 `LICENSE`、`NOTICES.txt`。
