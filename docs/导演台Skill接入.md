# 导演台 Skill 接入

导演台内的「导演技能」读取当前白模场景，生成可审阅的镜头方案。用户确认后可添加相机预演镜头，或把方案与每镜提示词带入画布制作。生成方案用文本模型；预演应用、切换技能、交接画布均不自动调用媒体模型。

## 本次选择

| 原包 | 导演台显示 | 融合用途 | 可应用机位 |
| --- | --- | --- | --- |
| seedance-shot-design | 电影镜头设计 | 景别、构图、焦距、光影、运镜 | 是 |
| seedance-shotlist-director | 导演分镜表 | 故事拆镜、站位、视线与连续性 | 是 |
| emotion-director | 情绪与场面调度 | 情绪转动作、节奏与机位建议 | 是 |
| emotion-expression-director | 微表情指导 | 眼神、呼吸、眉嘴与表演提示词 | 否 |
| seedance-previz-to-render | 白模预演精修 | 保持原调度机位，补充材质光影 | 否 |
| fpv | FPV 穿越运镜 | 空间穿越、速度与纵深 | 是 |
| seedance-seamless-stitch | 镜头衔接与转场 | 镜头出入点、动作接续、转场提示词 | 否 |

购买的 175 项中本次适配上述 7 项。完整原包正文与参考资料保留，共 45 个文件；每轮按所选技能和需求读取正文及相关参考，不静默截断。原平台工具名、模型名和输出流程由 XOi 的能力约束替代，不执行包内脚本。

## 使用

1. 打开 `/director3d`，进入自己的场景，搭建演员、道具和动作。
2. 点「导演技能」，选技能、文本模型和 1 / 3 / 6 个方案镜头，描述需求。
3. 点「读取场景并生成方案」，检查构图、运镜、假设与限制。
4. 支持机位的方案可点「添加为预演镜头」。创建新镜头，保留原镜头、演员、动作、画幅、灯光与参考；可撤销最近一次添加。生成后如场景已修改，需重新生成。
5. 点「带入画布制作」创建完整方案、每镜文字及视频配置节点。选择实际媒体模型并点击生成后才开始制作；画布的「返回导演台」回到原场景。

预演只自动写入相机路径。演员调度、微表情、灯光精修与转场是建议；不会假装白模引擎已有这些执行能力。精修保留具体动作和机位时，需另导出白模截图或录像并上传为参考。仅 3D 参数不等于已经分析了视频像素或音轨。

## 文件位置与部署

在 `backend/` 下运行：

```sh
./node_modules/.bin/tsx scripts/import-director-skills.ts /Users/zhaochenyu/Downloads/skills_copy
```

包放入 `backend/data/skills/purchased/director/<skill-id>/`；`manifest.json` 记录文件清单与 SHA-256。重复导入相同内容可运行，已有不同版本时拒绝覆盖。购买正文不提交 Git；部署其他机器时需将这一目录单独同步，或从原包重新导入。接口列出未导入状态，缺失参考文件时拒绝生成。

前端入口：`frontend/src/components/director/DirectorSkillsPanel.vue`；场景适配：`frontend/src/utils/directorScene.ts`；公共目录与校验：`shared/directorSkills.ts`；后端：`backend/src/utils/director/` 与 `/api/aiAssistant/director/skills`、`/plan`。

导演台工程本次依赖账号验证与用户工程命名空间；计划与草稿按账号、场景保存。后端使用登录身份检查工程前缀，并使用该用户的 NewAPI 凭据。前缀仅用于本地工程隔离，场景本身仍在浏览器存储，不是服务端工程 ACL。原公共工程不自动认领。

模型只能读脱敏场景元数据并返回经过校验的方案，没有画布写入、生成、Shell 或联网工具。相机路径校验焦距、有限坐标、关键点数量和顺序。应用和撤销均先比较工程指纹，账号切换拒绝继续使用旧面板。

## 验证

```sh
# backend/
./node_modules/.bin/tsx --test src/utils/director/director.test.ts
# frontend/，本机安装 Playwright 或设置 PLAYWRIGHT_MODULE 为其 index.mjs
node scripts/test-director-skills.mjs
```

单元测试覆盖场景脱敏、账号隔离、相机约束、演员动作保留、完整参考读取、路径越界、模型失败与工具调用拒绝。浏览器测试使用真实 Vue 面板与 MONOFORM 引擎，验证场景读取、原镜头与演员动作保留、相机导入、撤销、过期方案拒绝、画布交接及账号切换；模型与身份接口用测试响应，不消耗付费额度。
