/**
 * 拼豆模式叠层：行列序号 + 5/10 格红色标识线。
 *
 * 纯视图辅助（不进入 PNG 导出）：
 *  - 每 5 格一条红色虚线，每 10 格一条红色实线（格子边界对齐）；
 *  - 四周序号：缩放足够大（每格 ≥16px）时逐格编号，否则每 5 格编号，
 *    避免数字挤成一团。
 */

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

  const columns: number[] = []
  for (let i = step; i <= w; i += step) columns.push(i)
  const rows: number[] = []
  for (let j = step; j <= h; j += step) rows.push(j)

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

      {columns.map((n) => (
        <span
          key={`c-${n}`}
          data-testid="beads-col-label"
          aria-hidden
          style={{
            position: 'absolute',
            left: (n - 0.5) * scale,
            top: -BEADS_LABEL_PAD,
            transform: 'translateX(-50%)',
            fontSize: Math.max(8, Math.min(11, scale * 0.7)),
            lineHeight: `${BEADS_LABEL_PAD}px`,
            color: LABEL_COLOR,
            fontVariantNumeric: 'tabular-nums',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {n}
        </span>
      ))}

      {rows.map((n) => (
        <span
          key={`r-${n}`}
          data-testid="beads-row-label"
          aria-hidden
          style={{
            position: 'absolute',
            left: -BEADS_LABEL_PAD,
            top: (n - 0.5) * scale,
            transform: 'translateY(-50%)',
            width: BEADS_LABEL_PAD - 4,
            textAlign: 'right',
            fontSize: Math.max(8, Math.min(11, scale * 0.7)),
            lineHeight: 1,
            color: LABEL_COLOR,
            fontVariantNumeric: 'tabular-nums',
            pointerEvents: 'none',
          }}
        >
          {n}
        </span>
      ))}
    </>
  )
}
