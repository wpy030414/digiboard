import { describe, it, expect } from 'vitest'
import {
  BEAD_COLORS,
  MAX_BEAD_COLORS,
  beadColorForHex,
  compareBeadCode,
  invertedTextColor,
  nearestBeadColor,
} from './beads-palette'

describe('BEAD_COLORS — MARD 221 色卡', () => {
  it('恰好 221 色，且常量与数组长度一致', () => {
    expect(BEAD_COLORS).toHaveLength(221)
    expect(MAX_BEAD_COLORS).toBe(221)
  })

  it('色号与 HEX 均唯一', () => {
    expect(new Set(BEAD_COLORS.map((c) => c.code)).size).toBe(221)
    expect(new Set(BEAD_COLORS.map((c) => c.hex)).size).toBe(221)
  })

  it('色号形如 A1 / H7 / M15，HEX 为小写 #rrggbb', () => {
    for (const c of BEAD_COLORS) {
      expect(c.code).toMatch(/^[A-HM]\d{1,2}$/)
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/)
      expect(c.group).toBe(c.code.replace(/\d+$/, ''))
    }
  })
})

describe('beadColorForHex — 精确查询', () => {
  it('色卡内每个颜色都能查回自身', () => {
    for (const c of BEAD_COLORS) expect(beadColorForHex(c.hex)).toEqual(c)
  })

  it('忽略大小写与 # 写法差异', () => {
    expect(beadColorForHex('#FFFFFF')?.code).toBe('H1')
    expect(beadColorForHex('ffffff')?.code).toBe('H1')
    expect(beadColorForHex('#fff')?.code).toBe('H1')
  })

  it('色卡外的颜色返回 undefined', () => {
    expect(beadColorForHex('#ffaacc')).toBeUndefined()
  })
})

describe('nearestBeadColor — 最近色', () => {
  it('纯色吸附到色卡中最接近的一颗豆', () => {
    expect(nearestBeadColor('#ff0000').code).toBe('F5')
    expect(nearestBeadColor('#00ff00').code).toBe('B5')
    expect(nearestBeadColor('#0000ff').code).toBe('C8')
  })

  it('色卡内颜色返回自身', () => {
    for (const c of BEAD_COLORS) expect(nearestBeadColor(c.hex)).toBe(c)
  })

  it('默认画笔粉吸附到 E19', () => {
    expect(nearestBeadColor('#ffaacc').code).toBe('E19')
  })

  it('非法颜色按黑色处理，返回最接近的 H7', () => {
    expect(nearestBeadColor('not-a-color').code).toBe('H7')
  })
})

describe('compareBeadCode — 色号自然排序', () => {
  it('先按色系字母，再按数字（A1 < A9 < A10 < B1）', () => {
    const codes = ['B1', 'A10', 'A1', 'A9', 'H7', 'M15', 'B2']
    expect(codes.sort(compareBeadCode)).toEqual(['A1', 'A9', 'A10', 'B1', 'B2', 'H7', 'M15'])
  })

  it('整份色卡排序后保持分组与数字递增', () => {
    const sorted = [...BEAD_COLORS].sort((a, b) => compareBeadCode(a.code, b.code))
    expect(sorted[0]!.code).toBe('A1')
    expect(sorted.at(-1)!.code).toBe('M15')
    for (let i = 1; i < sorted.length; i++) {
      expect(compareBeadCode(sorted[i - 1]!.code, sorted[i]!.code)).toBeLessThan(0)
    }
  })
})

describe('invertedTextColor — 色块文字取反色', () => {
  it('亮色块用近黑字，暗色块用白字', () => {
    expect(invertedTextColor('#ffffff')).toBe('#101014')
    expect(invertedTextColor('#f6bbd1')).toBe('#101014')
    expect(invertedTextColor('#000000')).toBe('#ffffff')
    expect(invertedTextColor('#0f52bd')).toBe('#ffffff')
  })
})
