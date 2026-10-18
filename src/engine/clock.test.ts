import { describe, it, expect } from 'vitest'
import { digitDisplayText, formatClock, normalizeClockMode } from './clock'
import { createDigitLayer } from './factories'

// 本地时间：2026-10-18 15:04:05（星期几不影响输出）
const at = (h = 15, m = 4, s = 5) => new Date(2026, 9, 18, h, m, s)

describe('clock — 模式归一', () => {
  it('合法模式原样返回', () => {
    expect(normalizeClockMode('date')).toBe('date')
    expect(normalizeClockMode('time')).toBe('time')
    expect(normalizeClockMode('datetime')).toBe('datetime')
    expect(normalizeClockMode('off')).toBe('off')
  })

  it('未知 / 缺失值回落到 off', () => {
    expect(normalizeClockMode(undefined)).toBe('off')
    expect(normalizeClockMode('clock')).toBe('off')
    expect(normalizeClockMode(123)).toBe('off')
  })
})

describe('clock — 格式化', () => {
  const opts = (showSeconds = false, hour12 = false) => ({ showSeconds, hour12 })

  it('日期：YYYY-MM-DD（使用 - 分隔）', () => {
    expect(formatClock('date', at(), opts())).toBe('2026-10-18')
  })

  it('时间：24 小时制补零', () => {
    expect(formatClock('time', at(), opts(false, false))).toBe('15:04')
    expect(formatClock('time', at(), opts(true, false))).toBe('15:04:05')
  })

  it('时间：12 小时制（01–12）', () => {
    expect(formatClock('time', at(15, 4), opts(false, true))).toBe('03:04')
    expect(formatClock('time', at(0, 0), opts(false, true))).toBe('12:00')
    expect(formatClock('time', at(12, 0), opts(false, true))).toBe('12:00')
    expect(formatClock('time', at(9, 8), opts(false, true))).toBe('09:08')
  })

  it('日期时间：日期 + 空格 + 时间', () => {
    expect(formatClock('datetime', at(), opts(false, false))).toBe('2026-10-18 15:04')
    expect(formatClock('datetime', at(), opts(true, true))).toBe('2026-10-18 03:04:05')
  })

  it('off 返回空串', () => {
    expect(formatClock('off', at(), opts())).toBe('')
  })
})

describe('clock — 图层显示文本', () => {
  it('off 模式使用手动 text', () => {
    const d = createDigitLayer({ w: 80, h: 60 }, { text: '88:88', clockMode: 'off' })
    expect(digitDisplayText(d, at())).toBe('88:88')
  })

  it('时钟模式覆盖 text，并遵循秒 / 12 小时开关', () => {
    const d = createDigitLayer(
      { w: 80, h: 60 },
      {
        text: '9999',
        clockMode: 'datetime',
        clockShowSeconds: true,
        clockHour12: true,
      },
    )
    expect(digitDisplayText(d, at())).toBe('2026-10-18 03:04:05')
  })

  it('旧图层缺少开关字段时按 false 处理', () => {
    const d = createDigitLayer({ w: 80, h: 60 }, { clockMode: 'time' })
    // 直接删除字段，模拟旧 YAML 反序列化结果
    const legacy = { ...d, clockShowSeconds: undefined, clockHour12: undefined }
    expect(digitDisplayText(legacy as typeof d, at())).toBe('15:04')
  })
})
