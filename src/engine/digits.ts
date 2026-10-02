/**
 * 七段数码管几何与字符编码。
 *
 * 段位命名（经典布局）：
 * ```
 *   ──a──
 *  f│    │b
 *   ──g──
 *  e│    │c
 *   ──d──
 * ```
 * 原 Vue 实现用形如 `0b1110111` 的二进制字典（位序 a f b g e c d）驱动段位，
 * 此处迁移为规范的 a-g 位掩码：bit0=a, bit1=b, …, bit6=g。
 */

import type { SegmentStyle } from './types'

/** 段位标识，固定顺序，bit i 对应 SEGMENTS[i]。 */
export const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const
export type SegmentId = (typeof SEGMENTS)[number]

const bit = (...idx: number[]) => idx.reduce((m, i) => m | (1 << i), 0)
// a=0 b=1 c=2 d=3 e=4 f=5 g=6
const A = 0,
  B = 1,
  C = 2,
  D = 3,
  E = 4,
  F = 5,
  G = 6

/** 字符 → 段位掩码。数字、A-F、常见字母与 `- _ 空格`。 */
export const CHAR_SEGMENTS: Record<string, number> = {
  '0': bit(A, B, C, D, E, F),
  '1': bit(B, C),
  '2': bit(A, B, D, E, G),
  '3': bit(A, B, C, D, G),
  '4': bit(B, C, F, G),
  '5': bit(A, C, D, F, G),
  '6': bit(A, C, D, E, F, G),
  '7': bit(A, B, C),
  '8': bit(A, B, C, D, E, F, G),
  '9': bit(A, B, C, D, F, G),
  A: bit(A, B, C, E, F, G),
  b: bit(C, D, E, F, G),
  C: bit(A, D, E, F),
  c: bit(D, E, G),
  d: bit(B, C, D, E, G),
  E: bit(A, D, E, F, G),
  F: bit(A, E, F, G),
  G: bit(A, C, D, E, F),
  H: bit(B, C, E, F, G),
  h: bit(C, E, F, G),
  I: bit(E, F),
  i: bit(C),
  J: bit(B, C, D),
  L: bit(D, E, F),
  n: bit(C, E, G),
  o: bit(C, D, E, G),
  P: bit(A, B, E, F, G),
  r: bit(E, G),
  S: bit(A, C, D, F, G),
  t: bit(D, E, F, G),
  U: bit(B, C, D, E, F),
  u: bit(C, D, E),
  y: bit(B, C, D, F, G),
  '-': bit(G),
  _: bit(D),
  '=': bit(D, G),
  ' ': 0,
}

/** 小数点字符（单独渲染，不占段位）。 */
export const DECIMAL_POINT_CHARS = new Set(['.', ':'])

/** 归一化字符用于查表：优先精确匹配，其次尝试大写。 */
function lookupChar(ch: string): number | undefined {
  if (ch in CHAR_SEGMENTS) return CHAR_SEGMENTS[ch]
  const up = ch.toUpperCase()
  if (up in CHAR_SEGMENTS) return CHAR_SEGMENTS[up]
  return undefined
}

/** 该字符是否被数码管支持（可显示）。 */
export function isSupportedChar(ch: string): boolean {
  return DECIMAL_POINT_CHARS.has(ch) || lookupChar(ch) !== undefined
}

/** 取字符点亮的段位 id 列表；不支持的字符返回空。 */
export function charToSegments(ch: string): SegmentId[] {
  const mask = lookupChar(ch)
  if (mask === undefined) return []
  return SEGMENTS.filter((_, i) => (mask & (1 << i)) !== 0) as SegmentId[]
}

export interface Point {
  x: number
  y: number
}

/** 生成正多边形（按顶点）路径字符串。 */
function polygonPath(pts: Point[]): string {
  if (pts.length === 0) return ''
  const [first, ...rest] = pts
  let d = `M ${round(first!.x)} ${round(first!.y)}`
  for (const p of rest) d += ` L ${round(p.x)} ${round(p.y)}`
  return d + ' Z'
}

/** 圆角多边形路径：每个顶点用二次贝塞尔切角。 */
function roundedPolygonPath(pts: Point[], r: number): string {
  const n = pts.length
  if (n === 0) return ''
  if (r <= 0) return polygonPath(pts)
  let d = ''
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!
    const cur = pts[i]!
    const next = pts[(i + 1) % n]!
    // 入边方向与出边方向
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y)
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y)
    const rr = Math.min(r, inLen / 2, outLen / 2)
    const startX = cur.x + ((prev.x - cur.x) / (inLen || 1)) * rr
    const startY = cur.y + ((prev.y - cur.y) / (inLen || 1)) * rr
    const endX = cur.x + ((next.x - cur.x) / (outLen || 1)) * rr
    const endY = cur.y + ((next.y - cur.y) / (outLen || 1)) * rr
    if (i === 0) d = `M ${round(startX)} ${round(startY)}`
    else d += ` L ${round(startX)} ${round(startY)}`
    d += ` Q ${round(cur.x)} ${round(cur.y)} ${round(endX)} ${round(endY)}`
  }
  return d + ' Z'
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}

/** 水平段（a/g/d）：左右尖端的六边形。 */
function horizontalHex(x0: number, x1: number, yc: number, t: number): Point[] {
  const h = t / 2
  return [
    { x: x0, y: yc },
    { x: x0 + h, y: yc - h },
    { x: x1 - h, y: yc - h },
    { x: x1, y: yc },
    { x: x1 - h, y: yc + h },
    { x: x0 + h, y: yc + h },
  ]
}

/** 垂直段（f/b/e/c）：上下尖端的六边形。 */
function verticalHex(xc: number, y0: number, y1: number, t: number): Point[] {
  const h = t / 2
  return [
    { x: xc, y: y0 },
    { x: xc + h, y: y0 + h },
    { x: xc + h, y: y1 - h },
    { x: xc, y: y1 },
    { x: xc - h, y: y1 - h },
    { x: xc - h, y: y0 + h },
  ]
}

export interface DigitGeometry {
  /** 字符块宽（= digitHeight * aspect）。 */
  w: number
  /** 字符块高。 */
  h: number
  /** 段厚。 */
  t: number
  /** 每个段位的 SVG path（尖角或圆角）。 */
  paths: Record<SegmentId, string>
  /** 小数点 path（字符右下角）。 */
  decimalPath: string
}

/**
 * 生成单个字符块的段位几何。所有尺寸为局部坐标（左上角为原点）。
 *
 * @param height 字符高度（场景单位）
 * @param aspect 宽高比 width/height
 * @param thicknessRatio 段厚比例（相对 height）
 * @param style sharp=尖角六边形，rounded=圆角
 */
export function buildDigitGeometry(
  height: number,
  aspect: number,
  thicknessRatio: number,
  style: SegmentStyle = 'sharp',
): DigitGeometry {
  const h = height
  const w = height * aspect
  const t = Math.max(0.001, height * thicknessRatio)
  const r = style === 'rounded' ? t * 0.5 : 0

  const x0 = t / 2
  const x1 = w - t / 2
  const xcL = t / 2
  const xcR = w - t / 2
  const yTop = t / 2
  const yMid = h / 2
  const yBot = h - t / 2

  const raw: Record<SegmentId, Point[]> = {
    a: horizontalHex(x0, x1, yTop, t),
    g: horizontalHex(x0, x1, yMid, t),
    d: horizontalHex(x0, x1, yBot, t),
    f: verticalHex(xcL, yTop, yMid, t),
    b: verticalHex(xcR, yTop, yMid, t),
    e: verticalHex(xcL, yMid, yBot, t),
    c: verticalHex(xcR, yMid, yBot, t),
  }

  const paths = {} as Record<SegmentId, string>
  for (const id of SEGMENTS) {
    paths[id] = style === 'rounded' ? roundedPolygonPath(raw[id], r) : polygonPath(raw[id])
  }

  // 小数点：字符右下角一个小方块
  const dpSize = t * 1.1
  const dpX = w + t * 0.15
  const dpY = h - dpSize
  const decimalPath =
    style === 'rounded'
      ? roundedPolygonPath(
          [
            { x: dpX, y: dpY },
            { x: dpX + dpSize, y: dpY },
            { x: dpX + dpSize, y: dpY + dpSize },
            { x: dpX, y: dpY + dpSize },
          ],
          dpSize * 0.3,
        )
      : polygonPath([
          { x: dpX, y: dpY },
          { x: dpX + dpSize, y: dpY },
          { x: dpX + dpSize, y: dpY + dpSize },
          { x: dpX, y: dpY + dpSize },
        ])

  return { w, h, t, paths, decimalPath }
}

/** 单个字符渲染单元：字符 + 其在文本中的横向偏移 + 是否小数点。 */
export interface CharCell {
  ch: string
  /** 该字符块左上角相对整个文本块左上角的 x 偏移。 */
  offsetX: number
  /** 是否为纯小数点字符（不渲染段位，只渲染点）。 */
  isDecimal: boolean
  litSegments: SegmentId[]
}

/**
 * 排布一段文本：计算每个字符的横向偏移与点亮段位。
 * 小数点字符宽度更窄（仅占一个点宽）。
 *
 * @returns cells 与整体宽度 totalWidth
 */
export function layoutText(
  text: string,
  height: number,
  aspect: number,
  thicknessRatio: number,
  gapRatio: number,
): { cells: CharCell[]; totalWidth: number } {
  const geo = buildDigitGeometry(height, aspect, thicknessRatio)
  const charW = geo.w
  const gap = height * gapRatio
  const decimalW = geo.t * 1.4

  const cells: CharCell[] = []
  let cursorX = 0
  for (const ch of text) {
    const isDecimal = DECIMAL_POINT_CHARS.has(ch)
    cells.push({
      ch,
      offsetX: cursorX,
      isDecimal,
      litSegments: isDecimal ? [] : charToSegments(ch),
    })
    cursorX += isDecimal ? decimalW + gap : charW + gap
  }
  const totalWidth = Math.max(0, cursorX - (text.length > 0 ? gap : 0))
  return { cells, totalWidth }
}
