# TypeAny · WORKORDER(工程总纲 v0.4,2026-07-22)

> 本文件是整个工程的唯一权威:产品 spec、已定决策、分期。每个里程碑的实施细节在 `docs/plans/M<n>.md`,完工日志在 `docs/logs/M<n>-LOG.md`,工作规则在 `CLAUDE.md`,视觉 token 在 `design/README.md`。

## 定位

monkeytype 的手感和数据体验 + 导入自己的书(PDF/EPUB/TXT,中英文)+ 章节随机/顺序段落练习。用户心态:**练打字的同时顺便读书学东西**。

市场验证(2026-07-21 实地核实):TypeLit.io 官方明确**不支持中文**等 IME 语言,导入自有 EPUB/PDF/TXT 是付费功能($5/月,仅限非加密 utf-8 文件);Typersguild 仅英文,上传 EPUB/TXT 为 Premium($4.99/月);中文跟打圈(打字侠、极速打字等)无书籍体系、界面老旧。**"自有中英文书 + monkeytype 手感 + 章节随机"确认空白;同类"上传自有书"功能的市场定价基准 ≈ $5/月。**

## 已定决策

| 决策 | 结论 |
|---|---|
| 基座 | **fork monkeytype**(GPL-3.0)。前端 fork 保持 GPL 开源(公开 repo);后端自研、闭源(AI 解析、账号、存档、付费) |
| 商业化 | 允许收费。收费点在后端:AI 解析(扫描版/大文件)、云存档、中文支持等 |
| 广告 | **永久零广告**(用户定 2026-07-23)。删 ads 设置项;配置层 `overrideValue` 恒返回 `"off"`,`ad-controller` 永不初始化(旧 localStorage/预设/命令面板均无法开启)。变现只靠后端付费,不上任何广告 |
| 商标 | 移除 Monkeytype 名称与 logo。**候选名 TypeAny**(开发代号先用;风险:TypeAnywhere 同品类、Anytype 镜像名;上线前查域名商标。备选 TypeBook / TypeThrough / TypeTome) |
| 中文 | M5。先英文跑通,引擎预留中文接口 |
| 登录 | 游客可玩 random(成绩存本地);上传书 / 云端存档需 Google 登录 |
| Landing 文案 | **`Upload & Type` / `Random Mode`** |
| 设计语言 | **全站默认玻璃拟态**(毛玻璃透明卡片 + 按钮 + 背景);弹窗出现时背景整体模糊;**其余 setting 项可沿用 monkeytype 现有**。**视觉定稿:B「Ink Aurora」**(吸收 C 的高对比度与 A 的光标动效),全部 token 以 `design/README.md` 为准 |
| 后端 / DB / Auth | **Supabase**(用户 2026-07-22 已建项目;Postgres + Auth + Storage;取代原 fork 自带 Firebase+Mongo+Redis)→ M6 接线 |
| 部署 | 前端(GPL 静态)→ **Vercel**(`vercel.json` 已配;import 时 Application Preset 选 **Other**,避开 monorepo 多服务检测,勿选 Vite/Services);后端 API 部署 M6 定 |

## 页面流

1. **Landing**:科技感字体 logo(Sora)+ `Upload & Type` / `Random Mode`
2. Upload → 未登录则 Google 登录;Random → 游客直接玩
3. **Random 页**:monkeytype 复刻(按裁剪表)
4. **书籍流程**:上传(PDF/EPUB/TXT/粘贴)→ 解析清洗 → 书架 → 选书 → 顺序 或 章节/页范围随机
5. **书籍打字页**:详见下节
6. **结算页**:wpm(中文 cpm)、acc、raw、characters 四元组(correct/incorrect/extra/missed)、consistency、time、test type(模式/语言/设置)、每秒速度曲线(wpm+raw+errors);书籍模式加书名/章节/位置 + next 按钮(next → 从指针处开始下一轮)

## 书籍打字页(核心界面)

- **左上角双进度条**(旁注:当前位置/点击进度条更改打字页):本书已打 % + 本章已打 %,均可点击(见"快速换位")
- **左右两侧箭头**:同一模式下切到上一块/下一块内容(chronological)
- **右下角双结算按钮**:
  - `结算`(下方小一号文字:当前轮不计入数据和历史)——练手轮,出结算页但不入库
  - `结算`(当前轮计入个人数据和历史)——正常收录
  - 暂定两按钮常驻、可随时提前结束(⚠️ 触发时机语义待用户确认,见"待确认")
- **回合设置**:字数 或 时间(monkeytype 核心保留);变更在"下一轮"生效(结算后、开打前调整 → 之后每轮沿用新值)

### 回合连续性引擎(指针制)

- 每本书维护线性**内容指针**;每轮从指针处取材
- 字数模式:取 N 个词,指针前移 N
- 时间模式:到时后指针停在**未打完的词的开头**(下一轮从该词接着打;恰好打完则从下一词)
- 保证轮与轮无缝衔接:不丢内容、不重复
- 结算页点 next → 从指针处开始下一轮

## 快速换位交互

**点击"本书 %"进度条** → 弹出目录页:
- 展示扫描出的全部章节 + 章节名(各章显示进度)
- 点选章节 → 优先从数据库恢复该章上次打到的位置;无记录则从章首开始

**点击"本章 %"进度条** → 背景毛玻璃模糊 + 半屏弹窗(选页选文本):
- 左栏:**仿原书版式页视图**——AI 整理后的文本按原书分页排布、段落对应、图片跳过留白占位(保持版式感;像素级复刻与 AI 清洗天然冲突,做"页对齐+段落对应"级别)
- 顶部 `直达 page: xx` 输入 + 翻页箭头;底部显示第几页
- 鼠标在左栏选中文本 → 右栏预览框实时更新(每次新选中覆盖旧预览)
- 两栏之间:热力图比色卡图例
- 右下角 `开始` → 进入打字页正常开始

## 翻书热力图

- 粒度:**段落级**。解析时生成稳定段落 ID;记录 `user × book × paragraph → 打过次数`
- 翻书/选页视图:没打过 = 灰色;次数越多颜色越深(GitHub 贡献图式渐变,8 档色值见 design/README.md)
- 游客存本地,登录后入云端数据库

## Random 页裁剪表(已确认)

| 元素 | 处理 |
|---|---|
| punctuation / numbers / time / words / custom / 字数档 10·25·50·100 | 保留 |
| quote / zen | 删 |
| 皇冠(排行榜)、info、通知铃铛 | 删 |
| 键盘图标、设置 ⚙️、账号 👤 | 保留 |

## Custom 弹窗裁剪表

| 元素 | 处理 |
|---|---|
| mode 行(simple/repeat/shuffle/random) | 保留 |
| save / saved texts(升级为书架入口,M2) | 保留 |
| open file / custom generator | 保留 |
| remove zero-width characters | 保留 |
| replace new lines with spaces(space / period+space) | 保留 |
| limit 输入区、word delimiter(pipe) | 删 |
| remove fancy typography、replace control characters | 删 |
| words filter | **默认删**(用户未表态,可翻案) |

## 字符三分类与自动跳过(monkeytype 没有的核心工程点)

| 类别 | 内容 | 行为 |
|---|---|---|
| A 必打 | 26 字母、空格(中文模式:汉字) | 正常判定 |
| B 开关决定 | 标点 ← punctuation;数字 ← numbers | 开=要打;关=显示但光标自动跳过 |
| C 永不打 | 数学符号、希腊字母、公式、特殊字符 | 灰色弱化显示,自动跳过(与"未打"灰有视觉区分,见 design) |

- 跳过字符不计入 wpm/acc/consistency
- 书籍模式开关语义 = 控制"跳过",不剥离原文(保持阅读完整性)
- 典型场景:概率统计教材里的 ∑∫μσ² 等只显示、不用打

## 解析管道(两层)

1. **本地免费**:txt 直读;EPUB → epub.js;文本型 PDF → pdf.js
2. **后端 AI(闭源,收费点)**:段落重建、页眉页脚清除、章节识别、扫描版 OCR、符号分类、**分页对齐信息**(供仿版式视图)→ Claude API(原生 PDF 视觉)
3. 成本控制:一本书解析一次入缓存;按章节懒解析;扫描版/大文件付费
4. 章节来源优先级:EPUB 目录 > PDF 书签 > txt 正则(第X章 / Chapter N)> 用户手输页码范围

## 中文模式要点(M5)

- IME 输入:composition 事件按"上屏字"判定,不能逐键
- 速度:中文 字/分钟(CPM),英文 WPM;中文标点判全角(,。""!?)
- 引擎自 M1 抽象为"字符流判定器",双输入路径
- monkeytype IME 已知坑(上游 issue,M5 必须绕开):#5979 Firefox 下 preedit 组字不触发、#5974 Chromium 下注音输入法空格失效、#3597 日文 IME 每键被计为错误、#4673 候选窗缺失——结论:不能沿用其 keydown 判定路径,composition 流程必须自己接管
- 参考实现:PType 的 `src/features/typing-test/hooks/useTypingEngine.ts`(**MIT 许可**,compositionStart/End + isComposing 守卫 + 隐藏 input 模式),可直接借用代码
- 中英混排排版:按 grapheme cluster 拆分、稳定字符槽位防光标漂移(design/README.md §7)

## PK 模式(M7,最后做)

- 跨设备跨账号实时对战;赛前双方各选 words(字数)/time,不一致 → 系统随机定一个
- 比赛界面与平时打书一致;对手进度 = 实时移动的虚线光标(monkeytype pace caret 效果)
- WebSocket 同步;网络差时精度下降属物理限制
- 参考实现:PType 对战模块(**MIT 许可**):`src/features/battle/` + `server/server.js`(Socket.io 房间、好友邀请/随机匹配、竞速/限时两模式、实时进度同步、荣誉分),整套可直接借用

## 数据模型草案

- `books`:owner、title、lang、source_type、原文件、解析 JSON(段落ID、分页对齐、章节索引)
- `progress`:user × book → 全书指针;user × book × chapter → 该章上次位置
- `results`:mode、wpm/cpm、raw、acc、consistency、characters 四元组、每秒曲线、book/章节/位置、是否计入历史、时间戳
- `heat`:user × book × paragraph → 次数
- 版权:书籍私有存储,仅本人可见,不做分享(同 TypeLit 的处理方式)

## 技术栈

- 前端:monkeytype fork(**SolidJS + TypeScript + Vite 8 + Tailwind 4 + Chart.js**;Node 24 / pnpm / turbo monorepo)+ Ink Aurora 玻璃主题
- 后端(自研闭源):Node + Claude API;账号 / DB / 存储 = **Supabase**(Postgres + Auth + Storage;取代 fork 自带 Firebase+Mongo+Redis)→ M6 接线
- PK:WebSocket(Socket.io,参考 PType)
- 部署:前端 → **Vercel**(`vercel.json` 已配,静态游客站;Application Preset=Other);后端 API → Supabase Edge Functions 或独立 Node host(M6 定)

## 分期

- **M1** fork + 大裁剪(quote/zen/皇冠/info/铃铛/广告/排行榜/Sentry)+ 重品牌 + landing 双入口 + 游客模式 → 详见 `docs/plans/M1.md`。**进度:M1a ✅ + 部署管线 ✅ + M1b ✅(界面裁剪+永久零广告)+ M1c-1 ✅(品牌清理)+ M1c-2 ✅(Ink Aurora 主题+默认);M1c-3 玻璃拟态 / M1d landing 未完**
- **M2** custom 弹窗裁剪 + saved texts 升级书架
- **M3** 书籍层:指针连续性引擎、双进度条、上/下块箭头、双结算、顺序 + 章节/页随机、符号跳过;热力图本地记数开始
- **M4** 解析管道:本地 + AI 清洗/OCR + 章节识别 + 仿版式选页弹窗(选文本→预览→开始)
- **M5** 中文 IME + CPM
- **M6** 登录 + 云同步 + 历史曲线 + 热力图可视化入库 + 付费墙
- **M7** PK 实时对战
- UI 视觉:Ink Aurora 基调已定;逐页线框未出(见"待确认")

## 待确认 / 未拍板(compact 前快照,2026-07-22)

1. **双结算按钮触发时机**:仅"提前结束"用,还是每轮自然结束也要二选一?(暂按"常驻、随时可按"设计)
2. **产品名最终拍板**:TypeAny 现为开发代号(风险:TypeAnywhere 同品类、Anytype 镜像名);备选 TypeBook / TypeThrough / TypeTome;上线前须查域名与商标
3. **words filter**:默认删,有异议再翻案
4. **付费方案未拍板**:仅有市场基准(TypeLit $5/月、Typersguild $4.99/月);哪些功能进付费墙(AI 解析扫描版/大文件?云存档?PK?)、定价、支付渠道 → 最迟 M6 前定
5. **UI 逐页线框未出**:design/README.md 已定基调与全部 token,但其 §10 所列(逐页文字线框、选页弹窗三栏尺寸、书籍打字页快捷键、响应式断点、组件 token)未完成 → 用户继续与外部 AI 迭代,或开发时按基线自行落地并回填 design/
6. ~~后端账号/存储选型~~ → ✅ **已决:Supabase**(见「已定决策」;M6 接线)
7. **快捷键体系**:M1 沿用 monkeytype 默认(tab+enter 重开等);书籍模式专属快捷键(上/下段、双结算、选页弹窗)在 M3 设计

## 法务备忘

- GPL-3.0:前端 fork 持续开源、保留版权声明与协议文本;后端独立进程闭源无义务;商业销售合法
- 商标:Monkeytype 名称/logo 必须移除;新名注册前查重(TypeAnywhere / Anytype 干扰)
- 版权:用户上传内容私有、不公开分享
- 非律师意见,正式收费前做一次合规确认

## 参考(抄作业)

- [monkeytypegame/monkeytype](https://github.com/monkeytypegame/monkeytype) — 基座,GPL-3.0
- [anYuJia/ptype](https://github.com/anYuJia/ptype) — **MIT(可直接抄代码)**:中英文打字引擎含 IME composition 处理、Socket.io 1v1 对战、CPM 统计、自定义文本;**M5 与 M7 的首选参考**(React/Next 栈,移植到 Solid 时抄逻辑)
- [Meldiron/rewrite](https://github.com/Meldiron/rewrite) — 书籍上传→打字流程(已核实**仓库无 LICENSE 文件** = 版权保留,只看思路不抄代码)
- [plu5/retype](https://github.com/plu5/retype) — 章节导航/进度交互参考(桌面端)
- [TypeLit.io](https://www.typelit.io/) / [Typersguild](https://typersguild.com/) / [TypeAnywhere](https://typeanywhere.com/) — 竞品
- pdf.js / epub.js — 解析轮子
