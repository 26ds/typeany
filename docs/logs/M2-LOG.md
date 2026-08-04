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

### M2c 补记 —— 用户实测反馈与一处设计错误(2026-08-01)

- **bug:PDF 上传报 `undefined is not a function`**(用户实测,真实课件 PDF)。原因:`pdfjs-dist` 6 的默认构建是 modern-only,用了 `Promise.withResolvers` 与 iterator helpers,Safari < 18.4 / Chrome < 122 直接抛错。改用它自带的 `legacy/build`(内含 core-js polyfill)。**我的测试没抓到是因为用的是自己造的极简单页 PDF,还没走到缺失方法就解析完了** —— 教训:合成样本不能代替真实文件。已修并复验(19 词正常提取,扫描版仍正确报 `scanned-pdf`)。
- **设计错误:书被接进了 Random 页的 `custom` 槽位**。用户实测到三个症状:① 在书里点顶部 `words`/`time` 胶囊 → 跳出这本书变成随机词;② Random 页点 `custom` → 跳进上次没打完的书;③ 两边互相覆盖。
  - 根因:M2b/M2c 复用了上游"长 custom text"那套(`Config.mode="custom"` + 同一份 `customTextSettings`),这在只做书架时看不出问题,一旦要在书里放胶囊条就暴露了。
  - **这违反 WORKORDER 本来的「页面流」§3/§5** —— Random 页与书籍打字页在工单里一直是两个页面,是实现把它们合并了,不是工单没写。
  - 已在 WORKORDER 新增「Random 模式 与 书籍模式 的边界」一节写死两者职责与数据隔离;`docs/plans/M2.md` 的 M2d 重写为「先拆分、再加胶囊与箭头」。
- 遗留:pdf.js 的 `cMapUrl` 未配置 → 少数 CID 编码(多为中日韩)PDF 可能抽出乱码而非报错。中文本来就归 M5,届时一并处理。

---

## M2d — 书籍模式与 Random 模式拆分 + 回合胶囊条 + 左右箭头(2026-08-01)

- 实现:
  - **新建 `ts/books/book-session.ts`** —— 两个模式之间的那道墙。进书时把 Random 自己的 custom 文本**存进 `typeanyRandomCustomStash`**,出书时原样放回;`typeanyActiveBook` 记录当前在读哪本。打字引擎仍然只认 `Config.mode` + `CustomText`(所以一轮书还是得倒进那个槽位),但槽位的进出被这个模块包住了。
  - **新路由 `/read`** = 书籍打字页。它渲染的仍是 test 页(引擎同一套),只是换了 URL —— 与上游 `/verify` 用的是同一个手法,避免去动 20 处 `getActivePage() === "test"` 判断。`firebase.json` 白名单已补 `read`。
  - **`BookConfig.tsx`** —— 书里的胶囊条,外形与 Random 那排一致:`punctuation / numbers`(置灰 + `coming soon` 气泡)、`words / time`、档位 `25/50/100/200` 词与 `15/30/60/120` 秒。**改档只换下一轮长度,绝不跳出这本书。**
  - **左右箭头**:打字区两侧,`←`/`→` 按一整轮移动指针,到头置灰。
  - `TestConfig` 顶层按 `isBookMode()` 二选一渲染 `BookConfig` / 原来的 `RandomConfig`。
  - 回合设置**存在书自己身上**(`local-books` 新增 `roundMode / roundWords / roundSeconds`,默认 25 词;migrate 给老书补默认值)。
  - `navigate()` 里加一条:目标不是 `/read` 就 `endBookSession()` —— 离开书籍页 = 关书 + 还回 Random 的文本。
  - **`clearLegacyBookLeakage()`**:M2c 期间打开过书的用户,custom 槽位里残留着书的尾巴(指示器只在内存里,刷新即失,所以点 `custom` 会莫名其妙进到上次那本书)。一次性检测并重置,带 localStorage 标记只跑一次。
- 交互逻辑 / 边界:
  - 进书顺序是**先 `startBookSession` 再 `navigate("/read")`**。反过来不行:`getActivePage()` 要等页面转场动画结束才翻成 `"test"`,拿它当前置条件会让会话根本起不来(实测踩过)。
  - 书套书:从一本书直接跳另一本时不覆盖 stash,否则 Random 的文本会被前一本书顶掉。
- 关键文件:`ts/books/book-session.ts`(新)、`ts/components/pages/test/BookConfig.tsx`(新)、`ts/books/local-books.ts`(回合字段)、`ts/components/pages/test/TestConfig.tsx`、`ts/controllers/route-controller.ts`、`ts/components/pages/BookshelfPage.tsx`、`ts/test/custom-text.ts`(`setData` / `resetToDefault`)、`frontend/firebase.json`。
- 计划外变更:无(本片本身就是 2026-08-01 因用户反馈重写的计划)。
- 验证(localhost 实测,逐条对应用户报的问题):
  - 先给 Random 存一段 `random scratch text of mine`,再建一本 120 词的书。
  - 书架 `start` → 到 `/read`,顶部是书的胶囊条,正文恰好 25 词(w0–w24),书名与 `shift + enter` 提示在。
  - 点 `50` → **仍在这本书里**,正文变 w0–w49,书里 `roundWords` 存成 50。(用户问题 ②)
  - 点右箭头 → w25–w49,左箭头由置灰变可用,书架进度前进一整轮。
  - 走到 `/test` → 配置条变回 Random 那排,正文是 `random scratch text of mine`,`typeanyActiveBook` 与 stash 都已清空,书的进度 25 完好。(用户问题 ③)
  - `pnpm lint-fe` 0/0;`build-fe` 绿。
- 已知问题 / 未完:
  - 右箭头的 `next block` 气泡贴着屏幕右缘会被裁掉,只是提示文字被切,功能正常。
  - `punctuation` / `numbers` 只是占位;它们在书里的「跳过」语义要等 M3 的字符三分类。
  - 书籍页目前没有双进度条 / 双结算 / 章节(M3)。
  - 移动端书籍页只有 `test settings` 那个入口沿用 Random 的弹窗,还没有书籍版(M3 一并处理)。
- 下一步:M2 收尾,进 **M3**(章节段落级真指针、双进度条、双结算、符号跳过、热力图记数)。

---

## ✅ 已解决:PDF 上传失败(2026-08-01 立案 → 2026-08-03 定位并修复)

**结论:三条假设全部猜错,真因是 Safari 没有 `ReadableStream[Symbol.asyncIterator]`。**
修复与实测见下方 **M2e**。以下调查记录原样保留,因为它记的是「我怎么连猜两轮都错」——
教训是那三条假设都是从一句报错文本推出来的,谁都没去真机复现。

**状态:开着的 bug,下一个会话第一件事。** 用户在自己的浏览器上传真实 PDF(`CIS61_Ortak_S26.pdf`,课件)仍然失败。改用 pdf.js legacy 构建**没有解决**。

### 已经做过的

1. 第一次报错原文(用户提供):
   `Could not read CIS61_Ortak_S26.pdf: undefined is not a function (near '...e of t...')`
   —— `undefined is not a function` 是 WebKit/Safari 的措辞;`near '...e of t...'` 指向一个 `for (… of t…)`,像是迭代器 helper(`.map()`/`.filter()` 直接调在迭代器上)缺失。
2. 据此把 `extract-text.ts` 的 pdf 分支从 `pdfjs-dist` 默认构建换成 `pdfjs-dist/legacy/build/pdf.mjs` + `legacy/build/pdf.worker.mjs?url`(legacy 里打包了 core-js 的 `es.iterator.*`、`Promise.withResolvers` 等 polyfill)。已上线(commit `1780c8e31`)。
3. 换完后我在 Chromium 里复验:合成 PDF 正常提取 19 词,扫描版仍正确报 `scanned-pdf`。**但用户那边仍失败。**

### 下一个会话开工前必须先问用户拿到的东西

**不要再猜了,先要这三样**(前两次都是因为拿合成样本代替真实文件而误判):

1. **新的报错原文**(整段,截图或复制)—— 换 legacy 之后错误可能已经变了,是同一个还是新的决定了方向完全不同。
2. **浏览器与版本**(Safari 几点几 / Chrome 几)。
3. 可能的话,**那个 PDF 本身**(或任意一个能复现的真实 PDF)。放进 `docs/` 之外的临时目录,不要提交进仓库(版权)。

### 待验证的假设(按可能性排序)

1. **worker 加载失败**:`legacy/build/pdf.worker.mjs?url` 在生产构建里被 emit 到 `dist/worker/pdf.worker.*.mjs`。若浏览器因 MIME/CORS/模块 worker 支持拒绝加载,pdf.js 会抛出与主线程无关的错。**排查:上传时看 Network 面板有没有那个 .mjs 请求、状态码是什么。** Safari 对 module worker 的支持较晚(15+),legacy 版本可能仍用 `type: "module"` worker。
   - 若坐实:改用 `disableWorker: true`(在主线程解析,慢但兼容),或引入 `pdf.worker.min.mjs` 的 classic 构建。
2. **仍是语法/API 兼容**:legacy 构建虽带 polyfill,但 Vite/rolldown 的 target 可能把它又降级/保留了新语法。**排查:看 `browserslist` 与 `build.target`,确认产物里没有 `??=`、`?.` 之外的新语法。**
3. **这个 PDF 本身的特性**(加密 / 线性化异常 / 特殊字体)。若是,错误文案应该是我写的 `corrupt-file` 那条而不是裸 `undefined is not a function` —— 所以优先级最低。

### 相关已知遗留

- `cMapUrl` / `standardFontDataUrl` / `wasmUrl` 都没配。前者影响 CID 编码(中日韩)PDF 的文字提取正确性,后两者只影响渲染、与提取无关。中文归 M5,届时一并处理。
- **教训(已写进记忆)**:自己造的最小样本不能当验收依据。这个 bug 我"验证通过"了两次,用户那边两次都不通。真实文件没到手之前,不要声称 PDF 能用。

---

## M2e — PDF 上传修复:Safari 的 ReadableStream 异步迭代缺口(2026-08-03)

- 实现:`extract-text.ts` 不再调用 pdf.js 的 `page.getTextContent()`,改为自己
  `page.streamTextContent().getReader()` 逐块读同一条流;并给翻页循环补了独立的
  `try/catch`,失败时报「第几页读不出来」而不是掉进上层那句通用文案。
- 真因(实测,非推断):
  - pdf.js 6 的 `getTextContent()` 内部是 `for await (const value of readableStream)`
    (`pdfjs-dist/legacy/build/pdf.mjs:22166`)。
  - **Safari 至今没有实现 `ReadableStream[Symbol.asyncIterator]`**(Safari 26.5 实测
    `ReadableStream.prototype.values === undefined`)。`for await` 于是去取一个
    `undefined` 当迭代器来调用,WebKit 抛
    `TypeError: undefined is not a function (near '...value of readableStream...')`。
    压缩后变量名变成 `e`/`t`,就是用户看到的 `near '...e of t...'`。
  - 它落在我 `try` 之外,所以显示成 `Could not read <文件名>: …`,把出处彻底盖掉了。
- 为什么前两轮都没找到:
  - `for await` 是**语法**,不是能被 `compat/compat` 那条 lint 规则查出来的 API 调用,
    而且它在依赖里,不在我们代码里。
  - `ReadableStream` 是 Web API,**core-js 不管**,所以换 legacy 构建注定无效。
  - Chromium 与 Node 都有这个异步迭代器,本地怎么试都是绿的。
- 定位手法(下次遇到"只有用户的浏览器坏"照抄):
  写一个探针 HTML + 一个本地 node 静态服务器,页面把结果 `sendBeacon` 回
  `/report`,再 `open -a Safari http://localhost:…`。**不需要开 Safari 的远程自动化,
  也不需要用户复述控制台**,拿到的是真机 JS 环境。脚本留在会话临时目录,没进仓库。
- 实测(全部在用户本机 Safari 26.5 + 用户真实 PDF `CIS61_Ortak_S26.pdf` 上):
  - 探针一(裸 pdf.js):`ReadableStream[Symbol.asyncIterator]: undefined`;
    文档能打开、`numPages=5`、**worker 正常**(顺带排除了假设 1);
    `getTextContent()` 复现原报错;`streamTextContent()+getReader()` 成功拿到 118 项。
  - 探针二(端到端,同源 iframe 载入 `pnpm build-fe` 的生产产物 `/bookshelf`,
    把真 PDF 注进 App 自己的 `input[type=file]` 并派发 `change`):
    书成功入架 —— `chars=8920 words=1379 progress=0 round=words/25`,
    正文开头是课件真实内容,页面显示 `1 book on this device`。
  - `tsc --noEmit` 通过;`oxlint --type-aware` 0 问题;`build-fe` 绿。
- 计划外变更:`streamTextContent()` 在 `pdfjs-dist` 根 typings 里没导出 `TextContent`,
  用 `Awaited<ReturnType<PDFPageProxy["getTextContent"]>>` 取形状,避免深路径 import。
- 已知问题 / 未完:
  - `cMapUrl` / `standardFontDataUrl` 仍未配 —— 中日韩(CID 编码)PDF 的取字仍可能不对,
    归 M5 中文支持时一并处理。
  - 右箭头 `next block` 气泡贴右屏边被裁;移动端书籍页仍复用 Random 的 `test settings` 弹窗。
- 下一步:M2 收尾完成,进 **M3**。

---

## M2f — 书籍页两个线上 bug:胶囊条不刷新 + 打完一轮进度归零(2026-08-03)

用户报「切词数/切时间点了没反应」。实测发现的是两个独立的 bug,第二个比第一个严重得多。

### bug 1:回合胶囊条点了不刷新(用户报的现象)

- 现象(Safari 26.5 实测):点 `50` → 存储里 `roundWords` 确实变成 50、正文也确实变成 50 词,
  但**高亮不动**;点 `time` → `roundMode` 变了,可那排数字**仍然是 25/50/100/200**,
  秒数档 15/30/60/120 根本没出现 → 于是「点了时间也没反应」,因为屏幕上压根没有 60 可点。
- 原因:`getActiveBook()` 直接读 localStorage,不是信号。Solid 看不见 localStorage 变化,
  所以 `<Show when={book()?.roundMode === "words"}>` 和 `active={...}` 都不会重算。
  **我在 Chromium 里之所以看着是好的,是蹭了旁边 `getFocus()` 之类信号变化时的顺带重算 —— 巧合,不是设计。**
- 修:`local-books.ts` 里所有写操作统一走 `save()`,写成功后 bump 一个 `shelfVersion` 信号;
  `getActiveBook()` 先读一下 `shelfVersion()` 再取书。数据仍只有 localStorage 一份,信号只负责"通知"。
  顺带把打完一轮后进度变化也带上了 —— 左右箭头的置灰状态现在也会自己更新。
- 实测(Safari 26.5,同源 iframe 载入生产产物):
  `点 time → 秒数档 [15,30,60,120] 出现` / `点 60 → roundSeconds=60` / `回 words 点 50 → roundWords=50`。

### bug 2:打完一整轮 → 整本进度归零(用户没报,我顺着 bug 1 读代码翻出来的)

- **实测复现**:一本 8 词的书,一轮 2 词,起点 progress=2,正确接上 `[cc,dd]`,打完两个词后
  **progress 变成 0**,不是 4。用户每打完一轮就丢掉全部进度。
- 原因:`test-logic.ts` 的 long-custom-text 收尾是上游逻辑 —— 上游把整本书当**一场**测试,
  跑到底 = 整本读完 = `setCustomTextLongProgress(name, 0)`。我们把书切成一轮 25 词之后,
  "跑到底"变成了"打完一轮",于是每轮都触发归零。**这是 M2d 引入分轮制时漏掉的连带影响。**
- 修:统一按"这一轮实际打完多少词"推进指针,只有 `newProgress >= wordCount` 才算整本读完(才归零)。
  - 字数轮且没有 bail out → 只可能是把词打完才结束的,所以推进 `TestWords.words.length`(整轮)。
    不能数 input history:**结束这场测试的那个词还停在当前输入里,永远不会被提交进 history**,
    照 history 数会少一个词(实测 2→3 而不是 2→4)。
  - bail out / 时间轮到点 → 仍按 history 数已完成的词(保留上游那段"最后一个词没打完就不算"的判断)。
  - 提示语也换了:每轮都弹「Long custom text progress saved」太吵,现在只有中途 bail out 才提示
    `Progress saved — X of Y words`;整本读完提示 `Finished "<书名>" — back to the beginning`。
- 关键文件:`test/test-logic.ts`、`books/local-books.ts`、`books/book-session.ts`。

### 上传卡文案(用户问「这是免费识别文字的吗 到底什么格式需要 aiapi」)

- 虚线卡加一行:本机解析、免费、文件不上传;扫描版 PDF(整页是图)要 AI、现在还没做。
- 对应 WORKORDER「已定决策」新增一行,M4 接 AI 管道时这段文案要同步改。

### 验证与诚实说明

- `tsc --noEmit` 通过;`oxlint --type-aware` 0 问题;`build-fe` 绿。
- bug 1 与 bug 2 的**归零行为**都在用户本机 Safari 26.5 + 生产产物上实测过(见上)。
- **没能自动化验证的一点**:修完之后"打完一轮正好推进整轮词数"这个精确值。
  隐藏标签页里真实按键进不了打字引擎,合成 `InputEvent` 又无法让最后一个词自然结束测试;
  多开探针标签页还会共用同一 origin 的 localStorage 互相干扰。**这一项留给用户在真实使用中确认**
  (打完一轮回书架看进度是不是 +25),不当成已验证。
- 探针脚本(同源 iframe 驱动真实上传框/按钮 + `sendBeacon` 回报)留在会话临时目录,没进仓库。

### 已知问题 / 未完

- **续打时灰显上一个词**(用户 2026-08-03 提的需求)已写进 WORKORDER「续打上下文」,**本片未实现**,
  作为 M3 第一片。已确认技术上可行:`#words` 的子元素本来就混着非 `.word` 元素,行内布局按 class
  判断而非固定下标。
- 右箭头 `next block` 气泡贴右屏边被裁;移动端书籍页仍复用 Random 的 `test settings` 弹窗。

- 下一步:**M3**,第一片做「续打上下文灰显」。

---

## M2 收尾状态(2026-08-04,compact 前留给下一个会话)

- **M2 六片全部完成**(a/b/c/d/e/f),两次提交:`d808085a0`(PDF)、`ea2cd06db`(胶囊 + 进度归零 + 上传卡文案),均已 push 且线上复验。
- **⚠️ 用户 2026-08-04 原话:「其实还有一些 bug 不太对,但是我们下一个回合再说」——具体是哪些还没说。**
  **下个会话第一件事:问清楚是哪几个 bug,不要自顾自开 M3。**
- 已知未修 / 未验的,见 `docs/plans/M2.md` 的「已知遗留」六条,重点是:
  1. 用户未说明的那些 bug;
  2. 续打灰显上一个词(已定为 M3 第一片,spec 在 WORKORDER「续打上下文」);
  3. 「打完一轮正好推进整轮词数」这一条**没有自动化验证**,只验到"不再归零"。
- **自动化环境的坑(这次踩了很多次,下次直接照做,别再重新踩)**:
  - 浏览器面板的标签页是 `visibilityState: hidden` → rAF 停摆 → 页面切换会卡住(点了 `start` 但停在 `/bookshelf`),
    截图能逼出帧;真实按键也进不了 `#wordsInput`,`computer type` / `computer key` 都到不了打字引擎。
  - Safari 探针:**一个 origin 只能同时开一个标签页**。多开会共用同一份 localStorage 互相覆盖,
    而且 `open -a Safari` 会把上一个标签页挤到后台 → 它的 rAF 也停摆 → 永远跑不完。
    每跑一趟换一个端口(`node server2.mjs <port>`),跑完再开下一趟。
  - 探针等待条件要写成「等到**这一轮的词**出现」,不能只等 `#words` 非空 —— 测试页会留着上一轮的随机词,
    对着随机词打字什么也证明不了(这次因此得出过一个假结论)。
