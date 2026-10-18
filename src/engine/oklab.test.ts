import { describe, it, expect } from 'vitest'
import { hexToOklab, oklabDistance2, oklabMean, rgbToOklab } from './oklab'

describe('Oklab — 感知色彩空间', () => {
  it('白色 L≈1、色度≈0，黑色 L≈0', () => {
    const white = rgbToOklab(255, 255, 255)
    expect(white[0]).toBeCloseTo(1, 4)
    expect(Math.abs(white[1])).toBeLessThan(1e-4)
    expect(Math.abs(white[2])).toBeLessThan(1e-4)
    const black = rgbToOklab(0, 0, 0)
    expect(black[0]).toBeCloseTo(0, 6)
  })

  it('纯红 / 纯绿 / 纯蓝的色度方向正确', () => {
    const red = rgbToOklab(255, 0, 0)
    const green = rgbToOklab(0, 255, 0)
    const blue = rgbToOklab(0, 0, 255)
    expect(red[1]).toBeGreaterThan(0) // a: 红-绿轴
    expect(green[1]).toBeLessThan(0)
    expect(blue[2]).toBeLessThan(0) // b: 黄-蓝轴
  })

  it('hex 解析与 rgb 一致', () => {
    expect(hexToOklab('#ff0000')).toEqual(rgbToOklab(255, 0, 0))
  })

  it('距离与加权均值符合直觉', () => {
    const a = rgbToOklab(10, 10, 10)
    expect(oklabDistance2(a, a)).toBe(0)
    const mean = oklabMean([a, a, a])
    expect(mean[0]).toBeCloseTo(a[0], 6)
    const weighted = oklabMean([a, a, a], [1, 1, 2])
    expect(weighted[0]).toBeCloseTo(a[0], 6)
  })
})
