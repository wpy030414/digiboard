import { describe, it, expect } from 'vitest'
import {
  DEFAULT_MAX_COLORS,
  autoColorCount,
  coverCrop,
  kuwahara,
  quantizeImageData,
  representativeColor,
} from './image-to-pixels'
import { MAX_BEAD_COLORS, beadColorForHex } from './beads-palette'
import { rgbToOklab } from './oklab'

/** 生成 RGBA 数据：每格 [r,g,b,a]。 */
function rgba(cells: Array<[number, number, number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(cells.length * 4)
  cells.forEach(([r, g, b, a], i) => {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  })
  return data
}

describe('coverCrop — cover 裁切', () => {
  it('源图更宽：裁掉左右，保留高度', () => {
    expect(coverCrop(200, 100, 40, 40)).toEqual({ sx: 50, sy: 0, sw: 100, sh: 100 })
  })

  it('源图更高：裁掉上下，保留宽度', () => {
    expect(coverCrop(100, 200, 40, 20)).toEqual({ sx: 0, sy: 75, sw: 100, sh: 50 })
  })

  it('宽高比一致：不裁切', () => {
    expect(coverCrop(80, 60, 40, 30)).toEqual({ sx: 0, sy: 0, sw: 80, sh: 60 })
  })

  it('非法尺寸返回空裁切', () => {
    expect(coverCrop(0, 0, 10, 10)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 })
  })
})

describe('quantizeImageData — 色彩降级', () => {
  it('两种纯色吸附为拼豆色卡中的 2 色并映射到对应索引', () => {
    const data = rgba([
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [0, 0, 255, 255],
      [0, 0, 255, 255],
    ])
    const { palette, pixels } = quantizeImageData(data, 2, 2)
    expect(palette).toEqual(['#fb2a40', '#3349c3'])
    expect(palette.map((hex) => beadColorForHex(hex)?.code)).toEqual(['F4', 'C9'])
    expect(Array.from(pixels)).toEqual([1, 1, 2, 2])
  })

  it('透明格子写入 0，且不进入调色板', () => {
    const data = rgba([
      [0, 255, 0, 255],
      [0, 0, 0, 0],
    ])
    const { palette, pixels } = quantizeImageData(data, 2, 1)
    expect(palette).toEqual(['#64f343'])
    expect(Array.from(pixels)).toEqual([1, 0])
  })

  it('调色板颜色全部来自拼豆色卡且不重复', () => {
    const cells: Array<[number, number, number, number]> = []
    for (let i = 0; i < 60; i++) cells.push([i * 4, (i * 7) % 256, (i * 11) % 256, 255])
    const { palette } = quantizeImageData(rgba(cells), 60, 1)
    expect(new Set(palette).size).toBe(palette.length)
    for (const hex of palette) expect(beadColorForHex(hex)).toBeDefined()
  })

  it('默认上限与拼豆色卡一致（221 色）', () => {
    expect(DEFAULT_MAX_COLORS).toBe(221)
    expect(DEFAULT_MAX_COLORS).toBe(MAX_BEAD_COLORS)
  })

  it('颜色数受 maxColors 限制，相近色合并到同色', () => {
    const cells: Array<[number, number, number, number]> = []
    for (let i = 0; i < 20; i++) cells.push([i * 10, 0, 0, 255])
    const { palette, pixels } = quantizeImageData(rgba(cells), 20, 1, 3)
    expect(palette.length).toBeLessThanOrEqual(3)
    expect(new Set(Array.from(pixels)).size).toBeLessThanOrEqual(3)
  })

  it('全透明图片回退为单色空画布', () => {
    const data = rgba([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const { palette, pixels } = quantizeImageData(data, 2, 1)
    expect(palette).toHaveLength(1)
    expect(Array.from(pixels)).toEqual([0, 0])
  })

  it('同样输入产生确定性调色板', () => {
    const data = rgba([
      [12, 34, 56, 255],
      [200, 10, 90, 255],
      [12, 34, 56, 255],
    ])
    const a = quantizeImageData(data, 3, 1)
    const b = quantizeImageData(data, 3, 1)
    expect(a.palette).toEqual(b.palette)
    expect(Array.from(a.pixels)).toEqual(Array.from(b.pixels))
  })
})

describe('autoColorCount — 自适应色数', () => {
  it('按格子数收敛，并落在 8–32 之间', () => {
    expect(autoColorCount(1)).toBe(8)
    expect(autoColorCount(1200)).toBe(21)
    expect(autoColorCount(4800)).toBe(32)
    expect(autoColorCount(40000)).toBe(32)
  })
})

describe('representativeColor — 单格代表色', () => {
  const black = rgbToOklab(0, 0, 0)
  const white = rgbToOklab(255, 255, 255)

  it('低方差取均值', () => {
    const a = rgbToOklab(100, 100, 100)
    const b = rgbToOklab(104, 104, 104)
    const rep = representativeColor([a, b, a, b])
    expect(rep[0]).toBeCloseTo((a[0] + b[0]) / 2, 5)
  })

  it('真边缘取主导簇，不混成灰色', () => {
    // 16 个样本：10 黑 6 白，2-means 后应返回黑（主导簇），而不是中间灰
    const samples = [...Array(10).fill(black), ...Array(6).fill(white)]
    const rep = representativeColor(samples)
    expect(rep[0]).toBeCloseTo(black[0], 5)
    expect(rep[1]).toBeCloseTo(black[1], 5)
    expect(rep[2]).toBeCloseTo(black[2], 5)
  })
})

describe('kuwahara — 保边平滑', () => {
  it('保留硬边，不把两侧混成灰带', () => {
    const w = 11
    const h = 5
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4
        const v = x < 5 ? 0 : 255
        data[o] = v
        data[o + 1] = v
        data[o + 2] = v
        data[o + 3] = 255
      }
    }
    const out = kuwahara(data, w, h, 2)
    // 边界两侧的像素仍应是纯黑/纯白
    expect(out[(2 * w + 4) * 4]).toBe(0)
    expect(out[(2 * w + 5) * 4]).toBe(255)
  })
})
