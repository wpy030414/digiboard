/**
 * PNG 导出：三层合成到一张离屏 canvas → Blob。
 *
 * 合成顺序（与屏幕一致，按 layers 数组 z 从低到高）：
 *  1. 固定黑色底（屏幕底色，与屏幕渲染一致）
 *  2. 像素层：逐格画圆角点阵（灭点 + 亮点），被矢量层占据的格子整块抠除
 *  3. 矢量层：序列化为 SVG 文档 → Image → drawImage（栅格化，含发光/斜切）
 *
 * @param scene   场景
 * @param pixelSize 输出像素密度：每个点阵像素对应多少输出像素。默认 8，
 *                  即 80×60 点阵导出 640×480 png。矢量层随之等比栅格化。
 */

import type { DigitLayer, Scene, WidgetLayer } from '../types'
import { SCREEN_BACKGROUND } from '../types'
import { BEAD_CODE_MIN_CELL, drawBeadsGuides, drawPixelDots } from '../dots'
import { computeReservedMask } from '../footprint'
import { loadPixelFontForExport, vectorLayerToSvgDoc, type WidgetSnapshot } from './vector-to-svg'
import { drawBeadsAnnotations, measureBeadsExport } from './beads-export'

export interface ExportPngOptions {
  pixelSize?: number
  snapshots?: Map<string, WidgetSnapshot>
  /** 拼豆模式：直角无缝隙像素 + 每格灰色参考线 + 5/10 格红色参考线。 */
  beads?: boolean
  /**
   * 拼豆模式下是否附带行列序号与图例（默认开启）。关闭时只导出画布本身，
   * 供需要纯图案的场合使用。
   */
  beadsAnnotations?: boolean
}

/** SVG 字符串 → HTMLImageElement（异步，onload 完成）。 */
function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('SVG 栅格化失败'))
    img.src = url
  })
}

/**
 * 合成整个场景到一张 canvas（不下载，返回 canvas 供测试/进一步处理）。
 *
 * 矢量层先并行栅格化为 image，再按 layers 原始顺序逐层 drawImage，
 * 确保「像素层夹在矢量层之间」时 z-order 仍正确。
 */
export async function renderSceneToCanvas(
  scene: Scene,
  opts: ExportPngOptions = {},
): Promise<HTMLCanvasElement> {
  const pixelSize = opts.pixelSize ?? 8
  const beads = opts.beads ?? false
  const boardW = scene.size.w * pixelSize
  const boardH = scene.size.h * pixelSize
  // 拼豆成品默认带行列序号与图例；其它模式保持整张画布即场景
  const annotate = beads && (opts.beadsAnnotations ?? true)
  const metrics = annotate ? measureBeadsExport(scene, pixelSize) : null
  const offset = metrics?.pad ?? 0

  const canvas = document.createElement('canvas')
  canvas.width = metrics?.width ?? boardW
  canvas.height = metrics?.height ?? boardH
  const ctx = canvas.getContext('2d')!

  // 1. 固定黑色底（含序号/图例留白）
  ctx.fillStyle = SCREEN_BACKGROUND
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // 2. 被可见矢量层占据的格子：像素层在这些格子上整块留空
  const reservedMask = computeReservedMask(scene.layers, scene.size.w, scene.size.h)

  // 3. 预栅格化所有可见矢量层（并行），按 layer.id 索引
  const vectorImgs = new Map<string, HTMLImageElement>()
  const vectorLayers = scene.layers.filter(
    (l): l is DigitLayer | WidgetLayer => l.visible && (l.type === 'digit' || l.type === 'widget'),
  )
  // 小组件是 DOM 渲染的像素字体：导出前把同一份 woff2 内嵌进 SVG
  if (vectorLayers.some((l) => l.type === 'widget')) await loadPixelFontForExport()
  await Promise.all(
    vectorLayers.map(async (layer) => {
      const svg = vectorLayerToSvgDoc(layer, scene, pixelSize, opts.snapshots?.get(layer.id))
      vectorImgs.set(layer.id, await svgToImage(svg))
    }),
  )

  // 4. 按 z 顺序逐层合成（拼豆版把画布区平移到留白内）
  ctx.save()
  ctx.translate(offset, offset)
  for (const layer of scene.layers) {
    if (!layer.visible) continue
    if (layer.type === 'pixel') {
      ctx.globalAlpha = layer.opacity
      drawPixelDots(ctx, layer, {
        unit: pixelSize,
        mask: reservedMask,
        beads,
        labelCodes: annotate && pixelSize >= BEAD_CODE_MIN_CELL,
      })
      ctx.globalAlpha = 1
    } else {
      const img = vectorImgs.get(layer.id)
      if (img) {
        ctx.globalAlpha = 1 // 矢量层 opacity 已烘进 SVG
        ctx.drawImage(img, 0, 0, boardW, boardH)
      }
    }
  }

  // 5. 拼豆参考线：每格灰色细线 + 每 5/10 格红色标识，叠在画布区最上层
  if (beads) drawBeadsGuides(ctx, scene.size.w, scene.size.h, pixelSize)
  ctx.restore()

  // 6. 行列序号与图例：画在留白区（不随画布平移）
  if (metrics) drawBeadsAnnotations(ctx, metrics)

  return canvas
}

/** 场景 → PNG Blob。 */
export async function sceneToPngBlob(scene: Scene, opts: ExportPngOptions = {}): Promise<Blob> {
  const canvas = await renderSceneToCanvas(scene, opts)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('PNG 编码失败'))
    }, 'image/png')
  })
}

/** 触发浏览器下载 PNG。 */
export async function downloadScenePng(
  scene: Scene,
  filename = 'digiboard.png',
  opts: ExportPngOptions = {},
): Promise<void> {
  const blob = await sceneToPngBlob(scene, opts)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 触发浏览器下载 YAML 文本。 */
export function downloadText(text: string, filename: string, mime = 'text/yaml'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
