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
  const fills: { style: string; dots: DotTrace[]; alpha: number }[] = []
  let path: DotTrace[] = []
  const ctx = {
    fillStyle: '',
    globalAlpha: 1,
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
      fills.push({ style: ctx.fillStyle, dots: path.slice(), alpha: ctx.globalAlpha })
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

  it('先画每格灰线，再以 10 的倍数画实线、其余虚线', () => {
    const lines: Array<{ dash: number[]; alpha: number; style: string }> = []
    const ctx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {
        lines.push({ dash: [...dash], alpha, style })
      },
      set strokeStyle(v: string) {
        style = v
      },
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
    let style = ''
    drawBeadsGuides(ctx as unknown as CanvasRenderingContext2D, 20, 20, 8)

    // 第一条描边是整片格边界灰线
    expect(lines[0]?.style).toBe('rgba(255, 255, 255, 0.16)')

    const red = lines.filter((l) => l.style === '#ff3b3b')
    // 20 格 => 3 条竖线(5,10,15) + 3 条横线
    expect(red).toHaveLength(6)
    const solid = red.filter((l) => l.dash.length === 0)
    const dashed = red.filter((l) => l.dash.length > 0)
    expect(solid).toHaveLength(2) // 5,10,15 中只有 10 是实线，横竖各一
    expect(dashed).toHaveLength(4)
  })
})

describe('drawPixelDots — 拼豆色号标注', () => {
  function textCtx() {
    const texts: Array<{ text: string; fill: string; x: number; y: number }> = []
    const ctx = {
      fillStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
      beginPath: () => {},
      rect: () => {},
      fill: () => {},
      measureText: (t: string) => ({ width: t.length * 4 }),
      fillText: (text: string, x: number, y: number) => {
        texts.push({ text, fill: ctx.fillStyle, x, y })
      },
    }
    return { ctx: ctx as unknown as CanvasRenderingContext2D, texts }
  }

  it('格子足够大时在每个色块中央写取反色色号', () => {
    const layer: PixelLayer = createPixelLayer({ w: 2, h: 1 })
    layer.palette = ['#e10328', '#ffffff']
    layer.pixels[0] = 1
    layer.pixels[1] = 2
    const { ctx, texts } = textCtx()
    drawPixelDots(ctx, layer, { unit: 16, beads: true, labelCodes: true })
    expect(texts.map((t) => t.text)).toEqual(['F5', 'H1'])
    // 暗红底白字、白底近黑字
    expect(texts[0]!.fill).toBe('#ffffff')
    expect(texts[1]!.fill).toBe('#101014')
    expect(texts[0]!.x).toBe(8)
    expect(texts[0]!.y).toBe(8)
  })

  it('格子过小或未开启时不标注', () => {
    const layer: PixelLayer = createPixelLayer({ w: 1, h: 1 })
    layer.palette = ['#e10328']
    layer.pixels[0] = 1
    const small = textCtx()
    drawPixelDots(small.ctx, layer, { unit: 6, beads: true, labelCodes: true })
    expect(small.texts).toHaveLength(0)
    const off = textCtx()
    drawPixelDots(off.ctx, layer, { unit: 16, beads: true })
    expect(off.texts).toHaveLength(0)
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

  it('onlyValue 让其他颜色降为 30% 透明度而不是消失', () => {
    const layer = createPixelLayer({ w: 3, h: 1 })
    layer.palette = ['#ff0000', '#00ff00']
    layer.pixels[0] = 1
    layer.pixels[1] = 2
    layer.pixels[2] = 1
    const { ctx, fills } = fakeCtx()
    drawPixelDots(ctx, layer, { unit: 8, onlyValue: 1 })
    const red = fills.filter((f) => f.style === '#ff0000')
    const green = fills.filter((f) => f.style === '#00ff00')
    expect(red).toHaveLength(1)
    expect(red[0]!.dots).toHaveLength(2)
    expect(red[0]!.alpha).toBe(1)
    expect(green).toHaveLength(1)
    expect(green[0]!.dots).toHaveLength(1)
    expect(green[0]!.alpha).toBeCloseTo(0.3)
  })

  it('offColor 为空时跳过灭点', () => {
    const layer = createPixelLayer({ w: 2, h: 2 })
    layer.offColor = ''
    const { ctx, fills } = fakeCtx()
    drawPixelDots(ctx, layer, { unit: 4 })
    expect(fills).toHaveLength(0)
  })
})
