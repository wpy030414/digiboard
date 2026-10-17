/**
 * 图片 → 像素画：新建画布时「从图片生成」的核心。
 *
 * 流程：按 cover 裁切铺满目标点阵 → 缩略到 W×H（每格一个平均色）→
 * 色彩降级（默认最多 221 色）→ 对齐到拼豆色卡 → 输出调色板 + 像素值（0=灭，n=palette[n-1]）。
 *
 * 纯量化部分（`quantizeImageData` / `coverCrop`）与 canvas 解码解耦，可单测；
 * `imageFileToPixels` 依赖浏览器 canvas，由 E2E 覆盖。
 */

import type { PixelArtSource, SceneSize } from './types'
import { DEFAULT_PIXEL_COLOR } from './types'
import { MAX_BEAD_COLORS, nearestBeadColor } from './beads-palette'

/**
 * 默认色彩降级后的最大颜色数 = 拼豆色卡颜色数。
 * 像素值是 8 位：0 保留给灭点，1..221 对应调色板，故最多 221 种亮色
 * ——恰好是一套 MARD 221 色拼豆。
 */
export const DEFAULT_MAX_COLORS = MAX_BEAD_COLORS

/** 低于该 alpha 的格子视为「灭」（透明区域）。 */
export const ALPHA_THRESHOLD = 32

/** cover 裁切：取源图中间一块，使其宽高比等于目标宽高比。 */
export function coverCrop(
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return { sx: 0, sy: 0, sw: 0, sh: 0 }
  const srcAspect = sw / sh
  const dstAspect = dw / dh
  if (srcAspect > dstAspect) {
    // 源图更宽：裁掉左右
    const cropW = sh * dstAspect
    return { sx: (sw - cropW) / 2, sy: 0, sw: cropW, sh }
  }
  // 源图更高：裁掉上下
  const cropH = sw / dstAspect
  return { sx: 0, sy: (sh - cropH) / 2, sw, sh: cropH }
}

/**
 * 把 RGBA 像素数据降级为调色板索引画。
 *
 * 量化策略：4 bit/通道分桶（4096 桶）→ 取出现次数最多的 N 个桶 →
 * 桶内平均色吸附到最近的拼豆色卡颜色（去重）→ 每格映射到最近的调色板色。
 * 调色板因此只含真实可买到的拼豆色号；结果确定（同样输入必得同样调色板）。
 */
export function quantizeImageData(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  maxColors = DEFAULT_MAX_COLORS,
): PixelArtSource {
  const count = w * h
  const pixels = new Uint8Array(count)
  const limit = Math.max(1, Math.min(MAX_BEAD_COLORS, Math.floor(maxColors)))
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()

  for (let i = 0; i < count; i++) {
    const o = i * 4
    const a = data[o + 3] ?? 0
    if (a <= ALPHA_THRESHOLD) continue
    const r = data[o] ?? 0
    const g = data[o + 1] ?? 0
    const b = data[o + 2] ?? 0
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.n += 1
      bucket.r += r
      bucket.g += g
      bucket.b += b
    } else {
      buckets.set(key, { n: 1, r, g, b })
    }
  }

  if (buckets.size === 0) {
    return { palette: [nearestBeadColor(DEFAULT_PIXEL_COLOR).hex], pixels }
  }

  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n)
  // 吸附到拼豆色卡并按色号去重：多个桶可能落到同一颗豆，此时继续往后取，
  // 直到凑满 limit 个不同色号（避免调色板被重复色占位、白白少色）。
  const palette: string[] = []
  const rgb: Array<readonly [number, number, number]> = []
  const seen = new Set<string>()
  for (const b of sorted) {
    if (palette.length >= limit) break
    const bead = nearestBeadColor(rgbToHex(b.r / b.n, b.g / b.n, b.b / b.n))
    if (seen.has(bead.hex)) continue
    seen.add(bead.hex)
    palette.push(bead.hex)
    rgb.push(hexToRgb(bead.hex))
  }

  for (let i = 0; i < count; i++) {
    const o = i * 4
    const a = data[o + 3] ?? 0
    if (a <= ALPHA_THRESHOLD) continue
    const r = data[o] ?? 0
    const g = data[o + 1] ?? 0
    const b = data[o + 2] ?? 0
    let best = 0
    let bestDist = Infinity
    for (let p = 0; p < rgb.length; p++) {
      const [pr, pg, pb] = rgb[p]!
      const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
      if (d < bestDist) {
        bestDist = d
        best = p
      }
    }
    pixels[i] = best + 1
  }

  return { palette, pixels }
}

/** 图片文件 → 目标尺寸的像素画（cover 裁切 + 色彩降级）。 */
export async function imageFileToPixels(
  file: File,
  size: SceneSize,
  maxColors = DEFAULT_MAX_COLORS,
): Promise<PixelArtSource> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = size.w
    canvas.height = size.h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前浏览器不支持 canvas 2d')
    const crop = coverCrop(bitmap.width, bitmap.height, size.w, size.h)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size.w, size.h)
    const data = ctx.getImageData(0, 0, size.w, size.h).data
    return quantizeImageData(data, size.w, size.h, maxColors)
  } finally {
    bitmap.close?.()
  }
}

/** `#rrggbb` → [r,g,b]（拼豆色卡保证格式合法）。 */
function hexToRgb(hex: string): readonly [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  const hex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}
