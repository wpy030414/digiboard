# Spec — 画布引擎（三层合成与导出）

对应模块：`src/engine/`（types / scene-store / digits / transform / pixels / factories / render / export）

## 要构建什么

- 目标：以点阵尺寸 W×H 定义场景坐标系，三类图层（pixel/digit/widget）按 z-order 合成渲染，屏幕显示与 PNG/YAML 导出保持所见即所得；数码管为矢量元素，不受像素网格量化，但以一块矩形占据点阵空间（该区域像素点整块抠除）；小组件同样占据矩形且强制吸附整数网格。

## 行为

- 预期行为：
  - 像素层：整数格点，`pixels` 值为调色板索引（0=灭，n=palette[n-1]），单层即可多色混搭；屏幕与 PNG 均渲染为圆角点阵（每格留缝，灭点暗色 + 亮点按调色板上色）；画笔/橡皮（Bresenham 连续线）、油漆桶（4-连通扫描线填充）；画笔颜色取自顶部工具栏。拼豆模式导出由 `export/beads-export.ts` 额外绘制行列序号与颜色图例（拼豆色号），并绘制每格半透灰线与 5/10 格红线；格子 ≥8px 时每个色块中央标注取反色拼豆色号。
  - 数码管层：文本 → a-g 位掩码 → 段位几何（sharp/rounded）；默认字符高度 4 场景单位；支持斜切/发光/亚像素定位/负坐标（超出画布仍完整渲染）；暗底衬可选；不支持旋转（矩形占位需要可量化形状）。内容（含发光扩散）由 SVG `clipPath` 裁切在占位矩形内；发光拆成「只输出辉光的滤镜层 + 未过滤的源图形层」两层绘制，避免 WebKit 在小字号下漏绘段位。`paddingX` / `paddingY` 分别为内容与占位矩形之间的左右/上下留白（场景单位，≥0），渲染、命中测试、PNG 导出与掩码共用同一组数值。
  - 数码管字符集：0-9、A-F 与常用字母、`- _ = 空格`、小数点 `.`、冒号 `:`（上下双点）。冒号与小数点共用窄标点格，不点亮段位。
  - 时钟模式：`clockMode = off | date | time | datetime`；`time/datetime` 可选 `clockShowSeconds`，时间可选 `clockHour12`（12 小时制补零、无 AM/PM 标记）。时钟文本在渲染、占位计算与导出时由 `engine/clock.ts` 按本机时间生成，格式定长，不写入场景状态；编辑器/播放页每秒刷新（日期模式每分），PNG 导出取导出瞬间快照。
  - 小组件层：x/y/width/height 强制吸附整数网格（宽高 ≥1），内容 `overflow: hidden`，不越出占位矩形。
  - 占位抠除：取所有可见 digit/widget 层内容（含发光）的外接矩形，向外取整到格；与之相交的格子像素层整个不绘制（亮点与灭点都不画）。抠除区恒为矩形，外部圆角点阵不可能与内容区相交。
  - resize：像素层重采样保留左上重叠区，矢量层不受影响。
  - 撤销/重做：离散操作（fill/clear/add/remove/resize）自动入栈；连续操作（画笔拖拽）由调用方在笔画起点 `commitHistory()` 一次；栈上限 100。
  - 导出 PNG：固定黑色底 → 像素层（同一套圆角点阵几何）→ 矢量层（SVG→Image 逐层栅格化），严格按 layers 数组顺序合成。
  - 导出 YAML：像素 RLE 编码，round-trip 无损；base64 变体进播放页 URL。
  - 新建画布：对话框可选空白或图片生成；图片经 `image-to-pixels.ts` 做 cover 裁切 + 结构保持型像素化（Kuwahara 预滤波、逐格主导色、Oklab k-means 自适应色数、空间清理），最终吸附 MARD 221 色色卡（0=灭，1–221 上色）。
  - 主体抠图（可选）：`matting-model.ts` 在 Web Worker 里用 onnxruntime-web 跑 U²-Net-p（4.4MB，本地权重），得到 320×320 蒙版；`cropRectForSubject` 按主体包围盒 + padding + 目标宽高比重选裁切区域，`destination-in` 合成后覆盖率不足 25% 的格子写 0。模型失败时静默回退普通模式。

## 输入 / 输出

- 输入：`Scene { version, size, layers[] }`（唯一权威定义 `engine/types.ts`，底色固定黑色；像素层含 `palette: string[]`）；指针事件（编辑态，含当前画笔颜色）；导出参数（pixelSize 默认 8）。
- 输出：屏幕 DOM（canvas+svg+div 叠放）；PNG Blob；YAML 字符串 / base64。

## 约束

- 像素写入前必须 clone（`withPixelLayer`），历史栈正确性依赖不可变约定。
- 点阵尺寸 1–200（`MAX_SCENE_SIZE`）；超限的 YAML 拒绝加载，编辑/新建入口统一由 `clampSceneSize` 夹紧。数码管几何在 thicknessRatio=0 时夹紧为最小值，不产生 NaN。
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

- [x] vitest：digits 段位编码与几何（digits.test.ts）、transform 矩阵往返/包围盒（transform.test.ts）、pixels 填充/直线/RLE（pixels.test.ts）、store 撤销重做/不可变性（scene-store.test.ts）、YAML round-trip 无损（to-yaml.test.ts）、SVG 序列化含转义（vector-to-svg.test.ts）、组件渲染结构（render.test.tsx）——224 例通过
- [x] Playwright：真实指针拖拽绘制、填充、清空、撤销重做、数码管文本/变换/负坐标、PNG 下载（魔数+尺寸）、renderSceneToCanvas 三层合成非透明像素、YAML 下载与浏览器内往返（e2e/*.spec.ts）
- [x] 视觉验证：圆角点阵板（留缝、灭点/亮点）+ 数码管/小组件矩形内整块无点，数码管斜切+发光明显不贴合网格（截图人工核对）

## 完成定义

- 如何判定已完成：`pnpm check`、`pnpm test`、`pnpm test:e2e` 三绿；编辑器手动画像素 + 加数码管调变换 + 导出 PNG/YAML + 播放页还原全链路可用。
