# Spec — 画布引擎（三层合成与导出）

对应模块：`src/engine/`（types / scene-store / digits / transform / pixels / factories / render / export）

## 要构建什么

- 目标：以点阵尺寸 W×H 定义场景坐标系，三类图层（pixel/digit/widget）按 z-order 合成渲染，屏幕显示与 PNG/YAML 导出保持所见即所得；数码管为矢量浮层，不受像素网格量化。

## 行为

- 预期行为：
  - 像素层：整数格点单色 on/off；画笔/橡皮（Bresenham 连续线）、油漆桶（4-连通扫描线填充）；多像素层叠加实现多色。
  - 数码管层：文本 → a-g 位掩码 → 段位几何（sharp/rounded）；支持旋转/斜切/发光/亚像素定位/负坐标（超出画布仍完整渲染）；暗底衬可选。
  - resize：像素层重采样保留左上重叠区，矢量层不受影响。
  - 撤销/重做：离散操作（fill/clear/add/remove/resize）自动入栈；连续操作（画笔拖拽）由调用方在笔画起点 `commitHistory()` 一次；栈上限 100。
  - 导出 PNG：背景 → 像素层（smoothing off 放大）→ 矢量层（SVG→Image 逐层栅格化），严格按 layers 数组顺序合成。
  - 导出 YAML：像素 RLE 编码，round-trip 无损；base64 变体进播放页 URL。

## 输入 / 输出

- 输入：`Scene { version, size, background, layers[] }`（唯一权威定义 `engine/types.ts`）；指针事件（编辑态）；导出参数（pixelSize 默认 8）。
- 输出：屏幕 DOM（canvas+svg+div 叠放）；PNG Blob；YAML 字符串 / base64。

## 约束

- 像素写入前必须 clone（`withPixelLayer`），历史栈正确性依赖不可变约定。
- 点阵尺寸 1–512；数码管几何在 thicknessRatio=0 时夹紧为最小值，不产生 NaN。
- PNG 导出为异步（SVG→Image 解码）；jsdom 无 canvas 实现，栅格化路径只能在真实浏览器验证。
- YAML 中像素编码格式 `{ encoding: 'rle', w, h, data: number[] }`，改 `types.ts` 字段必须同步 `to-yaml.ts` 与 round-trip 测试。

## 边界条件

- 空文本数码管：totalWidth=0，不渲染 path。
- 不支持字符（如 `?`）：段位为空，仅暗底衬。
- 油漆桶起点值=目标值：no-op。
- 画笔越界：安全忽略；大点阵（500×500）填充不爆栈（扫描线迭代）。
- resize 缩小：裁剪；放大：补 0。
- 全零像素 RLE：`[N, 0]` 两个数；解码尺寸不匹配时补齐/截断。

## 验收标准

- [x] vitest：digits 段位编码与几何（digits.test.ts）、transform 矩阵往返/包围盒（transform.test.ts）、pixels 填充/直线/RLE（pixels.test.ts）、store 撤销重做/不可变性（scene-store.test.ts）、YAML round-trip 无损（to-yaml.test.ts）、SVG 序列化含转义（vector-to-svg.test.ts）、组件渲染结构（render.test.tsx）——197 例通过
- [x] Playwright：真实指针拖拽绘制、填充、清空、撤销重做、数码管文本/变换/负坐标、PNG 下载（魔数+尺寸）、renderSceneToCanvas 三层合成非透明像素、YAML 下载与浏览器内往返（e2e/*.spec.ts）
- [x] 视觉验证：矢量数码管旋转+斜切+发光叠加在像素网格上，明显不贴合网格（截图人工核对）

## 完成定义

- 如何判定已完成：`pnpm check`、`pnpm test`、`pnpm test:e2e` 三绿；编辑器手动画像素 + 加数码管调变换 + 导出 PNG/YAML + 播放页还原全链路可用。
