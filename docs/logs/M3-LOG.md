# M3 完工日志

计划见 `docs/plans/M3.md`,spec 见 `WORKORDER.md`「进度模型 v2:光标 ≠ 成绩」。

## M3a — 进度模型 v2 数据层 + 修掉「往回翻进度清零」(2026-08-04)

- **实现**:把「我在书里的哪个位置」和「我读了多少」拆成两份数据。`progress` 收窄为**光标**;新增 `done[]`(已结算的词区间)与 `skipped[]`(✗ 掉的缺口)。百分比、进度线、缺口全部由 `done`/`skipped` 派生
- **交互逻辑**:
  - 左右箭头 → 只写光标(`setCursor`),`done` 一个字节都不碰。这是用户报的 bug 的正解:翻回开头百分比不变
  - ➡️ 从进度线后方往前走时**停在进度线上**,不越过去凭空造缺口
  - 结算(自然打完 / shift+enter 提前结束)→ `settleRound(name, 光标, 光标+打完词数)`;refresh 重开不记任何东西
  - 光标撞到书尾时**不再无脑归零**:还有缺口就跳到第一个缺口并提示「还有 N 段没打」,真读完了才归零并提示读完
  - `reset progress` 是唯一允许让百分比下降的操作,它把 `done`/`skipped`/光标一起清空
- **关键文件**:
  - `frontend/src/ts/books/local-books.ts` — 区间三件套(`normalizeRanges`/`subtractRange`/`invertRanges`)、`setCursor`/`settleRound`/`dismissGap`/`resetProgress`、派生量 `getDoneWordCount`/`getFrontier`/`getGaps`/`getLastFinishedStart`/`getRangePreview`
  - `frontend/src/ts/books/book-session.ts` — `stepRound` 改为纯导航;新增 `jumpToLastFinished`/`jumpToGap`/`settleRound`;`applyRound` 拆出 `pourRoundText`(结算中途不能再跑 `setConfig`)
  - `frontend/src/ts/test/test-logic.ts` — 结算块改调 `BookSession.settleRound`,按 `RoundOutcome` 出提示
  - `frontend/__tests__/books/local-books.spec.ts` — 15 条新单测
- **迁移**:老书 `progress: N` → `done: [[0, N]]` + 光标 `N`(schema 变了会走 `migrateShelf`,已单测覆盖)。线性读到 N 的书语义等价,不丢进度
- **计划外变更**:
  - `custom-text.ts` 补 `resetCustomTextLongProgress`,`SavedTextsModal` 的「reset progress」改调它 —— 原先调 `setCustomTextLongProgress(name, 0)`,拆分后那只会移光标、清不掉成绩。该 Modal 现在已无人 import(M2 的 saved texts → bookshelf 之后成了死代码),但留着一个语义错的重置不合适
  - `BookshelfPage` 卡片上的 `76 / 1,379 words` 左数改成白字数(原先是光标位置)
- **验证**:`tsc --noEmit` ✅ / `oxlint --type-aware --type-check` ✅ / madge 无环 ✅ / vitest 1060 passed ✅ / `pnpm build-fe` ✅
- **线上复验**(https://typeany.vercel.app,2026-08-04,浏览器面板真实点击):
  1. 种一本老格式的书(`progress: 100`,无 `done` 字段)→ 刷新后 localStorage 变成 `done: [[0,100]]`、`skipped: []`,书卡显示 `100 / 400 words · 25%` —— 迁移生效、没丢进度
  2. 进书连点 4 次 `‹` 走回第 0 词 → `done` 仍是 `[[0,100]]`,回书架仍是 `100 / 400 words · 25%` —— **用户报的 bug 已修**(旧版本此时是 0%)
  3. 把回合长度点成 200(光标 0、进度线 100)→ 点一次 `›` 落在 **100** 而不是 200 —— 停在进度线上,没造出新缺口
- **已知问题/未完**:白/灰正文配色、缺口胶囊、「回到我的进度」按钮都还没有 UI —— 数据已经在记了,但书架上暂时只看得到百分比口径变了。`jumpToLastFinished`/`jumpToGap`/`getRangePreview` 是给 M3b/M3c 备的,本片未接线
- **下一步**:M3b 书卡缺口胶囊

## M3b + M3c — 白/灰、缺口胶囊、回到进度(2026-08-04)

两片一起做,因为胶囊组件书卡和弹窗共用,拆开做等于写两遍。

- **实现**:
  - **书卡**:进度条改成分段渲染 —— 绿=已结算、红=缺口(按它在书里的真实位置画,最小 3px 保证一个词的缺口也看得见)、灰=还没读到;左下角数字与百分比都改成白字口径;条下最多 6 个缺口胶囊(标签=那段开头 3 个词),超过 6 个显示「+N more unfinished — show all」点开弹窗
  - **打字页**:已结算的词加 `.word.settled`,正文显示白色;顶部胶囊条在「光标 ≠ 上次打完那一轮」时多出一张「back to my progress」卡;缺口 >6 时点 refresh(`#restartTestButton`)先弹缺口弹窗
  - **弹窗**(`BookGapsModal`):说明句 + 全部胶囊 + 每个胶囊的 ✗ + 「back to my progress」+「restart this round anyway」
- **交互逻辑**:
  - **✗ 只是不再提醒**:写进 `skipped[]`,那段字仍然是灰的、百分比不变。用户 2026-08-04 明确要求**这句话要出现在带 ✗ 的弹窗里**,所以文案抽成 `DISMISS_HINT` 常量,书卡和弹窗共用一份,改不散
  - 点胶囊 → `openBook(name, gap[0])`:先挪光标再开书,书架和打字页都走这一条路径
  - 「回到进度」落在**上次打完那一轮的开头**(不是进度线本身),所以那一轮整屏全白,再按一次 `›` 才到新内容 —— 用户原话的落法
  - 白色只覆盖没被打字状态占用的字母(`:not(.correct):not(.incorrect):not(.extra)`),重打时打错仍然是红的
- **关键文件**:`components/pages/BookshelfPage.tsx`(书卡)、`components/books/GapPills.tsx`(共用胶囊 + `DISMISS_HINT`)、`components/modals/BookGapsModal.tsx`、`states/book-gaps.ts`(弹窗看哪本书)、`books/open-book.ts`(从任意页面开书;不能放进 `book-session`,因为 `route-controller` 反过来 import 它)、`components/pages/test/BookConfig.tsx`、`test/test-ui.ts`(`buildWordHTML` 加 class)、`test/test-logic.ts`(refresh 拦截)、`styles/test.scss`
- **计划外变更**:`BookConfig` 的胶囊条从 `grid-cols-[auto_auto_auto]` 改成 `grid-flow-col` —— 「回到进度」这张卡是会出现和消失的,写死三列会把它挤掉
- **验证**:ts-check ✅ / lint ✅ / lint-styles ✅ / madge 无环 ✅ / vitest 1060 ✅ / build ✅
- **线上复验**(https://typeany.vercel.app,2026-08-04,真实点击):
  1. 种一本 400 词、读了 8 段共 200 词的书 → 书卡 `200 / 400 words · 50%`,进度条绿红相间且位置对得上,6 个胶囊 + 「+1 more unfinished」
  2. 点第一个胶囊的 ✗ → 胶囊消失、第 7 个补位、「+1 more」消失,**百分比仍是 50%**、进度条那一段从红变灰(不是变绿)—— ✗ 的语义正确
  3. 点胶囊 `w25 w26 w27…` → 打字页正好停在 w25–w49
  4. 缺口 7 个时点 refresh → 弹出「Parts you have not finished」,7 个胶囊 + 说明句 + 两个出口都在
  5. 弹窗里点「back to my progress」→ 光标落在 350(上次打完那一轮的开头),那一轮 25 个词全部带 `.settled`,字母实测色 `rgb(238,248,241)` = `--text-color`(白);往回一轮 w325–w349 是缺口,0 个 `.settled`,显示灰色
- **已知问题/未完**:
  - `‹` 的气泡贴左屏缘被裁(和已知的 `›` 贴右缘同一个毛病,M2 遗留)
  - 移动端(`md` 以下)胶囊条整体隐藏,所以「回到进度」在手机上还看不到 —— 跟「移动端书籍页仍用 Random 的 test settings 弹窗」是同一笔账,一起在 M3 后面处理
  - 键盘 `tab + enter` 重开不走缺口拦截(只拦了 refresh 按钮),按用户原话「点 refresh」照做
- **下一步**:M3d 续打灰显上一个词

## M3c-fix — refresh 是「重打这一段」,不是空操作(2026-08-05)

**我读错了规格。** 用户原话是「refresh 当前打字界面:让这个打字界面**变灰**(没打的、跳过的、**refresh 过没打完的**)」—— refresh 是一个动作。我做成了"refresh 不记任何东西"(既不加也不减),用户点下去屏幕没变灰、退回书架也没有胶囊,因为他那本书 0–76 是连续读完的、压根没有洞。

回头看,用户后面两句本来就把答案写在那儿了,是我没接上:「一个 ✗ **重新打的没结算的**就少一个」「如果用户点击了 **refresh 但是没结算完的**超过了 6 个胶囊」—— 胶囊的来源就是 refresh。

- **实现**:
  - `local-books.ts` 新增 `unsettleRange(name, range)`:从 `done` 里减掉这一段,同时把这段从 `skipped` 里挖掉(重新认领 = 撤销之前的 ✗);减不动就返回 `false`(那一轮本来就没读过)
  - 新增存储字段 **`frontier`(高水位)**。原先进度线是 `done` 最后一段的结尾推出来的,一旦 refresh 把最后一段交回去,进度线跟着退,洞就落到进度线之外、`getGaps` 看不见了 —— 那一段会凭空消失而不是变成胶囊。现在 `frontier` 只在结算时前推,只有 `reset progress` 能让它退
  - `book-session.unsettleCurrentRound()`:范围 = `[光标, 光标 + getRoundStep(book))`,减完重新铺一遍这一轮让它立刻重绘成灰;返回交回去了多少词
  - `test-logic` 的 `#restartTestButton` 处理:书籍模式下先判缺口 >6(弹窗优先),否则调 `unsettleCurrentRound()`,真的减掉了才弹一条提示说明百分比为什么会掉
  - `getLastFinishedStart` 改成按 `done` 的结尾算(不是 frontier),「回到我的进度」的显示条件也改成 `done.length > 0` —— 把唯一读过的一轮 refresh 掉之后,已经没有"进度"可回了
  - `getRoundStep()` 抽出来,箭头步长和 refresh 交回的范围共用一个定义(时间模式借 25 词)
- **交互逻辑**:
  - 只挂在 refresh **按钮**上。改回合长度、点箭头、开书都会触发内部重开,那些不是"我要重打",一律不减
  - 键盘 `tab + enter` 目前也不减(用户原话只说了 refresh 按钮)—— 待用户表态
- **计划外变更**:`frontier` 是新的存储字段,老书迁移取 `max(已有 frontier, done 末尾, 光标)`,不丢进度
- **线上复验时又抓到第二层**:数据改对了(`done` 从 `[[0,26]]` 变过来、`frontier` 守住 76),但**屏幕上的字还是白的** —— 重开时词表没变,monkeytype 不会重建那些 `.word` 元素,`buildWordHTML` 根本没再跑,class 就留在旧状态了。只改数据层的话,用户点下去看到的仍然是"没反应"。
  - 补 `test-ui.updateSettledWords()`:按 `data-wordindex` 就地 toggle `.settled`,不依赖重建;refresh 减完立刻调一次。就算上游哪天真的重建了,那时读到的也是刚更新过的缓存,两条路都对
- **验证**:ts-check ✅ / lint ✅ / vitest 1066 passed(books 21 条)✅ / build ✅
- **线上复验**(https://typeany.vercel.app,2026-08-05,种一本和用户一模一样的书:1379 词、`progress: 76`、老格式):
  1. 书架 `76 / 1,379 words · 6%`,没有胶囊 —— 复现用户的起点(0–76 连续读完,没有洞)
  2. 进书 → 光标 76,w76–w100 **灰**(还没读到);点「back to my progress」→ w51–w75 **白**(读过)
  3. 在这一屏点 refresh → 立刻:提示「25 words are unread again — this part is back on your retype list」、屏上 25 个词 `.settled` 全部消失、实测字色 `rgb(132,149,141)` = `--sub-color`(灰)
  4. 数据:`done` 由 `[[0,76]]` 变成 `[[0,51]]`,`frontier` 守住 76(没被拖回去)
  5. 退回书架:`51 / 1,379 words · 4%`,进度条绿段后面多出一小截红,底下一个胶囊 **`w51 w52 w53… ✗`** —— 用户要的"退出去能看到胶囊"到位

## M3f — 进度模型 v3 数据层:重打记次数,不动百分比(2026-08-14)

用户 2026-08-14 拍板改世界观:重打**不再**把这一段从 `done` 里收回,而是记成一条「第 N 次」的记录。理由是他这次要的东西——右上角 1 2 3 徽章、「上次打到哪」、战绩、✗ 删记录——全都要求原成绩留在原地不动。M3c-fix 那套"refresh 收回这一段"因此整块作废(spec 见 `WORKORDER.md`「进度模型 v3」)。**本片纯数据层,界面上只有一处能看出来:书里点 refresh 不再变灰、不再掉百分比。**

- **实现**:
  - `local-books.ts` 新增 `attempts` 存储字段 + `AttemptSchema`:`id / range / limit / typedWords / activeMs / startedAt / finishedAt? / stats?`。`finishedAt` 有无 = 打完了还是可以回去接着打,不再另存一个状态字段
  - `limit`(这一次是按几词还是几秒打的)存在记录自己身上,不读书当前的设置:回合长度随时可改,记录得说清楚它当年量的是什么;暂停的时间轮也靠它算剩余秒(`getAttemptRemainingMs` = `limit.value*1000 - activeMs`,离开的时间一秒不算)
  - 写:`saveAttempt`(按 id 覆盖,`activeMs` 是**赋值不是累加**,同一次存两遍不会翻倍)、`deleteAttempt`(✗)、`newAttemptId()`
  - 读:`getAttemptsOverlapping`(按 `startedAt` 升序 = 徽章 1 2 3 的顺序)、`getUnfinishedAttempts`、`getFinishedAttempts`、`isAttemptFinished`
  - `getRetypeRange(book)`:光标站在已结算的那一段里 → 返回这次要重打的区间,否则 `undefined`(= 普通往下读)。**段尾是硬边界**:25 词的段选 50 词也只打到段尾;时间轮给整段、让表来掐
  - 容量:同一区间最多 10 条、整本最多 100 条;淘汰**先扔打完的**(那只是纪念品)、同类里扔最旧的,并且**永不淘汰刚写的那一条**
  - `resetProgress` 一并清空 `attempts`
- **拆除**:`local-books.unsettleRange` / `book-session.unsettleCurrentRound` / `hasTooManyGaps` 全删;`test-logic` 的 `#restartTestButton` 回到"只重开这一轮";缺口窗里的「restart this round anyway」删掉(它只为打字页弹窗存在,现在只有书架 `+N` 会打开这个窗)
  - 顺带消解了 WORKORDER 待确认 0.5:refresh 按钮和 `tab + enter` 从此行为一致
  - `frontier` 字段**保留**:v3 之后没有东西再从 `done` 里减,它等价于 `done` 末尾;但线上书里已经有这个字段,回迁没有收益,注释里写清了它现在是什么
  - `test-ui.updateSettledWords()` 保留(M3g 的回看态要用它就地切白/灰),注释改成讲机制而不是讲 refresh
- **交互逻辑**(本片只落数据,行为在 M3g/M3i):
  - 重打绝不碰 `done` / `skipped` / `frontier` —— 全站能让百分比下降的只剩 `reset progress`
  - 一屏跨白灰交界不算重打(光标站在灰字上就是普通续读),灰的部分照常结算
  - 老书迁移:没有 `attempts` 就给 `[]`;**存坏了的记录不许连累书** —— 迁移用 `.catch([])` 兜住,坏记录丢掉、书和进度留下
- **计划外变更**:计划里写的 `saveAttempt / finishAttempt / deleteAttempt` 合成 `saveAttempt`(upsert)+ `deleteAttempt`。多一个 `finishAttempt` 只会多一条改状态的路,`finishedAt` 一个字段已经把"完没完"说清楚了
- **一个真被测试抓住的 bug**:淘汰函数写成 `slice(0, excess)`,`excess` 为负时 JS 把它当"从末尾倒数",于是每存到第 6 条就误删一条、总数永远停在 5。补了 `excess <= 0` 直接返回空。这条断言是先红后绿的(实测 `expected 10, got 5`)
- **验证**:ts-check ✅ / lint(type-aware)✅ / vitest 1077 passed(books 32 条,新增 19 条)✅ / build ✅
- **已知问题/未完**:徽章、回看滚动、战绩页、ESC 暂停都还没有界面 —— 分别在 M3g / M3i
- **线上复验**(https://typeany.vercel.app,2026-08-14,种一本 200 词的探针书):
  1. **先确认新包真上线**:抓全部 8 个 chunk,旧提示串 `back on your retype list`(M3c-fix 那条 toast)与 `restart this round anyway` **都已消失**,而 `Parts you have not finished`、✗ 说明文案仍在 —— 证明抓到的是新包不是空响应(不比 hash,Vercel 与本地构建环境不同,hash 永远对不上)
  2. **refresh 不再收回这一段**:`done [[0,100]]`、光标 75(站在白字里),进书 → w75–w99 全白(实测 `rgb(238,248,241)`);点 refresh → `done` 仍 `[[0,100]]`、frontier 100、25/25 个词仍带 `.settled`、无任何提示。**旧版本这里会变成 `[[0,75]]` + 变灰 + 掉百分比**
  3. **点击确实到达了按钮**:埋了一次性监听,`onButton:1` 且冒泡到 `.pageTest`(应用自己挂处理器的那个节点)各 1 次 —— 否则"什么都没变"不能算证据
  4. **缺口 >6 不再劫持 refresh**:改成 8 段已读 / 7 个洞(书卡显示 `40 / 200 words · 20%` + 6 个胶囊 + `+1 more unfinished`),进书点 refresh → **没有弹窗**(`openModals: []`),只是重开;正文白灰图案 `.....WWWWW.....WWWWW.....` 与 `done` 完全对应
  5. **书架 `+N` 仍能开那个窗**:7 个胶囊 + ✗ + 说明文案都在,底部只剩「back to my progress」(改过布局,确认没改坏)
  6. 探针书与 `typeanyActiveBook` 已从 localStorage 删除
- **顺带发现(不是本片引入)**:浏览器直接打开 `/test` 不会恢复书籍模式,落在 Random 的 custom 上 —— 书籍模式只能从书架进。整页刷新不会跑 `endBookSession`,`typeanyActiveBook` 还在但页面不认。记在这里备查,M3g 若要做"回到上次那本书"会撞上它
- **下一步**:M3g(打字页回看 + 重打徽章,连带 M3d 续打白显上一个词)

## M3f-fix — 打字时永远是「灰底打成白」(2026-08-14)

用户看了 M3g 计划里那句「打完的 → 整段**灰色**只读」当场纠正:白和灰**只回答"这些字打过了吗"**,不许拿去表示"这是历史记录、不能打"。定稿三条见 `WORKORDER.md`「白 / 灰只回答一个问题」。

顺着这条查下去,发现**当下就有一个活着的 bug**(M3c 起就在,一直没被发现):站在已读过的白字段落上重打时,还没打的字**本来就是白的**,打过去看不出任何进度 —— 用户那句「我要打字的效果永远是在灰色的打」正是被这个逼出来的。

- **实现**:`.settled` 的白改成只在"看"的时候生效
  - `test.scss`:选择器加 `#words:not(.typing)` 前缀
  - `test-ui.ts`:`onTestStart()` 给 `#words` 加 `typing`,`onTestRestart()` / `onTestFinish()` 去掉 —— 一开打整屏转灰底,打完/重开回到白
- **交互逻辑**:三条规则(正文白灰只看 `done`、重打记录不参与;开打即转灰;点进某一次才看那一次的白灰,打完的那次是**整段全白**)
- **计划外变更**:M3g 计划里「打完 → 整段灰只读」改成「整段全白、只读」,并注明"只读"要用别的方式表达
- **验证**:ts-check ✅ / lint ✅ / build ✅
- **线上复验**(2026-08-14,200 词探针书,`done [[0,100]]`、光标 75):
  1. **看的时候**:进书,w75–w99 全白 `rgb(238,248,241)` = `--text-color`
  2. **打字时**:给 `#words` 加上 `typing` 并把首字母标 `.correct`(引擎会做的两件事)→ 已打的字仍白 `rgb(238,248,241)`,**同一个词后面没打的字和后面整段都变灰 `rgb(132,149,141)` = `--sub-color`** —— 这正是"在灰的上面打"
  3. **打完/重开回到白**:点 refresh → `.typing` 被清掉、字色回到 `rgb(238,248,241)`,`.settled` 标记全程没丢
  4. `done` 全程 `[[0,100]]` 没动
- **这一条没能在线上跑到**:`onTestStart()` 里那句"开打就加 class"。浏览器面板的标签页是隐藏态,**合成 InputEvent 被当成不可信来源忽略,CDP 真实按键也进不了 `#wordsInput`**(两种都试了),所以没法在这里真的敲一个字。上面第 2 步是手动施加引擎会施加的那个 class 来验规则本身;"第一个键落下时会不会加"这一环靠 tsc + 它挂在 monkeytype 自己的 start 钩子上(同一个函数里还设 Focus 和实时统计),留给用户验收第 3 步
- **又一次踩到隐藏标签页**:点 refresh 后立刻读,`.typing` 还在、字还是灰的 —— 重开的淡出动画卡在 rAF 上没走完。截一张图把帧泵一下,再读就对了。**别把这种读数当 bug**

## M3f2 — 模块边界(blocks)+ 续打落点(2026-08-14)

用户实测:15 秒的时间轮只打到第 9 个词就停了,再按键却从那 9 个字的**开头**重打,而不是从没打完的地方接着打。根因是 **`done` 会把相邻区间合并,一轮的边界在存储里根本不存在** —— 分不清"打满了一整轮"和"打到一半停了",于是「回到我的进度」只能按"往回退一个回合长度"猜,猜错了就让人重打自己刚打过的半轮。

- **实现**:
  - `local-books.ts` 新增 `blocks: { range, complete }[]` —— **按结算顺序记、永不合并**。`done` 继续回答"读了多少"(百分比只看它),`blocks` 回答"这一轮从哪到哪、打满没有"
  - `settleRound` 多收一个 `complete`;`test-logic` 传 `!getBailedOut()` —— 自然打完(词打满 / 时间走完)为 true,shift+enter 提前停为 false
  - `getLastFinishedStart` 改成看最后一块:**完整 → 块开头**(整块全白,再按 ➡️ 到新内容,2026-08-04 原意);**不完整 → 块的末尾**(leftoff,接着打)
  - `getRetypeRange` 改成认**完整模块**:光标站在某个 complete 块里 → 重打范围 = 那一块(块尾硬边界,`min(当前档位, 块尾)`);站在没打完的尾巴上 → 不是重打,是普通往下读
  - `MAX_BLOCKS = 1000` 上限,超了丢最旧的(只丢"能不能当固定块重打",读没读过仍在 `done` 里)
- **交互逻辑**:
  - 老书(没有 blocks)一律落在 `done` 末尾 —— 没有边界可考时,**宁可少一次回看,也绝不让人重打**
  - 块可能互相重叠(在没打完的半块中间用箭头挪一下再打),`getBlockAt` 取**最后一个**匹配的块,新的压旧的
- **计划外变更**:无
- **验证**:ts-check ✅ / lint ✅ / vitest 1083 passed(books 38 条,新增 6 条)✅ / build ✅
  - 「没打完就接着打」这条断言是先红后绿:旧实现在这个用例上返回 9(= `max(块首, done末尾 − 25)`),新实现返回 34
- **线上复验**(2026-08-14,两本 200 词探针书,都从光标 0 出发点「back to my progress」):
  1. **A「上一轮没打满」**(`done [[0,34]]`,blocks = 完整 `[0,25)` + 不完整 `[25,34)`)→ 落在 **w34**,整屏灰字,`back to my progress` 按钮随即消失(已经在进度上了)。**旧代码会落在 w9**,让人重打自己刚打过的 9 个词 —— 用户报的就是这个
  2. **B「上一轮打满了」**(`done [[0,50]]`,两块都完整)→ 落在 **w25** = 最后那个完整块的开头,屏上 **25/25 全白**,正好是一整块,再按 ➡️ 就是新内容
  3. 两本书的 `done` 全程没动(A `[[0,34]]`、B `[[0,50]]`),探针书已删除
- **下一步**:M3g(回看 + 徽章 + 续打白显重复词)
