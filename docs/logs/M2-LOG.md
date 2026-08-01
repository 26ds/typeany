# M2 LOG — Custom 弹窗裁剪 + Saved texts 升级书架

> 按分片追加,每条遵循 CLAUDE.md 的 LOG 模板。计划见 `docs/plans/M2.md`。

## M2 开工前 — 决策拍板与 WORKORDER 修订(2026-07-31)

- 实地读代码后写出 `docs/plans/M2.md`,其中两处需偏离/澄清 WORKORDER,已交用户拍板:
  - **D1 书架数据模型 = 合并成「书」**(用户选定):书架里每一项都是书、都带进度指针;取消 `Save custom text` 的 `Long text (book mode)` 勾选框;旧的无进度 saved text 迁移为 `progress: 0` 的书。→ 已写入 WORKORDER「已定决策」表。
  - **D3 custom 弹窗的 limit 输入区 = 保留**(用户改判,原裁剪表写「删」):`words` / `time` 两格留着,`sections` 那格随 pipe delimiter 一起删。理由:临时粘贴文本仍需要能限词/限时;打书的每轮字数/时间归 M3 书籍层的「回合设置」。→ 已改写 WORKORDER「Custom 弹窗裁剪表」对应行并注明改判日期。
- **关键发现(决定了 M2/M3 的实现路径)**:上游已内置「书」的雏形 —— `Save custom text` 的 `Long text (book mode)` 把文本存进 localStorage `customTextLong`(`{ [name]: { text, progress } }`,`test/custom-text.ts:12-16`),`test-logic.ts:986-1034` 每轮结束按已打完的词数推进 `progress`(bail out / Shift+Enter 存进度;整本打完则归零),`SavedTextsModal` 加载时 `text.slice(progress)` 续打,`TestModesNotice.tsx:118` 显示书名。**这就是 WORKORDER「指针制」的词级极简版**,M2 书架直接建在其上,M3 再升级为章节/段落级真指针。存储 schema 定义在前端本地(zod + `LocalStorageWithSchema`,自带 migrate),不在 `packages/schemas`,扩展字段不牵动后端契约。

---

## M2a — Custom 弹窗裁剪(2026-07-31)

- 实现(逐项对照 WORKORDER「Custom 弹窗裁剪表」修订版):
  - **删 `Word delimiter` 组**(pipe / space)及 `handleDelimiterChange`、`delimiterOptions`;表单不再有 `pipeDelimiter` 字段。
  - **删 `limitSection` 输入框**与其在提交/初始化/模式切换里的所有分支(该格只在 pipe 模式下显示,随 pipe 一起走)。
  - **删 `Remove fancy typography` 与 `Replace control characters` 两组**及 `applyRemoveFancyTypography` / `applyReplaceControlChars`;`utils/strings` 的 `cleanTypographySymbols` / `replaceControlCharacters` 两个函数**保留不删**(沿用 M1b「隐藏入口不深删」),本文件的 `import * as Strings` 随之移除。
  - **删 `words filter` 按钮** + `<WordFilterModal>` 渲染 + import。`WordFilterModal.tsx`(437 行)与 `states/modals.ts` 的 `"WordFilter"` ModalId 保留 → 该组件现为孤儿,不再可达。
  - **保留**:mode 行(simple/repeat/shuffle/random)、**limit 组(words / time)**、save、saved texts、open file、custom generator、remove zero-width characters、replace new lines with spaces(space / period+space)。
- 交互逻辑 / 边界:
  - **pipeDelimiter 归一化**:`initState()` 不再读取存储值、以空格 join 文本回填 textarea;提交时**恒写 `CustomText.setPipeDelimiter(false)`**。原因是 `url-handler.tsx:238`(分享测试设置的链接)仍可能写入 `pipeDelimiter: true`,而弹窗已无 UI 可切回 —— 不归一化会把用户锁死在 pipe 模式。
  - **限制模式 `section` 的兼容**:`section` 仍可能来自分享链接或 `practise-words.ts:167`。`initState()` 把非 `time` 的限制一律显示在 `words` 格里;提交后落地为 `word` 模式。**能力未删**(`words-generator` / `live-stats` / `bail-out` / `quick-restart` 里的 section 分支原样保留),只是弹窗不再产生它。
  - `handleModeChange`:simple → 其他模式时,limit 自动取全文词数(原按 pipe 分岔写进 word 或 section,现只写 word)。
  - 提交校验保留「You can only specify one limit」(words 与 time 仍二选一)与「You need to specify a limit」;涉及 `limitSection` 的判断清掉。
  - `ShareTestSettings.tsx:131` 按 `pipeDelimiter` 显示 "sections/words",归一化后恒走 words 分支,无需改。
- 关键文件:`ts/components/modals/CustomTextModal.tsx`(唯一改动文件,735 → 588 行)。
- 计划外变更:无。
- 验证:
  - `pnpm lint-fe`(oxlint --type-aware --type-check)**0 error / 0 warning**(590 文件);`RECAPTCHA_SITE_KEY=<占位> pnpm build-fe` 绿。
  - 浏览器实测(localhost:3000)——弹窗按钮实际只剩:save / saved texts / ok / simple / repeat / shuffle / random / open file / custom generator / apply(zero-width)/ space / period + space,与裁剪表逐项一致;number 输入框只剩 words 与 time 两个。
  - simple 模式下两个 limit 格为 disabled;切到 shuffle 后自动 enable 且 words 自动填成全文词数(10);点 ok → 存储写入 `{mode:"shuffle", pipeDelimiter:false, limit:{mode:"word",value:10}}`,打字页立刻生成 10 个乱序词。
  - **pipe 兼容性实测**:手工往 localStorage 塞 `{mode:"random", pipeDelimiter:true, limit:{mode:"section",value:3}}` 后刷新 → 弹窗正常打开、textarea 以空格显示、限制显示在 words 格(3);提交后存储被归一化为 `pipeDelimiter:false` + `limit:{mode:"word",value:3}`,打字页生成 3 个随机词。**旧状态不会把弹窗卡死。**
- 已知问题 / 未完:
  - **从命令面板打开 custom 弹窗时 textarea 是空的**(上游既有行为,非本期引入):命令面板本身是 modal,`showModal("CustomText")` 走 `states/modals.ts:64` 的 chain 分支 → `beforeShow(isChained=true)` → 只跑 `handleIncomingData()` 而不跑 `initState()`,表单停在默认空值。配置条 `custom → change` 路径正常回填。M2c 接线时若顺手能修就修,否则记在这里。
  - 浏览器自动化环境下,打字页「未聚焦」遮罩会吞掉配置条按钮的指针点击(需要多点一次);本次改用命令面板 + DOM 事件完成验证。真人使用不受影响,与 M1d 记录的后台标签页动画问题同属自动化环境限制。
- 下一步:**M2b** 本地书籍数据层(`ts/books/local-books.ts`:书模型 + zod migrate + 旧短文本迁移)+ 书架页只读展示(玻璃书卡、进度条、空态)。

---

## M2b — 本地书籍数据层 + 书架页(只读)(2026-07-31)

- 实现:
  - 新建 **`ts/books/local-books.ts`**:书模型 `{ text, progress, wordCount, createdAt, lastOpenedAt }`(名字是 record 的 key,对外类型 `Book` 再把 `name` 拼回去)。对外 API:`listBooks / getBookNames / getBook / getBookWords / addBook / deleteBook / renameBook / setProgress / resetProgress / touchBook / getProgressPercentage / splitWords`。
  - **`test/custom-text.ts` 的所有 long 分支改为委托本模块**,函数签名与抛错行为不变 → `test-logic.ts` 的进度回写零改动。原 `CustomTextLongObjectSchema` / `customTextLongLS` / `getLocalStorageLong` / `setLocalStorageLong` 删除。
  - **`BookshelfPage.tsx` 重写**为真实书架:玻璃书卡网格(书名 / 词数 / 进度条 + 百分比 / 上次打开)、空态面板、页头计数;字体从占位页的等宽换成 landing 同款 sans(M1d LOG 遗留项已清)。
- 交互逻辑 / 边界:
  - **沿用上游 `customTextLong` 这个 localStorage key**,老用户的书原地可用。但要求 **local-books 是该 key 的唯一读写方** —— 上游 `custom-text.ts` 里的 zod object 会在每次 `setCustomTextLongProgress` 的读改写中把新字段 strip 掉,所以委托不是"顺手重构",是正确性前提。
  - `migrate` 逐条抢救:老 `{text, progress}` 补 `wordCount`(现算)/ `createdAt` / `lastOpenedAt`(取当时);单条解析不出 `text` 才丢弃,不整表回退。
  - **D1 旧短文本入架**:一次性把老 `customText` 里的条目当 `progress: 0` 的书导入,**不删旧 key**,用单独的 `typeanyShortTextsImported` 标记防止用户删了书下次又冒出来;同名冲突时保留书、跳过短文本。写入失败(配额)则不置标记,下次重试。
  - `splitWords` = `split(/ +/)` 再滤掉空串:上游的裸 `split` 会把前导/连续空格算成词,让进度指针整体错位。`wordCount` 与 `getBookWords` 用同一函数,口径一致。
  - `setProgress` clamp 到 `[0, wordCount]`;`listBooks` 按 `lastOpenedAt` 倒序(并列时按 `createdAt`)。
  - 书架页组件在 app 启动时就被创建(`Page` 的 `Show` 在内部),所以用 `createEffect` 监听 `getActivePage() === "bookshelf"` 重读,而不是靠挂载时机 —— 否则进度变了回书架看到的是启动那一刻的快照。
  - 卡片"上次打开"在 `lastOpenedAt === createdAt` 时显示 **Never opened**,不假装刚打开过(迁移进来的书 `lastOpenedAt` 只能取当时,不写这条会误导)。
- 关键文件:`ts/books/local-books.ts`(新,约 230 行)、`ts/test/custom-text.ts`(long 分支委托,244 → 213 行)、`ts/components/pages/BookshelfPage.tsx`(重写,49 → 146 行)。
- 计划外变更:
  1. **旧短文本迁移方式**:计划只写了"一并迁入"。落地改成「一次性标记 + 保留旧 key」。原因:若把旧 key 清空,`custom-text.ts` 与 local-books 会有两个 `LocalStorageWithSchema` 实例操作同一份数据、缓存不一致;而且没必要销毁用户数据。
  2. 新增 `splitWords` 的空串过滤与 `setProgress` 的 clamp(上游都没有,见上)。
  3. **进度条用 `--main-color` 而不是设计稿的琥珀 `#FFC46B`**:该色在主题变量里只落在 `colorfulError` 槽位,拿"错误色"当进度色语义不对,且换主题会变成红色。是否给"书籍/进度"单开一个 token 留给 M3 定。
  4. 书卡加 `min-w-0`:移动端长书名会把 grid item 撑破(实测溢出),加上后正常省略号截断。
- 验证:
  - `pnpm lint-fe` **0 error / 0 warning**(591 文件);`RECAPTCHA_SITE_KEY=<占位> pnpm build-fe` 绿(exit 0)。
  - **迁移实测**:手工塞入老格式 `customTextLong`(`Moby Dick ch1` 120 词 progress 30、`Untouched book`)+ 老 `customText`(`old snippet`、以及一个与书**同名**的 `Untouched book`)→ 刷新 `/bookshelf`:3 本书,`Moby Dick ch1` 显示 30/120 = 25%,`old snippet` 以 0% 入架,同名的短文本被跳过、真书内容未被覆盖;存储里 5 个字段齐全,`typeanyShortTextsImported` = "1",旧 `customText` 原样保留。
  - **进度回写端到端**:`Untouched book`(5 词)载入打字页 → 打完 `alpha`、`bravo` 两词、第三词打了一半 → bail out → 书里 `progress` 0 → 2,**且 `wordCount` / `createdAt` / `lastOpenedAt` 三个新字段没有被 strip**;回书架显示 2 / 5 words、40%;重新载入该书时 `CustomText.getText()` 返回 `["charlie","delta","echo"]`,断点续打正确。
  - 空态、桌面三列栅格、移动端(375 宽)单列 + 长书名省略号、`Never opened` / `Opened … ago` 两种文案、按 `lastOpenedAt` 倒序 —— 均实测通过。
- 已知问题 / 未完:
  - **书架现在是只读的**:没有导入、开始/继续、重命名、重置、删除按钮 —— 全在 M2c。目前唯一的建书途径仍是 custom 弹窗的 `save` + `Long text (book mode)`。
  - 迁移标记置位后,**M2c 之前**新存的"短文本"不会再自动进书架(旧 key 仍收着)。M2c 取消短文本这条路后此问题消失。
  - "Opened … ago" 走 `date-fns` 的英文相对时间,中文化归 M5。
  - 自动化环境限制(同 M1d / M2a 记录):浏览器 pane 的标签页处于 hidden 时 rAF 不跑,`TestLogic.finish()` 里的淡出动画会卡住;本次靠截图逼出帧来完成验证。真人使用不受影响。
- 线上复验(2026-07-31,https://typeany.vercel.app):push 后 Vercel 自动部署已生效 —— custom 弹窗为 M2a 裁剪后的样子(只剩 mode / limit / open file / custom generator / remove zero-width / replace new lines),`/bookshelf` 为 M2b 新书架。线上走通「custom → change → 粘贴文本 → save → 勾 Long text(book mode) → 命名保存 → /bookshelf」,书卡正确显示 `85 words / Not started / 0% / Never opened`。**用户反馈"线上没看到新功能",实为 M2b 书架默认空 + 只读、没有任何建书入口所致 —— 这是 M2c 要解决的,不是部署问题。**
- 下一步:**M2c** 书架操作闭环(导入 .txt / 粘贴建书、开始/继续、重置进度、重命名、下载、删除,`saved texts` 按钮改跳 `/bookshelf`,退役 `SavedTextsModal`)。

---

## M2c — 书架操作闭环 + 虚线上传卡 + 多格式文本提取(2026-08-01)

- 实现:
  - 新建 **`ts/books/extract-text.ts`**:统一出口 `extractText(file) → { text, title }`,按扩展名分派 **txt / md / docx / pdf / epub**;失败一律抛 `ExtractTextError`,带 `kind` 字段(`unsupported-format / empty-file / too-large / corrupt-file / scanned-pdf / no-text`)。
  - **书架虚线上传卡**(D5):排在书卡网格末尾、占一个格子,支持点选文件与**拖放**;附 `paste text` 次要入口。上传中显示转圈与 "Reading your file…"。M2b 那个纯文字空态被它取代。
  - **书卡操作**:`start` / `continue`(按指针)、重置进度、重命名、下载 `.txt`、删除。重置与删除走 `showSimpleModal` 二次确认;重命名与粘贴也复用 `showSimpleModal` 的 schema + inputs,**没有新建任何 AnimatedModal / ModalId**。
  - **接线**:custom 弹窗 `saved texts` → 改成 `bookshelf` 按钮(关弹窗 + `navigate("/bookshelf")`);`SavedTextsModal` 停止渲染(文件保留,orphan);按 **D1** 删掉 `SaveCustomTextModal` 的 `Long text (book mode)` 勾选框 —— **保存即建书**,标题改为 "Save to bookshelf"。
  - `vite.config.ts`:解析器不进任何 chunk group,靠动态 `import()` 自然分片。
- 交互逻辑 / 边界:
  - **五种格式**:txt 直读;md 剥标记(frontmatter / 围栏代码 / 标题 / 引用 / 列表 / 表格 / 强调 / 图片,链接保留文字);docx 走 `mammoth.extractRawText`;pdf 用 `pdfjs-dist` 逐页 `getTextContent()`;epub 用 `fflate` 解 zip → 读 `container.xml` → OPF spine → 各 XHTML 的 `textContent`(**不引 epub.js**,那是整套渲染器,"提取字符"用不上)。
  - **不静默失败**:扫描版 PDF(无文字层)明确报"这是扫描版、需要 M4 的 AI 解析",**不建空书**;不认的扩展名、空文件、超 100MB、解析崩溃各报各的;错误通知 8 秒 + important。
  - **重名不覆盖**:文件名撞上已有书时弹"Name this book"让用户改名(预填 `xxx (2)`),而不是悄悄加后缀或覆盖原书。
  - 清洗:`normalize()` → 去零宽字符 → `\s+` 合一 → `trim`,与 custom 弹窗同源;书名默认取文件名去扩展名。
  - `openBook` 在 `navigate("/test")` 之后**先确认真的到了打字页**才 `restartTestEvent.dispatch()` —— `navigate()` 在页面忙时会静默 no-op,不判断就会在书架页上重开测试。
- 关键文件:`ts/books/extract-text.ts`(新,约 300 行)、`ts/components/pages/BookshelfPage.tsx`(146 → 400 行)、`ts/components/modals/CustomTextModal.tsx`(saved texts → bookshelf)、`ts/components/modals/SaveCustomTextModal.tsx`(去勾选框)、`ts/components/ui/form/TextareaField.tsx`、`vite.config.ts`。
- 计划外变更:
  1. **顺手修了一个上游 bug**:`TextareaField` 把 `field.state.value` 直接赋给 `textarea.value`,默认值为 `undefined` 时会在框里显示字符串 `"undefined"`(粘贴弹窗一打开就能看到)。改成 `?? ""`。影响所有用 textarea 的 `SimpleModal`。
  2. **打包分组**:原计划给解析器单开一个 `vendor-parsers` group。实测**不能这么做** —— vite 的 preload helper 会被分进这个 group,而 entry 静态 import 它,于是 index.html 给 `vendor-parsers` 加了 `<link rel="modulepreload">`,930kB 每次开页面都下载。改成把三个包排除在 `vendor` group 之外、不给它们任何 group,让动态 `import()` 自己成块。验证:index.html 的 preload 列表里没有解析器块;`vendor` 从 1166kB 降回 678kB;entry 973 → 974kB(几乎没变)。
  3. epub 的 `textContent` 会把相邻块级元素粘成一个词(`Chapter OneThe quick…`),给块级元素补了尾随空格。
- 验证:
  - `pnpm lint-fe` 0/0(593 文件);`RECAPTCHA_SITE_KEY=<占位> pnpm build-fe` 绿。
  - **五种格式逐个实测**(在页面里现造文件跑 `extractText`):txt 34 词 / md 22 词(frontmatter 与代码块已剥掉)/ docx 36 词 / epub 38 词 / 文本型 pdf 36 词,首句都对得上原文。
  - **三种失败实测**:扫描版 pdf → `scanned-pdf`;`.rtf` → `unsupported-format`;空 txt → `empty-file`,文案各不相同,且都没建出书。
  - **UI 全链路**:传 pdf → 书卡 `36 words / Not started / 0% / Never opened` → `start` → 打字页显示书名与 `shift + enter to save progress`、正文就是 PDF 里的字;粘贴建书(带乱空格/换行/Tab)→ 存成 `alpha bravo charlie delta echo` 5 词;重名再传 → 弹改名框、原书 36 词未被 5 词的新文件覆盖;重命名 → 卡片即时更新;删除 → 二次确认后计数 2 → 1;custom 弹窗 `bookshelf` 按钮 → 关弹窗并跳转。
- 已知问题 / 未完:
  - 书架还没有搜索 / 排序 / 封面(按需,不进 M2)。
  - 打书仍是"一次把剩下全部铺出来",**没有每轮字数与左右箭头** —— 那是紧接着的 M2d。
  - 自动化环境限制照旧:浏览器 pane 标签页 hidden 时 rAF 不跑,弹窗进出场动画与 `navigate()` 的 `PageTransition` 标志会卡住(本次一度让 `bookshelf` 按钮看似无效,清掉标志后正常)。真人使用不受影响。
- 下一步:**M2d** 打书回合胶囊条(默认 25 词)+ 左右箭头切段。
