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
- 其余:`ts/{db,auth,ui,firebase,sentry}.ts`、`ts/ape/*`(API 层,多为后端 URL/标识,随 M6 处理)。
- 静态资源(manifest.json/favicon/robots/sitemap/images/sounds)在 **`frontend/static/`**(vite `publicDir`);生产构建产物在 `frontend/dist`(index.html + 5 个独立 HTML + PWA sw.js)。

---

## M1 旁支 — 部署准备(Vercel,2026-07-22)

- 实现:验证生产构建 `pnpm build-fe`(前置:env `RECAPTCHA_SITE_KEY` 占位 + `firebase-config-live.ts` 存在)→ 输出 `frontend/dist`;写 `vercel.json`(install=`pnpm install`、build=`pnpm build-fe`、output=`frontend/dist`、SPA rewrite `/(.*)`→`/index.html`);提交空白 `firebase-config.ts`/`firebase-config-live.ts`(.gitignore 加放行)让构建开箱即用。
- 关键发现:生产 `vite.config.ts` 把 `constants/firebase-config` alias 到 `-live`;`!isDevelopment` 时强制要求 `RECAPTCHA_SITE_KEY`(且设了 `SENTRY` 才要 `SENTRY_AUTH_TOKEN`,我们不设)。
- Vercel import 设置:Root=仓库根、Framework=Other、Env `RECAPTCHA_SITE_KEY`=占位/Google 测试 key、Node=24。
- 未完:用户自建 Vercel 账号并 import(账号/授权类不可代做);Supabase 空项目备用(M6 接线)。
- 注:reCAPTCHA/Sentry/analytics 将在 M1b 移除,届时该 build env 依赖可去除。
- 用户侧(2026-07-22):Vercel + Supabase 均已注册。Vercel import 遇 monorepo 多服务检测(自动选「Services」preset,欲连 backend 一起部署)→ 指引改 **Application Preset = Other**(单应用只部署前端;勿选 Vite,否则不经 turbo 建 packages 会失败);Project Name 建议 `typeany`(此项目=前端)。**已回填(2026-07-31 实测):live URL = https://typeany.vercel.app,GitHub 自动部署正常,push 后无需手动操作。**
- 决策:后端 / DB / Auth 定为 **Supabase**(WORKORDER 已从待确认 #6 移入已定决策)。

---

## M1b — 界面裁剪(2026-07-23)

- 实现(逐项对照 WORKORDER「Random 页裁剪表」+ M1 计划移除清单):
  - **模式按钮删 quote / zen**:桌面 `TestConfig.tsx` 的 `Mode` modeOptions 与移动 `MobileTestConfigModal.tsx` 的 `modes` 均改为 `["time","words","custom"]`。
  - **顶栏删皇冠(排行榜)/ info / 通知铃铛**:`Nav.tsx` 移除三个 `Button` 及随之失效的 import(`prefetchAboutPage`/`prefetchLeaderboardPage`/`NotificationBubble`/`showModal`)与 `showAlertsNotificationBubble` memo;保留 键盘/设置/账号/XP。
  - **广告位**:默认配置 `default-config.ts` `ads: "result"` → `"off"`(关掉结算页广告位);`ready.ts` 移除 merch 横幅(`MerchBanner.showIfNotClosedBefore()` 及其 import)。
  - **Sentry / 第三方统计**:`cookies.ts` 的 `activateWhatsAccepted()` 清空(原按 cookie 同意调 `activateAnalytics()`/`activateSentry()`)→ 两者永不激活;移除对应 import(含 `isProfilerMode`)。
  - **捐赠 / 社交入口**:`Footer.tsx` 删 support(捐赠)、github、discord、twitter;保留 contact / terms / security / privacy / 主题 / 版本。
- 交互逻辑 / 边界:
  - 策略=**隐藏入口不深删**。quote/zen 面板组件(`Mode2Quote` 等)与 `/leaderboards`·`/about` 路由、`ad-controller`·`analytics-controller`·`sentry` 模块**均原样保留**,仅切断入口/激活;避免连锁破坏,深删留 M2/M3。
  - Sentry 已功能性移除:错误上报点(`config/validation.ts`、`test/test-logic.ts`、`auth.tsx`)经 `sentry.ts` 里**动态 `import("@sentry/browser")`**,无 `activateSentry()`→ 永不 init、事件丢弃;`vendor-sentry` 是懒加载 chunk,游客流程不加载。
  - `analytics-controller.log()` 未激活时 `analytics===undefined`→ `logEvent` 抛错被 try/catch 吞掉,空转无副作用,故 test-logic/commandline 的埋点调用点无需改。
- 关键文件:`components/pages/test/TestConfig.tsx`、`components/modals/MobileTestConfigModal.tsx`、`components/layout/header/Nav.tsx`、`components/layout/footer/Footer.tsx`、`constants/default-config.ts`、`ready.ts`、`cookies.ts`。
- 验证:`pnpm lint-fe`(oxlint --type-aware --type-check)0 error/0 warning(588 文件);`pnpm build-fe` 成功(32s,PWA 产物齐);浏览器 localhost:3000 实测——顶栏仅键盘/设置/账号,配置条仅 time/words/custom(+punc/num、字数档、tools),页脚仅 contact/terms/security/privacy,无 merch 横幅。
- 计划外变更:无(均在 M1b 清单内)。
- 已知问题 / 未完:
  - **cookie 同意弹窗仍在**(首次加载弹出):其 gated 的 analytics/sentry 已空转、ads 已默认关,弹窗已无实际作用。未在 M1b 清单内,留 M1c/M2 决定是否整体移除(游客+localStorage 站点或可免同意)。
  - logo/标题仍为 "monkeytype" = M1c 重品牌处理,本期不动。
  - `ads`/`sentry`/`analytics` 三模块与 `vendor-sentry` chunk 仍在仓库/构建产物中(惰性、不运行);彻底删模块与瘦身随 M2/M3 顺手做。
- 下一步:M1c 重品牌 + Ink Aurora 基础主题(清 monkeytype 品牌串、默认主题、GPL README)。

---

## M1b 加固 — 永久零广告(2026-07-23)

- 背景:用户明确「不要任何广告」。M1b 仅把 `ads` 默认改 `off`,但设置页仍有开关、命令面板/旧 localStorage/导入预设仍能改回 → 不够。此次做到**恒零广告**。
- 实现:
  - `config/metadata.tsx` 的 `ads.overrideValue` 从「dev 才 off」改为**所有环境恒返回 `"off"`**。这是配置系统的强制覆盖钩子,`Config.ads` 的**生效值**永远是 off,与 localStorage 存值/预设/命令面板无关 → `ad-controller` 的 `reinstate`/`renderResult` 全走 `Config.ads==="off"` 早退,第三方广告 SDK(PW/EG)**永不加载**。
  - `components/pages/settings/SettingsPage.tsx`:删 danger zone 的 `<SearchableAutoSetting key="ads" />`(设置页不再有广告开关)。
  - `components/modals/CookiesModal.tsx`:删「advertising」同意区块(调 ad CMP `showConsentPopup`)及随之孤儿的 import(`showConsentPopup`、`showErrorNotification`)。
- 交互逻辑:`overrideValue` 是单点硬保证;设置项与 cookie 广告同意区块的删除是配套清理。选择配置层锁死而非改 `ad-controller` 内部,是因后者 gut 会让 `init`/`checkAdblock`/EG/PW 变未用函数,触发 oxlint 连锁 → 配置层零连锁。
- 关键文件:`config/metadata.tsx`、`components/pages/settings/SettingsPage.tsx`、`components/modals/CookiesModal.tsx`。
- 计划外变更:无(深化 M1b 广告移除;已在 WORKORDER「已定决策」记入永久零广告)。
- 已知问题 / 未完:`ad-controller.ts` 与 EG/PW/video-ad-popup 模块及广告容器 DOM 仍在(惰性、恒不触发);彻底删随后期。
- 下一步:M1c 重品牌 + Ink Aurora 基础主题。

---

## M1c-1 — 品牌清理(去 monkeytype 名称/logo)(2026-07-23)

- 实现(主可见面的 monkeytype 品牌 → TypeAny):
  - **文字 logo**:`Logo.tsx` 删 monkeytype 鼠标 SVG 与 "monkey see" 副文,改为文字 wordmark `TypeAny`(`Type` 用 text 色,`Any` 用 main 色;字体 `"Sora","Space Grotesk",system-ui`——字体文件 M5,先系统兜底);`aria-label` → "TypeAny Home"。
  - **head.html**:`<title>`、`meta name/description/keywords/author`、`og:title/description`、`twitter:title/card` 全改 TypeAny;删 monkeytype.com 的 `og:url`/`og:image`/`twitter:image`/`meta image` 外链;删 `preconnect api.monkeytype.com`(后端 M6 再配);favicon 首选新的 `favicon.svg`,删 monkeytype 的 apple-touch/safari mask-icon/msapplication(TileColor/browserconfig)。
  - **favicon.svg**:重画为 Ink Aurora「T」标(深底 `#0B1112` + 主色 `#8BE9B5`)。
  - **PWA manifest**(`vite.config.ts`):`name`/`short_name` → TypeAny。
  - **README.md**:重写为 GPL 合规版——声明 fork 自 Monkeytype、GPL-3.0、链上游、保留 Monkeytype/Miodec 致谢、说明前端 GPL 开源 / 后端独立闭源。
- 交互逻辑:logo 聚焦(打字中)时 `Any` 去掉 main 色随整体变暗(`classList`,规避 oxlint `solid/prefer-classlist`)。
- 关键文件:`components/layout/header/Logo.tsx`、`src/html/head.html`、`static/images/favicon/favicon.svg`、`vite.config.ts`、`README.md`。
- 验证:lint 0/0、build 绿;浏览器 tab 标题为「TypeAny — type through your own books」,顶栏 logo 显示文字 `TypeAny`(monkeytype 鼠标图标已除)。
- 计划外变更:无。
- 已知问题 / 未完:
  - **残留 monkeytype 串在游客态不可达面**,留后续清:`AboutPage.tsx`(/about 的 nav 入口 M1b 已删、仅 URL 可达);`SupportModal.tsx`(footer support 入口 M1b 已删=孤儿);账号相关 `RemoveAuthMethodModal`/`AccountTab`(登录后才见,M6)。上游 API URL `api.monkeytype.com`(ape 层)随 M6 换我方后端。
  - **光栅 favicon/PWA 图标仍是 monkeytype**:`favicon.ico`、`apple-touch-icon.png`、`android-chrome-*.png`、`maskable/general_icon`。SVG favicon(现代浏览器 tab 可见面)已换;光栅版需图像工具从源 SVG 重新生成 → 资产任务,待办。
  - head.html `:root` 兜底色与 manifest `theme_color/background_color` 仍是 serika(`#323437`/`#e2b714`)→ 随 M1c-2 换 Ink Aurora。
- 下一步:**M1c-2** 新建 `typeany` 主题(Ink Aurora B 色板,写入 `themes.ts` + schema `ThemeName`,设为默认);之后 **M1c-3** 玻璃拟态 v1(背景渐变 + 面板半透明 blur)。

---

## M1c-2 — Ink Aurora 主题(色板)+ 设为默认(2026-07-23)

- 实现:新建 `typeany` 主题并设为全站默认,色板照 `design/README.md` B「Ink Aurora」。
  - `packages/schemas/src/themes.ts`:`ThemeNameSchema` 枚举追加 `"typeany"`(与前端 `themes.ts` 的 `Record<ThemeName,Theme>` 类型对齐,turbo 会先重建 schemas 包)。
  - `frontend/src/ts/constants/themes.ts`:加 `typeany` 条目。映射:`bg #0b1112`、`main #8be9b5`(正确/主按钮)、`caret #75d8d1`(辅助/光标)、`sub #84958d`(弱文字/未打)、`subAlt #1d2a28`(卡片底)、`text #eef8f1`(主文字)、`error #ff6b6b`;`errorExtra #9e4b4b`、`colorfulError #ffc46b`(取 B 琥珀强调)、`colorfulErrorExtra #b3894b` 为派生值(design 未直接给,按暗底和谐取)。
  - `frontend/src/ts/constants/default-config.ts`:`theme`/`themeLight`/`themeDark` 全设 `typeany`(暗色单主题;autoSwitch 默认关时只 `theme` 生效)。
  - `frontend/src/html/head.html`:`:root` 兜底色变量 + `frontend/vite.config.ts` PWA `theme_color`/`background_color` 同步为 Ink Aurora(`#0b1112`),消除首屏/安装态的 serika 黄。
- 交互逻辑:主题系统是 `themes.ts`(色值)→ theme-controller 注入 CSS 变量;`typeany` 无 `hasCss`,纯色板、无特效 CSS 文件。picker 从 `themes.ts` 取,故新主题自动出现在设置的主题列表。
- 关键文件:`packages/schemas/src/themes.ts`、`frontend/src/ts/constants/themes.ts`、`constants/default-config.ts`、`src/html/head.html`、`vite.config.ts`。
- 验证:lint 0/0、build 绿;浏览器清 localStorage 后默认即 Ink Aurora——背景墨绿黑、logo「Any」与主按钮墨绿(`#8be9b5`)、次要文字/未打词暗灰绿。
- 计划外变更:无。
- 已知问题 / 未完:仍是**平面纯色**,无玻璃拟态(背景径向渐变 + 面板半透明 + backdrop-blur + 边框高光)——留 M1c-3;圆角/间距 token(B:小按钮 12 / 配置条 18 / 卡片 28)与字体文件(Sora/IBM Plex Mono)随 M1c-3 / M5。AA 对比度已按 design §9 选色(text/sub 达标),玻璃层落地后需按"最差背景透出"复检。
- 下一步:**M1c-3** 玻璃拟态 v1(全局 CSS:body 背景渐变 + 主面板/弹窗半透明 blur + 圆角 token)。

---

## M1c-3 — 玻璃拟态 v1(2026-07-23)

- 实现(照 design/README B「Ink Aurora」§4 玻璃参数 + §8 动效):
  - 新建全局 `frontend/src/styles/glass.scss`,加入 `index.scss` 的 `@import` **末位**(同 `custom-styles` 层内后导入胜出,压过 `popups.scss` 的 `.modal`)。
  - **Aurora 背景**:`body` 背景改为两道 radial-gradient 微光(绿 `rgba(75,170,135,.13)` + 琥珀 `rgba(255,180,85,.10)`)叠在 `var(--bg-color)` 上,`background-attachment: fixed`。
  - **弹窗玻璃**:`.popupWrapper/.modalWrapper` 遮罩 `rgba(3,10,10,.58)` + `backdrop-filter: blur(24px)`;`.modal` 面板 `color-mix(in srgb, var(--sub-alt-color) 82%, transparent)` + `blur(30px) saturate(120%)` + 边框 `rgba(190,235,215,.14)` + 圆角 `1.75rem`(≈28px)+ 阴影 `0 20px 60px rgba(0,0,0,.38)`。
  - **配置条卡片玻璃**:改 `TestConfig.tsx` 的 `cardClass`——`bg-sub-alt` → Tailwind arbitrary `bg-[color-mix(in_srgb,var(--sub-alt-color)_62%,transparent)]` + `backdrop-blur-xl` + `border-[rgba(190,235,215,0.12)]` + `rounded-[1.125rem]`(≈18px)。
- 交互逻辑 / 关键约束:
  - **层级**:head.html 的 `@layer` 顺序里 `utilities` 在最后=最高优先级,故 `bg-sub-alt` 这类 Tailwind 工具类会盖过 custom-styles 层的覆盖 → 配置条玻璃**必须在组件的 Tailwind class 上改**(留在 utilities 层),而非在 SCSS 里覆盖;弹窗 `.modal` 因本就是 custom-styles 层 SCSS,故在 glass.scss 里同层后导入即可胜出。
  - **主题无关**:面板玻璃色用 `color-mix(var(--sub-alt-color))` 派生 → 换任何主题都自适应;仅 body 的极光辉光用 design 的固定绿/琥珀值(品牌签名背景)。
  - **无障碍**:`@media (prefers-reduced-transparency: reduce)` 回退为不透明 `--sub-alt-color` 面板、去 blur。
  - vendor 前缀 `-webkit-backdrop-filter` 被 stylelint `property-no-vendor-prefix` 禁(交给构建期 autoprefixer),已移除。
- 关键文件:`frontend/src/styles/glass.scss`(新)、`styles/index.scss`(import)、`components/pages/test/TestConfig.tsx`(cardClass)。
- 验证:stylelint 干净、lint 0/0、build 绿;浏览器实测——test 页 body 有绿+琥珀极光辉光、配置条卡片半透明玻璃、cookie 弹窗磨砂大圆角面板。
- 计划外变更:无(v1 范围=背景 + 弹窗 + 配置条;圆角用 design B 的 18/28)。
- 已知问题 / 未完:
  - 玻璃仅覆盖**背景 / 弹窗 / 配置条**三处主面;结算页面板、设置页各 section 卡片、账号页等更多面待 v1.1(同法:custom-styles 层的用 glass.scss,Tailwind 工具类的改组件 class)。
  - 圆角 token 未做成统一系统(小按钮仍沿用 `--roundness`);字体文件(Sora/IBM Plex Mono)M5。
  - 极光辉光偏克制(design 低 alpha),如需更明显可调 glass.scss 的 alpha。
- 下一步:**M1c 完成**(c1 品牌 + c2 主题 + c3 玻璃)。M1 只剩 **M1d Landing 双入口**(`Upload & Type` / `Random Mode`)。

---

## M1d — Landing 双入口 + 游客路由(2026-07-30)

- 实现:
  - **路由重排**(`controllers/route-controller.ts`):`/` = **landing**(新)、`/test` = 打字页(原 `/`)、`/bookshelf` = 书架占位页(新);`/verify` 仍指向打字页不变。
  - **两个新页面**接入上游 solidPage 机制:`pages/page.ts` 的 `PageName` 加 `"landing" | "bookshelf"` → `page-controller.ts` 的 `pages` 表加 `landing: solidPage("landing")` / `bookshelf: solidPage("bookshelf")` → `index.html` 加 `#pageLanding` / `#pageBookshelf` 两个 `.page` 骨架 div + `mount` 点 → `mount.tsx` 注册 `landingpage` / `bookshelfpage`。命名必须对齐:`solidPage(id)` 内部按 `page${首字母大写(id)}` 找 DOM id。
  - **LandingPage.tsx**(新):Sora 大字标 `Type`(text 色)+ `Any`(main 色),`clamp(3.25rem,11vw,6rem)` 响应式;副标语;两张玻璃 CTA 卡 `Upload & Type` → `/bookshelf`、`Random Mode` → `/test`。玻璃参数照 design B(`color-mix(--sub-alt-color 62%)` + `backdrop-blur-xl` + 边框 `rgba(190,235,215,.12)` + 圆角 18px + 阴影 `0 20px 60px rgba(0,0,0,.38)`);动效照 design §8(hover 亮度 +10% 且上移 1px、press `scale(.98)`)。
  - **BookshelfPage.tsx**(新):玻璃大卡占位,文案说明"上传 PDF/EPUB/TXT + 章节检测 + 登录云端"仍在建设中、Random Mode 游客可玩且成绩存本机;两个出口按钮 `Random Mode` / `Back home`。
  - **Landing 隐藏顶栏**(`Header.tsx`):`getActivePage() === "landing"` 时整个 header 不渲染,避免与大字标重复;`Keytips.tsx` 在 landing / bookshelf 上不显示("restart test" 在这两页无意义)。
  - **原"去打字页"入口全部改指 `/test`**:顶栏键盘图标(`Nav.tsx`)、命令面板 `View Typing Page`(`commandline/lists/navigation.ts`)、`Load challenge`(`load-challenge.ts`)。`Logo` 改为纯 Home 链接(指 `/` = landing),去掉原"点 logo 重开测试"的 onClick(现在点了会离开测试页,语义冲突)。
  - `frontend/firebase.json` rewrite 白名单补 `bookshelf`(`/test` 上游已在列)。Vercel 走 `vercel.json` 的 `/(.*)` 全量 rewrite,无需改。
- 交互逻辑 / 边界:
  - 游客路径闭环:landing → `Random Mode` → `/test` 直接开打(成绩存本地);landing → `Upload & Type` → `/bookshelf` 占位页 → 可回 `/test` 或回 landing;顶栏 logo 在任何页都回 landing。
  - `navigate("/")` 的既有调用点(未登录时 `/login`·`/account`·`/account-settings`·`/friends` 的兜底跳转、404 页 Go Home)现在落到 landing —— 语义正确,未改。
  - 硬刷新 `/test`、`/bookshelf` 不 404(dev 由 Vite 兜底,生产由 vercel.json SPA rewrite 兜底)。
- 关键文件:`ts/components/pages/LandingPage.tsx`(新)、`ts/components/pages/BookshelfPage.tsx`(新)、`ts/controllers/route-controller.ts`、`ts/controllers/page-controller.ts`、`ts/pages/page.ts`、`src/index.html`、`ts/components/mount.tsx`、`layout/header/{Header,Logo,Nav}.tsx`、`layout/footer/Keytips.tsx`、`commandline/lists/{navigation,load-challenge}.ts`、`frontend/firebase.json`。
- 计划外变更(均为顺手清掉的 M1c 品牌残留,已在硬性产品规则内):
  - **页面标题里的 Monkeytype 残留**:`page-controller.ts` 的 `${页名} | Monkeytype` → `| TypeAny`;`utils/misc.ts` 的默认标题 `Monkeytype | A minimalistic...` → `TypeAny — type through your own books`。这两处是**运行时覆盖** head.html 的 `<title>`,所以 M1c-1 改了 head.html 仍不够——任何客户端换页都会把标题写回 monkeytype。landing 与 test 页用默认标语标题,其余页 `${页名} | TypeAny`。
  - **404 页删 `monkeymeme.jpg`**:该图是 monkeytype 品牌资产且 404 对任何错误 URL 都可达。删后页面居中排版正常。
- 已知问题 / 未完:
  - **自动化验证的老限制**(M1a 已记录,非本期回归):浏览器工具瞬间注入整串文本 = 0 秒测试,被判无效并自动重开,拿不到结算曲线。本期实测到的是:输入确实进引擎(`<letter class="correct">` 逐字判定正确)、打满 10 词会走完结束流程。**真人正常速打一轮 + 结算曲线仍需人工确认一次。**
  - **换页动画在后台标签页会卡住**(上游既有,已用 `git stash` 回到 M1c 基线复现确认):`PageController.change()` 的 `promiseAnimate` 依赖 rAF,标签页不在前台时 rAF 被节流 → `PageTransition` 停在 `true` → 下一次 `navigate` 被 "page is busy" 拦掉,需要再点一次(第一次点击把标签页拉回前台、动画补完)。真人使用不受影响,**不是 M1d 引入的**,也未修(改上游换页机制风险大,留待后续如确实影响真人体验再处理)。
  - Landing 的 Sora / IBM Plex Mono 字体文件仍未引入(系统 sans 兜底),随 M5 字体资产一起做。
  - bookshelf 占位页正文沿用全站等宽字体(与 landing 的 sans 不一致);该页 M2/M4 会整体重做,不单独调。
  - cookie 同意弹窗仍在(M1b 已记录的遗留);光栅 favicon/PWA 图标仍是 monkeytype(M1c-1 已记录)。
  - 本机 Node 已升到 **24.18.0**,`.nvmrc` 仍钉 24.11.0(该版本已不在本机)→ `nvm use` 会报 not installed;`package.json` engines 是 `>=24.0.0 <25`,直接用 24.18.0 即可,lint / build 全绿。
- 验证:`pnpm lint-fe` 0 error / 0 warning(590 文件);`RECAPTCHA_SITE_KEY=<占位> pnpm build-fe` 成功(PWA 产物齐);浏览器实测——`/` 出 landing(无顶栏、Sora 大字标、两张玻璃卡、页脚法务链接)、点 `Upload & Type` 进 `/bookshelf`(顶栏回来、标题 `Bookshelf | TypeAny`)、点 logo 回 landing、`/test` 打字页与配置条正常、硬刷新 `/test` 与 `/bookshelf` 均不 404、未知路径出 404 页(已无 monkeymeme 图,标题 `404 | TypeAny`)。
- 下一步:**M1 全部完成**(a fork / b 裁剪 / c 品牌+主题+玻璃 / d Landing 双入口)。进入 M2 前按 CLAUDE.md 工作流:先读 `WORKORDER.md` 的 Custom 弹窗裁剪表 + 本 LOG,再实地读 custom 弹窗与 saved texts 代码,然后写 `docs/plans/M2.md` 交用户确认。
