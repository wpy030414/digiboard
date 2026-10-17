/**
 * 拼豆模式 PNG 导出的附加版面：行列序号 + 图例。
 *
 * 屏幕用 DOM 叠层（BeadsOverlay / BeadsLegend），导出没有 DOM，因此在画布上
 * 重绘同一套信息：四周序号、按像素数统计的颜色图例（拼豆色号）。几何与
 * `to-png.ts` 共用，保证「屏幕所见 = 导出所得」。
 *
 * 版面：四周留出 `pad`；画布区从 (pad, pad) 开始；图例在画布下方换行排列。
 */

import type { PixelLayer, Scene } from '../types'
import { beadColorForHex, compareBeadCode, nearestBeadColor } from '../beads-palette'

export interface BeadsLegendItem {
  /** 调色板原始颜色（色块按它绘制）。 */
  color: string
  /** 拼豆色号。 */
  code: string
  /** 颜色是否精确等于色卡（false 时显示 `≈色号`）。 */
  approximate: boolean
  /** 该色像素数。 */
  count: number
}

export interface BeadsExportMetrics {
  unit: number
  pad: number
  font: number
  /** 序号间隔：每格足够大时逐格编号，否则每 5 格。 */
  step: number
  cols: number
  rows: number
  boardW: number
  boardH: number
  width: number
  height: number
  titleH: number
  rowH: number
  swatch: number
  itemGap: number
  /** 署名行的高度与起始 y（画布与图例之间）。 */
  signatureH: number
  signatureTop: number
  legendTop: number
  legend: BeadsLegendItem[]
  legendRows: BeadsLegendItem[][]
}

const LABEL_COLOR = '#ff8a9c'
const MUTED_COLOR = '#9a9aa8'
const TEXT_COLOR = '#e8e8f0'
const FONT_FAMILY = 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif'
/** 成品图署名（白色居中，夹在画布与图例之间）。 */
const SIGNATURE = 'Powered by Digiboard. GitHub:wpy030414'

/** 统计像素基座中每种颜色的数量，并按调色板顺序映射为拼豆色号。 */
export function collectBeadsLegend(scene: Scene): BeadsLegendItem[] {
  const layer = scene.layers.find((l): l is PixelLayer => l.type === 'pixel')
  if (!layer) return []
  const counts = Array.from({ length: layer.palette.length }, () => 0)
  for (const v of layer.pixels) {
    if (v > 0 && v <= counts.length) counts[v - 1]! += 1
  }
  return layer.palette
    .map((color, i) => {
      const exact = beadColorForHex(color)
      const bead = exact ?? nearestBeadColor(color)
      return {
        color,
        code: bead.code,
        approximate: !exact,
        count: counts[i]!,
      }
    })
    .filter((it) => it.count > 0)
    .sort((a, b) => compareBeadCode(a.code, b.code))
}

/** 计算带序号与图例的导出画布尺寸与排版（不绘制）。 */
export function measureBeadsExport(scene: Scene, unit: number): BeadsExportMetrics {
  const cols = scene.size.w
  const rows = scene.size.h
  const boardW = cols * unit
  const boardH = rows * unit
  // 留白与字号都随每格像素放大：高密度导出时序号/图例/署名不会显得过小
  const pad = Math.max(30, Math.min(56, Math.round(unit * 1.2)))
  const font = Math.max(12, Math.min(20, Math.round(unit * 0.4)))
  const step = unit >= 16 ? 1 : 5
  const titleH = font + 8
  const rowH = font + 8
  const swatch = font + 2
  const itemGap = 12

  const legend = collectBeadsLegend(scene)
  const ctx = measureContext()
  ctx.font = `${font}px ${FONT_FAMILY}`

  // 按画布宽度换行；单个条目比画布还宽时允许撑宽整体画布
  const itemWidth = (it: BeadsLegendItem) =>
    swatch + 4 + ctx.measureText(`${it.approximate ? '≈' : ''}${it.code} ×${it.count}`).width
  // 署名比画布/图例更宽时也要撑开整图，否则小点阵的署名会被裁掉
  let widest = Math.max(boardW, ctx.measureText(SIGNATURE).width)
  for (const it of legend) widest = Math.max(widest, itemWidth(it) + itemGap)
  const contentW = Math.max(boardW, widest)

  const legendRows: BeadsLegendItem[][] = []
  let current: BeadsLegendItem[] = []
  let used = 0
  for (const it of legend) {
    const w = itemWidth(it) + itemGap
    if (current.length > 0 && used + w > contentW) {
      legendRows.push(current)
      current = []
      used = 0
    }
    current.push(it)
    used += w
  }
  if (current.length > 0) legendRows.push(current)

  const legendHeight = titleH + (legendRows.length > 0 ? legendRows.length * rowH : font + 6)
  // 画布下方还有一排列号，图例要再往下让出字体高度
  const gap = Math.max(font + 10, Math.round(unit * 1.5))
  // 署名行夹在画布（含下方列号）与图例之间
  const signatureH = font + 10
  const signatureTop = pad + boardH + gap
  const legendTop = signatureTop + signatureH
  const width = pad * 2 + contentW
  const height = legendTop + legendHeight + pad

  return {
    unit,
    pad,
    font,
    step,
    cols,
    rows,
    boardW,
    boardH,
    width,
    height,
    titleH,
    rowH,
    swatch,
    itemGap,
    signatureH,
    signatureTop,
    legendTop,
    legend,
    legendRows,
  }
}

/** 在已合成好画布的完整画布上绘制序号与图例（绝对坐标）。 */
export function drawBeadsAnnotations(ctx: CanvasRenderingContext2D, m: BeadsExportMetrics): void {
  const { pad, font, unit, cols, rows } = m

  ctx.save()
  ctx.font = `${font}px ${FONT_FAMILY}`
  ctx.textBaseline = 'middle'

  // 列号：画布上方、下方各一条
  ctx.fillStyle = LABEL_COLOR
  ctx.textAlign = 'center'
  for (let n = m.step; n <= cols; n += m.step) {
    ctx.fillText(String(n), pad + (n - 0.5) * unit, pad - font)
    ctx.fillText(String(n), pad + (n - 0.5) * unit, pad + m.boardH + font)
  }
  // 行号：画布左侧（右对齐）、右侧（左对齐），都贴近画布边缘
  ctx.textAlign = 'right'
  for (let n = m.step; n <= rows; n += m.step) {
    ctx.fillText(String(n), pad - 6, pad + (n - 0.5) * unit)
  }
  ctx.textAlign = 'left'
  for (let n = m.step; n <= rows; n += m.step) {
    ctx.fillText(String(n), pad + m.boardW + 6, pad + (n - 0.5) * unit)
  }

  // 署名：画布与图例之间，白色居中
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(SIGNATURE, m.width / 2, m.signatureTop + m.signatureH / 2)

  // 图例
  ctx.textAlign = 'left'
  const total = m.legend.reduce((n, it) => n + it.count, 0)
  let y = m.legendTop
  ctx.fillStyle = MUTED_COLOR
  ctx.fillText(`图例 · ${m.legend.length} 色 · 共 ${total} 颗`, pad, y + m.titleH / 2)
  y += m.titleH

  if (m.legendRows.length === 0) {
    ctx.fillStyle = MUTED_COLOR
    ctx.fillText('还没有点亮任何像素', pad, y + font / 2)
  }

  for (const row of m.legendRows) {
    let x = pad
    for (const it of row) {
      const swatchY = y + (m.rowH - m.swatch) / 2
      ctx.fillStyle = it.color
      ctx.fillRect(x, swatchY, m.swatch, m.swatch)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, swatchY + 0.5, m.swatch - 1, m.swatch - 1)

      const label = `${it.approximate ? '≈' : ''}${it.code} ×${it.count}`
      ctx.fillStyle = TEXT_COLOR
      const labelY = y + m.rowH / 2
      ctx.fillText(label, x + m.swatch + 4, labelY)
      x += m.swatch + 4 + ctx.measureText(label).width + m.itemGap
    }
    y += m.rowH
  }

  ctx.restore()
}

/** 拼豆导出的每格像素上限与单边上限。 */
export const MAX_BEADS_EXPORT_UNIT = 48
export const MAX_BEADS_EXPORT_SIDE = 4096

/**
 * 拼豆成品的导出密度：与屏幕缩放解耦，尽量用高密度出图；
 * 大点阵按单边 4096 回收，避免离屏 canvas 过大。
 */
export function beadsExportUnit(scene: Scene): number {
  const longest = Math.max(1, scene.size.w, scene.size.h)
  return Math.max(8, Math.min(MAX_BEADS_EXPORT_UNIT, Math.floor(MAX_BEADS_EXPORT_SIDE / longest)))
}

/** 取一个测量用的 2D 上下文（离屏，不进入文档）。 */
function measureContext(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持 canvas 2d')
  return ctx
}
