# ARCHITECTURE — DigiBoard 电子副屏

## 系统概述

```
┌─────────────────────────── 浏览器（纯静态部署）───────────────────────────┐
│                                                                          │
│  EditorPage (/)                        PlayerPage (/play?scene=<b64yml>) │
│  ┌─────────┬──────────────┬─────────┐  ┌──────────────────────────────┐  │
│  │ Toolbar │              │Property │  │  全屏只读渲染                 │  │
│  ├─────────┤  SceneCanvas │ Panel   │  │  （同一 SceneCanvas,mode=play)│  │
│  │ Layer   │ ┌──────────┐ ├─────────┤  └──────────────────────────────┘  │
│  │ Panel   │ │ 三层合成  │ │         │                                    │
│  └─────────┘ └──────────┘ └─────────┘                                    │
│        │           │                                                     │
│        ▼           ▼                                                     │
│  ┌──────────────────────────────────────────────────┐                    │
│  │ engine（核心，无 UI 依赖）                        │                    │
│  │  types / scene-store(zustand+历史栈) / digits     │                    │
│  │  transform(仿射矩阵) / pixels(RLE/填充) /factories│                    │
│  │  render: PixelCanvas + DigitLayerView + WidgetView│                    │
│  │  export: to-yaml / to-png / vector-to-svg         │                    │
│  └──────────────────────────────────────────────────┘                    │
│        │ EventSource (SSE)                          ▲                    │
└────────┼────────────────────────────────────────────┼────────────────────┘
         ▼                                            │
  bridge/server.mjs（本机 sidecar,127.0.0.1:4321）─────┘
    读 ~/.claude/sessions/*.json（判活）+ projects/*/<sid>.jsonl 尾部
    聚合 → SSE 推送；不可达时前端降级 mock 演示数据
```

场景坐标系：以点阵尺寸 `W×H` 为逻辑单位。三类图层按数组顺序（z 从低到高）叠放：

| 图层     | 坐标             | 屏幕渲染                                                    | PNG 导出                                  | 网格量化         |
| -------- | ---------------- | ----------------------------------------------------------- | ----------------------------------------- | ---------------- |
| `pixel`  | 整数格点         | `<canvas>` 圆角点阵：每格一颗圆角方块（留缝），灭点 + 亮点  | 同一套 `drawPixelDots` 按输出像素密度绘制 | **是**           |
| `digit`  | 浮点，可超出画布 | `<svg>` 铺满容器 + matrix transform + glow filter，占据矩形 | 序列化为 SVG 文档 → `Image` → drawImage   | **否（真突破）** |
| `widget` | 浮点             | `<div>` container-query 单位，DOM 渲染，占据矩形            | `widgetLayerToSvg` 快照化为 SVG 文本卡    | 否               |

**拼豆模式**（编辑器工具栏开关，偏好存 localStorage `digiboard.ui.beads.v1`；开关标签随状态显示「副屏」/「拼豆」）：
像素改画直角整格、无留缝，叠加行列序号、每格半透灰色边界线与红色标识线（5 格虚线 / 10 格实线），
画布下方出现颜色图例（每种颜色按 **MARD 221 色拼豆色号** 显示像素数，并按色号自然顺序 `A1 < A9 < A10 < B1` 排列），点击图例可高亮该颜色——其余颜色降为 30% 透明度而不是消失。格子 ≥8px 时，每个色块中央用取反色小字标注色号（亮底深字 / 暗底白字）。
开启时 PNG 导出同步变成直角方块与全套参考线，并外扩留白绘制四边行列序号、署名行与图例（`export/beads-export.ts`）；拼豆导出密度与屏幕倍率解耦（`beadsExportUnit`：上限 48px/格、单边 4096），关闭时导出仍是圆角点阵。

**点阵尺寸上限 200×200**（`MAX_SCENE_SIZE`）：工具栏输入、新建对话框、resize 与 YAML 加载统一受此约束。

**像素层是画布基座**：像素值语义为调色板索引（0=灭，n=`palette[n-1]`），
因此单层即可混搭多色（上限 221 色，与 MARD 拼豆色卡一致）；画笔颜色在顶部工具栏，选择时自动吸附到最近的拼豆色号（tooltip 显示色号），写入时自动登记新颜色。

**像素层是画布基座**：场景恒有且仅有一个 `pixel` 层，固定位于 `layers[0]`
（z 最底）。它不出现在图层面板、不可删除/复制，也不能通过「添加图层」新增；
读档时 `normalizeScene` 会把基座归位、合并旧场景里多余像素层的亮像素。
内容层（digit/widget）只能叠在基座之上，排序下界是 index 1。

**屏幕是网格玩具板**：像素不是无缝方块，而是留缝的圆角点。数码管与小组件
不是浮在像素点上，而是占据一整块矩形点阵空间——`computeReservedMask` 逐格
判定被可见矢量层覆盖的格子，像素层在这些格子上既不画亮点也不画灭点（整块
抠除）。命中测试、屏幕渲染与 PNG 导出共用 `footprint.ts` 的同一个矩形。

## 核心模块

| 模块                               | 职责                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `engine/types.ts`                  | 场景/图层数据模型唯一权威定义（Scene、PixelLayer、DigitLayer、WidgetLayer、Tool）                                                                                              |
| `engine/scene-store.ts`            | zustand 单例：场景 CRUD、选中态、撤销/重做栈（上限 100）、像素写入的 clone-then-mutate                                                                                         |
| `engine/digits.ts`                 | 七段数码管：a-g 位掩码字符表、段位几何（sharp/rounded）、文本排布（含小数点）                                                                                                  |
| `engine/transform.ts`              | 3×3 仿射矩阵：translate/rotate/skew/scale、layerToScene 及其逆、AABB 包围盒与命中测试                                                                                          |
| `engine/pixels.ts`                 | 像素原语：扫描线油漆桶、Bresenham 直线、RLE 编解码                                                                                                                             |
| `engine/dots.ts`                   | 圆角点阵几何与绘制（灭点/按调色板分桶的亮点、留缝、圆角），屏幕与 PNG 导出共用                                                                                                 |
| `engine/footprint.ts`              | 矢量层矩形与占位掩码：`layerFootprint` / `pointInLayer` / `computeReservedMask`                                                                                                |
| `engine/persistence.ts`            | 场景防抖持久化到 localStorage（YAML 序列化，损坏/不可用时静默降级）                                                                                                            |
| `engine/beads-palette.ts`          | MARD 221 色色卡（色号/HEX/分组）、精确查询与最近色吸附；调色板上限的来源                                                                                                       |
| `engine/image-to-pixels.ts`        | 图片 → 像素画：cover 裁切 / 主体裁切、4× 超采样、Kuwahara 保边平滑、逐格主导色、Oklab k-means（色数自适应）、双边 + ICM 空间清理、吸附 MARD 221 色卡                           |
| `engine/matting.ts`                | 主体蒙版几何：主体包围盒、按主体选裁切区域（padding + 目标宽高比）、蒙版转 alpha 画布                                                                                          |
| `engine/matting-model.ts`          | 主体抠图主线程侧：解码图片、320×320 归一化、Worker 协议与进度回调                                                                                                              |
| `workers/matting.worker.ts`        | 主体抠图 Worker：onnxruntime-web（WASM）跑 U²-Net-p，返回 320×320 alpha 蒙版                                                                                                   |
| `public/models/u2netp.onnx`        | 主体抠图权重（4.4MB，U²-Net-p / Apache-2.0），随站点托管、本地推理                                                                                                             |
| `vite.config.ts`（copyOrtRuntime） | dev 启动 / build 开始时把 onnxruntime-web 的 WASM 运行时复制到 `src/ort/`（生成物，不入 git）                                                                                  |
| `editor/NewSceneDialog.tsx`        | 新建画布对话框：指定尺寸（1–200）空白生成 / 图片生成（自动色数 8–32，可选主体抠图）                                                                                            |
| `render/BeadsOverlay.tsx`          | 拼豆模式叠层：行列序号（≥16px/格时逐格，否则每 5 格）与 5/10 格红色标识线                                                                                                      |
| `engine/factories.ts`              | 图层/场景工厂、resize 重采样（保留重叠区）、深拷贝（历史快照）                                                                                                                 |
| `engine/render/SceneCanvas.tsx`    | 合成容器（edit/play 共用）：图层叠放、指针交互（绘制/拖拽矢量层）                                                                                                              |
| `engine/export/to-yaml.ts`         | 场景⇄YAML（像素 RLE），base64 变体供播放页 URL                                                                                                                                 |
| `engine/export/to-png.ts`          | 三层合成到离屏 canvas → Blob；矢量层逐层栅格化保 z-order；拼豆版扩边并附加序号/图例                                                                                            |
| `engine/export/beads-export.ts`    | 拼豆导出版面：图例统计、序号与图例排版、画布尺寸计算                                                                                                                           |
| `engine/export/vector-to-svg.ts`   | 矢量层→SVG 字符串（复用 digits/transform 几何，所见即所得）                                                                                                                    |
| `editor/*`                         | Toolbar（新建/保存/工具/尺寸/缩放/播放/侧栏）、NewSceneDialog（空白/从 YAML 载入/图片）、SaveDialog（YAML/PNG）、PropertyPanel（右上属性表单）、LayerPanel（右下「小组件」树） |
| `pages/EditorPage.tsx`             | 画布 + 右侧共享栏（属性 60% / 小组件 40%）、自适应缩放、键盘快捷键、导出/播放编排                                                                                              |
| `pages/PlayerPage.tsx`             | 全屏只读：URL base64-yml / 内置演示场景，F 全屏 E 返回（YAML 导入在「新建」）                                                                                                  |
| `widgets/claude-status/*`          | 小组件注册（index.ts）、渲染器（container-query 自适应）、状态 store、SSE hook（3s 超时降级 mock）、mock 数据                                                                  |
| `bridge/server.mjs`                | 本地 SSE sidecar：枚举判活会话、jsonl 尾部反向扫描、聚合推送；`/events`(SSE) `/status`(快照)                                                                                   |

## 模块关系

- `engine` 不依赖任何 UI 模块（React 组件在 `engine/render/` 但只依赖 types 与纯逻辑），编辑器/播放页/导出/测试都单向依赖 engine。
- 屏幕渲染与 PNG 导出是**两条平行管线**，共享 `digits.ts` 几何与 `transform.ts` 矩阵：React 组件走 DOM/SVG，导出走字符串序列化 + canvas 合成。改几何/变换时两条管线同时生效（这是「所见即所得」的结构保证）。
- 像素点阵、占位抠除、PNG 合成三者共用 `dots.ts` 与 `footprint.ts`：屏幕与导出不存在第二套几何。
- 小组件经 `registerWidget` 注册表解耦：`WidgetLayerView` 只知道 `WidgetKind → renderer` 映射，`main.tsx` 副作用导入完成注册。
- Claude 状态数据流：bridge（SSE）→ `use-claude-status`（连接生命周期）→ `status-store`（zustand 单例）→ `ClaudeStatusWidget`（订阅渲染）。场景里小组件图层的 `config.bridgeUrl` 经 `use-sync-bridge-url` 写回 store，连接自动跟随。

## 数据流

1. **编辑**：UI 事件 → store action（离散操作先 `pushHistory`）→ 不可变更新 → 订阅组件重渲染 →
   `usePersistScene` 防抖 400ms 将场景写入 localStorage（刷新后自动恢复）。
2. **导出 YAML**：scene → 像素层 RLE → js-yaml dump →（可选 base64）→ 下载/URL。
3. **导出 PNG**：背景 fillRect → 像素层 ImageData 放大 drawImage（smoothing off）→ 矢量层 SVG 字符串 → data-URL Image → drawImage，全程按 layers 原始顺序。
4. **播放**：URL/文件 YAML → `sceneFromYaml` → PlayerPage 局部 state → SceneCanvas(mode=play)。
5. **小组件实时数据**：bridge 轮询（1s）→ 变化时 SSE 推送 → store → widget 重渲染；bridge 不可达 → 3s 超时 → mock 心跳（3s 翻转 busy/idle 制造活动感）。

## 外部系统

- `~/.claude/sessions/<pid>.json` — 会话实时状态（status: busy/idle/waiting + waitingFor）。bridge 只读，用 `process.kill(pid,0)` 判活跳过残留。
- `~/.claude/projects/<escaped-cwd>/<sessionId>.jsonl` — 消息流。bridge 只读尾部 256KB 反向扫描（model/usage/last-prompt/tool_use），不全量解析。
- GitHub Pages — 项目站点静态部署在 `https://wpy030414.github.io/digiboard/`（无 CNAME），CI 用 `voidzero-dev/setup-vp` + `vp install/check/test/build`；构建时 `base` 自动取 `/<repo>/`，`BrowserRouter` 的 basename 跟随 `import.meta.env.BASE_URL`，产物另附 `404.html` 与 `.nojekyll` 承担 SPA 回退。

## 重要技术边界

- **量化 vs 矢量**：像素层永远整数格点（LED 颗粒感是特性不是缺陷）；矢量层永远浮点（突破网格是核心卖点），但以一个可量化矩形占据点阵空间——矩形必须无旋转（旋转会让「占位」失去唯一解）。两者只在导出 PNG 时于 canvas 上汇合。
- **无网格辅助线**：屏幕由点阵本身表达格子，编辑器不再叠加网格线层。
- **不可变约定**：历史栈与当前场景可能共享结构；任何像素写入前必须 clone（`withPixelLayer`），任何结构修改必须展开复制。违反此约定会破坏撤销/重做。
- **dev-only 测试钩子**：`window.__digiboard` 仅在 `import.meta.env.DEV` 挂载（E2E 确定性断言用），生产构建不暴露。
- **bridge 安全边界**：只监听 127.0.0.1；绝不读 `.key` 令牌文件；CORS 默认只放行 localhost/127.0.0.1，可用 `DIGIBOARD_ORIGIN` 收紧到确切源。
- **jsdom 能力边界**：canvas 2D / SVG 栅格化 / toBlob 在 jsdom 无实现——纯逻辑（几何/矩阵/RLE/序列化/组件结构）走 vitest，真实像素合成走 Playwright（chromium）。
