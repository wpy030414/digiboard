/**
 * 矢量层「占位空间」计算 —— 数码管/小组件在点阵板上占据的矩形。
 *
 * 屏幕是网格玩具板：数码管与小组件不是浮在上面的图层，而是一整块矩形
 * 占住点阵空间（该区域内的像素点整块抠除）。本模块是这层语义的唯一真相：
 *  - `layerFootprint`   矢量层的局部矩形 + 变换参数（旋转已取消，仅保留斜切）
 *  - `layerMatrix`      局部 → 场景的矩阵
 *  - `pointInLayer`     命中测试（精确到斜切后的矩形）
 *  - `layerContentBounds` 组件内容（含发光扩散）在场景中的外接矩形
 *  - `computeReservedMask`  被所有可见矢量层占据的格子掩码（1 = 抠除）
 *
 * 抠除规则（用户要求：矩形必须完整包裹组件，外部像素点不得与内容区相交）：
 *  1. 取内容矩形的外接矩形（AABB；斜切时也是矩形，保证「占据一个矩形」）；
 *  2. 向外取整到格边界，凡是与 AABB 有交集（含边界）的格子一律抠除；
 *  3. 圆角点阵在格内留有 DOT_GAP_RATIO 的空隙，因此抠除区外的点不可能
 *     与内容矩形相交。
 *
 * 屏幕渲染（SceneCanvas）、命中测试、PNG 导出（to-png）全部复用此模块。
 */

import type { DigitLayer, Layer, WidgetLayer } from './types'
import { layoutText } from './digits'
import { digitDisplayText } from './clock'
import {
  apply,
  invert,
  layerToScene,
  type Matrix,
  type Vec2,
  type VectorLayerTransform,
} from './transform'

/** 可占据点阵空间的矢量层（像素层不在其列）。 */
export type VectorLayer = DigitLayer | WidgetLayer

/** 场景中的轴对齐矩形。 */
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 数码管发光在矩形外的可见扩散半径。
 *
 * SVG filter 的 stdDeviation = glow * digitHeight * 0.18；高斯模糊在 3.5σ 处
 * 亮度已降到峰值的 0.1% 以下，再往外目视不可见。掩码与 SVG clipPath 共用
 * 同一个 padding，保证「矩形完整包裹组件」在任何摆放/斜切下都成立。
 */
export const GLOW_SPREAD_SIGMAS = 3.5

/** 数码管发光需要额外占据的局部半径（场景单位，四边相同）。 */
export function digitGlowPadding(layer: DigitLayer): number {
  if (!(layer.glow > 0)) return 0
  const std = Math.max(0.0001, layer.glow * layer.digitHeight * 0.18)
  return std * GLOW_SPREAD_SIGMAS
}

/**
 * 矢量层在场景坐标下的矩形与变换。
 *
 * 数码管的矩形 = 文本排布宽度 × 字符高度（与 DigitLayerView 的局部包围盒一致）；
 * 小组件直接取 width × height（已由 `snapWidgetLayer` 吸附到整数网格）。
 * 旋转已从模型中移除，变换矩阵不再含 rotation。
 */
export function layerFootprint(layer: VectorLayer): VectorLayerTransform {
  if (layer.type === 'widget') {
    return {
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      skewX: 0,
      skewY: 0,
    }
  }
  const { totalWidth } = layoutText(
    digitDisplayText(layer),
    layer.digitHeight,
    layer.aspect,
    layer.thicknessRatio,
    layer.gapRatio,
  )
  // 空文本时仍保留一个字符宽度的命中矩形，避免图层「消失」无法选中
  const contentW = Math.max(totalWidth, layer.digitHeight * layer.aspect)
  const padX = Math.max(0, layer.paddingX ?? 0)
  const padY = Math.max(0, layer.paddingY ?? 0)
  return {
    x: layer.x,
    y: layer.y,
    width: contentW + padX * 2,
    height: layer.digitHeight + padY * 2,
    skewX: layer.skewX,
    skewY: layer.skewY,
  }
}

/** 图层局部坐标 → 场景坐标的矩阵。 */
export function layerMatrix(layer: VectorLayer): Matrix {
  return layerToScene(layerFootprint(layer))
}

/**
 * 组件内容（含数码管发光扩散）在场景坐标中的轴对齐包围盒。
 *
 * 这是「占据的矩形」：斜切后的平行四边形不再逐格描边，而是取完整包住它的
 * 轴对齐矩形，因此无论怎么摆放，外部像素点都不会与内容区相交。
 */
export function layerContentBounds(layer: VectorLayer): Bounds {
  const t = layerFootprint(layer)
  const m = layerToScene(t)
  const pad = layer.type === 'digit' ? digitGlowPadding(layer) : 0
  const corners = [
    apply(m, { x: -pad, y: -pad }),
    apply(m, { x: t.width + pad, y: -pad }),
    apply(m, { x: t.width + pad, y: t.height + pad }),
    apply(m, { x: -pad, y: t.height + pad }),
  ]
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** 场景坐标点是否落在图层矩形内（`tol` 为场景单位的容差）。 */
export function pointInLayer(p: Vec2, layer: VectorLayer, tol = 0): boolean {
  const t = layerFootprint(layer)
  const inv = invert(layerToScene(t))
  if (!inv) return false
  const q = apply(inv, p)
  return q.x >= -tol && q.x <= t.width + tol && q.y >= -tol && q.y <= t.height + tol
}

/**
 * 小组件强制吸附到点阵网格：左上角取整、宽高取正整数格。
 *
 * 小组件是信息卡片而不是矢量图形，必须与点阵对齐——
 * 这样它占据的格子恰好是 `width × height` 个整格，不会出现半格悬空。
 * 数码管不走这条路径：它保留浮点定位与斜切，以「突破像素限制」。
 */
export function snapWidgetLayer<T extends WidgetLayer>(layer: T): T {
  return {
    ...layer,
    x: Math.round(layer.x),
    y: Math.round(layer.y),
    width: Math.max(1, Math.round(layer.width)),
    height: Math.max(1, Math.round(layer.height)),
  }
}

/**
 * 计算被所有**可见**矢量层占据的格子掩码。
 *
 * 判定方式：取 `layerContentBounds` 的外接矩形，向外取整到格边界，
 * 与之相交的格子全部抠除。结果永远是一个矩形区域——
 * 即使数码管斜切，占据的也是完整包住它的矩形，而不是阶梯状边缘。
 *
 * @returns Uint8Array，长度 w*h，1 = 该格被占据（不绘制像素点）
 */
export function computeReservedMask(layers: Layer[], w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h)
  for (const layer of layers) {
    if (!layer.visible) continue
    if (layer.type !== 'digit' && layer.type !== 'widget') continue

    const b = layerContentBounds(layer)
    // 格子 [x, x+1) 与 [b.x, b.x+b.width] 相交即抠除
    const x0 = Math.max(0, Math.floor(b.x))
    const y0 = Math.max(0, Math.floor(b.y))
    const x1 = Math.min(w - 1, Math.ceil(b.x + b.width) - 1)
    const y1 = Math.min(h - 1, Math.ceil(b.y + b.height) - 1)

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        mask[y * w + x] = 1
      }
    }
  }
  return mask
}
