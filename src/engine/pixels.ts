/**
 * 像素层数据操作：不可变写入、连通填充、RLE 编解码（供 yml 导出/导入）。
 *
 * store 保证写入前 clone，因此本模块的函数可直接原地修改传入的副本。
 */

/** 索引计算，越界返回 -1。 */
export function indexOf(x: number, y: number, w: number, h: number): number {
  if (x < 0 || y < 0 || x >= w || y >= h) return -1
  return y * w + x
}

/** 读取像素值（0/1），越界返回 0。 */
export function getPixel(pixels: Uint8Array, x: number, y: number, w: number): number {
  const i = y * w + x
  if (x < 0 || y < 0 || i >= pixels.length) return 0
  return pixels[i] ?? 0
}

/** 写入像素（原地，越界忽略）。 */
export function setPixel(
  pixels: Uint8Array,
  x: number,
  y: number,
  w: number,
  h: number,
  value: number,
): void {
  const i = indexOf(x, y, w, h)
  if (i >= 0) pixels[i] = value
}

/** 克隆像素缓冲。 */
export function clonePixels(pixels: Uint8Array): Uint8Array {
  return new Uint8Array(pixels)
}

/**
 * 油漆桶：从 (x,y) 出发，把所有与起点同值且连通的像素改为 `value`。
 * 4-连通。原地修改传入的 `pixels` 副本。
 */
export function floodFill(
  pixels: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  value: number,
): void {
  const start = indexOf(x, y, w, h)
  if (start < 0) return
  const target = pixels[start] ?? 0
  if (target === value) return

  // 扫描线填充，避免深递归爆栈（点阵可达数千像素宽）
  const stack: number[] = [start]
  const visited = new Uint8Array(pixels.length)
  visited[start] = 1

  while (stack.length > 0) {
    const idx = stack.pop()!
    if (pixels[idx] !== target) continue
    pixels[idx] = value

    const px = idx % w
    const py = (idx / w) | 0

    const push = (nx: number, ny: number) => {
      const ni = indexOf(nx, ny, w, h)
      if (ni < 0 || visited[ni]) return
      if ((pixels[ni] ?? 0) !== target) return
      visited[ni] = 1
      stack.push(ni)
    }
    push(px + 1, py)
    push(px - 1, py)
    push(px, py + 1)
    push(px, py - 1)
  }
}

/**
 *  Bresenham 直线：返回从 (x0,y0) 到 (x1,y1) 的整数格点。
 * 用于像素画笔的连续拖拽（避免快速移动时出现断点）。
 */
export function bresenhamLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = []
  let dx = Math.abs(x1 - x0)
  let dy = -Math.abs(y1 - y0)
  let sx = x0 < x1 ? 1 : -1
  let sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let x = x0
  let y = y0

  for (;;) {
    pts.push({ x, y })
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
  return pts
}

/**
 * RLE 压缩：把 0/1 缓冲编码为 `[count, value, count, value, …]` 数组。
 * 大面积同色时压缩率极高，适合像素画存进 yml。
 */
export function rleEncode(pixels: Uint8Array): number[] {
  const out: number[] = []
  const n = pixels.length
  if (n === 0) return out
  let cur = pixels[0] ?? 0
  let count = 0
  for (let i = 0; i < n; i++) {
    const v = pixels[i] ?? 0
    if (v === cur) {
      count++
    } else {
      out.push(count, cur)
      cur = v
      count = 1
    }
  }
  out.push(count, cur)
  return out
}

/** RLE 解压，恢复为长度 w*h 的缓冲；长度不足补 0、超出截断。 */
export function rleDecode(rle: number[], w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h)
  let pos = 0
  for (let i = 0; i + 1 < rle.length; i += 2) {
    const count = rle[i] ?? 0
    const value = rle[i + 1] ?? 0
    for (let k = 0; k < count && pos < out.length; k++) {
      out[pos++] = value
    }
  }
  return out
}

/** 统计点亮像素数（用于导出摘要与测试）。 */
export function countLit(pixels: Uint8Array): number {
  let n = 0
  for (let i = 0; i < pixels.length; i++) if (pixels[i]) n++
  return n
}
