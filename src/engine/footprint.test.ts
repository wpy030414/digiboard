import { describe, it, expect } from 'vitest'
import {
  computeReservedMask,
  digitGlowPadding,
  layerContentBounds,
  layerFootprint,
  layerMatrix,
  pointInLayer,
  snapWidgetLayer,
} from './footprint'
import { createDigitLayer, createPixelLayer, createWidgetLayer } from './factories'
import { apply } from './transform'
import { DOT_GAP_RATIO } from './dots'
import type { Layer, WidgetLayer } from './types'

function countMask(mask: Uint8Array): number {
  let n = 0
  for (const v of mask) if (v) n++
  return n
}

/** 轴对齐矩形是否相交（含边界接触不算相交，留缝本来就存在）。 */
function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** 某格内圆角点阵的实际绘制范围（场景单位）。 */
function dotBounds(x: number, y: number) {
  return {
    x: x + DOT_GAP_RATIO,
    y: y + DOT_GAP_RATIO,
    width: 1 - DOT_GAP_RATIO * 2,
    height: 1 - DOT_GAP_RATIO * 2,
  }
}

describe('layerFootprint — 矢量层矩形', () => {
  it('小组件矩形 = x/y/width/height', () => {
    const w = createWidgetLayer({ w: 80, h: 60 }, 'claude-status', {
      x: 10,
      y: 5,
      width: 20,
      height: 10,
    })
    expect(layerFootprint(w)).toMatchObject({ x: 10, y: 5, width: 20, height: 10 })
  })

  it('数码管矩形高度 = digitHeight，宽度来自文本排布', () => {
    const d = createDigitLayer({ w: 80, h: 60 }, { text: '88', digitHeight: 20, x: 4, y: 6 })
    const t = layerFootprint(d)
    expect(t.height).toBe(20)
    expect(t.width).toBeGreaterThan(20 * d.aspect)
    expect(t.x).toBe(4)
    expect(t.y).toBe(6)
  })

  it('空文本仍保留一个字符宽的矩形', () => {
    const d = createDigitLayer({ w: 80, h: 60 }, { text: '', digitHeight: 20 })
    expect(layerFootprint(d).width).toBeCloseTo(20 * d.aspect)
  })

  it('矩阵应用在矩形四角上得到对应场景坐标', () => {
    const w = createWidgetLayer({ w: 80, h: 60 }, 'claude-status', {
      x: 10,
      y: 5,
      width: 20,
      height: 10,
    })
    const m = layerMatrix(w)
    expect(apply(m, { x: 0, y: 0 })).toEqual({ x: 10, y: 5 })
    expect(apply(m, { x: 20, y: 10 })).toEqual({ x: 30, y: 15 })
  })
})

describe('layerContentBounds — 内容外接矩形（含发光）', () => {
  it('小组件内容矩形 = 吸附后的整格矩形', () => {
    const w = createWidgetLayer({ w: 80, h: 60 }, 'claude-status', {
      x: 10,
      y: 5,
      width: 20,
      height: 10,
    })
    expect(layerContentBounds(w)).toEqual({ x: 10, y: 5, width: 20, height: 10 })
  })

  it('数码管无发光时内容矩形 = 文本矩形', () => {
    const d = createDigitLayer(
      { w: 80, h: 60 },
      {
        text: '8',
        digitHeight: 10,
        glow: 0,
        skewX: 0,
      },
    )
    expect(digitGlowPadding(d)).toBe(0)
    const t = layerFootprint(d)
    expect(layerContentBounds(d)).toEqual({ x: t.x, y: t.y, width: t.width, height: t.height })
  })

  it('数码管发光按 σ 扩散计入内容矩形（四边等量外扩）', () => {
    const d = createDigitLayer(
      { w: 80, h: 60 },
      {
        text: '8',
        digitHeight: 10,
        glow: 0.5,
        skewX: 0,
      },
    )
    const t = layerFootprint(d)
    const b = layerContentBounds(d)
    const pad = digitGlowPadding(d)
    expect(pad).toBeGreaterThan(0)
    expect(b.x).toBeCloseTo(t.x - pad)
    expect(b.y).toBeCloseTo(t.y - pad)
    expect(b.width).toBeCloseTo(t.width + pad * 2)
    expect(b.height).toBeCloseTo(t.height + pad * 2)
  })

  it('横纵边距分别扩大占位矩形', () => {
    const d = createDigitLayer(
      { w: 40, h: 30 },
      {
        text: '1',
        digitHeight: 10,
        x: 2,
        y: 3,
        skewX: 0,
        gapRatio: 0.1,
        glow: 0,
        paddingX: 2,
        paddingY: 3,
      },
    )
    const t = layerFootprint(d)
    expect(t.width).toBeCloseTo(10) // 内容 6 + 左右边距 2×2
    expect(t.height).toBeCloseTo(16) // 字符高 10 + 上下边距 3×2
    expect(layerContentBounds(d)).toEqual({ x: 2, y: 3, width: t.width, height: t.height })
    expect(countMask(computeReservedMask([d], 40, 30))).toBe(10 * 16)
  })

  it('斜切后取完整包裹的轴对齐矩形', () => {
    const d = createDigitLayer(
      { w: 80, h: 60 },
      { text: '8', digitHeight: 10, glow: 0, skewX: 30, x: 10, y: 10 },
    )
    const t = layerFootprint(d)
    const b = layerContentBounds(d)
    expect(b.width).toBeGreaterThan(t.width)
    expect(b.height).toBeCloseTo(t.height)
  })
})

describe('snapWidgetLayer — 强制吸附整数网格', () => {
  it('左上角取整、宽高取正整数格', () => {
    const w = createWidgetLayer({ w: 80, h: 60 }, 'claude-status', {
      x: 10.4,
      y: 5.6,
      width: 20.5,
      height: 0.2,
    })
    expect(w.x).toBe(10)
    expect(w.y).toBe(6)
    expect(w.width).toBe(21)
    expect(w.height).toBe(1)
  })

  it('已是整数的矩形保持不变', () => {
    const w = createWidgetLayer({ w: 80, h: 60 }, 'claude-status', {
      x: 10,
      y: 5,
      width: 20,
      height: 10,
    })
    expect(snapWidgetLayer(w)).toEqual(w)
  })

  it('工厂默认值也落在整格上', () => {
    const w = createWidgetLayer({ w: 41, h: 31 }, 'claude-status')
    for (const v of [w.x, w.y, w.width, w.height]) expect(Number.isInteger(v)).toBe(true)
    expect(w.width).toBeGreaterThanOrEqual(1)
    expect(w.height).toBeGreaterThanOrEqual(1)
  })
})

describe('pointInLayer — 命中测试', () => {
  const widget = createWidgetLayer({ w: 80, h: 60 }, 'claude-status', {
    x: 10,
    y: 5,
    width: 20,
    height: 10,
  })

  it('矩形内命中、矩形外不命中', () => {
    expect(pointInLayer({ x: 15, y: 10 }, widget)).toBe(true)
    expect(pointInLayer({ x: 9, y: 10 }, widget)).toBe(false)
    expect(pointInLayer({ x: 31, y: 10 }, widget)).toBe(false)
  })

  it('容差生效', () => {
    expect(pointInLayer({ x: 9, y: 10 }, widget, 1.5)).toBe(true)
  })
})

describe('computeReservedMask — 占据的格子', () => {
  it('轴对齐小组件抠出整数格矩形', () => {
    const widget = createWidgetLayer({ w: 40, h: 30 }, 'claude-status', {
      x: 10,
      y: 5,
      width: 20,
      height: 10,
    })
    const mask = computeReservedMask([widget], 40, 30)
    expect(countMask(mask)).toBe(200)
    expect(mask[5 * 40 + 10]).toBe(1)
    expect(mask[4 * 40 + 10]).toBe(0) // 上方一行未被占据
    expect(mask[5 * 40 + 30]).toBe(0) // 右侧下一列未被占据
  })

  it('矩形不落在整数格上时向外取整，避免外部像素点贴边', () => {
    const base = createWidgetLayer({ w: 40, h: 30 }, 'claude-status', {
      x: 10,
      y: 5,
      width: 20,
      height: 10,
    })
    // 绕过吸附，直接构造带小数的矩形，验证掩码向外取整
    const widget: WidgetLayer = { ...base, x: 10.4, y: 5.2 }
    const mask = computeReservedMask([widget], 40, 30)
    // x: 10.4..30.4 => 10..30（21 列）；y: 5.2..15.2 => 5..15（11 行）
    expect(countMask(mask)).toBe(21 * 11)
    expect(mask[5 * 40 + 10]).toBe(1)
    expect(mask[5 * 40 + 31]).toBe(0)
    expect(mask[16 * 40 + 10]).toBe(0)
  })

  it('斜切数码管也抠出完整矩形（不再呈阶梯状）', () => {
    const d = createDigitLayer(
      { w: 40, h: 30 },
      { text: '1', digitHeight: 10, x: 5, y: 5, skewX: 30, gapRatio: 0.1, glow: 0 },
    )
    const mask = computeReservedMask([d], 40, 30)
    const b = layerContentBounds(d)
    const cols = Math.ceil(b.x + b.width) - Math.floor(b.x)
    const rows = Math.ceil(b.y + b.height) - Math.floor(b.y)
    expect(countMask(mask)).toBe(cols * rows)
    // 矩形四角都被抠除（阶梯判定会漏掉斜切外的角）
    expect(mask[Math.floor(b.y) * 40 + Math.floor(b.x)]).toBe(1)
    expect(mask[(Math.ceil(b.y + b.height) - 1) * 40 + (Math.ceil(b.x + b.width) - 1)]).toBe(1)
  })

  it('发光扩散计入占位：发光越强，抠除区越大', () => {
    const none = createDigitLayer(
      { w: 60, h: 40 },
      { text: '8', digitHeight: 10, x: 20, y: 15, glow: 0, skewX: 0 },
    )
    const strong = createDigitLayer(
      { w: 60, h: 40 },
      { text: '8', digitHeight: 10, x: 20, y: 15, glow: 0.8, skewX: 0 },
    )
    expect(countMask(computeReservedMask([strong], 60, 40))).toBeGreaterThan(
      countMask(computeReservedMask([none], 60, 40)),
    )
  })

  it('任何未抠除格子的像素点都不与内容矩形相交', () => {
    const widget = createWidgetLayer({ w: 60, h: 40 }, 'claude-status', {
      x: 7,
      y: 4,
      width: 15,
      height: 9,
    })
    const digit = createDigitLayer(
      { w: 60, h: 40 },
      { text: '42', digitHeight: 12, x: 25.3, y: 18.7, skewX: 24, skewY: -8, glow: 0.4 },
    )
    const layers: Layer[] = [widget, digit]
    const mask = computeReservedMask(layers, 60, 40)
    const bounds = layers.map((l) => layerContentBounds(l))

    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 60; x++) {
        if (mask[y * 60 + x]) continue
        const dot = dotBounds(x, y)
        for (const b of bounds) {
          expect(intersects(dot, b)).toBe(false)
        }
      }
    }
  })

  it('不可见图层不占据空间', () => {
    const widget = createWidgetLayer({ w: 40, h: 30 }, 'claude-status', { visible: false })
    expect(countMask(computeReservedMask([widget], 40, 30))).toBe(0)
  })

  it('像素层不占据空间', () => {
    const px = createPixelLayer({ w: 40, h: 30 })
    expect(countMask(computeReservedMask([px], 40, 30))).toBe(0)
  })

  it('超出画布的矩形被裁剪到边界内', () => {
    const widget = createWidgetLayer({ w: 40, h: 30 }, 'claude-status', {
      x: -10,
      y: -10,
      width: 20,
      height: 20,
    })
    const mask = computeReservedMask([widget], 40, 30)
    expect(countMask(mask)).toBe(100) // 10×10 可见部分
  })

  it('完全在画布外的图层不占据任何格子', () => {
    const widget = createWidgetLayer({ w: 40, h: 30 }, 'claude-status', {
      x: -100,
      y: -100,
      width: 20,
      height: 20,
    })
    expect(countMask(computeReservedMask([widget], 40, 30))).toBe(0)
  })

  it('多个矢量层的占据区取并集', () => {
    const a = createWidgetLayer({ w: 40, h: 30 }, 'claude-status', {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    })
    const b = createWidgetLayer({ w: 40, h: 30 }, 'claude-status', {
      x: 5,
      y: 5,
      width: 10,
      height: 10,
    })
    const layers: Layer[] = [a, b]
    // 两个 10×10 方块错开 (5,5)：并集 = 100 + 100 - 25 = 175 格
    expect(countMask(computeReservedMask(layers, 40, 30))).toBe(175)
  })

  it('数码管占据其内容矩形（无发光时为文本矩形）', () => {
    const d = createDigitLayer(
      { w: 40, h: 30 },
      {
        text: '1',
        digitHeight: 10,
        x: 2,
        y: 3,
        skewX: 0,
        gapRatio: 0.1,
        glow: 0,
      },
    )
    const t = layerFootprint(d)
    const mask = computeReservedMask([d], 40, 30)
    expect(countMask(mask)).toBe(Math.round(t.width) * Math.round(t.height))
  })
})
