# DigiBoard · 电子副屏

可自定义点阵尺寸的电子副屏模拟器：在同一块画布上叠放单色像素画、LED 数码管（矢量浮层，可突破像素网格）与信息流小组件，导出 PNG / YAML，并提供独立全屏播放页。

## 这是什么？

- 定位：浏览器端电子副屏编辑器 + 播放页，纯前端部署（GitHub Pages），可选本地桥接脚本注入真实数据
- 解决的核心问题：LED 数显模拟只有一种内容（数码管）且被像素网格锁死；本项目把它升级为通用副屏——点阵尺寸可配、内容可分层叠放、数码管为矢量浮层不受网格量化、可导出可分享

## 为什么存在？

- 背景 / 动机：原项目是 Vue 3 七段数码管模拟器（simu-digits），功能单一。升级为「电子副屏」后支持三类内容共存：像素画（受点阵约束）、LED 数码管（矢量、真突破像素限制：任意旋转/斜切/发光/亚像素定位/可超出画布）、信息流小组件（默认提供 Claude Code 会话状态）。历史 commit 已按要求重写为规范 message（作者 `杏仁鹿 <krkr@xrl.im>`，作者时间保留）

## 如何安装和运行？

- 前置要求：Node `^20.19.0 || >=22.12.0`，pnpm 12+
- 安装步骤：`pnpm install`（已配置 npmmirror 镜像，见 `.npmrc`）
- 运行 / 启动：
  - `pnpm dev` — 开发服务器（编辑器 `/`，播放页 `/play`）
  - `pnpm bridge` — 本地 SSE 桥接，读取 `~/.claude/sessions` 推送真实会话状态（详见 `bridge/README.md`；不启动时小组件自动降级为演示数据）
  - `pnpm test` — vitest 单测（197 例）
  - `pnpm test:e2e` — Playwright E2E（29 例，含 PNG 真实栅格化验证）
  - `pnpm check` — format + lint + type（提交前必须通过）
  - `pnpm build` — 生产构建到 `dist/`

## 当前状态

- 阶段：开发中（核心功能完整：编辑器、播放页、导出、小组件、桥接均已落地并通过测试）
- 已知限制：
  - PNG 导出依赖浏览器 canvas（jsdom 无法测试，由 Playwright 覆盖）
  - Claude 会话小组件需本机运行 bridge 才有真实数据，静态部署只有演示数据
  - 小组件目前仅内置「Claude Code 会话状态」一种

## 核心技术

- 语言 / 框架 / 关键依赖：React 19.3 + TypeScript 5.9、Vite+（`vite-plus`，命令 `vp`，统一 dev/build/check/test）、Tailwind v4 + shadcn/ui、zustand 5（场景状态 + 撤销重做）、react-router-dom 7、js-yaml（场景序列化）、Playwright（E2E）

详情见 `docs/`：`PRD.md`（行为与价值）、`ARCHITECTURE.md`（稳定结构）、`DECISIONS.md`（关键决策记录）、`specs/`（模块规格：画布引擎、Claude 小组件与桥接）；Agent 操作指南见根目录 `AGENTS.md`。
