/**
 * 主体蒙版：模型输出的低分辨率 alpha 图，以及基于它的构图计算。
 *
 * 蒙版坐标与源图坐标解耦：模型固定输出 320×320（源图被拉伸进去），
 * 这里按比例换算回源图坐标，既省内存，也避免为一亿像素的大图物化全分辨率蒙版。
 */

/** 前景置信度蒙版（0=背景，255=前景），len = width * height。 */
export interface Matte {
  width: number
  height: number
  data: Uint8Array
}

/** 源图裁切矩形（与 `coverCrop` 返回的形状一致）。 */
export interface SourceRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

/**
 * 主体包围盒（蒙版坐标）。全背景时返回 null。
 * 阈值取 128：低于它的软边不参与构图，避免光晕把 bbox 撑大。
 */
export function subjectBounds(
  matte: Matte,
  threshold = 128,
): { x0: number; y0: number; x1: number; y1: number } | null {
  if (matte.width <= 0 || matte.height <= 0) return null
  let x0 = matte.width
  let y0 = matte.height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < matte.height; y++) {
    for (let x = 0; x < matte.width; x++) {
      if ((matte.data[y * matte.width + x] ?? 0) < threshold) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < x0 || y1 < y0) return null
  return { x0, y0, x1, y1 }
}

/**
 * 按主体包围盒选裁切区域：
 *  - 留出 padding（比例）避免贴边；
 *  - 扩展到目标宽高比；
 *  - 夹在源图内，并保持宽高比。
 *
 * 蒙版坐标按 matte.width/srcW 的比例换算回源图坐标。
 */
export function cropRectForSubject(
  matte: Matte,
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  padding = 0.12,
  threshold = 128,
): SourceRect | null {
  if (srcW <= 0 || srcH <= 0 || targetW <= 0 || targetH <= 0) return null
  const bounds = subjectBounds(matte, threshold)
  if (!bounds) return null

  const scaleX = srcW / matte.width
  const scaleY = srcH / matte.height
  const bx0 = bounds.x0 * scaleX
  const by0 = bounds.y0 * scaleY
  const bx1 = (bounds.x1 + 1) * scaleX
  const by1 = (bounds.y1 + 1) * scaleY
  const cx = (bx0 + bx1) / 2
  const cy = (by0 + by1) / 2
  let cw = (bx1 - bx0) * (1 + 2 * padding)
  let ch = (by1 - by0) * (1 + 2 * padding)

  const aspect = targetW / targetH
  if (cw / ch > aspect) ch = cw / aspect
  else cw = ch * aspect

  // 不超过源图，再按目标宽高比回缩一次
  cw = Math.min(cw, srcW)
  ch = Math.min(ch, srcH)
  if (cw / ch > aspect) cw = ch * aspect
  else ch = cw / aspect

  const sx = Math.min(Math.max(0, cx - cw / 2), srcW - cw)
  const sy = Math.min(Math.max(0, cy - ch / 2), srcH - ch)
  return { sx, sy, sw: cw, sh: ch }
}

/** 蒙版 → 带 alpha 的画布，供 `destination-in` 合成使用。 */
export function matteToCanvas(matte: Matte): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = matte.width
  canvas.height = matte.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const image = ctx.createImageData(matte.width, matte.height)
  for (let i = 0; i < matte.data.length; i++) {
    image.data[i * 4 + 3] = matte.data[i] ?? 0
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}
