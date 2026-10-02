/**
 * 信息流小组件渲染器 —— 浮点定位的 DOM/SVG 层。
 *
 * 小组件内容由「注册表」按 widgetKind 分发渲染。阶段 2 提供占位实现，
 * 阶段 5 注册真正的 Claude Code 会话状态小组件。
 *
 * 与数码管一样，小组件层不受点阵网格量化，可任意定位/旋转/超出画布。
 */

import { memo } from 'react'
import type { WidgetLayer, WidgetKind } from '../types'
import { layerToScene, matrixToCss } from '../transform'

/** 小组件渲染器签名：在局部坐标系（0,0 到 width,height）内绘制内容。 */
export interface WidgetRendererProps {
  layer: WidgetLayer
  /** 场景单位 → 屏幕像素的显示缩放。 */
  scale: number
}
export type WidgetRenderer = (props: WidgetRendererProps) => React.ReactNode

const registry = new Map<WidgetKind, WidgetRenderer>()

/** 注册一种小组件渲染器。 */
export function registerWidget(kind: WidgetKind, renderer: WidgetRenderer): void {
  registry.set(kind, renderer)
}

/** 取小组件渲染器（不存在时返回 null）。 */
export function getWidget(kind: WidgetKind): WidgetRenderer | undefined {
  return registry.get(kind)
}

interface WidgetLayerViewProps {
  layer: WidgetLayer
  scale: number
  selected?: boolean
}

export const WidgetLayerView = memo(function WidgetLayerView({
  layer,
  scale,
  selected = false,
}: WidgetLayerViewProps) {
  // DOM 层：内容盒已是屏幕像素尺寸（width*scale），故直接在屏幕空间构建矩阵，
  // 把缩放后的定位/尺寸喂给 layerToScene（x、cx 等均线性缩放，结果正确）。
  const m = layerToScene({
    x: layer.x * scale,
    y: layer.y * scale,
    width: layer.width * scale,
    height: layer.height * scale,
    rotation: layer.rotation,
    skewX: 0,
    skewY: 0,
  })

  const renderer = getWidget(layer.widgetKind)

  return (
    <div
      data-widget-layer={layer.id}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: layer.width * scale,
        height: layer.height * scale,
        transform: matrixToCss(m),
        transformOrigin: '0 0',
        opacity: layer.opacity,
        pointerEvents: 'none',
        outline: selected ? '1px dashed #ffaacc' : 'none',
      }}
    >
      {renderer ? (
        renderer({ layer, scale })
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${layer.color}`,
            borderRadius: 4,
            color: layer.color,
            fontSize: Math.max(8, layer.height * scale * 0.18),
            fontFamily: 'ui-monospace, monospace',
            opacity: 0.7,
          }}
        >
          widget: {layer.widgetKind}
        </div>
      )}
    </div>
  )
})
