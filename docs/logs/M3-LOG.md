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
