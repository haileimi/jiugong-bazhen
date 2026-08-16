# PROGRESS.md — 进度日志（状态真相）

> 每次收工由 AI 更新。新对话开工先读本文件 + AGENTS.md。
> 保持精简：能 5 分钟读完。

## 当前状态（最近一次更新：2026-08-16）

**正在做什么**：
- 项目已接入 Git + GitHub，接下来在家/公司双端协作开发

**已完成**：
- v2.0 核心玩法：九宫格布阵（上 3 下 2 共 5 格）、天机费用（每回合 4 点）、
  12 英雄牌库随机抽 5 张上阵
- 战斗规则：五行克制（×1.3 / 被克 ×0.7）、暴击 10%（×1.5）、兵种特技 25% 触发
- 卦象系统：开局三选一上卦（一局固定）+ 九宫格第 1 行合成下卦（每回合重算），64 卦特效自动组合
- 魔王战：5 魔将 + 本体「混沌·六爻魔」（100 血，魔将全灭前守护）
- 规则自检：514 项断言（`node tools/run-selftest.js`）
- 12 英雄 + 皮肤体系（`images/hero/<id>/<皮肤id>.png`，缺失降级为图标文字）
- **Git 接入**：本地仓库已提交（37 文件，commit `625a614`），已推送到 GitHub
  （https://github.com/haileimi/jiugong-bazhen，分支 main）；git 已加入 PATH；
  仓库已配置代理 `http://127.0.0.1:7897`；新增 `GIT速查表.md`（居家自用速查）

**卡住的问题 / 已知坑**：
- 公司电脑命令行外网必须走代理 `127.0.0.1:7897`（已写入仓库 `.git/config`，勿删）
- 本机 git 曾不在 PATH，已加用户 PATH（旧终端需重开生效）
- AI 沙箱里 GitHub 登录弹窗无法弹出 → push 需人工在终端执行（或提供 PAT）
- 浏览器缓存坑：改 JS/CSS 必须同步更新 `index.html` 与 `cardRenderer.js` 的 `?v=` 版本号

**下一步（按优先级）**：
1. 家里电脑 `git clone https://github.com/haileimi/jiugong-bazhen.git` 开始双端协作
2. 日常循环：`git add .` → `git commit` → `git push`（收工必 push，开工必 pull）
3. 考虑给 AI 一个 GitHub PAT，实现 push 也由 AI 代跑

## 开发日志

### 2026-08-16（地点：公司）
- Git + GitHub 接入完成：初始提交并推送云端（分支 main），配置代理与 PATH
- 新增 `GIT速查表.md`，更新本文件（PROGRESS.md）
