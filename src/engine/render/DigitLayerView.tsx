/**
 * 数码管矢量渲染器 —— 电子副屏的核心「突破像素限制」层。
 *
 * 它占据一整块矩形点阵空间（该区域的像素点被整块抠除，见 footprint.ts），
 * 内部用 SVG 浮点几何绘制：可斜切、发光、亚像素定位、甚至超出画布边界，
 * 完全不被点阵网格量化。旋转已取消（矩形需保持可量化）。
 * 导出 png 时此层被栅格化合成，导出 yml 时保留矢量参数。
 */

import { memo, useEffect, useId, useState } from 'react'
import type { DigitLayer } from '../types'
import { buildDigitGeometry, layoutText, SEGMENTS } from '../digits'
import { layerToScene, matrixToSvg } from '../transform'
import { digitGlowPadding } from '../footprint'
import { formatClock, normalizeClockMode } from '../clock'

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
  // useId 保证每个实例的 filter/clip id 唯一
  const uid = useId().replace(/:/g, '')
  const glowId = `glow-${uid}`

  const {
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

  // 时钟模式：本地每秒（日期模式每分）刷新一次，不写入场景状态。
  const clockMode = normalizeClockMode(layer.clockMode)
  const [clockNow, setClockNow] = useState(() => new Date())
  useEffect(() => {
    if (clockMode === 'off') return
    setClockNow(new Date())
    const timer = setInterval(() => setClockNow(new Date()), clockMode === 'date' ? 60_000 : 1_000)
    return () => clearInterval(timer)
  }, [clockMode])
  const displayText =
    clockMode === 'off'
      ? layer.text
      : formatClock(clockMode, clockNow, {
          showSeconds: layer.clockShowSeconds ?? false,
          hour12: layer.clockHour12 ?? false,
        })

  const geo = buildDigitGeometry(digitHeight, aspect, thicknessRatio, segmentStyle)
  const { cells, totalWidth } = layoutText(
    displayText,
    digitHeight,
    aspect,
    thicknessRatio,
    gapRatio,
  )

  // 图层局部包围盒：内容宽高 + 四边内边距。变换绕其中心。
  const padX = Math.max(0, layer.paddingX ?? 0)
  const padY = Math.max(0, layer.paddingY ?? 0)
  const contentW = Math.max(totalWidth, digitHeight * aspect)
  const localW = contentW + padX * 2
  const localH = digitHeight + padY * 2
  const m = layerToScene({
    x,
    y,
    width: localW,
    height: localH,
    skewX,
    skewY,
  })

  const glowStd = Math.max(0.0001, glow * digitHeight * 0.18)
  // 内容必须完整落在占位矩形内：发光扩散由 footprint 计入占位，
  // 这里用同一 padding 裁切，保证任何 filter 尾部都不会漏到矩形外。
  const clipPad = digitGlowPadding(layer)
  const clipId = `clip-${uid}`
  // 辉光与源图形分成两层：WebKit 的 SVG filter 在小字号下会漏绘部分段位，
  // 但只让它负责「辉光层」，源图形始终用未过滤的一份绘制在最上层。
  const cellsNode = (
    <>
      {cells.map((cell, ci) => {
        // 冒号：上下两个点，不渲染段位
        if (cell.isColon) {
          return (
            <g key={ci} transform={`translate(${round(cell.offsetX)} 0)`}>
              <path d={geo.colonPath} fill={color} />
            </g>
          )
        }
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
              SEGMENTS.map((id) => <path key={`off-${id}`} d={geo.paths[id]} fill={offColor} />)}
            {/* 点亮段 */}
            {cell.litSegments.map((id) => (
              <path key={`on-${id}`} d={geo.paths[id]} fill={color} />
            ))}
          </g>
        )
      })}
    </>
  )

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
          <filter
            id={glowId}
            filterUnits="userSpaceOnUse"
            x={-clipPad}
            y={-clipPad}
            width={localW + clipPad * 2}
            height={localH + clipPad * 2}
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation={glowStd} result="blur" />
            <feFlood floodColor={glowColor} floodOpacity={Math.min(1, glow)} result="flood" />
            <feComposite in="flood" in2="blur" operator="in" result="glow" />
          </filter>
        )}
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <rect
            x={-clipPad}
            y={-clipPad}
            width={localW + clipPad * 2}
            height={localH + clipPad * 2}
          />
        </clipPath>
      </defs>
      {/* 外层 scale：场景单位 → 屏幕像素；内层 m：局部 → 场景（含旋转/斜切/定位） */}
      <g transform={`scale(${scale})`}>
        <g transform={matrixToSvg(m)}>
          {/* 裁切放在父组：WebKit 下「filter + clipPath 同一元素」会漏绘部分段位 */}
          <g clipPath={`url(#${clipId})`}>
            <g opacity={opacity}>
              {glow > 0 && (
                <g filter={`url(#${glowId})`}>
                  <g transform={`translate(${round(padX)} ${round(padY)})`}>{cellsNode}</g>
                </g>
              )}
              <g transform={`translate(${round(padX)} ${round(padY)})`}>{cellsNode}</g>
            </g>
          </g>
          {/* 选中框是编辑器辅助，不属于组件内容，放在裁切组之外 */}
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
