/**
 * 像素层渲染器：把一个 PixelLayer 画成「网格玩具板」。
 *
 * 不再是 W×H 的硬边位图放大，而是每格一颗圆角方块（留缝），灭点用暗色、
 * 亮点用图层色。画布按输出像素密度绘制（受设备像素比与上限约束），
 * 圆角因此是真正的圆角而非放大后的锯齿。
 *
 * 被数码管/小组件占据的格子由 `mask` 传入，整块抠除（见 footprint.ts）——
 * 矢量层不是浮在像素点之上，而是占住了那一片点阵空间。
 */

import { useEffect, useRef } from 'react'
import type { PixelLayer } from '../types'
import { BEAD_CODE_MIN_CELL, drawPixelDots } from '../dots'

/** 画布单边最大输出像素，避免大点阵 × 高缩放撑爆 canvas 内存。 */
const MAX_CANVAS_SIDE = 4096

/** 渲染像素密度上限（每格最多多少输出像素）。 */
const MAX_UNIT = 24

interface PixelCanvasProps {
  layer: PixelLayer
  /** 每个场景单位对应的屏幕像素（显示缩放）。 */
  scale: number
  /** 被矢量层占据的格子掩码（1 = 抠除），长度 w*h。 */
  mask?: Uint8Array | null
  /** 拼豆模式：直角矩形、无缝隙。 */
  beads?: boolean
  /** 图例筛选：只显示该像素值的亮点。 */
  onlyValue?: number | null
  className?: string
  style?: React.CSSProperties
}

/**
 * 计算每格多少输出像素：跟随显示缩放与设备像素比，并受画布尺寸上限约束。
 * 上限内取整，保证圆角点阵在高分屏上依然锐利。
 */
export function dotUnit(scale: number, w: number, h: number, dpr = currentDpr()): number {
  const wanted = Math.max(2, Math.round(scale * dpr))
  const sideCap = Math.floor(MAX_CANVAS_SIDE / Math.max(1, w, h))
  return Math.max(1, Math.min(wanted, MAX_UNIT, Math.max(1, sideCap)))
}

function currentDpr(): number {
  return typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
}

export function PixelCanvas({
  layer,
  scale,
  mask,
  beads = false,
  onlyValue = null,
  className,
  style,
}: PixelCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const unit = dotUnit(scale, layer.w, layer.h)
    canvas.width = layer.w * unit
    canvas.height = layer.h * unit
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawPixelDots(ctx, layer, {
      unit,
      mask,
      beads,
      onlyValue,
      labelCodes: beads && scale >= BEAD_CODE_MIN_CELL,
    })
  }, [layer, scale, mask, beads, onlyValue])

  return (
    <canvas
      ref={ref}
      className={className}
      style={{
        width: layer.w * scale,
        height: layer.h * scale,
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
