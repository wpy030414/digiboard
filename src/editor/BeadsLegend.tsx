/**
 * 拼豆模式图例：列出每种颜色需要多少颗像素，点击可只看该颜色。
 *
 * 计数来自像素基座当前内容（palette 索引即像素值-1）；点击已选中的色块再次
 * 点击即取消筛选。筛选只影响屏幕显示，不改变数据与导出。
 *
 * 图例显示拼豆色号（MARD 221 色）而不是 HEX：颜色恰好等于色卡时直接给出色号，
 * 否则给出最接近的色号并加 `≈` 前缀——照着买豆子时不会误以为完全一致。
 */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { beadColorForHex, compareBeadCode, nearestBeadColor } from '@/engine/beads-palette'
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
      .map((color, i) => {
        const exact = beadColorForHex(color)
        return {
          color,
          value: i + 1,
          count: counts[i]!,
          bead: exact ?? nearestBeadColor(color),
          exact: Boolean(exact),
        }
      })
      .filter((it) => it.count > 0)
      .sort((a, b) => compareBeadCode(a.bead.code, b.bead.code))
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
        const code = it.exact ? it.bead.code : `≈${it.bead.code}`
        const detail = it.exact
          ? `拼豆色号 ${it.bead.code}（${it.bead.hex}）`
          : `最接近的拼豆色号 ${it.bead.code}（${it.bead.hex}），当前颜色 ${it.color}`
        return (
          <button
            key={it.value}
            type="button"
            data-testid={`beads-legend-item-${it.value}`}
            data-selected={selected}
            data-bead-code={it.bead.code}
            aria-pressed={selected}
            onClick={() => onSelect(selected ? null : it.value)}
            className={cn(
              'flex items-center gap-1 rounded border px-1.5 py-0.5 transition-colors',
              selected
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border hover:bg-accent',
            )}
            title={selected ? '再次点击显示全部颜色' : `只显示 ${code} · ${detail}`}
          >
            <span
              className="size-3 rounded-[2px] border border-black/30"
              style={{ background: it.color }}
            />
            <span className="font-mono">{code}</span>
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
