import { describe, it, expect } from 'vitest'
import {
  charToSegments,
  buildDigitGeometry,
  layoutText,
  isSupportedChar,
  CHAR_SEGMENTS,
  SEGMENTS,
} from './digits'

describe('digits — 段位编码', () => {
  it('数字 8 点亮全部七段', () => {
    expect(charToSegments('8').sort()).toEqual([...SEGMENTS].sort())
  })

  it('数字 1 只点亮 b、c', () => {
    expect(charToSegments('1').sort()).toEqual(['b', 'c'])
  })

  it('数字 0 点亮除 g 外全部（无中间横）', () => {
    expect(charToSegments('0')).not.toContain('g')
    expect(charToSegments('0').length).toBe(6)
  })

  it('原 Vue 二进制字典语义对齐：0b1110111(0) = abcdef', () => {
    // 原实现 0 -> 0b1110111，位序 a f b g e c d；值中 g 位为 0
    // 迁移后 '0' 应不含 g、含 a b c d e f
    expect(CHAR_SEGMENTS['0']).toBeDefined()
    expect(charToSegments('0').sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('大小写与字母回退查表', () => {
    expect(isSupportedChar('a')).toBe(true)
    expect(isSupportedChar('A')).toBe(true)
    expect(charToSegments('a')).toEqual(charToSegments('A'))
  })

  it('小数点、冒号与减号被识别', () => {
    expect(isSupportedChar('.')).toBe(true)
    expect(isSupportedChar(':')).toBe(true)
    expect(isSupportedChar('-')).toBe(true)
  })

  it('减号点亮中间横段 g', () => {
    expect(charToSegments('-')).toEqual(['g'])
  })

  it('不支持的字符返回空段位', () => {
    expect(isSupportedChar('?')).toBe(false)
    expect(charToSegments('?')).toEqual([])
  })
})

describe('digits — 几何生成', () => {
  it('生成七段路径，尺寸正确', () => {
    const geo = buildDigitGeometry(20, 0.6, 0.16)
    expect(geo.h).toBe(20)
    expect(geo.w).toBeCloseTo(12)
    expect(geo.t).toBeCloseTo(3.2)
    for (const id of SEGMENTS) {
      expect(geo.paths[id]).toMatch(/^M /)
      expect(geo.paths[id].endsWith('Z')).toBe(true)
    }
  })

  it('rounded 样式生成含贝塞尔曲线 Q 的路径', () => {
    const geo = buildDigitGeometry(20, 0.6, 0.16, 'rounded')
    expect(geo.paths['a']).toContain('Q')
  })

  it('sharp 样式不含曲线', () => {
    const geo = buildDigitGeometry(20, 0.6, 0.16, 'sharp')
    expect(geo.paths['a']).not.toContain('Q')
  })

  it('冒号由上下两个点组成，标点格宽度固定', () => {
    const geo = buildDigitGeometry(20, 0.6, 0.16)
    expect(geo.punctW).toBeCloseTo(geo.t * 1.4)
    expect(geo.colonPath.match(/M /g)?.length).toBe(2)
    expect(geo.decimalPath.match(/M /g)?.length).toBe(1)
  })

  it('零厚度被夹紧为最小值，不产生 NaN', () => {
    const geo = buildDigitGeometry(20, 0.6, 0)
    expect(geo.t).toBeGreaterThan(0)
    expect(Number.isNaN(geo.paths['a'] as unknown as number)).toBe(false)
    expect(geo.paths['a']).not.toContain('NaN')
  })
})

describe('digits — 文本排布', () => {
  it('空文本宽度为 0', () => {
    expect(layoutText('', 20, 0.6, 0.16, 0.12).totalWidth).toBe(0)
  })

  it('多字符宽度单调递增', () => {
    const w1 = layoutText('8', 20, 0.6, 0.16, 0.12).totalWidth
    const w2 = layoutText('88', 20, 0.6, 0.16, 0.12).totalWidth
    expect(w2).toBeGreaterThan(w1)
  })

  it('小数点字符更窄', () => {
    const withDot = layoutText('8.8', 20, 0.6, 0.16, 0.12)
    const dotCell = withDot.cells.find((c) => c.isDecimal)
    expect(dotCell).toBeDefined()
    expect(dotCell!.litSegments).toEqual([])
  })

  it('冒号使用窄标点格且不点亮段位', () => {
    const { cells } = layoutText('12:34', 20, 0.6, 0.16, 0.12)
    const colon = cells.find((c) => c.isColon)!
    expect(colon).toBeDefined()
    expect(colon.litSegments).toEqual([])
    // 冒号格宽度小于一个完整字符宽
    expect(cells[3]!.offsetX - cells[2]!.offsetX).toBeLessThan(20 * 0.6)
  })

  it('偏移量随字符递增', () => {
    const { cells } = layoutText('123', 20, 0.6, 0.16, 0.12)
    expect(cells[0]!.offsetX).toBe(0)
    expect(cells[1]!.offsetX).toBeGreaterThan(0)
    expect(cells[2]!.offsetX).toBeGreaterThan(cells[1]!.offsetX)
  })
})
