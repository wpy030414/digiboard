/**
 * 数码管时钟模式 —— 按本机时间生成显示文本。
 *
 * 设计：时钟不写入场景状态（否则每秒都会触发持久化与历史栈），
 * 而是在渲染 / 占位计算 / 导出时用同一个纯函数生成文本。
 * 只要格式长度固定（补零），占位矩形宽度就不会随秒数跳动。
 */

import type { ClockMode, DigitLayer } from './types'

export const CLOCK_MODES: readonly ClockMode[] = ['off', 'date', 'time', 'datetime']

/** 把任意输入归一为合法时钟模式（未知值回落到手动文本）。 */
export function normalizeClockMode(value: unknown): ClockMode {
  return value === 'date' || value === 'time' || value === 'datetime' ? value : 'off'
}

export interface ClockFormatOptions {
  /** 是否显示秒（time / datetime 生效）。 */
  showSeconds: boolean
  /** 是否使用 12 小时制（time / datetime 生效）。 */
  hour12: boolean
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * 生成时钟文本。
 *  - date: `YYYY-MM-DD`
 *  - time: `HH:MM` / `HH:MM:SS`（12 小时制为 `01`–`12`）
 *  - datetime: `YYYY-MM-DD HH:MM[:SS]`
 */
export function formatClock(
  mode: ClockMode,
  now: Date = new Date(),
  opts: ClockFormatOptions = { showSeconds: false, hour12: false },
): string {
  if (mode === 'off') return ''
  const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  const hours24 = now.getHours()
  const hours = opts.hour12 ? hours24 % 12 || 12 : hours24
  const time = `${pad2(hours)}:${pad2(now.getMinutes())}${
    opts.showSeconds ? `:${pad2(now.getSeconds())}` : ''
  }`
  if (mode === 'date') return date
  if (mode === 'time') return time
  return `${date} ${time}`
}

/** 数码管当前应显示的文本：时钟模式优先，否则使用手动 text。 */
export function digitDisplayText(layer: DigitLayer, now: Date = new Date()): string {
  const mode = normalizeClockMode(layer.clockMode)
  if (mode === 'off') return layer.text
  return formatClock(mode, now, {
    showSeconds: layer.clockShowSeconds ?? false,
    hour12: layer.clockHour12 ?? false,
  })
}
