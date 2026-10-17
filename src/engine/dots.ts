/**
 * 点阵玩具板渲染原语 —— 屏幕不再是无缝像素，而是一颗颗圆角方块。
 *
 * 每格画一颗圆角矩形，四周留出固定比例的空隙（`DOT_GAP_RATIO`），
 * 未点亮的格子画暗色圆点（灭点），点亮的格子画图层色圆点。
 * 屏幕渲染（PixelCanvas）与 PNG 导出（to-png）共用本模块，
 * 保证「所见即所得」——这是两条平行管线唯一的点阵几何真相。
 *
 * 被数码管/小组件占据的格子由 `mask` 标记（见 footprint.ts）：
 * 这些格子既不画灭点也不画亮点，整块矩形「抠」出来交给矢量层。
 */

import type { PixelLayer } from './types'
import { beadColorForHex, invertedTextColor, nearestBeadColor } from './beads-palette'

/** 每格四周留出的空隙占格边长的比例（单边）。 */
export const DOT_GAP_RATIO = 0.16

/** 圆角半径占亮点边长的比例。 */
export const DOT_RADIUS_RATIO = 0.3

/** 单颗圆角方块的几何（单位：输出像素）。 */
export interface DotRect {
  x: number
  y: number
  size: number
  radius: number
}

/** 计算第 (cellX, cellY) 格圆角方块的几何。`unit` = 每格多少输出像素。 */
export function dotRect(cellX: number, cellY: number, unit: number): DotRect {
  const inset = unit * DOT_GAP_RATIO
  const size = Math.max(unit * 0.2, unit - inset * 2)
  return {
    x: cellX * unit + inset,
    y: cellY * unit + inset,
    size,
    radius: size * DOT_RADIUS_RATIO,
  }
}

export interface DrawPixelDotsOptions {
  /** 每格多少输出像素。 */
  unit: number
  /** 被矢量层占据的格子掩码，1 = 抠除（不绘制），长度 w*h。 */
  mask?: Uint8Array | null
  /** 拼豆模式：格子画成直角矩形、无留缝（对齐物理拼豆板）。 */
  beads?: boolean
  /** 图例筛选：该像素值（1..）保持原样，其余亮点降为 30% 透明度。 */
  onlyValue?: number | null
  /** 拼豆色号标注：格子足够大时在每个色块中央写小号色号（取反色）。 */
  labelCodes?: boolean
}

/** 色号标注的最小格子尺寸（输出像素）；太小则文字无法辨认，直接省略。 */
export const BEAD_CODE_MIN_CELL = 8

/** 图例筛选时非选中颜色的透明度（保留轮廓，避免画面突然消失）。 */
export const FILTERED_DOT_ALPHA = 0.3

/**
 * 把一个像素层画成点阵玩具板。调用方负责设置 canvas 尺寸与 globalAlpha。
 *
 * 先铺满灭点，再按调色板分桶绘制亮点：每种颜色一次 `fill()`，
 * 单层即可混搭多种颜色（像素值 = palette 下标 + 1）。
 */
export function drawPixelDots(
  ctx: CanvasRenderingContext2D,
  layer: PixelLayer,
  opts: DrawPixelDotsOptions,
): void {
  const { w, h, pixels, palette, offColor } = layer
  const { unit, mask, beads = false, onlyValue = null, labelCodes = false } = opts

  if (offColor) {
    ctx.beginPath()
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mask?.[y * w + x]) continue
        traceCell(ctx, x, y, unit, beads)
      }
    }
    ctx.fillStyle = offColor
    ctx.fill()
  }

  // 亮点按像素值（调色板索引）分桶
  const buckets = new Map<number, number[]>()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const v = pixels[i] ?? 0
      if (!v || mask?.[i]) continue
      const bucket = buckets.get(v)
      if (bucket) bucket.push(i)
      else buckets.set(v, [i])
    }
  }

  const baseAlpha = ctx.globalAlpha
  const showLabels = labelCodes && unit >= BEAD_CODE_MIN_CELL
  if (showLabels) {
    const font = Math.min(10, Math.max(4, unit * 0.5))
    ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
  }

  for (const [value, cells] of buckets) {
    // 图例筛选：非选中的颜色保留但降为 30% 透明度
    const dimmed = onlyValue !== null && value !== onlyValue
    ctx.globalAlpha = dimmed ? baseAlpha * FILTERED_DOT_ALPHA : baseAlpha

    ctx.beginPath()
    for (const i of cells) {
      traceCell(ctx, i % w, Math.floor(i / w), unit, beads)
    }
    const hex = palette[value - 1] ?? palette[0] ?? 'transparent'
    ctx.fillStyle = hex
    ctx.fill()

    // 拼豆色号：每个色块中央写小字，颜色取反以保证对比度（跟随该色透明度）
    if (showLabels) {
      const bead = beadColorForHex(hex) ?? nearestBeadColor(hex)
      if (ctx.measureText(bead.code).width <= unit * 0.92) {
        ctx.fillStyle = invertedTextColor(hex)
        for (const i of cells) {
          ctx.fillText(bead.code, (i % w) * unit + unit / 2, Math.floor(i / w) * unit + unit / 2)
        }
      }
    }
  }
  ctx.globalAlpha = baseAlpha
}

/** 拼豆参考线所在的格子边界（每 5 格，不含左/上边缘）。 */
export function beadsBoundaries(count: number): number[] {
  const out: number[] = []
  for (let i = 5; i < count; i += 5) out.push(i)
  return out
}

/**
 * 把拼豆参考线画进 canvas（PNG 导出用；屏幕用 SVG 叠层）。
 *
 * 先画每格一条半透灰线（定位单颗豆的边界），再叠 5/10 格红色标识线。
 */
export function drawBeadsGuides(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  unit: number,
): void {
  ctx.save()

  // 每格边界：半透灰细线
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
  ctx.lineWidth = 1
  ctx.setLineDash([])
  ctx.beginPath()
  for (let i = 1; i < w; i++) {
    const x = i * unit + 0.5
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h * unit)
  }
  for (let j = 1; j < h; j++) {
    const y = j * unit + 0.5
    ctx.moveTo(0, y)
    ctx.lineTo(w * unit, y)
  }
  ctx.stroke()

  // 5/10 格红色标识线
  ctx.strokeStyle = '#ff3b3b'
  const strokeBand = (index: number) => {
    const solid = index % 10 === 0
    ctx.globalAlpha = solid ? 0.95 : 0.7
    ctx.lineWidth = solid ? 1.2 : 1
    ctx.setLineDash(solid ? [] : [Math.max(2, unit * 0.5), Math.max(2, unit * 0.375)])
  }
  // +0.5 让 1px 线落在像素中心，避免被两条像素列各分走一半而不够醒目
  for (const i of beadsBoundaries(w)) {
    strokeBand(i)
    const x = i * unit + 0.5
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h * unit)
    ctx.stroke()
  }
  for (const j of beadsBoundaries(h)) {
    strokeBand(j)
    const y = j * unit + 0.5
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w * unit, y)
    ctx.stroke()
  }
  ctx.restore()
}

/** 按显示模式追加一格：拼豆模式整格直角，普通模式留缝圆角。 */
function traceCell(
  ctx: CanvasRenderingContext2D,
  cellX: number,
  cellY: number,
  unit: number,
  beads: boolean,
): void {
  if (beads) {
    ctx.rect(cellX * unit, cellY * unit, unit, unit)
    return
  }
  traceDot(ctx, dotRect(cellX, cellY, unit))
}

/** 把一颗圆角矩形追加进当前路径（roundRect 不可用时退化为直角矩形）。 */
function traceDot(ctx: CanvasRenderingContext2D, r: DotRect): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(r.x, r.y, r.size, r.size, r.radius)
  } else {
    ctx.rect(r.x, r.y, r.size, r.size)
  }
}
