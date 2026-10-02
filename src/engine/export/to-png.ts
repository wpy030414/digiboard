/**
 * PNG 导出：三层合成到一张离屏 canvas → Blob。
 *
 * 合成顺序（与屏幕一致，按 layers 数组 z 从低到高）：
 *  1. 背景色（若 background 非 null）
 *  2. 像素层：逐层画到 W×H 临时 canvas 再放大合成（保留硬边颗粒）
 *  3. 矢量层：序列化为 SVG 文档 → Image → drawImage（栅格化，含发光/旋转/斜切）
 *
 * @param scene   场景
 * @param pixelSize 输出像素密度：每个点阵像素对应多少输出像素。默认 8，
 *                  即 80×60 点阵导出 640×480 png。矢量层随之等比栅格化。
 */

import type { DigitLayer, PixelLayer, Scene, WidgetLayer } from '../types'
import { hexToRgba } from '../render/PixelCanvas'
import { vectorLayerToSvgDoc, type WidgetSnapshot } from './vector-to-svg'

export interface ExportPngOptions {
  pixelSize?: number
  snapshots?: Map<string, WidgetSnapshot>
}

/** 把单个像素层画到一个 W×H 的 canvas（每个像素一格）。 */
function pixelLayerToCanvas(layer: PixelLayer): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = layer.w
  c.height = layer.h
  const ctx = c.getContext('2d')!
  const [r, g, b, a] = hexToRgba(layer.color)
  const img = ctx.createImageData(layer.w, layer.h)
  const data = img.data
  for (let i = 0; i < layer.pixels.length; i++) {
    if (layer.pixels[i]) {
      const o = i * 4
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      data[o + 3] = a
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
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
  const w = scene.size.w * pixelSize
  const h = scene.size.h * pixelSize

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // 1. 背景
  if (scene.background) {
    ctx.fillStyle = scene.background
    ctx.fillRect(0, 0, w, h)
  }

  // 2. 预栅格化所有可见矢量层（并行），按 layer.id 索引
  const vectorImgs = new Map<string, HTMLImageElement>()
  const vectorLayers = scene.layers.filter(
    (l): l is DigitLayer | WidgetLayer => l.visible && (l.type === 'digit' || l.type === 'widget'),
  )
  await Promise.all(
    vectorLayers.map(async (layer) => {
      const svg = vectorLayerToSvgDoc(layer, scene, pixelSize, opts.snapshots?.get(layer.id))
      vectorImgs.set(layer.id, await svgToImage(svg))
    }),
  )

  // 3. 按 z 顺序逐层合成
  for (const layer of scene.layers) {
    if (!layer.visible) continue
    if (layer.type === 'pixel') {
      const pc = pixelLayerToCanvas(layer)
      ctx.globalAlpha = layer.opacity
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(pc, 0, 0, layer.w, layer.h, 0, 0, w, h)
      ctx.globalAlpha = 1
    } else {
      const img = vectorImgs.get(layer.id)
      if (img) {
        ctx.globalAlpha = 1 // 矢量层 opacity 已烘进 SVG
        ctx.drawImage(img, 0, 0, w, h)
      }
    }
  }

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
