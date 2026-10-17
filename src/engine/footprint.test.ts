import { describe, it, expect } from 'vitest'
import { computeReservedMask, layerFootprint, layerMatrix, pointInLayer } from './footprint'
import { createDigitLayer, createPixelLayer, createWidgetLayer } from './factories'
import { apply } from './transform'
import type { Layer } from './types'

function countMask(mask: Uint8Array): number {
  let n = 0
  for (const v of mask) if (v) n++
  return n
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

  it('数码管占据其文本矩形', () => {
    const d = createDigitLayer(
      { w: 40, h: 30 },
      {
        text: '1',
        digitHeight: 10,
        x: 2,
        y: 3,
        skewX: 0,
        gapRatio: 0.1,
      },
    )
    const t = layerFootprint(d)
    const mask = computeReservedMask([d], 40, 30)
    expect(countMask(mask)).toBe(Math.round(t.width) * Math.round(t.height))
  })
})
