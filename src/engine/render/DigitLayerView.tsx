/**
 * 数码管矢量渲染器 —— 电子副屏的核心「突破像素限制」层。
 *
 * 它占据一整块矩形点阵空间（该区域的像素点被整块抠除，见 footprint.ts），
 * 内部用 SVG 浮点几何绘制：可斜切、发光、亚像素定位、甚至超出画布边界，
 * 完全不被点阵网格量化。旋转已取消（矩形需保持可量化）。
 * 导出 png 时此层被栅格化合成，导出 yml 时保留矢量参数。
 */

import { memo, useId } from 'react'
import type { DigitLayer } from '../types'
import { buildDigitGeometry, layoutText, SEGMENTS } from '../digits'
import { layerToScene, matrixToSvg } from '../transform'

interface DigitLayerViewProps {
  layer: DigitLayer
  scale: number
  /** 编辑态显示选中辅助；播放态隐藏。 */
  selected?: boolean
}

export const DigitLayerView = memo(function DigitLayerView({
  layer,
  scale,
  selected = false,
}: DigitLayerViewProps) {
  // useId 保证每个实例的 filter id 唯一，避免多数码管层发光滤镜串扰
  const uid = useId().replace(/:/g, '')
  const glowId = `glow-${uid}`

  const {
    text,
    x,
    y,
    digitHeight,
    aspect,
    thicknessRatio,
    gapRatio,
    color,
    glow,
    glowColor,
    skewX,
    skewY,
    segmentStyle,
    showOffSegments,
    offColor,
    opacity,
  } = layer

  const geo = buildDigitGeometry(digitHeight, aspect, thicknessRatio, segmentStyle)
  const { cells, totalWidth } = layoutText(text, digitHeight, aspect, thicknessRatio, gapRatio)

  // 图层局部包围盒：宽 = 文本总宽，高 = 字符高。变换绕其中心。
  const localW = Math.max(totalWidth, digitHeight * aspect)
  const localH = digitHeight
  const m = layerToScene({
    x,
    y,
    width: localW,
    height: localH,
    skewX,
    skewY,
  })

  const glowStd = Math.max(0.0001, glow * digitHeight * 0.18)

  return (
    <svg
      width="100%"
      height="100%"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        overflow: 'visible',
        pointerEvents: 'none',
      }}
      data-digit-layer={layer.id}
    >
      <defs>
        {glow > 0 && (
          <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation={glowStd} result="blur" />
            <feFlood floodColor={glowColor} floodOpacity={Math.min(1, glow)} />
            <feComposite in2="blur" operator="in" result="glowColor" />
            <feMerge>
              <feMergeNode in="glowColor" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      {/* 外层 scale：场景单位 → 屏幕像素；内层 m：局部 → 场景（含旋转/斜切/定位） */}
      <g transform={`scale(${scale})`}>
        <g
          transform={matrixToSvg(m)}
          opacity={opacity}
          filter={glow > 0 ? `url(#${glowId})` : undefined}
        >
          {cells.map((cell, ci) => {
            // 小数点：仅渲染点，不渲染段位
            if (cell.isDecimal) {
              return (
                <g key={ci} transform={`translate(${round(cell.offsetX)} 0)`}>
                  <path d={geo.decimalPath} fill={color} />
                </g>
              )
            }
            return (
              <g key={ci} transform={`translate(${round(cell.offsetX)} 0)`}>
                {/* 暗底衬（未点亮段）*/}
                {showOffSegments &&
                  SEGMENTS.map((id) => (
                    <path key={`off-${id}`} d={geo.paths[id]} fill={offColor} />
                  ))}
                {/* 点亮段 */}
                {cell.litSegments.map((id) => (
                  <path key={`on-${id}`} d={geo.paths[id]} fill={color} />
                ))}
              </g>
            )
          })}
          {selected && (
            <rect
              x={-digitHeight * 0.05}
              y={-digitHeight * 0.05}
              width={localW + digitHeight * 0.1}
              height={localH + digitHeight * 0.1}
              fill="none"
              stroke="#ffaacc"
              strokeWidth={Math.max(0.3, digitHeight * 0.02)}
              strokeDasharray={`${digitHeight * 0.08} ${digitHeight * 0.06}`}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </g>
      </g>
    </svg>
  )
})

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}
