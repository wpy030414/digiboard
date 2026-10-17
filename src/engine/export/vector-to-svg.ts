/**
 * 矢量层 → SVG 字符串序列化器（用于 PNG 导出）。
 *
 * 屏幕渲染用 React SVG 组件（DigitLayerView），导出 PNG 时需要把同样的
 * 几何序列化成独立 SVG 文档字符串，再经 Image 栅格化后合成进 canvas。
 * 两者复用 digits.ts 的几何与 transform.ts 的矩阵，保证「所见即所得」。
 */

import type { DigitLayer, Scene, WidgetLayer } from '../types'
import { SEGMENTS, buildDigitGeometry, layoutText } from '../digits'
import { layerToScene, matrixToSvg } from '../transform'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}

/** 数码管层 → SVG `<g>` 片段（场景坐标系，含旋转/斜切/发光）。 */
export function digitLayerToSvg(layer: DigitLayer, scale: number): string {
  const geo = buildDigitGeometry(
    layer.digitHeight,
    layer.aspect,
    layer.thicknessRatio,
    layer.segmentStyle,
  )
  const { cells, totalWidth } = layoutText(
    layer.text,
    layer.digitHeight,
    layer.aspect,
    layer.thicknessRatio,
    layer.gapRatio,
  )
  const localW = Math.max(totalWidth, layer.digitHeight * layer.aspect)
  const m = layerToScene({
    x: layer.x,
    y: layer.y,
    width: localW,
    height: layer.digitHeight,
    skewX: layer.skewX,
    skewY: layer.skewY,
  })

  const filterId = `glow-${layer.id}`
  const glowStd = Math.max(0.0001, layer.glow * layer.digitHeight * 0.18)
  const filterDef =
    layer.glow > 0
      ? `<filter id="${filterId}" x="-80%" y="-80%" width="260%" height="260%">` +
        `<feGaussianBlur stdDeviation="${round(glowStd)}" result="blur"/>` +
        `<feFlood flood-color="${esc(layer.glowColor)}" flood-opacity="${Math.min(1, layer.glow)}"/>` +
        `<feComposite in2="blur" operator="in" result="gc"/>` +
        `<feMerge><feMergeNode in="gc"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
      : ''

  let content = ''
  for (const cell of cells) {
    const tx = round(cell.offsetX)
    if (cell.isDecimal) {
      content += `<g transform="translate(${tx} 0)"><path d="${geo.decimalPath}" fill="${esc(layer.color)}"/></g>`
      continue
    }
    let g = `<g transform="translate(${tx} 0)">`
    if (layer.showOffSegments) {
      for (const id of SEGMENTS) g += `<path d="${geo.paths[id]}" fill="${esc(layer.offColor)}"/>`
    }
    for (const id of cell.litSegments)
      g += `<path d="${geo.paths[id]}" fill="${esc(layer.color)}"/>`
    g += `</g>`
    content += g
  }

  const filterAttr = layer.glow > 0 ? ` filter="url(#${filterId})"` : ''
  return (
    `<defs>${filterDef}</defs>` +
    `<g transform="scale(${scale})">` +
    `<g transform="${matrixToSvg(m)}" opacity="${layer.opacity}"${filterAttr}>` +
    content +
    `</g></g>`
  )
}

/** 小组件层 → SVG `<g>` 片段。Claude 会话状态导出为一张信息卡（快照）。 */
export function widgetLayerToSvg(
  layer: WidgetLayer,
  scale: number,
  snapshot?: WidgetSnapshot,
): string {
  const m = layerToScene({
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    skewX: 0,
    skewY: 0,
  })
  const w = layer.width * scale
  const h = layer.height * scale
  const pad = Math.max(4, h * 0.08)
  const fs = Math.max(8, h * 0.16)

  const lines: string[] = []
  if (layer.widgetKind === 'claude-status' && snapshot) {
    lines.push(`Claude · ${snapshot.status ?? 'idle'}`)
    if (snapshot.name) lines.push(snapshot.name)
    if (snapshot.model) lines.push(snapshot.model)
    if (snapshot.cwd) lines.push(shorten(snapshot.cwd))
    if (snapshot.tokens != null) lines.push(`${snapshot.tokens} tok`)
  } else {
    lines.push(`widget: ${layer.widgetKind}`)
  }

  const textSvg = lines
    .slice(0, 6)
    .map(
      (line, i) =>
        `<text x="${round(pad)}" y="${round(pad + fs * (i + 0.8))}" font-family="monospace" font-size="${round(fs)}" fill="${esc(layer.color)}">${esc(line)}</text>`,
    )
    .join('')

  return (
    `<g transform="${matrixToSvg(m)}" opacity="${layer.opacity}">` +
    `<rect x="0" y="0" width="${round(w)}" height="${round(h)}" rx="${round(fs * 0.4)}" fill="#00000066" stroke="${esc(layer.color)}" stroke-width="1"/>` +
    textSvg +
    `</g>`
  )
}

/** 小组件导出快照（阶段 5 由 Claude 状态 hook 提供）。 */
export interface WidgetSnapshot {
  status?: string
  name?: string
  model?: string
  cwd?: string
  tokens?: number
}

function shorten(cwd: string): string {
  const parts = cwd.split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : cwd
}

/** 整个场景的所有矢量层 → 单个 SVG 文档字符串（场景坐标系 × scale）。 */
export function sceneVectorToSvg(
  scene: Scene,
  scale: number,
  snapshots?: Map<string, WidgetSnapshot>,
): string {
  const w = scene.size.w * scale
  const h = scene.size.h * scale
  let body = ''
  for (const layer of scene.layers) {
    if (!layer.visible) continue
    if (layer.type === 'digit') body += digitLayerToSvg(layer, scale)
    else if (layer.type === 'widget')
      body += widgetLayerToSvg(layer, scale, snapshots?.get(layer.id))
  }
  return svgDoc(body, w, h)
}

/** 单个矢量层 → 完整 SVG 文档（用于逐层栅格化，保证 z-order 正确）。 */
export function vectorLayerToSvgDoc(
  layer: DigitLayer | WidgetLayer,
  scene: Scene,
  scale: number,
  snapshot?: WidgetSnapshot,
): string {
  const w = scene.size.w * scale
  const h = scene.size.h * scale
  const body =
    layer.type === 'digit'
      ? digitLayerToSvg(layer, scale)
      : widgetLayerToSvg(layer, scale, snapshot)
  return svgDoc(body, w, h)
}

function svgDoc(body: string, w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
}
