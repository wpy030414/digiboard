/**
 * 图片 → 像素画：新建画布时「从图片生成」的核心。
 *
 * 为什么不是「缩略图 + 取平均」：轮廓穿过的格子会被平均成源图里不存在的
 * 中间色，于是轮廓变成 2–3 格宽的渐变带。像素画要对每个格子做决策，而不是
 * 求均值。流程：
 *
 *   1. cover 裁切 → 4× 中间分辨率（每格保留约 16 个原始样本）；
 *   2. Kuwahara 预滤波：压平纹理、保留硬边（传统版的「卡通化」）；
 *   3. 逐格代表色：低方差取 Oklab 均值；高方差（真边缘）取双簇主导色，
 *      避免把轮廓两侧混成第三种颜色；
 *   4. 网格级双边滤波：抹掉量化噪点、保留色差大的轮廓；
 *   5. Oklab k-means（k-means++ 固定种子）→ 吸附 MARD 221 色卡并去重；
 *   6. ICM 空间清理：孤立格并入邻域主色，跨强边不合并；
 *   7. 可选 L 通道非锐化，找回被平均掉的局部对比。
 *
 * 纯量化部分与 canvas 解耦（`quantizeImageData` / `kuwahara` / `coverCrop`），
 * 可单测；`imageFileToPixels` 依赖浏览器 canvas，由 E2E 覆盖。
 */

import type { PixelArtSource, SceneSize } from './types'
import { DEFAULT_PIXEL_COLOR } from './types'
import { BEAD_COLORS, MAX_BEAD_COLORS, nearestBeadColor } from './beads-palette'
import { hexToOklab, oklabDistance2, oklabMean, rgbToOklab, type Oklab } from './oklab'
import { cropRectForSubject, matteToCanvas, type Matte } from './matting'

/**
 * 默认色彩降级后的最大颜色数 = 拼豆色卡颜色数。
 * 像素值是 8 位：0 保留给灭点，1..221 对应调色板，故最多 221 种亮色。
 * 注意：这是「上限」，实际默认色数由 `autoColorCount` 按格子数自适应。
 */
export const DEFAULT_MAX_COLORS = MAX_BEAD_COLORS

/** 低于该 alpha 的格子视为「灭」（透明区域）。 */
export const ALPHA_THRESHOLD = 32

/** 中间分辨率相对目标格子的倍率。 */
const SUPERSAMPLE = 4

/** 中间分辨率的边上限：200×200 的板子也只需要 800×800。 */
const MAX_INTERMEDIATE = 800

/** 自动色数的上下限：太少会丢结构，太多会变成噪点拼贴。 */
const AUTO_COLORS_MIN = 8
const AUTO_COLORS_MAX = 32

/** 边缘判定：格子内样本方差超过它才认为「有真边缘」。 */
const EDGE_VARIANCE = 0.0025
/** 双簇中心距离超过它才算真边缘（Oklab 距离）。 */
const EDGE_SEPARATION = 0.07
/** 小簇占比低于它视为零星噪点，不触发主导色。 */
const EDGE_MINORITY = 0.12

/** 空间清理的平滑强度与边缘尺度（Oklab 平方距离）。 */
const SMOOTH_LAMBDA = 0.0012
const SMOOTH_EDGE_SCALE = 0.004

/** 一格内至少这么多比例的样本属于前景，才保留该格（抠图后的背景写灭点）。 */
const CELL_COVERAGE = 0.25

export type ColorCount = number | 'auto'

export interface ImageToPixelsOptions {
  /** 目标色数；'auto' 按格子数自适应（8–32）。 */
  colors?: ColorCount
  /** Kuwahara 预滤波半径（0 = 关闭）。 */
  smooth?: number
  /** L 通道锐化强度（0 = 关闭）。 */
  sharpen?: number
  /** 双边滤波 + ICM 空间清理。 */
  cleanup?: boolean
  /** 主体蒙版；提供时按主体裁切，并把背景写为灭点。 */
  matte?: Matte | null
}

export const DEFAULT_IMAGE_OPTIONS: Required<ImageToPixelsOptions> = {
  colors: 'auto',
  smooth: 3,
  sharpen: 0.3,
  cleanup: true,
  matte: null,
}

/** 按格子数自适应色数：格子越多，允许的色数越多，但有上下限。 */
export function autoColorCount(cells: number): number {
  const raw = Math.round(Math.sqrt(Math.max(1, cells)) * 0.6)
  return Math.min(AUTO_COLORS_MAX, Math.max(AUTO_COLORS_MIN, raw))
}

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
 * Kuwahara 滤波：每个像素取四象限中方差最小的那个均值。
 *
 * 效果是「压平纹理但保留硬边」——照片转像素画前最便宜的卡通化替代，
 * 几十毫秒、零依赖。用积分图做矩形求和，复杂度与半径无关。
 *
 * 只处理 RGB，alpha 原样保留；返回新的缓冲区。
 */
export function kuwahara(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
): Uint8ClampedArray {
  const r = Math.max(1, Math.floor(radius))
  if (w < 3 || h < 3) return data
  const stride = w + 1
  const size = stride * (h + 1)
  const sR = new Float32Array(size)
  const sG = new Float32Array(size)
  const sB = new Float32Array(size)
  const qR = new Float32Array(size)
  const qG = new Float32Array(size)
  const qB = new Float32Array(size)

  // 归一化到 [0,1]，Float32 积分图在 800² 内的精度足够比较方差
  for (let y = 1; y <= h; y++) {
    let r1 = 0
    let g1 = 0
    let b1 = 0
    let r2 = 0
    let g2 = 0
    let b2 = 0
    for (let x = 1; x <= w; x++) {
      const o = ((y - 1) * w + (x - 1)) * 4
      const cr = (data[o] ?? 0) / 255
      const cg = (data[o + 1] ?? 0) / 255
      const cb = (data[o + 2] ?? 0) / 255
      r1 += cr
      g1 += cg
      b1 += cb
      r2 += cr * cr
      g2 += cg * cg
      b2 += cb * cb
      const i = y * stride + x
      const up = i - stride
      sR[i] = sR[up]! + r1
      sG[i] = sG[up]! + g1
      sB[i] = sB[up]! + b1
      qR[i] = qR[up]! + r2
      qG[i] = qG[up]! + g2
      qB[i] = qB[up]! + b2
    }
  }

  const rect = (arr: Float32Array, x0: number, y0: number, x1: number, y1: number): number =>
    arr[y1 * stride + x1]! -
    arr[y0 * stride + x1]! -
    arr[y1 * stride + x0]! +
    arr[y0 * stride + x0]!

  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let bestVar = Infinity
      let br = 0
      let bg = 0
      let bb = 0
      for (let q = 0; q < 4; q++) {
        const x0 = Math.max(0, q % 2 === 0 ? x - r : x + 1)
        const x1 = Math.min(w, q % 2 === 0 ? x + 1 : x + r + 1)
        const y0 = Math.max(0, q < 2 ? y - r : y + 1)
        const y1 = Math.min(h, q < 2 ? y + 1 : y + r + 1)
        const n = (x1 - x0) * (y1 - y0)
        if (n <= 0) continue
        const mR = rect(sR, x0, y0, x1, y1) / n
        const mG = rect(sG, x0, y0, x1, y1) / n
        const mB = rect(sB, x0, y0, x1, y1) / n
        const v =
          rect(qR, x0, y0, x1, y1) / n -
          mR * mR +
          (rect(qG, x0, y0, x1, y1) / n - mG * mG) +
          (rect(qB, x0, y0, x1, y1) / n - mB * mB)
        if (v < bestVar) {
          bestVar = v
          br = mR
          bg = mG
          bb = mB
        }
      }
      const o = (y * w + x) * 4
      out[o] = br * 255
      out[o + 1] = bg * 255
      out[o + 2] = bb * 255
      out[o + 3] = data[o + 3] ?? 0
    }
  }
  return out
}

/**
 * 把 RGBA 像素降级为调色板索引画。
 *
 * 输入已经是「一格一像素」的尺寸时（例如单测或旧调用方），每个像素即一个
 * 格子；不走 Kuwahara 与超采样，但仍使用感知调色板与空间清理。
 */
export function quantizeImageData(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  maxColors = DEFAULT_MAX_COLORS,
): PixelArtSource {
  const reps: Array<Oklab | null> = Array.from({ length: w * h }, () => null)
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    if ((data[o + 3] ?? 0) <= ALPHA_THRESHOLD) {
      reps[i] = null
      continue
    }
    reps[i] = rgbToOklab(data[o] ?? 0, data[o + 1] ?? 0, data[o + 2] ?? 0)
  }
  return finalize(reps, w, h, {
    ...DEFAULT_IMAGE_OPTIONS,
    colors: maxColors,
    smooth: 0,
    sharpen: 0,
  })
}

/** 图片文件 → 目标尺寸的像素画（cover 裁切 + 结构保持型量化）。 */
export async function imageFileToPixels(
  file: File,
  size: SceneSize,
  options: number | ImageToPixelsOptions = DEFAULT_IMAGE_OPTIONS,
): Promise<PixelArtSource> {
  const opts = normalizeOptions(options)
  const bitmap = await createImageBitmap(file)
  try {
    const subjectCrop = opts.matte
      ? cropRectForSubject(opts.matte, bitmap.width, bitmap.height, size.w, size.h)
      : null
    const crop = subjectCrop ?? coverCrop(bitmap.width, bitmap.height, size.w, size.h)
    const scale = Math.max(
      1,
      Math.min(SUPERSAMPLE, Math.floor(MAX_INTERMEDIATE / Math.max(size.w, size.h))),
    )
    const iw = size.w * scale
    const ih = size.h * scale
    const canvas = document.createElement('canvas')
    canvas.width = iw
    canvas.height = ih
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('当前浏览器不支持 canvas 2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, iw, ih)
    if (opts.matte) {
      applyMatte(ctx, opts.matte, bitmap.width, bitmap.height, crop, iw, ih)
    }
    const raw = ctx.getImageData(0, 0, iw, ih).data
    const filtered = opts.smooth > 0 ? kuwahara(raw, iw, ih, opts.smooth) : raw
    const reps = sampleCells(filtered, iw, ih, size.w, size.h)
    return finalize(reps, size.w, size.h, opts)
  } finally {
    bitmap.close?.()
  }
}

/** 把主体蒙版按裁切区域画进中间画布，背景变透明。 */
function applyMatte(
  ctx: CanvasRenderingContext2D,
  matte: Matte,
  srcW: number,
  srcH: number,
  crop: { sx: number; sy: number; sw: number; sh: number },
  iw: number,
  ih: number,
): void {
  const matteCanvas = matteToCanvas(matte)
  ctx.save()
  ctx.globalCompositeOperation = 'destination-in'
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    matteCanvas,
    (crop.sx / srcW) * matte.width,
    (crop.sy / srcH) * matte.height,
    (crop.sw / srcW) * matte.width,
    (crop.sh / srcH) * matte.height,
    0,
    0,
    iw,
    ih,
  )
  ctx.restore()
}

function normalizeOptions(options: number | ImageToPixelsOptions): Required<ImageToPixelsOptions> {
  if (typeof options === 'number') {
    return { ...DEFAULT_IMAGE_OPTIONS, colors: options }
  }
  return {
    colors: options.colors ?? DEFAULT_IMAGE_OPTIONS.colors,
    smooth: options.smooth ?? DEFAULT_IMAGE_OPTIONS.smooth,
    sharpen: options.sharpen ?? DEFAULT_IMAGE_OPTIONS.sharpen,
    cleanup: options.cleanup ?? DEFAULT_IMAGE_OPTIONS.cleanup,
    matte: options.matte ?? null,
  }
}

/** 从中间分辨率采样出每格代表色。 */
function sampleCells(
  data: Uint8ClampedArray,
  iw: number,
  ih: number,
  w: number,
  h: number,
): Array<Oklab | null> {
  const reps: Array<Oklab | null> = Array.from({ length: w * h }, () => null)
  for (let cy = 0; cy < h; cy++) {
    const y0 = Math.floor((cy * ih) / h)
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * ih) / h))
    for (let cx = 0; cx < w; cx++) {
      const x0 = Math.floor((cx * iw) / w)
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * iw) / w))
      const samples: Oklab[] = []
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * iw + x) * 4
          if ((data[o + 3] ?? 0) <= ALPHA_THRESHOLD) continue
          samples.push(rgbToOklab(data[o] ?? 0, data[o + 1] ?? 0, data[o + 2] ?? 0))
        }
      }
      const total = (y1 - y0) * (x1 - x0)
      reps[cy * w + cx] =
        total > 0 && samples.length / total >= CELL_COVERAGE ? representativeColor(samples) : null
    }
  }
  return reps
}

/**
 * 单格代表色。低方差取均值；高方差（真边缘）取双簇主导簇质心。
 * 这一步是「轮廓不被混色」的关键。
 */
export function representativeColor(samples: Oklab[]): Oklab {
  const mean = oklabMean(samples)
  if (samples.length < 4) return mean
  let variance = 0
  for (const s of samples) variance += oklabDistance2(s, mean)
  variance /= samples.length
  if (variance < EDGE_VARIANCE) return mean

  // 2-means：初值取均值与最远样本
  let far = samples[0]!
  let farDist = -1
  for (const s of samples) {
    const d = oklabDistance2(s, mean)
    if (d > farDist) {
      farDist = d
      far = s
    }
  }
  let c0 = mean
  let c1 = far
  let w0 = 0
  let w1 = 0
  for (let iter = 0; iter < 4; iter++) {
    let l0 = 0
    let a0 = 0
    let b0 = 0
    let l1 = 0
    let a1 = 0
    let b1 = 0
    w0 = 0
    w1 = 0
    for (const s of samples) {
      if (oklabDistance2(s, c0) <= oklabDistance2(s, c1)) {
        w0++
        l0 += s[0]
        a0 += s[1]
        b0 += s[2]
      } else {
        w1++
        l1 += s[0]
        a1 += s[1]
        b1 += s[2]
      }
    }
    if (w0 > 0) c0 = [l0 / w0, a0 / w0, b0 / w0]
    if (w1 > 0) c1 = [l1 / w1, a1 / w1, b1 / w1]
  }
  const separation = Math.sqrt(oklabDistance2(c0, c1))
  const minority = Math.min(w0, w1) / samples.length
  if (separation > EDGE_SEPARATION && minority >= EDGE_MINORITY) {
    return w0 >= w1 ? c0 : c1
  }
  return mean
}

/** 网格级双边滤波：抹掉量化噪点，但保留色差大的轮廓。 */
function bilateral(
  reps: Array<Oklab | null>,
  w: number,
  h: number,
  sigmaS = 1.3,
  sigmaC = 0.045,
  radius = 2,
): Array<Oklab | null> {
  const out: Array<Oklab | null> = Array.from({ length: reps.length }, () => null)
  const invS = 1 / (2 * sigmaS * sigmaS * radius * radius)
  const invC = 1 / (2 * sigmaC * sigmaC)
  for (let i = 0; i < reps.length; i++) {
    const rep = reps[i]
    if (!rep) {
      out[i] = null
      continue
    }
    const x = i % w
    const y = (i / w) | 0
    let L = 0
    let A = 0
    let B = 0
    let W = 0
    for (let dy = -radius; dy <= radius; dy++) {
      const yy = y + dy
      if (yy < 0 || yy >= h) continue
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = x + dx
        if (xx < 0 || xx >= w) continue
        const q = reps[yy * w + xx]
        if (!q) continue
        const ws = Math.exp(-(dx * dx + dy * dy) * invS)
        const wc = Math.exp(-oklabDistance2(rep, q) * invC)
        const weight = ws * wc
        L += q[0] * weight
        A += q[1] * weight
        B += q[2] * weight
        W += weight
      }
    }
    out[i] = W > 0 ? [L / W, A / W, B / W] : rep
  }
  return out
}

/** L 通道非锐化掩膜：找回被平均掉的局部对比。 */
function unsharp(
  reps: Array<Oklab | null>,
  w: number,
  h: number,
  amount: number,
): Array<Oklab | null> {
  return reps.map((rep, i) => {
    if (!rep) return null
    const x = i % w
    const y = (i / w) | 0
    let L = 0
    let A = 0
    let B = 0
    let n = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
        const q = reps[yy * w + xx]
        if (!q) continue
        L += q[0]
        A += q[1]
        B += q[2]
        n++
      }
    }
    if (n === 0) return rep
    const L2 = Math.max(0, Math.min(1, rep[0] + amount * (rep[0] - L / n)))
    const A2 = rep[1] + amount * 0.4 * (rep[1] - A / n)
    const B2 = rep[2] + amount * 0.4 * (rep[2] - B / n)
    return [L2, A2, B2] as Oklab
  })
}

/** 色卡颜色的 Oklab 预计算（模块级缓存）。 */
const BEAD_LABS = BEAD_COLORS.map((c) => ({ hex: c.hex, lab: hexToOklab(c.hex) }))

function nearestBeadOklab(lab: Oklab): string {
  let best = BEAD_LABS[0]!
  let bestDist = Infinity
  for (const bead of BEAD_LABS) {
    const d = oklabDistance2(lab, bead.lab)
    if (d < bestDist) {
      bestDist = d
      best = bead
    }
  }
  return best.hex
}

/** 确定性 PRNG（LCG）：k-means++ 的初始化必须可复现。 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Oklab 加权 k-means（k-means++ 初始化），返回吸附到色卡后的调色板。 */
function buildPalette(
  reps: Array<Oklab | null>,
  maxColors: number,
): { palette: string[]; labs: Oklab[] } {
  const points: Oklab[] = []
  for (const rep of reps) if (rep) points.push(rep)
  if (points.length === 0) return { palette: [], labs: [] }

  const k = Math.min(Math.max(1, Math.floor(maxColors)), points.length)
  const rng = makeRng(0x9e3779b9)
  const centers: Oklab[] = [points[Math.floor(rng() * points.length)]!]
  const nearest = new Float64Array(points.length).fill(Infinity)
  while (centers.length < k) {
    const last = centers[centers.length - 1]!
    let sum = 0
    for (let i = 0; i < points.length; i++) {
      const d = oklabDistance2(points[i]!, last)
      if (d < nearest[i]!) nearest[i] = d
      sum += nearest[i]!
    }
    let target = rng() * sum
    let pick = 0
    if (sum > 0) {
      for (let i = 0; i < points.length; i++) {
        target -= nearest[i]!
        if (target <= 0) {
          pick = i
          break
        }
      }
    }
    centers.push([points[pick]![0], points[pick]![1], points[pick]![2]])
  }

  for (let iter = 0; iter < 12; iter++) {
    const acc = centers.map(() => [0, 0, 0, 0])
    for (const p of points) {
      let best = 0
      let bestDist = Infinity
      for (let c = 0; c < centers.length; c++) {
        const d = oklabDistance2(p, centers[c]!)
        if (d < bestDist) {
          bestDist = d
          best = c
        }
      }
      const a = acc[best]!
      a[0] = a[0]! + p[0]
      a[1] = a[1]! + p[1]
      a[2] = a[2]! + p[2]
      a[3] = a[3]! + 1
    }
    let moved = 0
    for (let c = 0; c < centers.length; c++) {
      const a = acc[c]!
      if (a[3]! === 0) continue
      const next: Oklab = [a[0]! / a[3]!, a[1]! / a[3]!, a[2]! / a[3]!]
      moved += oklabDistance2(next, centers[c]!)
      centers[c] = next
    }
    if (moved < 1e-9) break
  }

  const palette: string[] = []
  const labs: Oklab[] = []
  const seen = new Set<string>()
  for (const c of centers) {
    const hex = nearestBeadOklab(c)
    if (seen.has(hex)) continue
    seen.add(hex)
    palette.push(hex)
    labs.push(hexToOklab(hex))
  }
  return { palette, labs }
}

function assignLabels(reps: Array<Oklab | null>, labs: Oklab[]): Int32Array {
  const labels = new Int32Array(reps.length).fill(-1)
  if (labs.length === 0) return labels
  for (let i = 0; i < reps.length; i++) {
    const rep = reps[i]
    if (!rep) continue
    let best = 0
    let bestDist = Infinity
    for (let p = 0; p < labs.length; p++) {
      const d = oklabDistance2(rep, labs[p]!)
      if (d < bestDist) {
        bestDist = d
        best = p
      }
    }
    labels[i] = best
  }
  return labels
}

/**
 * ICM 空间清理：按「数据项 + 边感知平滑项」重新选标签。
 *
 * 数据项 = 与源格代表色的 Oklab 距离；平滑项只在邻域颜色接近时生效，
 * 因此跨真实轮廓不会把两块颜色合并掉。做两轮即可收敛，确定性。
 */
function spatialCleanup(
  labels: Int32Array,
  reps: Array<Oklab | null>,
  labs: Oklab[],
  w: number,
  h: number,
): void {
  if (labs.length <= 1) return
  for (let pass = 0; pass < 2; pass++) {
    let changed = 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const rep = reps[i]
        if (!rep) continue
        const current = labels[i]!
        if (current < 0) continue
        const candidates = new Set<number>([current])
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= h) continue
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            if (xx < 0 || xx >= w) continue
            const l = labels[yy * w + xx]!
            if (l >= 0) candidates.add(l)
          }
        }
        let bestLabel = current
        let bestCost = Infinity
        for (const label of candidates) {
          let cost = oklabDistance2(rep, labs[label]!)
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy
            if (yy < 0 || yy >= h) continue
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx
              if (xx < 0 || xx >= w) continue
              if (dx === 0 && dy === 0) continue
              const j = yy * w + xx
              if (labels[j] === label) continue
              const neighbor = reps[j]
              const edge = neighbor ? oklabDistance2(rep, neighbor) : 1
              cost += SMOOTH_LAMBDA / (1 + edge / SMOOTH_EDGE_SCALE)
            }
          }
          if (cost < bestCost) {
            bestCost = cost
            bestLabel = label
          }
        }
        if (bestLabel !== current) {
          labels[i] = bestLabel
          changed++
        }
      }
    }
    if (changed === 0) break
  }
}

function finalize(
  reps: Array<Oklab | null>,
  w: number,
  h: number,
  opts: Required<ImageToPixelsOptions>,
): PixelArtSource {
  let work = reps
  if (opts.cleanup) work = bilateral(work, w, h)
  if (opts.sharpen > 0) work = unsharp(work, w, h, opts.sharpen)

  const colors =
    opts.colors === 'auto'
      ? autoColorCount(w * h)
      : Math.min(MAX_BEAD_COLORS, Math.max(1, Math.floor(opts.colors)))
  const { palette, labs } = buildPalette(work, colors)
  const labels = assignLabels(work, labs)
  if (opts.cleanup) spatialCleanup(labels, work, labs, w, h)

  const pixels = new Uint8Array(w * h)
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]!
    if (label >= 0) pixels[i] = label + 1
  }
  if (palette.length === 0) {
    return { palette: [nearestBeadColor(DEFAULT_PIXEL_COLOR).hex], pixels }
  }
  return { palette, pixels }
}
