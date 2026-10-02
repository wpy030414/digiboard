/**
 * 场景合成画布 —— 编辑态与播放态共用的渲染容器。
 *
 * 布局：一个尺寸为 `size.w*scale × size.h*scale` 的相对定位容器，
 * 各图层按 `scene.layers` 顺序（z 从低到高）绝对定位叠放：
 *   - PixelLayer   → <canvas>（网格量化）
 *   - DigitLayer   → <svg>（矢量浮层，突破网格）
 *   - WidgetLayer  → <div>（浮点 DOM）
 *
 * 交互（仅 edit 模式）：
 *   - pen/eraser/fill/picker：指针 → 场景网格坐标，驱动像素绘制
 *   - select：命中测试顶层矢量层，拖拽移动
 */

import { useCallback, useRef } from 'react'
import type { DigitLayer, Layer, Scene, WidgetLayer } from '../types'
import { useSceneStore } from '../scene-store'
import { layerBounds, pointInBounds, type Vec2 } from '../transform'
import { getPixel } from '../pixels'
import { PixelCanvas } from './PixelCanvas'
import { DigitLayerView } from './DigitLayerView'
import { WidgetLayerView } from './WidgetLayerView'

export type SceneMode = 'edit' | 'play'

interface SceneCanvasProps {
  scene: Scene
  scale: number
  mode: SceneMode
  /** 显示网格辅助线（仅 edit）。 */
  showGrid?: boolean
  className?: string
}

export function SceneCanvas({ scene, scale, mode, showGrid = false, className }: SceneCanvasProps) {
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

  const select = useSceneStore((s) => s.select)
  const selectedId = useSceneStore((s) => s.selectedId)
  const tool = useSceneStore((s) => s.tool)
  const brushValue = useSceneStore((s) => s.brushValue)

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
      const value = st.brushValue
      if (tool === 'pen' || tool === 'eraser') {
        const v: 0 | 1 = tool === 'eraser' ? 0 : value
        const g = toGrid(scenePt)
        if (prev) {
          const pg = toGrid(prev)
          st.drawLine(pg.x, pg.y, g.x, g.y, v)
        } else {
          st.drawPixel(g.x, g.y, v)
        }
      } else if (tool === 'fill') {
        const g = toGrid(scenePt)
        st.fillAt(g.x, g.y, value)
      } else if (tool === 'picker') {
        const g = toGrid(scenePt)
        const px = st.scene.layers.find((l) => l.id === st.selectedId && l.type === 'pixel')
        const target = (
          px?.type === 'pixel' ? px : st.scene.layers.find((l) => l.type === 'pixel')
        ) as { pixels: Uint8Array; w: number } | undefined
        if (target) {
          const lit = getPixel(target.pixels, g.x, g.y, target.w)
          st.setBrushValue(lit ? 1 : 0)
        }
      }
    },
    [tool, brushValue, toGrid],
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
        background: scene.background ?? 'transparent',
        overflow: 'visible',
        cursor,
        touchAction: 'none',
      }}
    >
      {showGrid && mode === 'edit' && (
        <div
          aria-hidden
          className="pixel-grid-bg"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundSize: `${scale}px ${scale}px`,
            pointerEvents: 'none',
            opacity: 0.5,
          }}
        />
      )}

      {scene.layers.map((layer) => {
        if (!layer.visible) return null
        return (
          <LayerSlot
            key={layer.id}
            layer={layer}
            scale={scale}
            selected={layer.id === selectedId}
            mode={mode}
          />
        )
      })}
    </div>
  )
}

/** 单个图层的定位插槽。 */
function LayerSlot({
  layer,
  scale,
  selected,
  mode,
}: {
  layer: Layer
  scale: number
  selected: boolean
  mode: SceneMode
}) {
  const commonStyle: React.CSSProperties = { position: 'absolute', left: 0, top: 0 }

  if (layer.type === 'pixel') {
    return (
      <PixelCanvas
        layer={layer}
        scale={scale}
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

/** 命中测试：返回顶层第一个包围盒包含点 p 的矢量层（digit/widget）。 */
function hitTestVector(layers: Layer[], p: Vec2): (DigitLayer | WidgetLayer) | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]!
    if (!l.visible || l.locked) continue
    if (l.type !== 'digit' && l.type !== 'widget') continue
    const t = vectorTransformOf(l)
    const b = layerBounds(t)
    if (pointInBounds(p, b, Math.min(t.width, t.height) * 0.02)) return l
  }
  return null
}

function vectorTransformOf(l: DigitLayer | WidgetLayer) {
  if (l.type === 'digit') {
    // 数码管宽度按文本长度近似（命中测试用，宽松即可）
    const charW = l.digitHeight * l.aspect
    const width = Math.max(charW, charW * l.text.length)
    return {
      x: l.x,
      y: l.y,
      width,
      height: l.digitHeight,
      rotation: l.rotation,
      skewX: l.skewX,
      skewY: l.skewY,
    }
  }
  return {
    x: l.x,
    y: l.y,
    width: l.width,
    height: l.height,
    rotation: l.rotation,
    skewX: 0,
    skewY: 0,
  }
}
