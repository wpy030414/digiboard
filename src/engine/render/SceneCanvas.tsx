/**
 * 场景合成画布 —— 编辑态与播放态共用的渲染容器。
 *
 * 布局：一个尺寸为 `size.w*scale × size.h*scale` 的相对定位容器，
 * 各图层按 `scene.layers` 顺序（z 从低到高）绝对定位叠放：
 *   - PixelLayer   → <canvas>（圆角点阵玩具板）
 *   - DigitLayer   → <svg>（矢量矩形，占据整块点阵空间）
 *   - WidgetLayer  → <div>（浮点 DOM，同样占据矩形空间）
 *
 * 矢量层不是浮在像素点之上：它占据的矩形格子会被整块抠除
 * （computeReservedMask），像素层在这些格子上不画任何点。
 *
 * 交互（仅 edit 模式）：
 *   - pen/eraser/fill/picker：指针 → 场景网格坐标，驱动像素绘制
 *   - select：命中测试顶层矢量层，拖拽移动
 */

import { useCallback, useMemo, useRef } from 'react'
import type { DigitLayer, Layer, Scene, WidgetLayer } from '../types'
import { SCREEN_BACKGROUND } from '../types'
import { useSceneStore } from '../scene-store'
import type { Vec2 } from '../transform'
import { computeReservedMask, layerFootprint, pointInLayer } from '../footprint'
import { getPixel } from '../pixels'
import { PixelCanvas } from './PixelCanvas'
import { DigitLayerView } from './DigitLayerView'
import { WidgetLayerView } from './WidgetLayerView'
import { BeadsOverlay } from './BeadsOverlay'

export type SceneMode = 'edit' | 'play'

interface SceneCanvasProps {
  scene: Scene
  scale: number
  mode: SceneMode
  /** 拼豆模式：直角无缝隙像素 + 行列序号 + 5/10 格红色标识线。 */
  beads?: boolean
  /** 图例筛选：只显示该像素值的亮点（null = 全部）。 */
  onlyValue?: number | null
  className?: string
}

export function SceneCanvas({
  scene,
  scale,
  mode,
  beads = false,
  onlyValue = null,
  className,
}: SceneCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const drawing = useRef(false)
  const last = useRef<Vec2 | null>(null)
  const dragLayer = useRef<{
    id: string
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  // 被可见矢量层占据的格子：像素层在这些格子上整块留空
  const reservedMask = useMemo(
    () => computeReservedMask(scene.layers, scene.size.w, scene.size.h),
    [scene.layers, scene.size.w, scene.size.h],
  )

  const select = useSceneStore((s) => s.select)
  const selectedId = useSceneStore((s) => s.selectedId)
  const tool = useSceneStore((s) => s.tool)
  const brushColor = useSceneStore((s) => s.brushColor)

  /** 屏幕坐标 → 场景坐标（浮点）。 */
  const toScene = useCallback(
    (e: React.PointerEvent): Vec2 => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale }
    },
    [scale],
  )

  /** 场景坐标 → 网格整数坐标（floor）。 */
  const toGrid = useCallback((p: Vec2): Vec2 => ({ x: Math.floor(p.x), y: Math.floor(p.y) }), [])

  const drawAt = useCallback(
    (scenePt: Vec2, prev: Vec2 | null) => {
      const st = useSceneStore.getState()
      const color = st.brushColor
      if (tool === 'pen' || tool === 'eraser') {
        const v = tool === 'eraser' ? null : color
        const g = toGrid(scenePt)
        if (prev) {
          const pg = toGrid(prev)
          st.drawLine(pg.x, pg.y, g.x, g.y, v)
        } else {
          st.drawPixel(g.x, g.y, v)
        }
      } else if (tool === 'fill') {
        const g = toGrid(scenePt)
        st.fillAt(g.x, g.y, color)
      } else if (tool === 'picker') {
        const g = toGrid(scenePt)
        const target = st.scene.layers.find((l) => l.type === 'pixel')
        if (target && target.type === 'pixel') {
          const value = getPixel(target.pixels, g.x, g.y, target.w)
          const picked = value > 0 ? target.palette[value - 1] : null
          if (picked) st.setBrushColor(picked)
        }
      }
    },
    [tool, brushColor, toGrid],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (mode !== 'edit') return
      const p = toScene(e)

      if (tool === 'select') {
        // 命中测试：从顶层往下找第一个包含该点的矢量层
        const hit = hitTestVector(scene.layers, p)
        if (hit) {
          select(hit.id)
          dragLayer.current = { id: hit.id, startX: p.x, startY: p.y, origX: hit.x, origY: hit.y }
          useSceneStore.getState().commitHistory()
        } else {
          select(null)
        }
        return
      }

      // 像素工具
      drawing.current = true
      last.current = p
      useSceneStore.getState().commitHistory()
      drawAt(p, null)
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    },
    [mode, tool, scene.layers, toScene, drawAt, select],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (mode !== 'edit') return
      const p = toScene(e)

      if (dragLayer.current) {
        const d = dragLayer.current
        const st = useSceneStore.getState()
        const dx = p.x - d.startX
        const dy = p.y - d.startY
        st.updateLayer(d.id, { x: d.origX + dx, y: d.origY + dy } as Partial<
          DigitLayer & WidgetLayer
        >)
        return
      }

      if (!drawing.current) return
      drawAt(p, last.current)
      last.current = p
    },
    [mode, toScene, drawAt],
  )

  const endInteraction = useCallback((e: React.PointerEvent) => {
    drawing.current = false
    last.current = null
    dragLayer.current = null
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
  }, [])

  const cursor =
    mode !== 'edit'
      ? 'default'
      : tool === 'select'
        ? 'move'
        : tool === 'fill'
          ? 'cell'
          : 'crosshair'

  return (
    <div
      ref={containerRef}
      data-testid="scene-canvas"
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endInteraction}
      onPointerCancel={endInteraction}
      onPointerLeave={endInteraction}
      style={{
        position: 'relative',
        width: scene.size.w * scale,
        height: scene.size.h * scale,
        background: SCREEN_BACKGROUND,
        overflow: 'visible',
        cursor,
        touchAction: 'none',
      }}
    >
      {scene.layers.map((layer) => {
        if (!layer.visible) return null
        return (
          <LayerSlot
            key={layer.id}
            layer={layer}
            scale={scale}
            selected={layer.id === selectedId}
            mode={mode}
            beads={beads}
            onlyValue={onlyValue}
            reservedMask={reservedMask}
          />
        )
      })}

      {beads && <BeadsOverlay w={scene.size.w} h={scene.size.h} scale={scale} />}
    </div>
  )
}

/** 单个图层的定位插槽。 */
function LayerSlot({
  layer,
  scale,
  selected,
  mode,
  beads,
  onlyValue,
  reservedMask,
}: {
  layer: Layer
  scale: number
  selected: boolean
  mode: SceneMode
  beads: boolean
  onlyValue: number | null
  reservedMask: Uint8Array
}) {
  const commonStyle: React.CSSProperties = { position: 'absolute', left: 0, top: 0 }

  if (layer.type === 'pixel') {
    return (
      <PixelCanvas
        layer={layer}
        scale={scale}
        mask={reservedMask}
        beads={beads}
        onlyValue={onlyValue}
        style={{
          ...commonStyle,
          outline: selected && mode === 'edit' ? '1px solid #ffaacc' : 'none',
        }}
      />
    )
  }
  if (layer.type === 'digit') {
    return <DigitLayerView layer={layer} scale={scale} selected={selected && mode === 'edit'} />
  }
  return <WidgetLayerView layer={layer} scale={scale} selected={selected && mode === 'edit'} />
}

/** 命中测试：返回顶层第一个矩形包含点 p 的矢量层（digit/widget）。 */
function hitTestVector(layers: Layer[], p: Vec2): (DigitLayer | WidgetLayer) | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]!
    if (!l.visible || l.locked) continue
    if (l.type !== 'digit' && l.type !== 'widget') continue
    const t = layerFootprint(l)
    if (pointInLayer(p, l, Math.min(t.width, t.height) * 0.02)) return l
  }
  return null
}
