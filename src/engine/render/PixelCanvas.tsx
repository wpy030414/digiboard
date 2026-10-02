/**
 * 像素层渲染器：把一个 PixelLayer 画到 <canvas>。
 *
 * backing store 为 W×H（每个逻辑像素一格），通过 CSS 放大到显示尺寸，
 * `image-rendering: pixelated` 保留硬边颗粒感（LED/点阵质感）。
 * 矢量层不受此量化影响 —— 这正是「像素受限、数码管突破」的分野。
 */

import { useEffect, useRef } from 'react'
import type { PixelLayer } from '../types'

interface PixelCanvasProps {
  layer: PixelLayer
  /** 每个场景单位对应的屏幕像素（显示缩放）。 */
  scale: number
  className?: string
  style?: React.CSSProperties
}

export function PixelCanvas({ layer, scale, className, style }: PixelCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { w, h, pixels, color } = layer
    canvas.width = w
    canvas.height = h
    ctx.clearRect(0, 0, w, h)

    // 解析颜色为 RGBA，用 ImageData 批量写入（比逐格 fillRect 快得多）
    const [r, g, b, a] = hexToRgba(color)
    const img = ctx.createImageData(w, h)
    const data = img.data
    for (let i = 0; i < pixels.length; i++) {
      if (pixels[i]) {
        const o = i * 4
        data[o] = r
        data[o + 1] = g
        data[o + 2] = b
        data[o + 3] = a
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [layer])

  return (
    <canvas
      ref={ref}
      className={className}
      style={{
        width: layer.w * scale,
        height: layer.h * scale,
        imageRendering: 'pixelated',
        opacity: layer.opacity,
        ...style,
      }}
    />
  )
}

/** #rgb / #rrggbb / #rrggbbaa → [r,g,b,a]，a 为 0..255。 */
export function hexToRgba(hex: string): [number, number, number, number] {
  let h = hex.replace('#', '').trim()
  if (h.length === 3 || h.length === 4) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255
  return [r, g, b, Number.isNaN(a) ? 255 : a]
}
