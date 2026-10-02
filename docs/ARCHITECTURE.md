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

| 图层     | 坐标             | 屏幕渲染                                                  | PNG 导出                                | 网格量化         |
| -------- | ---------------- | --------------------------------------------------------- | --------------------------------------- | ---------------- |
| `pixel`  | 整数格点         | `<canvas>` W×H backing + `image-rendering: pixelated`     | 逐层 ImageData → drawImage 放大         | **是**           |
| `digit`  | 浮点，可超出画布 | `<svg>` overflow visible + matrix transform + glow filter | 序列化为 SVG 文档 → `Image` → drawImage | **否（真突破）** |
| `widget` | 浮点             | `<div>` container-query 单位，DOM 渲染                    | `widgetLayerToSvg` 快照化为 SVG 文本卡  | 否               |

## 核心模块

| 模块                             | 职责                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `engine/types.ts`                | 场景/图层数据模型唯一权威定义（Scene、PixelLayer、DigitLayer、WidgetLayer、Tool）                             |
| `engine/scene-store.ts`          | zustand 单例：场景 CRUD、选中态、撤销/重做栈（上限 100）、像素写入的 clone-then-mutate                        |
| `engine/digits.ts`               | 七段数码管：a-g 位掩码字符表、段位几何（sharp/rounded）、文本排布（含小数点）                                 |
| `engine/transform.ts`            | 3×3 仿射矩阵：translate/rotate/skew/scale、layerToScene 及其逆、AABB 包围盒与命中测试                         |
| `engine/pixels.ts`               | 像素原语：扫描线油漆桶、Bresenham 直线、RLE 编解码                                                            |
| `engine/factories.ts`            | 图层/场景工厂、resize 重采样（保留重叠区）、深拷贝（历史快照）                                                |
| `engine/render/SceneCanvas.tsx`  | 合成容器（edit/play 共用）：图层叠放、指针交互（绘制/拖拽矢量层）                                             |
| `engine/export/to-yaml.ts`       | 场景⇄YAML（像素 RLE），base64 变体供播放页 URL                                                                |
| `engine/export/to-png.ts`        | 三层合成到离屏 canvas → Blob；矢量层逐层栅格化保 z-order                                                      |
| `engine/export/vector-to-svg.ts` | 矢量层→SVG 字符串（复用 digits/transform 几何，所见即所得）                                                   |
| `editor/*`                       | Toolbar（工具/尺寸/缩放/导出）、LayerPanel（图层树）、PropertyPanel（分类型属性表单）                         |
| `pages/EditorPage.tsx`           | 四区布局、自适应缩放、键盘快捷键、导出/播放编排                                                               |
| `pages/PlayerPage.tsx`           | 全屏只读：URL base64-yml / 拖入文件 / 内置演示场景，F 全屏 E 返回                                             |
| `widgets/claude-status/*`        | 小组件注册（index.ts）、渲染器（container-query 自适应）、状态 store、SSE hook（3s 超时降级 mock）、mock 数据 |
| `bridge/server.mjs`              | 本地 SSE sidecar：枚举判活会话、jsonl 尾部反向扫描、聚合推送；`/events`(SSE) `/status`(快照)                  |

## 模块关系

- `engine` 不依赖任何 UI 模块（React 组件在 `engine/render/` 但只依赖 types 与纯逻辑），编辑器/播放页/导出/测试都单向依赖 engine。
- 屏幕渲染与 PNG 导出是**两条平行管线**，共享 `digits.ts` 几何与 `transform.ts` 矩阵：React 组件走 DOM/SVG，导出走字符串序列化 + canvas 合成。改几何/变换时两条管线同时生效（这是「所见即所得」的结构保证）。
- 小组件经 `registerWidget` 注册表解耦：`WidgetLayerView` 只知道 `WidgetKind → renderer` 映射，`main.tsx` 副作用导入完成注册。
- Claude 状态数据流：bridge（SSE）→ `use-claude-status`（连接生命周期）→ `status-store`（zustand 单例）→ `ClaudeStatusWidget`（订阅渲染）。场景里小组件图层的 `config.bridgeUrl` 经 `use-sync-bridge-url` 写回 store，连接自动跟随。

## 数据流

1. **编辑**：UI 事件 → store action（离散操作先 `pushHistory`）→ 不可变更新 → 订阅组件重渲染。
2. **导出 YAML**：scene → 像素层 RLE → js-yaml dump →（可选 base64）→ 下载/URL。
3. **导出 PNG**：背景 fillRect → 像素层 ImageData 放大 drawImage（smoothing off）→ 矢量层 SVG 字符串 → data-URL Image → drawImage，全程按 layers 原始顺序。
4. **播放**：URL/文件 YAML → `sceneFromYaml` → PlayerPage 局部 state → SceneCanvas(mode=play)。
5. **小组件实时数据**：bridge 轮询（1s）→ 变化时 SSE 推送 → store → widget 重渲染；bridge 不可达 → 3s 超时 → mock 心跳（3s 翻转 busy/idle 制造活动感）。

## 外部系统

- `~/.claude/sessions/<pid>.json` — 会话实时状态（status: busy/idle/waiting + waitingFor）。bridge 只读，用 `process.kill(pid,0)` 判活跳过残留。
- `~/.claude/projects/<escaped-cwd>/<sessionId>.jsonl` — 消息流。bridge 只读尾部 256KB 反向扫描（model/usage/last-prompt/tool_use），不全量解析。
- GitHub Pages — 静态部署（CNAME `simu-digits.xrl.im`），CI 用 `voidzero-dev/setup-vp` + `vp install/check/test/build`。

## 重要技术边界

- **量化 vs 矢量**：像素层永远整数格点（LED 颗粒感是特性不是缺陷）；矢量层永远浮点（突破网格是核心卖点）。两者只在导出 PNG 时于 canvas 上汇合。
- **不可变约定**：历史栈与当前场景可能共享结构；任何像素写入前必须 clone（`withPixelLayer`），任何结构修改必须展开复制。违反此约定会破坏撤销/重做。
- **dev-only 测试钩子**：`window.__digiboard` 仅在 `import.meta.env.DEV` 挂载（E2E 确定性断言用），生产构建不暴露。
- **bridge 安全边界**：只监听 127.0.0.1；绝不读 `.key` 令牌文件；CORS 默认只放行 localhost/127.0.0.1，可用 `DIGIBOARD_ORIGIN` 收紧到确切源。
- **jsdom 能力边界**：canvas 2D / SVG 栅格化 / toBlob 在 jsdom 无实现——纯逻辑（几何/矩阵/RLE/序列化/组件结构）走 vitest，真实像素合成走 Playwright（chromium）。
