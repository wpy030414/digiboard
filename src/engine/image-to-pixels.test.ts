import { describe, it, expect } from 'vitest'
import { DEFAULT_MAX_COLORS, coverCrop, quantizeImageData } from './image-to-pixels'
import { MAX_BEAD_COLORS, beadColorForHex } from './beads-palette'

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
    expect(palette).toEqual(['#e10328', '#0f52bd'])
    expect(palette.map((hex) => beadColorForHex(hex)?.code)).toEqual(['F5', 'C8'])
    expect(Array.from(pixels)).toEqual([1, 1, 2, 2])
  })

  it('透明格子写入 0，且不进入调色板', () => {
    const data = rgba([
      [0, 255, 0, 255],
      [0, 0, 0, 0],
    ])
    const { palette, pixels } = quantizeImageData(data, 2, 1)
    expect(palette).toEqual(['#39e158'])
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
