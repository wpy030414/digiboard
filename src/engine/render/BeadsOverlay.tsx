/**
 * 拼豆模式叠层：行列序号 + 每格灰色边界线 + 5/10 格红色标识线。
 *
 * 纯视图辅助：
 *  - 每格一条半透灰线（定位单颗豆），其上是每 5 格红色虚线、每 10 格红色实线；
 *  - 四周序号：缩放足够大（每格 ≥16px）时逐格编号，否则每 5 格编号，
 *    避免数字挤成一团。
 */

import type { CSSProperties } from 'react'
import { beadsBoundaries } from '../dots'

const GUIDE_COLOR = '#ff3b3b'
const LABEL_COLOR = '#ff8a9c'
/** 序号条带宽度（屏幕像素），编辑器据此给画布留出边距。 */
export const BEADS_LABEL_PAD = 18

interface BeadsOverlayProps {
  /** 点阵列数。 */
  w: number
  /** 点阵行数。 */
  h: number
  /** 每格屏幕像素。 */
  scale: number
}

export function BeadsOverlay({ w, h, scale }: BeadsOverlayProps) {
  const step = scale >= 16 ? 1 : 5
  const width = w * scale
  const height = h * scale

  const boundariesX = beadsBoundaries(w)
  const boundariesY = beadsBoundaries(h)
  const cellX: number[] = []
  for (let i = 1; i < w; i++) cellX.push(i)
  const cellY: number[] = []
  for (let j = 1; j < h; j++) cellY.push(j)

  const columns: number[] = []
  for (let i = step; i <= w; i += step) columns.push(i)
  const rows: number[] = []
  for (let j = step; j <= h; j += step) rows.push(j)

  const labelFontSize = Math.max(9, Math.min(14, scale * 0.8))
  const columnLabelStyle = (n: number): CSSProperties => ({
    position: 'absolute',
    left: (n - 0.5) * scale,
    top: -BEADS_LABEL_PAD,
    transform: 'translateX(-50%)',
    fontSize: labelFontSize,
    lineHeight: `${BEADS_LABEL_PAD}px`,
    color: LABEL_COLOR,
    fontVariantNumeric: 'tabular-nums',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  })
  const rowLabelStyle = (n: number): CSSProperties => ({
    position: 'absolute',
    left: -BEADS_LABEL_PAD,
    top: (n - 0.5) * scale,
    transform: 'translateY(-50%)',
    width: BEADS_LABEL_PAD - 4,
    textAlign: 'right',
    fontSize: labelFontSize,
    lineHeight: 1,
    color: LABEL_COLOR,
    fontVariantNumeric: 'tabular-nums',
    pointerEvents: 'none',
  })

  return (
    <>
      <svg
        data-testid="beads-guides"
        width={width}
        height={height}
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        {cellX.map((i) => (
          <line
            key={`gx-${i}`}
            data-testid="beads-cell-guide"
            x1={i * scale}
            y1={0}
            x2={i * scale}
            y2={height}
            stroke="#ffffff"
            strokeOpacity={0.16}
            strokeWidth={1}
          />
        ))}
        {cellY.map((j) => (
          <line
            key={`gy-${j}`}
            data-testid="beads-cell-guide"
            x1={0}
            y1={j * scale}
            x2={width}
            y2={j * scale}
            stroke="#ffffff"
            strokeOpacity={0.16}
            strokeWidth={1}
          />
        ))}
        {boundariesX.map((i) => {
          const solid = i % 10 === 0
          return (
            <line
              key={`cx-${i}`}
              x1={i * scale}
              y1={0}
              x2={i * scale}
              y2={height}
              stroke={GUIDE_COLOR}
              strokeWidth={solid ? 1.2 : 1}
              strokeDasharray={solid ? undefined : '4 3'}
              opacity={solid ? 0.95 : 0.7}
            />
          )
        })}
        {boundariesY.map((j) => {
          const solid = j % 10 === 0
          return (
            <line
              key={`cy-${j}`}
              x1={0}
              y1={j * scale}
              x2={width}
              y2={j * scale}
              stroke={GUIDE_COLOR}
              strokeWidth={solid ? 1.2 : 1}
              strokeDasharray={solid ? undefined : '4 3'}
              opacity={solid ? 0.95 : 0.7}
            />
          )
        })}
      </svg>

      {/* 列号：上、下各一条，保证大图滚动时始终能看到当前列 */}
      {columns.map((n) => (
        <span
          key={`c-${n}`}
          data-testid="beads-col-label"
          data-side="top"
          aria-hidden
          style={columnLabelStyle(n)}
        >
          {n}
        </span>
      ))}
      {columns.map((n) => (
        <span
          key={`cb-${n}`}
          data-testid="beads-col-label"
          data-side="bottom"
          aria-hidden
          style={{ ...columnLabelStyle(n), top: height }}
        >
          {n}
        </span>
      ))}

      {/* 行号：左、右各一条 */}
      {rows.map((n) => (
        <span
          key={`r-${n}`}
          data-testid="beads-row-label"
          data-side="left"
          aria-hidden
          style={rowLabelStyle(n)}
        >
          {n}
        </span>
      ))}
      {rows.map((n) => (
        <span
          key={`rb-${n}`}
          data-testid="beads-row-label"
          data-side="right"
          aria-hidden
          style={{ ...rowLabelStyle(n), left: width + 4, textAlign: 'left' }}
        >
          {n}
        </span>
      ))}
    </>
  )
}
