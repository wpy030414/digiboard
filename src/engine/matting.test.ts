import { describe, it, expect } from 'vitest'
import { cropRectForSubject, subjectBounds, type Matte } from './matting'

/** 生成蒙版：`fill(x,y)` 返回该像素的前景置信度。 */
function mask(w: number, h: number, fill: (x: number, y: number) => number): Matte {
  const data = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data[y * w + x] = fill(x, y)
  }
  return { width: w, height: h, data }
}

describe('subjectBounds — 主体包围盒', () => {
  it('返回前景像素的最小外接矩形', () => {
    // 10×10 里画一个 (2,3)–(5,5) 的矩形
    const matte = mask(10, 10, (x, y) => (x >= 2 && x <= 5 && y >= 3 && y <= 5 ? 255 : 0))
    expect(subjectBounds(matte)).toEqual({ x0: 2, y0: 3, x1: 5, y1: 5 })
  })

  it('全背景返回 null', () => {
    expect(subjectBounds(mask(8, 8, () => 0))).toBeNull()
  })

  it('阈值以下的软边不参与包围盒', () => {
    const matte = mask(4, 4, (x, y) => (x === 0 && y === 0 ? 100 : x === 2 && y === 2 ? 200 : 0))
    expect(subjectBounds(matte)).toEqual({ x0: 2, y0: 2, x1: 2, y1: 2 })
  })
})

describe('cropRectForSubject — 主体裁切', () => {
  it('裁切区域保持目标宽高比且包含主体', () => {
    // 100×100 源图，蒙版 10×10，主体在中心 (4,4)–(5,5)
    const matte = mask(10, 10, (x, y) => (x >= 4 && x <= 5 && y >= 4 && y <= 5 ? 255 : 0))
    const rect = cropRectForSubject(matte, 100, 100, 40, 30)
    expect(rect).not.toBeNull()
    expect(rect!.sw / rect!.sh).toBeCloseTo(40 / 30, 5)
    // 主体中心在裁切区域内
    const cx = rect!.sx + rect!.sw / 2
    const cy = rect!.sy + rect!.sh / 2
    expect(cx).toBeGreaterThanOrEqual(40)
    expect(cx).toBeLessThanOrEqual(60)
    expect(cy).toBeGreaterThanOrEqual(40)
    expect(cy).toBeLessThanOrEqual(60)
  })

  it('裁切区域不越出源图', () => {
    // 主体贴着右下角
    const matte = mask(10, 10, (x, y) => (x >= 8 && y >= 8 ? 255 : 0))
    const rect = cropRectForSubject(matte, 100, 100, 16, 9, 0.2)
    expect(rect).not.toBeNull()
    expect(rect!.sx).toBeGreaterThanOrEqual(0)
    expect(rect!.sy).toBeGreaterThanOrEqual(0)
    expect(rect!.sx + rect!.sw).toBeLessThanOrEqual(100)
    expect(rect!.sy + rect!.sh).toBeLessThanOrEqual(100)
    expect(rect!.sw / rect!.sh).toBeCloseTo(16 / 9, 5)
  })

  it('全背景返回 null（调用方回退到 cover 裁切）', () => {
    expect(
      cropRectForSubject(
        mask(10, 10, () => 0),
        100,
        100,
        40,
        30,
      ),
    ).toBeNull()
  })
})
