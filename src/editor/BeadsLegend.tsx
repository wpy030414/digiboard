/**
 * 拼豆模式图例：列出每种颜色需要多少颗像素，点击可只看该颜色。
 *
 * 计数来自像素基座当前内容（palette 索引即像素值-1）；点击已选中的色块再次
 * 点击即取消筛选。筛选只影响屏幕显示，不改变数据与导出。
 */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { PixelLayer } from '@/engine/types'

interface BeadsLegendProps {
  layer: PixelLayer
  /** 当前筛选的像素值（1..），null = 显示全部。 */
  selectedValue: number | null
  onSelect: (value: number | null) => void
  /** 图例最大宽度（与画布对齐）。 */
  width?: number
}

export function BeadsLegend({ layer, selectedValue, onSelect, width }: BeadsLegendProps) {
  const items = useMemo(() => {
    const counts = Array.from({ length: layer.palette.length }, () => 0)
    for (const v of layer.pixels) {
      if (v > 0 && v <= counts.length) counts[v - 1]! += 1
    }
    return layer.palette
      .map((color, i) => ({ color, value: i + 1, count: counts[i]! }))
      .filter((it) => it.count > 0)
  }, [layer])

  const total = items.reduce((n, it) => n + it.count, 0)

  return (
    <div
      data-testid="beads-legend"
      className="flex flex-wrap items-center gap-1.5 rounded-md border bg-card/90 p-1.5 text-xs"
      style={width ? { maxWidth: width } : undefined}
    >
      <span className="px-1 text-muted-foreground">
        图例 · {items.length} 色 · 共 {total} 颗
      </span>
      {items.map((it) => {
        const selected = selectedValue === it.value
        return (
          <button
            key={it.value}
            type="button"
            data-testid={`beads-legend-item-${it.value}`}
            data-selected={selected}
            aria-pressed={selected}
            onClick={() => onSelect(selected ? null : it.value)}
            className={cn(
              'flex items-center gap-1 rounded border px-1.5 py-0.5 transition-colors',
              selected
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border hover:bg-accent',
            )}
            title={selected ? '再次点击显示全部颜色' : `只显示 ${it.color}`}
          >
            <span
              className="size-3 rounded-[2px] border border-black/30"
              style={{ background: it.color }}
            />
            <span className="font-mono">{it.color}</span>
            <span className="text-muted-foreground tabular-nums">×{it.count}</span>
          </button>
        )
      })}
      {items.length === 0 && <span className="px-1 text-muted-foreground">还没有点亮任何像素</span>}
      {selectedValue !== null && (
        <button
          type="button"
          data-testid="beads-legend-clear"
          onClick={() => onSelect(null)}
          className="rounded px-1.5 py-0.5 text-muted-foreground underline-offset-2 hover:underline"
        >
          显示全部
        </button>
      )}
    </div>
  )
}
