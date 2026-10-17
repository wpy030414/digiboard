# AGENTS.md

DigiBoard 电子副屏：React 19.3 + Vite+ 的点阵画布应用，三层图层（像素/数码管矢量/小组件）+ 导出 + 播放页 + 本地 SSE 桥接。

## 概述

- 本项目是什么：浏览器端电子副屏编辑器与播放页。场景 = 点阵尺寸 + 有序图层栈；图层分三类：`pixel`（圆角点阵玩具板，像素值是调色板索引——单层多色混搭；画笔颜色在顶部工具栏）、`digit`（矢量 LED 数码管，可斜切/发光/超出画布——「突破像素限制」是核心卖点，但以一块矩形占据点阵空间）、`widget`（信息流小组件，同样占据矩形，目前内置 Claude Code 会话状态）。
- 点阵尺寸上限 200×200（`MAX_SCENE_SIZE`）：新入口一律经 `clampSceneSize`，YAML 超限直接拒绝。
- 拼豆模式（`beads`）：`PixelCanvas` 画直角整格，`BeadsOverlay` 叠加行列序号与 5/10 格红线，`editor/BeadsLegend` 显示颜色计数并支持单色筛选；开关偏好存 localStorage（`digiboard.ui.beads.v1`），开启时 PNG 导出同步方形并烧入参考线（不含序号）。
- 新建画布入口是 `editor/NewSceneDialog`：空白或从图片生成（`engine/image-to-pixels.ts`，cover 裁切 + 最多 255 色降级）。
- 像素层是画布基座：场景恒有且仅有一个 `pixel` 层，固定在 `layers[0]`，不出现在图层面板、不可增删/复制，内容层只能叠在它上面（`normalizeScene` 负责读档归一）。
- 屏幕隐喻：一块黑底网格玩具板。像素是留缝的圆角方块；数码管/小组件不是浮在点之上，而是把矩形内的像素点整块抠掉（`computeReservedMask`）。画布底色固定黑色，不允许透明或换色；不提供网格辅助线；图层不允许旋转。

## 边界与范围

- 范围内：画布引擎（src/engine）、编辑器 UI（src/editor、src/pages）、小组件（src/widgets）、本地桥接脚本（bridge/）、单测与 E2E。
- 非目标（明确排除）：
  - 不做多用户/协作/云存储——场景以 YAML 文件与 URL 传递；
  - bridge 只读 `~/.claude`，**绝不读取 `.key` 令牌文件**、绝不写回、只监听 127.0.0.1；
  - 不做移动端触控优化（指针事件可用但未针对性调优）。

## Agent 操作指南

- 如何理解本项目：先读 `docs/ARCHITECTURE.md`（三层合成与坐标变换）与 `docs/DECISIONS.md`（为什么 Vite+/为什么矢量层用 SVG）。场景数据模型的唯一权威定义在 `src/engine/types.ts`。
- 全局规则 / 约定：
  - 工具链一切走 `vp`（Vite+）：`pnpm check`（fmt+lint+type）必须在提交前通过；测试 `pnpm test`（vitest）与 `pnpm test:e2e`（Playwright，dev server 用 5273 端口，**不要占用/杀死 5173/5174**——那是其它项目的进程）。
  - 像素写入必须走 store 的 clone-then-mutate 约定（见 `scene-store.ts` 的 `withPixelLayer`），历史栈依赖不可变性。
  - 点阵几何（圆角/留缝/灭点）与占位抠除必须共用 `engine/dots.ts` 与 `engine/footprint.ts`——屏幕渲染与 PNG 导出不允许出现第二套几何。
  - 编辑自动保存走 `engine/persistence.ts`（防抖 400ms → localStorage `digiboard.scene.v1`）；只持久化 scene，不持久化历史栈/选中态。
  - 带历史的离散操作用 `pushHistory`；连续操作（画笔拖拽）由调用方在笔画起点 `commitHistory()` 一次。
  - YAML 是场景的交换格式：改动 `types.ts` 中图层字段时必须同步 `to-yaml.ts` 的序列化与 round-trip 测试。
  - 小组件经 `registerWidget` 注册表分发；新增小组件类型需同时扩展 `WidgetKind`、注册入口与 `vector-to-svg.ts` 的导出快照分支。
  - git commit：Conventional Commits（type/scope 英文、描述简体中文），作者 `杏仁鹿 <krkr@xrl.im>`；本机启用了 GPG 签名，若 pinentry 被取消导致提交失败，先 `echo | gpg --clearsign --local-user 5DA29157B3C5F863` 预热再重试。
  - **不要 force push**：历史已按用户要求重写过一次，远端 origin/main 保持不动（用户明确「重写但不推送」，推送时机由用户决定）。

## 目录速查

- `src/engine/types.ts` — 场景与三类图层的数据模型（唯一权威）
- `src/engine/scene-store.ts` — zustand 场景状态 + 撤销/重做
- `src/engine/digits.ts` — 七段数码管几何与字符编码（a-g 位掩码）
- `src/engine/transform.ts` — 3×3 仿射矩阵（矢量层定位/旋转/斜切/命中测试）
- `src/engine/pixels.ts` — 像素操作（油漆桶/Bresenham/RLE）
- `src/engine/dots.ts` — 圆角点阵几何与绘制（灭点/亮点，屏显与导出共用）
- `src/engine/footprint.ts` — 矢量层矩形、命中测试与占位抠除掩码
- `src/engine/persistence.ts` — 场景防抖持久化（localStorage）
- `src/engine/image-to-pixels.ts` — 图片 → 像素画（cover 裁切 + 色彩降级）
- `src/engine/factories.ts` — 图层/场景工厂与 resize 重采样
- `src/engine/render/` — SceneCanvas 合成容器 + 三类图层渲染器（canvas/SVG/DOM）
- `src/engine/export/` — to-yaml（场景⇄YAML）、to-png（三层合成栅格化）、vector-to-svg（矢量层序列化）
- `src/editor/` — Toolbar / LayerPanel / PropertyPanel
- `src/pages/` — EditorPage（编辑器）、PlayerPage（播放页，URL ?scene= base64-yml）
- `src/widgets/claude-status/` — Claude 会话小组件（SSE 订阅 + mock 降级）
- `src/components/ui/` — shadcn/ui 组件（`cn` 统一走 `@/lib/utils`）
- `bridge/` — 本地 SSE 桥接脚本与文档（`node bridge/server.mjs`）
- `e2e/` — Playwright 端到端测试（helpers 经 dev 态 `window.__digiboard` 断言）
- `docs/` — PRD / ARCHITECTURE / DECISIONS / specs
