/**
 * 矢量层变换数学。
 *
 * 数码管是浮点层、小组件已吸附整数网格；渲染与拾取都需要
 * 在「场景坐标」与「图层局部坐标」之间来回变换。
 *
 * 变换顺序（与 CSS/SVG transform 语义一致，从右往左应用）：
 *   translate(x, y) · translate(cx, cy) · rotate(θ) · skew(kx, ky) · translate(-cx, -cy) · scale
 * 即：先绕图层中心旋转与斜切，再整体平移到锚点。
 */

export interface Vec2 {
  x: number
  y: number
}

/** 3×3 仿射矩阵，行主序 [a c e; b d f; 0 0 1]。 */
export type Matrix = [number, number, number, number, number, number]

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

export function multiply(m: Matrix, n: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m
  const [a2, b2, c2, d2, e2, f2] = n
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ]
}

export function translate(tx: number, ty: number): Matrix {
  return [1, 0, 0, 1, tx, ty]
}

export function rotate(deg: number): Matrix {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [c, s, -s, c, 0, 0]
}

/** skewX/skewY 角度（度）。 */
export function skew(kx: number, ky: number): Matrix {
  const tx = Math.tan((kx * Math.PI) / 180)
  const ty = Math.tan((ky * Math.PI) / 180)
  return [1, ty, tx, 1, 0, 0]
}

export function scale(sx: number, sy: number): Matrix {
  return [sx, 0, 0, sy, 0, 0]
}

/** 应用矩阵到点。 */
export function apply(m: Matrix, p: Vec2): Vec2 {
  const [a, b, c, d, e, f] = m
  return { x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f }
}

/** 求逆矩阵（仿射可逆时）；退化返回 null。 */
export function invert(m: Matrix): Matrix | null {
  const [a, b, c, d, e, f] = m
  const det = a * d - b * c
  if (Math.abs(det) < 1e-9) return null
  const ia = d / det
  const ib = -b / det
  const ic = -c / det
  const id = a / det
  const ie = (c * f - d * e) / det
  const if_ = (b * e - a * f) / det
  return [ia, ib, ic, id, ie, if_]
}

export interface VectorLayerTransform {
  x: number
  y: number
  width: number
  height: number
  /** 旋转角度（度）。数码管/小组件已取消旋转，图层变换恒省略此字段。 */
  rotation?: number
  skewX: number
  skewY: number
}

/**
 * 构建矢量层「局部 → 场景」的正向变换矩阵。
 * 局部坐标以图层包围盒左上角为原点、宽高为 width×height。
 */
export function layerToScene(t: VectorLayerTransform): Matrix {
  const cx = t.width / 2
  const cy = t.height / 2
  let m = translate(t.x, t.y)
  m = multiply(m, translate(cx, cy))
  if (t.rotation) m = multiply(m, rotate(t.rotation))
  if (t.skewX || t.skewY) m = multiply(m, skew(t.skewX, t.skewY))
  m = multiply(m, translate(-cx, -cy))
  return m
}

/** 构建「场景 → 局部」的逆向矩阵；退化返回 null。 */
export function sceneToLayer(t: VectorLayerTransform): Matrix | null {
  return invert(layerToScene(t))
}

/**
 * 计算图层在场景坐标下的轴对齐包围盒（AABB），用于选中框与命中测试。
 * 变换后的四个角点取极值。
 */
export function layerBounds(t: VectorLayerTransform): {
  x: number
  y: number
  width: number
  height: number
} {
  const m = layerToScene(t)
  const corners = [
    apply(m, { x: 0, y: 0 }),
    apply(m, { x: t.width, y: 0 }),
    apply(m, { x: t.width, y: t.height }),
    apply(m, { x: 0, y: t.height }),
  ]
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** 点是否落在 AABB 内（含容差）。 */
export function pointInBounds(
  p: Vec2,
  b: { x: number; y: number; width: number; height: number },
  tol = 0,
): boolean {
  return (
    p.x >= b.x - tol &&
    p.x <= b.x + b.width + tol &&
    p.y >= b.y - tol &&
    p.y <= b.y + b.height + tol
  )
}

/** 将矩阵序列化为 SVG transform 属性字符串。 */
export function matrixToSvg(m: Matrix): string {
  const [a, b, c, d, e, f] = m
  return `matrix(${r(a)} ${r(b)} ${r(c)} ${r(d)} ${r(e)} ${r(f)})`
}

/** CSS transform 用的 matrix() 字符串（列主序）。 */
export function matrixToCss(m: Matrix): string {
  const [a, b, c, d, e, f] = m
  return `matrix(${r(a)}, ${r(b)}, ${r(c)}, ${r(d)}, ${r(e)}, ${r(f)})`
}

function r(v: number): number {
  return Math.round(v * 10000) / 10000
}
