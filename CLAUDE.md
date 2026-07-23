# TypeAny(开发代号)· Claude 工作规则

## 文件地图
- `WORKORDER.md` — 工程总纲(产品 spec、决策、分期、待确认清单)的唯一权威
- `docs/plans/M<n>.md` — 每个里程碑的实施计划(拆成分片 a/b/c…)
- `docs/logs/M<n>-LOG.md` — 每个里程碑的完工日志(按分片追加)
- `docs/UI-brief.md` — 给外部 AI 出视觉方案用的需求书
- `design/README.md` — 视觉方案定稿(B「Ink Aurora」)与全部设计 token 的唯一来源
- `docs/UPSTREAM-DEV-NOTES.md` — 上游 monkeytype 开发须知(pnpm/oxlint/Tailwind/Fa 约定),仅作参考

## 里程碑工作流(必须遵守)
1. **进入新里程碑 M<n>**:先读 `WORKORDER.md` 相关章节 + 上一个里程碑的 LOG,再实地读代码,然后写 `docs/plans/M<n>.md`(分片须可独立验证),经用户确认后开工。
2. **开始任何分片前**(如 M1b):必须先完整读 `docs/plans/M1.md` 和 `docs/logs/M1-LOG.md`,再写代码。
3. **分片完成的定义**:功能跑通 + 构建无错 + LOG 已追加 + 已 git commit(有远程则 push)。
4. **LOG 条目模板**:
   ```
   ## M<n><字母> — <标题>(<YYYY-MM-DD>)
   - 实现:<功能点>
   - 交互逻辑:<关键行为、状态机、边界情况>
   - 关键文件:<路径 或 模块入口>
   - 计划外变更:<新增/偏离计划之处及原因;没有则写"无">
   - 已知问题/未完:<…>
   - 下一步:<…>
   ```
5. 计划与日志只写进上述文件,**不塞进本文件**;本文件只放规则与指针。
6. **换机无缝原则**:一切状态(计划/日志/决策)只存在于仓库文件,不依赖对话记忆;克隆仓库 + 读本文件即可继续工作。

## 硬性产品规则
- 前端 fork 自 monkeytype(GPL-3.0):保留原版权声明,fork 保持开源;Monkeytype 名称与 logo 必须清除干净。
- 后端(AI 解析、账号、付费)独立于前端仓库,闭源。
- 偏离 `WORKORDER.md` 的改动:先在 WORKORDER.md 提出修改并经用户确认,再动代码。

## 仓库与环境(M1a 已完成迁移)
- 工作仓库 = `Desktop/打字项目/typeany/`(fork 自 monkeytypegame/monkeytype,GPL-3.0,独立 .git;远程 origin=26ds/typeany、upstream=monkeytypegame)。**新会话在此目录打开**,读本文件即可继续。
- `WORKORDER.md`/`CLAUDE.md`/`docs/`/`design/` 已迁入本仓库根,以本 CLAUDE.md 为准;上游 `AGENTS.md` 原位保留、上游开发须知转存 `docs/UPSTREAM-DEV-NOTES.md`,均仅作参考。
- 环境与启动:Node **24.11.0**(`.nvmrc` → `nvm use`)、pnpm **10.28.1**(`packageManager` 自管,无需 corepack);仓库根 `pnpm install` → `pnpm dev-fe` → http://localhost:3000。
- firebase 配置:`firebase-config.ts`(dev)与 `firebase-config-live.ts`(prod alias 目标)均已提交**空白版** = 游客模式,开箱即用;真实密钥 M6 用 env 注入,不进代码库。
- 部署:前端(GPL)→ **Vercel**(`vercel.json`:root=仓库根、build=`pnpm build-fe`、output=`frontend/dist`、SPA rewrite→index.html)。**生产构建需 env `RECAPTCHA_SITE_KEY`**(占位即可;M1b 移除 recaptcha 后可去除)。Vercel 的 Node 版本需 24。
- **勿把本项目提交进外层 Desktop git 仓库。**
