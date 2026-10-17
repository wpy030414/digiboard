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
import { DEFAULT_OFF_DOT_COLOR, DEFAULT_PIXEL_COLOR, MAX_SCENE_SIZE, SCENE_VERSION } from './types'

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

/** 把尺寸夹到合法范围（1..MAX_SCENE_SIZE，整数）。 */
export function clampSceneSize(size: SceneSize): SceneSize {
  const clamp = (v: number) => Math.min(MAX_SCENE_SIZE, Math.max(1, Math.round(v || 1)))
  return { w: clamp(size.w), h: clamp(size.h) }
}

export function createPixelLayer(
  rawSize: SceneSize,
  overrides: Partial<PixelLayer> = {},
): PixelLayer {
  const size = clampSceneSize(rawSize)
  return {
    id: nextId('px'),
    name: '像素层',
    type: 'pixel',
    visible: true,
    locked: false,
    opacity: 1,
    palette: [DEFAULT_PIXEL_COLOR],
    offColor: DEFAULT_OFF_DOT_COLOR,
    w: size.w,
    h: size.h,
    pixels: new Uint8Array(size.w * size.h),
    ...overrides,
  }
}

export function createDigitLayer(
  rawSize: SceneSize,
  overrides: Partial<DigitLayer> = {},
): DigitLayer {
  const size = clampSceneSize(rawSize)
  // 默认数码管「8888」要完整落在板面内：宽度 ≈ 1.248 × digitHeight，
  // 同时受画布高宽约束，避免首次打开就溢出板外
  const digitHeight = Math.max(8, Math.round(Math.min(size.w * 0.3, size.h * 0.6)))
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
    skewX: -6,
    skewY: 0,
    segmentStyle: 'sharp',
    showOffSegments: true,
    offColor: '#3a0d0d',
    ...overrides,
  }
}

export function createWidgetLayer(
  rawSize: SceneSize,
  widgetKind: WidgetKind = 'claude-status',
  overrides: Partial<WidgetLayer> = {},
): WidgetLayer {
  const size = clampSceneSize(rawSize)
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

/** 创建一个空白场景：指定尺寸 + 仅一个像素层（编辑器「新建」用）。 */
export function createBlankScene(rawSize: SceneSize = { w: 40, h: 30 }): Scene {
  const size = clampSceneSize(rawSize)
  return {
    version: SCENE_VERSION,
    size,
    layers: [createPixelLayer(size)],
  }
}

/**
 * 归一化场景：保证像素层是唯一基座，且永远位于图层栈最底部。
 *
 * 像素层是画布本身（必备、不可删、不可增），内容层（digit/widget）叠在它上面。
 * 旧 YAML 里可能存在多个像素层或像素层不在底部：这里把它们的亮像素按坐标
 * 并集合并进基座，并统一尺寸到 `scene.size`。
 */
export function normalizeScene(scene: Scene): Scene {
  const size: SceneSize = clampSceneSize(scene.size)
  const pixelLayers = scene.layers.filter((l): l is PixelLayer => l.type === 'pixel')
  const contentLayers = scene.layers.filter((l) => l.type !== 'pixel')
  const base = pixelLayers.length > 0 ? mergePixelBase(pixelLayers, size) : createPixelLayer(size)
  return { ...scene, size, layers: [base, ...contentLayers] }
}

function mergePixelBase(layers: PixelLayer[], size: SceneSize): PixelLayer {
  const first = layers[0]!
  // 常见情况：只有一个像素层且尺寸吻合，直接复用（不复制缓冲区）
  if (layers.length === 1 && first.w === size.w && first.h === size.h) return first
  const merged = new Uint8Array(size.w * size.h)
  // 多个旧像素层的调色板按颜色去重合并，像素值随之重映射
  const palette = [...first.palette]
  const valueFor = (layer: PixelLayer, value: number): number => {
    if (value === 0) return 0
    const color = layer.palette[value - 1]
    if (!color) return 0
    let i = palette.indexOf(color)
    if (i < 0) {
      palette.push(color)
      i = palette.length - 1
    }
    return i + 1
  }
  for (const layer of layers) {
    const cw = Math.min(layer.w, size.w)
    const ch = Math.min(layer.h, size.h)
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const v = layer.pixels[y * layer.w + x] ?? 0
        if (v) merged[y * size.w + x] = valueFor(layer, v)
      }
    }
  }
  return { ...first, w: size.w, h: size.h, pixels: merged, palette }
}

/** 创建一个初始场景：一块画布 + 一个像素层 + 一个数码管层。 */
export function createDefaultScene(rawSize: SceneSize = { w: 80, h: 60 }): Scene {
  const size = clampSceneSize(rawSize)
  return {
    version: SCENE_VERSION,
    size,
    layers: [createPixelLayer(size), createDigitLayer(size)],
  }
}

/**
 * 场景 resize：调整 size，并把所有像素层重采样到新尺寸
 * （保留左上角重叠区内容，新增区补 0，缩小则裁剪）。
 * 矢量层不受影响（浮点坐标独立于网格）。
 */
export function resizeScene(scene: Scene, rawNext: SceneSize): Scene {
  const next = clampSceneSize(rawNext)
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
    return { ...layer, pixels: new Uint8Array(layer.pixels), palette: [...layer.palette] }
  }
  if (layer.type === 'widget') {
    return { ...layer, config: { ...layer.config } }
  }
  return { ...layer }
}
