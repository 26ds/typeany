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
- **验证**:`tsc --noEmit` ✅ / `oxlint --type-aware --type-check` ✅ / madge 无环 ✅ / vitest 1060 passed ✅ / `pnpm build-fe` ✅ / 线上复验见下
- **已知问题/未完**:白/灰正文配色、缺口胶囊、「回到我的进度」按钮都还没有 UI —— 数据已经在记了,但书架上暂时只看得到百分比口径变了。`jumpToLastFinished`/`jumpToGap`/`getRangePreview` 是给 M3b/M3c 备的,本片未接线
- **下一步**:M3b 书卡缺口胶囊
