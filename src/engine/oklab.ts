/**
 * Oklab 感知色彩空间。
 *
 * 为什么不用 sRGB 欧氏距离：人眼对暗部和饱和色的感知不均匀，直接在 sRGB 里
 * 算最近色会让肤色、暗部分辨不开（图片转像素时最明显）。Oklab 是感知均匀的，
 * 距离近似人眼差异，且比 CIEDE2000 便宜一个数量级——调色板吸附与 k-means
 * 都跑在这个空间里。
 *
 * 约定：`Oklab` 三元组为 [L, a, b]，L ∈ [0,1]，a/b 约在 [-0.4,0.4]。
 */

export type Oklab = readonly [number, number, number]

const SRGB_TO_LINEAR = (c: number): number => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** `#rrggbb` → [r,g,b]（0–255）。 */
export function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

/** sRGB（0–255）→ Oklab。 */
export function rgbToOklab(r: number, g: number, b: number): Oklab {
  const lr = SRGB_TO_LINEAR(r)
  const lg = SRGB_TO_LINEAR(g)
  const lb = SRGB_TO_LINEAR(b)
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ]
}

/** `#rrggbb` → Oklab。 */
export function hexToOklab(hex: string): Oklab {
  const [r, g, b] = hexToRgb(hex)
  return rgbToOklab(r, g, b)
}

/** Oklab 距离的平方（省一次开方，排序/比较足够）。 */
export function oklabDistance2(a: Oklab, b: Oklab): number {
  const dL = a[0] - b[0]
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return dL * dL + da * da + db * db
}

/** 加权平均（用于格子代表色；权重缺省为 1）。 */
export function oklabMean(points: readonly Oklab[], weights?: readonly number[]): Oklab {
  let L = 0
  let A = 0
  let B = 0
  let W = 0
  for (let i = 0; i < points.length; i++) {
    const w = weights?.[i] ?? 1
    const p = points[i]!
    L += p[0] * w
    A += p[1] * w
    B += p[2] * w
    W += w
  }
  if (W <= 0) return [0, 0, 0]
  return [L / W, A / W, B / W]
}
