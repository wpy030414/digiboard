import { describe, it, expect } from 'vitest'
import {
  indexOf,
  getPixel,
  setPixel,
  floodFill,
  bresenhamLine,
  rleEncode,
  rleDecode,
  countLit,
  clonePixels,
} from './pixels'

describe('pixels — 索引与读写', () => {
  it('indexOf 越界返回 -1', () => {
    expect(indexOf(-1, 0, 4, 4)).toBe(-1)
    expect(indexOf(0, 4, 4, 4)).toBe(-1)
    expect(indexOf(4, 0, 4, 4)).toBe(-1)
    expect(indexOf(2, 2, 4, 4)).toBe(2 * 4 + 2)
  })

  it('setPixel/getPixel 往返', () => {
    const px = new Uint8Array(16)
    setPixel(px, 1, 2, 4, 4, 1)
    expect(getPixel(px, 1, 2, 4)).toBe(1)
    expect(getPixel(px, 0, 0, 4)).toBe(0)
  })

  it('setPixel 越界安全忽略', () => {
    const px = new Uint8Array(16)
    expect(() => setPixel(px, 9, 9, 4, 4, 1)).not.toThrow()
    expect(countLit(px)).toBe(0)
  })
})

describe('pixels — 油漆桶填充', () => {
  it('空白 4x4 填充整块', () => {
    const px = new Uint8Array(16)
    floodFill(px, 4, 4, 0, 0, 1)
    expect(countLit(px)).toBe(16)
  })

  it('被墙隔断的区域不越界填充', () => {
    // 4x4，中间一道竖墙 x=1
    const px = new Uint8Array(16)
    for (let y = 0; y < 4; y++) setPixel(px, 1, y, 4, 4, 1)
    // 从左半区 (0,0) 填充为 1，不应越过墙影响右半
    floodFill(px, 4, 4, 0, 0, 1)
    // 左半（x=0）应全亮，右半（x>=2）仍为 0
    for (let y = 0; y < 4; y++) {
      expect(getPixel(px, 0, y, 4)).toBe(1)
      expect(getPixel(px, 2, y, 4)).toBe(0)
      expect(getPixel(px, 3, y, 4)).toBe(0)
    }
  })

  it('起点值等于目标值时不改动', () => {
    const px = new Uint8Array(16)
    floodFill(px, 4, 4, 0, 0, 0)
    expect(countLit(px)).toBe(0)
  })

  it('越界起点安全返回', () => {
    const px = new Uint8Array(16)
    expect(() => floodFill(px, 4, 4, 9, 9, 1)).not.toThrow()
    expect(countLit(px)).toBe(0)
  })

  it('大尺寸不爆栈（扫描线填充）', () => {
    const w = 500,
      h = 500
    const px = new Uint8Array(w * h)
    expect(() => floodFill(px, w, h, 0, 0, 1)).not.toThrow()
    expect(countLit(px)).toBe(w * h)
  })
})

describe('pixels — Bresenham 直线', () => {
  it('水平线', () => {
    const pts = bresenhamLine(0, 0, 3, 0)
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ])
  })

  it('端点始终包含', () => {
    const pts = bresenhamLine(0, 0, 5, 3)
    expect(pts[0]).toEqual({ x: 0, y: 0 })
    expect(pts[pts.length - 1]).toEqual({ x: 5, y: 3 })
  })

  it('反向直线', () => {
    const pts = bresenhamLine(3, 3, 0, 0)
    expect(pts[0]).toEqual({ x: 3, y: 3 })
    expect(pts[pts.length - 1]).toEqual({ x: 0, y: 0 })
  })

  it('单点', () => {
    expect(bresenhamLine(2, 2, 2, 2)).toEqual([{ x: 2, y: 2 }])
  })
})

describe('pixels — RLE 编解码', () => {
  it('全零缓冲往返', () => {
    const px = new Uint8Array(100)
    const rle = rleEncode(px)
    expect(rleDecode(rle, 10, 10)).toEqual(px)
  })

  it('随机缓冲往返一致', () => {
    const w = 37,
      h = 19
    const px = new Uint8Array(w * h)
    for (let i = 0; i < px.length; i++) px[i] = (i * 7 + (i % 3)) & 1
    const rle = rleEncode(px)
    expect(rleDecode(rle, w, h)).toEqual(px)
  })

  it('压缩有效：大面积同色 RLE 很短', () => {
    const px = new Uint8Array(10000)
    const rle = rleEncode(px)
    expect(rle.length).toBe(2) // [10000, 0]
  })

  it('空缓冲往返', () => {
    const px = new Uint8Array(0)
    expect(rleDecode(rleEncode(px), 0, 0)).toEqual(px)
  })

  it('尺寸不匹配时补齐/截断', () => {
    const px = new Uint8Array([1, 1, 0, 1])
    const rle = rleEncode(px)
    // 解码成 8 长，末尾补 0
    const out = rleDecode(rle, 8, 1)
    expect(out.length).toBe(8)
    expect(out[0]).toBe(1)
    expect(out[7]).toBe(0)
  })
})

describe('pixels — clone', () => {
  it('克隆独立于原缓冲', () => {
    const px = new Uint8Array([1, 0, 1])
    const cp = clonePixels(px)
    cp[0] = 0
    expect(px[0]).toBe(1)
    expect(cp[0]).toBe(0)
  })
})
