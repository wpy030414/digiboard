/**
 * 场景数据模型 —— 电子副屏的核心类型定义。
 *
 * 坐标系：以点阵尺寸 `size.w × size.h` 定义逻辑画布，单位为「点阵像素」。
 * 三类图层按 `layers` 数组顺序叠放（数组越靠后 z 越高）：
 *  - PixelLayer  像素画，锁定在整数网格上（受点阵量化）
 *  - DigitLayer  LED 数码管，浮点矢量层，可任意旋转/斜切/发光/超出画布（真突破像素限制）
 *  - WidgetLayer 信息流小组件，浮点定位，实时数据驱动
 */

export type LayerType = 'pixel' | 'digit' | 'widget'

/** 当前可用的信息流小组件类型。默认提供 Claude Code 会话状态。 */
export type WidgetKind = 'claude-status'

export interface LayerBase {
  id: string
  name: string
  type: LayerType
  /** 是否可见。隐藏图层不参与渲染与 png 合成，但仍写入 yml。 */
  visible: boolean
  /** 锁定后编辑器不可选中/修改，但仍渲染。 */
  locked: boolean
  /** 不透明度 0..1。 */
  opacity: number
}

/**
 * 像素画层。每个像素仅 on/off（单色），颜色由图层 `color` 决定。
 * 需要多色时叠加多个 PixelLayer 即可。
 *
 * `pixels` 为长度 `w*h` 的 Uint8Array，索引 `y*w+x`，值 0=灭 1=亮。
 * store 保证不可变更新：任何写入前都会 clone，历史栈因此可安全共享引用。
 */
export interface PixelLayer extends LayerBase {
  type: 'pixel'
  color: string
  /** 像素网格宽度（= 创建时的 scene.size.w，resize 时同步）。 */
  w: number
  h: number
  pixels: Uint8Array
}

/** 数码管段位端点样式。sharp=尖角六边形，rounded=圆角（同色描边近似）。 */
export type SegmentStyle = 'sharp' | 'rounded'

/**
 * LED 数码管层（矢量浮层）。
 *
 * 定位与变换全部为浮点场景单位，`x/y` 可取负值或超过画布尺寸，
 * 配合 rotation/skew 实现「突破像素限制」——数码管不被点阵网格量化。
 */
export interface DigitLayer extends LayerBase {
  type: 'digit'
  /** 显示文本，支持 0-9、A-F、部分字母、`- _ . : 空格`。 */
  text: string
  /** 字符块左上角锚点（场景单位，浮点）。 */
  x: number
  y: number
  /** 单个字符高度（场景单位）。可远大于 1 个网格像素，即「突破」。 */
  digitHeight: number
  /** 字符宽高比 width/height，默认 0.6。 */
  aspect: number
  /** 段厚 = digitHeight * thicknessRatio。 */
  thicknessRatio: number
  /** 字符间距（相对 digitHeight 的比例）。 */
  gapRatio: number
  color: string
  /** 发光强度 0..1，0 为无发光。 */
  glow: number
  /** 发光颜色，默认取 color。 */
  glowColor: string
  /** 旋转角度（度），绕字符块中心。 */
  rotation: number
  /** X 方向斜切（度）。 */
  skewX: number
  /** Y 方向斜切（度）。 */
  skewY: number
  segmentStyle: SegmentStyle
  /** 是否渲染未点亮的段（暗色底衬，模拟真实数码管）。 */
  showOffSegments: boolean
  /** 未点亮段的颜色。 */
  offColor: string
}

/**
 * 信息流小组件层。由外部实时数据（如 SSE 桥接）驱动渲染。
 * `config` 承载各小组件专属配置，结构由 widgetKind 决定。
 */
export interface WidgetLayer extends LayerBase {
  type: 'widget'
  widgetKind: WidgetKind
  /** 左上角锚点（场景单位）。 */
  x: number
  y: number
  width: number
  height: number
  rotation: number
  /** 小组件前景/强调色。 */
  color: string
  config: Record<string, unknown>
}

export type Layer = PixelLayer | DigitLayer | WidgetLayer

export interface SceneSize {
  w: number
  h: number
}

/** 一个完整的电子副屏场景。 */
export interface Scene {
  /** 数据格式版本，用于 yml import 的向后兼容。 */
  version: number
  size: SceneSize
  /** 画布底色，null 表示透明（png 导出保留透明通道）。 */
  background: string | null
  layers: Layer[]
}

export const SCENE_VERSION = 1

/** 编辑器当前的绘制/交互工具。 */
export type Tool =
  | 'select' // 选择/移动矢量层
  | 'pen' // 像素画笔（点亮）
  | 'eraser' // 像素橡皮（熄灭）
  | 'fill' // 油漆桶（连通填充）
  | 'picker' // 取色（暂用于从像素层取前景色）
