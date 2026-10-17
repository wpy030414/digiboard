/**
 * 矢量层「占位空间」计算 —— 数码管/小组件在点阵板上占据的矩形。
 *
 * 屏幕是网格玩具板：数码管与小组件不是浮在上面的图层，而是一整块矩形
 * 占住点阵空间（该区域内的像素点整块抠除）。本模块是这层语义的唯一真相：
 *  - `layerFootprint`   矢量层的局部矩形 + 变换参数（旋转已取消，仅保留斜切）
 *  - `layerMatrix`      局部 → 场景的矩阵
 *  - `pointInLayer`     命中测试（精确到斜切后的矩形）
 *  - `computeReservedMask`  被所有可见矢量层占据的格子掩码（1 = 抠除）
 *
 * 屏幕渲染（SceneCanvas）、命中测试、PNG 导出（to-png）全部复用此模块。
 */

import type { DigitLayer, Layer, WidgetLayer } from './types'
import { layoutText } from './digits'
import {
  apply,
  invert,
  layerBounds,
  layerToScene,
  type Matrix,
  type Vec2,
  type VectorLayerTransform,
} from './transform'

/** 可占据点阵空间的矢量层（像素层不在其列）。 */
export type VectorLayer = DigitLayer | WidgetLayer

/**
 * 矢量层在场景坐标下的矩形与变换。
 *
 * 数码管的矩形 = 文本排布宽度 × 字符高度（与 DigitLayerView 的包围盒一致）；
 * 小组件直接取 width × height。旋转已从模型中移除，变换矩阵不再含 rotation。
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
    layer.text,
    layer.digitHeight,
    layer.aspect,
    layer.thicknessRatio,
    layer.gapRatio,
  )
  // 空文本时仍保留一个字符宽度的命中矩形，避免图层「消失」无法选中
  const width = Math.max(totalWidth, layer.digitHeight * layer.aspect)
  return {
    x: layer.x,
    y: layer.y,
    width,
    height: layer.digitHeight,
    skewX: layer.skewX,
    skewY: layer.skewY,
  }
}

/** 图层局部坐标 → 场景坐标的矩阵。 */
export function layerMatrix(layer: VectorLayer): Matrix {
  return layerToScene(layerFootprint(layer))
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
 * 计算被所有**可见**矢量层占据的格子掩码。
 *
 * 判定方式：逐格取格心，反变换回图层局部坐标，落在矩形内即视为被占据。
 * 无旋转时轴对齐矩形得到整齐的整数格矩形；斜切时边缘随格心判定呈阶梯状，
 * 与实体玩具板「抠掉一颗颗棋子」的观感一致。
 *
 * @returns Uint8Array，长度 w*h，1 = 该格被占据（不绘制像素点）
 */
export function computeReservedMask(layers: Layer[], w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h)
  for (const layer of layers) {
    if (!layer.visible) continue
    if (layer.type !== 'digit' && layer.type !== 'widget') continue

    const t = layerFootprint(layer)
    const inv = invert(layerToScene(t))
    if (!inv) continue

    const b = layerBounds(t)
    const x0 = Math.max(0, Math.floor(b.x))
    const y0 = Math.max(0, Math.floor(b.y))
    const x1 = Math.min(w - 1, Math.ceil(b.x + b.width))
    const y1 = Math.min(h - 1, Math.ceil(b.y + b.height))

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const q = apply(inv, { x: x + 0.5, y: y + 0.5 })
        if (q.x >= 0 && q.x <= t.width && q.y >= 0 && q.y <= t.height) {
          mask[y * w + x] = 1
        }
      }
    }
  }
  return mask
}
