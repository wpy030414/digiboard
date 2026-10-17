import { describe, it, expect } from 'vitest'
import { createBlankScene } from '../factories'
import type { PixelLayer } from '../types'
import { collectBeadsLegend } from './beads-export'

describe('collectBeadsLegend — 拼豆图例统计', () => {
  it('按调色板顺序统计像素数，并映射为拼豆色号', () => {
    const scene = createBlankScene({ w: 4, h: 2 })
    const px = scene.layers[0] as PixelLayer
    px.palette = ['#e10328', '#39e158', '#ffaacc']
    px.pixels = new Uint8Array([1, 1, 2, 0, 0, 0, 3, 0])

    // 图例按色号排序，而不是调色板登记顺序
    expect(collectBeadsLegend(scene)).toEqual([
      { color: '#39e158', code: 'B5', approximate: false, count: 1 },
      { color: '#ffaacc', code: 'E19', approximate: true, count: 1 },
      { color: '#e10328', code: 'F5', approximate: false, count: 2 },
    ])
  })

  it('没有点亮的像素时返回空图例', () => {
    expect(collectBeadsLegend(createBlankScene({ w: 3, h: 3 }))).toEqual([])
  })
})
