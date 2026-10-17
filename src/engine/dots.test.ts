import { describe, it, expect } from 'vitest'
import {
  DOT_GAP_RATIO,
  DOT_RADIUS_RATIO,
  beadsBoundaries,
  dotRect,
  drawBeadsGuides,
  drawPixelDots,
} from './dots'
import { createPixelLayer } from './factories'
import { DEFAULT_OFF_DOT_COLOR, type PixelLayer } from './types'

interface DotTrace {
  x: number
  y: number
  size: number
  radius: number
}

/** 记录 roundRect / rect 与 fill 的最小 canvas 2d 替身。 */
function fakeCtx() {
  const fills: { style: string; dots: DotTrace[] }[] = []
  let path: DotTrace[] = []
  const ctx = {
    fillStyle: '',
    beginPath: () => {
      path = []
    },
    roundRect: (x: number, y: number, w: number, _h: number, radius: number) => {
      path.push({ x, y, size: w, radius })
    },
    rect: (x: number, y: number, w: number) => {
      path.push({ x, y, size: w, radius: 0 })
    },
    fill: () => {
      fills.push({ style: ctx.fillStyle, dots: path.slice() })
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills }
}

describe('dotRect — 圆角方块几何', () => {
  it('四周留缝，圆角半径按方块边长取比例', () => {
    const r = dotRect(0, 0, 10)
    expect(r.x).toBeCloseTo(10 * DOT_GAP_RATIO)
    expect(r.y).toBeCloseTo(10 * DOT_GAP_RATIO)
    expect(r.size).toBeCloseTo(10 - 2 * 10 * DOT_GAP_RATIO)
    expect(r.radius).toBeCloseTo(r.size * DOT_RADIUS_RATIO)
  })

  it('相邻格子之间有缝隙（非无缝像素）', () => {
    const a = dotRect(0, 0, 10)
    const b = dotRect(1, 0, 10)
    expect(a.x + a.size).toBeLessThan(b.x)
  })

  it('unit 很小时方块仍保留正尺寸', () => {
    expect(dotRect(0, 0, 1).size).toBeGreaterThan(0)
  })
})

describe('beadsBoundaries / drawBeadsGuides — 参考线', () => {
  it('每 5 格一条边界，不含 0 与边缘', () => {
    expect(beadsBoundaries(12)).toEqual([5, 10])
    expect(beadsBoundaries(10)).toEqual([5])
    expect(beadsBoundaries(4)).toEqual([])
  })

  it('10 的倍数画实线，其余虚线', () => {
    const lines: Array<{ dash: number[]; alpha: number }> = []
    const ctx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {
        lines.push({ dash: [...dash], alpha })
      },
      set strokeStyle(_v: string) {},
      set globalAlpha(v: number) {
        alpha = v
      },
      set lineWidth(_v: number) {},
      setLineDash: (d: number[]) => {
        dash = d
      },
    }
    let alpha = 1
    let dash: number[] = []
    drawBeadsGuides(ctx as unknown as CanvasRenderingContext2D, 20, 20, 8)
    // 20 格 => 3 条竖线(5,10,15) + 3 条横线
    expect(lines).toHaveLength(6)
    const solid = lines.filter((l) => l.dash.length === 0)
    const dashed = lines.filter((l) => l.dash.length > 0)
    expect(solid).toHaveLength(2) // 10/20 坐标... 5,10,15 中只有 10 是实线，横竖各一
    expect(dashed).toHaveLength(4)
  })
})

describe('drawPixelDots — 灭点与亮点', () => {
  it('先铺满灭点，再叠亮点', () => {
    const layer: PixelLayer = createPixelLayer({ w: 3, h: 2 })
    layer.palette = ['#ff8800']
    layer.pixels[0] = 1
    const { ctx, fills } = fakeCtx()
    drawPixelDots(ctx, layer, { unit: 8 })
    expect(fills).toHaveLength(2)
    expect(fills[0]!.style).toBe(DEFAULT_OFF_DOT_COLOR)
    expect(fills[0]!.dots).toHaveLength(6)
    expect(fills[1]!.style).toBe('#ff8800')
    expect(fills[1]!.dots).toHaveLength(1)
  })

  it('拼豆模式：直角整格、无留缝', () => {
    const layer = createPixelLayer({ w: 2, h: 1 })
    const { ctx, fills } = fakeCtx()
    drawPixelDots(ctx, layer, { unit: 10, beads: true })
    // 灭点铺满两格：整格直角矩形，从格角起画
    expect(fills[0]!.dots).toHaveLength(2)
    expect(fills[0]!.dots[0]).toMatchObject({ x: 0, y: 0, size: 10, radius: 0 })
    expect(fills[0]!.dots[1]).toMatchObject({ x: 10, y: 0, size: 10, radius: 0 })
  })

  it('mask 命中的格子既不画灭点也不画亮点', () => {
    const layer = createPixelLayer({ w: 3, h: 2 })
    layer.pixels[0] = 1
    const mask = new Uint8Array(6)
    mask[0] = 1
    const { ctx, fills } = fakeCtx()
    drawPixelDots(ctx, layer, { unit: 8, mask })
    expect(fills[0]!.dots).toHaveLength(5)
    // 唯一的亮点被抠除 => 不产生亮点绘制
    expect(fills).toHaveLength(1)
  })

  it('onlyValue 只保留指定颜色的亮点', () => {
    const layer = createPixelLayer({ w: 3, h: 1 })
    layer.palette = ['#ff0000', '#00ff00']
    layer.pixels[0] = 1
    layer.pixels[1] = 2
    layer.pixels[2] = 1
    const { ctx, fills } = fakeCtx()
    drawPixelDots(ctx, layer, { unit: 8, onlyValue: 1 })
    // 只有红色桶被绘制：1 颗
    const litFills = fills.filter((f) => f.style === '#ff0000')
    expect(litFills).toHaveLength(1)
    expect(litFills[0]!.dots).toHaveLength(2)
  })

  it('offColor 为空时跳过灭点', () => {
    const layer = createPixelLayer({ w: 2, h: 2 })
    layer.offColor = ''
    const { ctx, fills } = fakeCtx()
    drawPixelDots(ctx, layer, { unit: 4 })
    expect(fills).toHaveLength(0)
  })
})
