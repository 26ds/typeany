# M1 LOG — 基座:Fork、裁剪、重品牌、Landing

> 按分片追加,每条遵循 CLAUDE.md 的 LOG 模板。代码结构地图放在 M1a 末尾专节。

## M1a — Fork + 环境跑通 + 代码地图(2026-07-22)

- 实现:
  - Fork `monkeytypegame/monkeytype` → `26ds`,仓库改名 `typeany`;clone 到 `Desktop/打字项目/typeany/`(remote:origin=26ds/typeany、upstream=monkeytypegame;327MB 全量历史)。
  - 迁入 `WORKORDER.md` / `CLAUDE.md` / `docs/` / `design/` 到仓库根;上游 CLAUDE.md 转存 `docs/UPSTREAM-DEV-NOTES.md`。
  - 工具链:nvm 装 Node **24.11.0**(`.nvmrc`,`.npmrc` engine-strict 强制);pnpm **10.28.1**(package.json `packageManager` 自管,无需 corepack);`pnpm install` 成功(1m44s)。
  - `firebase-config.ts` 由 example 复制、字段留空 → 账号禁用 = 游客模式(该文件被 `.gitignore`)。
  - `pnpm dev-fe` 跑通:**Vite v8.0.5 @ http://localhost:3000**,oxlint 0 error / 0 warning(586 文件)。

- 交互逻辑(浏览器实测 words-10 英文):
  - 结算页完整渲染:wpm、acc、raw、consistency、characters(x/x/x/x)、test type、time 全字段;每秒曲线图(chart-controller + canvas)存在且已绘制数据点(hover tooltip 显示 correct/incorrect)。
  - 引擎行为:**点击/聚焦词区会重新生成词表**(自动化取词必须在聚焦之后);首次按键启动计时;words 模式打满 N 词即自动结算。
  - 自动化局限:浏览器 `type` 瞬间注入 = 0s 测试,被判 `too short / afk / Infinite wpm`,曲线无时间序列点。真人正常速打字正常出曲线,非 fork 缺陷。

- 关键文件:见下方「代码结构地图」。

- 计划外变更:
  - CLAUDE.md「迁移注意」改写为「仓库与环境(M1a 已完成)」,补 origin/upstream、Node/pnpm 版本、启动命令、UPSTREAM-DEV-NOTES 指针(为换机无缝)。
  - 上游 CLAUDE.md 未原位保留,转存 `docs/UPSTREAM-DEV-NOTES.md`(根位让给我们的治理文件)。

- 已知问题 / 未完:
  - `ssh2` 可选 crypto 原生绑定在 node24 编译失败(nan/v8 API 不兼容),自动退回纯 JS,**不影响前端**;backend 若真用到 SSH 再议。
  - `@parcel/watcher` build script 被 pnpm 默认拦截(dev-fe 正常未触发);若需其原生文件监听再 `pnpm approve-builds`。
  - Browserslist 数据旧(提示级),忽略。
  - `firebase-config.ts` 被 gitignore → 换机 clone 后需重新 `cp firebase-config-example.ts firebase-config.ts`(CLAUDE.md 启动步骤已注明)。

- 下一步:M1b 界面裁剪(隐藏入口优先,不深删)。

---

### 代码结构地图(frontend/src)

栈:**SolidJS + TS + Vite8 + Tailwind4**;前端由 vanilla 迁移中,legacy `.ts` 与新 `.tsx` 并存。样式用 Tailwind class + `cn`,颜色仅限 config 内定义(见 UPSTREAM-DEV-NOTES)。

**入口 / 启动**
- `index.html` → `ts/index.ts`(总入口,副作用式 import 初始化)。
- index.ts 接线(M1b/c 关注):`controllers/ad-controller`、`popups/video-ad-popup`(egVideoListener)、`sentry`、`firebase` init、`auth`、`db`、`controllers/route-controller`、`components/mount`(SolidJS 挂载)、`elements/psa`、config store/lifecycle;含 `Math.random` 锁定(反作弊)。
- `ts/ready.ts`、`pages/{page,test,loading}.ts` = 页面生命周期。

**路由**(`controllers/route-controller.ts`)
- 自实现 path→regex 路由。路由表:`/`(打字页)、`/verify`、`/leaderboards`、`/about`、`/settings`、`/login`、`/account`、`/account-settings`、`/profile[/:uidOrName]`、404。
- 注释提示:加路由须同步 `firebase.json` rewrite。→ M1d landing 在此加 `/` landing 或新路由。

**打字引擎**(`ts/test/` + `ts/input/`)
- 判定/主逻辑:`test/test-logic.ts`;输入:`input/`(input-element.ts、handlers/、listeners/、state.ts);词生成:`test/words-generator.ts`、`test-words.ts`、`wordset.ts`、`custom-text.ts`。
- caret:`test/caret.ts`(+`elements/caret.ts`);**对手 pace 线:`test/pace-caret.ts`(← M7 PK 参考)**;计时:`test/test-timer.ts`;焦点:`test/focus.ts`。
- 结算/统计:`test/result.ts`、`test/events/stats.ts`;**曲线图:`controllers/chart-controller.ts`(Chart.js)**;PB 皇冠:`test/pb-crown.ts`;replay:`test/replay-ui.ts`。
- **三分类/跳过(我们的核心差异,M2+ 改造点)**:字符判定集中在 test-logic + words-generator + input/handlers。

**配置系统**(`ts/config/`)
- SolidJS store:`config/store.ts`(Config);读写:`setters.ts`、`persistence.ts`(localStorage)、`lifecycle.ts`(loadFromLocalStorage)、`remote.ts`、`validation.ts`;**模式/设置元数据:`config/metadata.tsx`(punctuation/numbers/time/words/quote/zen/custom 定义源)**。

**顶栏 / 页脚 / 配置条**(M1b 裁剪、M1c 重品牌)
- 顶栏:`components/layout/header/`{Header,Logo,Nav,AccountMenu,AccountXpBar}.tsx;状态 `states/header.ts`。**Nav.tsx = 键盘图标/排行榜皇冠/info/铃铛/设置/账号入口**;Logo.tsx = logo(M1c)。
- 页脚:`components/layout/footer/`{Footer,Keytips,ScrollToTop,ThemeIndicator,VersionButton}.tsx。
- **配置条 pills:`components/pages/test/TestConfig.tsx`(桌面)+ `components/modals/MobileTestConfigModal.tsx`(移动)** = punctuation/numbers/time/words/quote/zen/custom 渲染处 → M1b 隐藏 quote/zen。

**主题**(M1c Ink Aurora)
- `controllers/theme-controller.ts` + `frontend/src/styles`(Tailwind4 颜色变量);主题清单见上游 `docs/THEMES.md`;页脚 ThemeIndicator 显示当前主题。

**广告 / Sentry / 统计**(M1b 移除)
- 广告:`controllers/{ad-controller,eg-ad-controller,pw-ad-controller}.ts`、`popups/video-ad-popup.ts`、`elements/merch-banner.tsx`。
- Sentry:`ts/sentry.ts`(index.ts 引入)。统计:`controllers/analytics-controller.ts`。PSA:`elements/psa.tsx`。

**品牌串**(M1c)
- 核心:**`src/html/head.html`**(`<title>`、meta description 关键词表、og:*、twitter、preconnect api.monkeytype.com、mtsocial.png)。
- 其余:`ts/{db,auth,ui,firebase,sentry}.ts`、`ts/ape/*`(API 层,多为后端 URL/标识,随 M6 处理);manifest/favicon 待 M1c 落地时定位(可能构建生成)。
