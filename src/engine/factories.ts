/**
 * 图层与场景工厂：生成带默认值的各类图层，处理 id 分配与画布 resize。
 */

import type {
  DigitLayer,
  Layer,
  PixelLayer,
  Scene,
  SceneSize,
  WidgetLayer,
  WidgetKind,
} from './types'
import { SCENE_VERSION } from './types'

let idCounter = 0
/** 生成图层 id。带时间前缀保证跨会话唯一、可读。 */
export function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`
}

/** 重置 id 计数器（测试用）。 */
export function resetIdCounter(): void {
  idCounter = 0
}

export function createPixelLayer(size: SceneSize, overrides: Partial<PixelLayer> = {}): PixelLayer {
  return {
    id: nextId('px'),
    name: '像素层',
    type: 'pixel',
    visible: true,
    locked: false,
    opacity: 1,
    color: '#ffaacc',
    w: size.w,
    h: size.h,
    pixels: new Uint8Array(size.w * size.h),
    ...overrides,
  }
}

export function createDigitLayer(size: SceneSize, overrides: Partial<DigitLayer> = {}): DigitLayer {
  const digitHeight = Math.max(8, Math.round(size.h * 0.5))
  return {
    id: nextId('dg'),
    name: '数码管',
    type: 'digit',
    visible: true,
    locked: false,
    opacity: 1,
    text: '8888',
    x: size.w * 0.1,
    y: size.h * 0.25,
    digitHeight,
    aspect: 0.6,
    thicknessRatio: 0.16,
    gapRatio: 0.12,
    color: '#ff3b3b',
    glow: 0.55,
    glowColor: '#ff3b3b',
    rotation: 0,
    skewX: -6,
    skewY: 0,
    segmentStyle: 'sharp',
    showOffSegments: true,
    offColor: '#3a0d0d',
    ...overrides,
  }
}

export function createWidgetLayer(
  size: SceneSize,
  widgetKind: WidgetKind = 'claude-status',
  overrides: Partial<WidgetLayer> = {},
): WidgetLayer {
  return {
    id: nextId('wg'),
    name: widgetKind === 'claude-status' ? 'Claude 会话' : '小组件',
    type: 'widget',
    visible: true,
    locked: false,
    opacity: 1,
    widgetKind,
    x: size.w * 0.05,
    y: size.h * 0.6,
    width: size.w * 0.4,
    height: size.h * 0.3,
    rotation: 0,
    color: '#ffaacc',
    config: {},
    ...overrides,
  }
}

/** 按类型分发的图层工厂。 */
export function createLayer(
  type: Layer['type'],
  size: SceneSize,
  overrides: Partial<Layer> = {},
): Layer {
  switch (type) {
    case 'pixel':
      return createPixelLayer(size, overrides as Partial<PixelLayer>)
    case 'digit':
      return createDigitLayer(size, overrides as Partial<DigitLayer>)
    case 'widget':
      return createWidgetLayer(
        size,
        (overrides as WidgetLayer).widgetKind ?? 'claude-status',
        overrides as Partial<WidgetLayer>,
      )
  }
}

/** 创建一个初始场景：一块画布 + 一个像素层 + 一个数码管层。 */
export function createDefaultScene(size: SceneSize = { w: 80, h: 60 }): Scene {
  return {
    version: SCENE_VERSION,
    size,
    background: '#101014',
    layers: [createPixelLayer(size), createDigitLayer(size)],
  }
}

/**
 * 场景 resize：调整 size，并把所有像素层重采样到新尺寸
 * （保留左上角重叠区内容，新增区补 0，缩小则裁剪）。
 * 矢量层不受影响（浮点坐标独立于网格）。
 */
export function resizeScene(scene: Scene, next: SceneSize): Scene {
  const layers = scene.layers.map((layer) => {
    if (layer.type !== 'pixel') return layer
    const np = new Uint8Array(next.w * next.h)
    const copyW = Math.min(layer.w, next.w)
    const copyH = Math.min(layer.h, next.h)
    for (let y = 0; y < copyH; y++) {
      for (let x = 0; x < copyW; x++) {
        np[y * next.w + x] = layer.pixels[y * layer.w + x] ?? 0
      }
    }
    return { ...layer, w: next.w, h: next.h, pixels: np }
  })
  return { ...scene, size: { ...next }, layers }
}

/** 深拷贝场景（像素层 clone，其余结构复制）。用于历史快照。 */
export function cloneScene(scene: Scene): Scene {
  return {
    ...scene,
    size: { ...scene.size },
    layers: scene.layers.map(cloneLayer),
  }
}

export function cloneLayer(layer: Layer): Layer {
  if (layer.type === 'pixel') {
    return { ...layer, pixels: new Uint8Array(layer.pixels) }
  }
  if (layer.type === 'widget') {
    return { ...layer, config: { ...layer.config } }
  }
  return { ...layer }
}
