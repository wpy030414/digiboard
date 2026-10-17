/**
 * 场景 ⇄ YAML 序列化。
 *
 * 设计目标：
 *  - 无损：导出的 yml 再 import 可完整复原场景（含像素、矢量参数、小组件配置）。
 *  - 紧凑：像素层用 RLE 编码（大面积同色时极短），避免 yml 里塞入上万个 0/1。
 *  - 可读：保留图层顺序、命名、类型，便于人工查看/编辑与跨会话传递。
 *
 * Uint8Array 不能直接进 YAML，故像素层转为 `{ encoding: 'rle', data: number[] }`。
 */

import { dump, load } from 'js-yaml'
import type { DigitLayer, Layer, PixelLayer, Scene, WidgetLayer } from '../types'
import { DEFAULT_OFF_DOT_COLOR, DEFAULT_PIXEL_COLOR, MAX_SCENE_SIZE, SCENE_VERSION } from '../types'
import { normalizeScene } from '../factories'
import { rleDecode, rleEncode } from '../pixels'

/** YAML 中像素数据的表示。 */
interface SerializedPixels {
  encoding: 'rle'
  w: number
  h: number
  data: number[]
}

/** YAML 中各图层的可序列化形态（像素层用 SerializedPixels 替代 Uint8Array）。 */
type SerializedPixelLayer = Omit<PixelLayer, 'pixels'> & { pixels: SerializedPixels }
type SerializedLayer = SerializedPixelLayer | DigitLayer | WidgetLayer

interface SerializedScene {
  version: number
  size: { w: number; h: number }
  layers: SerializedLayer[]
}

/** 场景 → 可序列化对象（像素转 RLE）。 */
export function sceneToSerializable(scene: Scene): SerializedScene {
  return {
    version: SCENE_VERSION,
    size: { w: scene.size.w, h: scene.size.h },
    layers: scene.layers.map(serializeLayer),
  }
}

function serializeLayer(layer: Layer): SerializedLayer {
  if (layer.type !== 'pixel') return layer as DigitLayer | WidgetLayer
  const { pixels, ...rest } = layer
  return {
    ...rest,
    pixels: {
      encoding: 'rle',
      w: layer.w,
      h: layer.h,
      data: rleEncode(pixels),
    },
  }
}

/** 可序列化对象 → 场景（RLE 还原为 Uint8Array）。 */
function assertSize(w: number, h: number): void {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
    throw new Error(`无效点阵尺寸 ${w}×${h}`)
  }
  if (w > MAX_SCENE_SIZE || h > MAX_SCENE_SIZE) {
    throw new Error(`点阵尺寸超限 ${w}×${h}（上限 ${MAX_SCENE_SIZE}×${MAX_SCENE_SIZE}）`)
  }
}

export function sceneFromSerializable(obj: SerializedScene): Scene {
  assertSize(obj.size.w, obj.size.h)
  return normalizeScene({
    version: obj.version ?? SCENE_VERSION,
    size: { w: obj.size.w, h: obj.size.h },
    layers: (obj.layers ?? []).map(deserializeLayer),
  })
}

function deserializeLayer(raw: SerializedLayer): Layer {
  if (raw.type !== 'pixel') return raw as DigitLayer | WidgetLayer
  const { pixels, ...rest } = raw as SerializedPixelLayer & { color?: string }
  const w = pixels.w ?? rest.w
  const h = pixels.h ?? rest.h
  assertSize(w, h)
  // 旧版单色场景用 `color` 字段：迁移为调色板首色（像素值 1 仍指向它）
  const { color: legacyColor, ...layerRest } = rest as typeof rest & { color?: string }
  return {
    ...layerRest,
    palette: layerRest.palette ?? (legacyColor ? [legacyColor] : [DEFAULT_PIXEL_COLOR]),
    // 旧场景没有 offColor：补默认灭点色，保持「玩具板」观感
    offColor: rest.offColor ?? DEFAULT_OFF_DOT_COLOR,
    w,
    h,
    pixels: rleDecode(pixels.data ?? [], w, h),
  } as PixelLayer
}

/** 场景 → YAML 字符串。 */
export function sceneToYaml(scene: Scene): string {
  return dump(sceneToSerializable(scene), {
    lineWidth: 120,
    noRefs: true,
    quoteStyle: 'double',
  })
}

/**
 * YAML 字符串 → 场景。带基本结构校验，非法输入抛错。
 * @throws 当 yml 缺失 size/layers 或格式错误时。
 */
export function sceneFromYaml(text: string): Scene {
  const raw = load(text) as Partial<SerializedScene> | null
  if (!raw || typeof raw !== 'object') {
    throw new Error('无效的 DigiBoard YAML：顶层必须是对象')
  }
  if (!raw.size || typeof raw.size.w !== 'number' || typeof raw.size.h !== 'number') {
    throw new Error('无效的 DigiBoard YAML：缺少 size.w / size.h')
  }
  if (!Array.isArray(raw.layers)) {
    throw new Error('无效的 DigiBoard YAML：layers 必须是数组')
  }
  return sceneFromSerializable(raw as SerializedScene)
}

/**
 * 场景 → base64 编码的 YAML，用于放进播放页 URL（?scene=…）。
 * 用 TextEncoder 做 UTF-8 安全的 base64（兼容中文图层名）。
 */
export function sceneToBase64Yaml(scene: Scene): string {
  const ymlStr = sceneToYaml(scene)
  const bytes = new TextEncoder().encode(ymlStr)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** base64 YAML → 场景。 */
export function sceneFromBase64Yaml(b64: string): Scene {
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  const ymlStr = new TextDecoder().decode(bytes)
  return sceneFromYaml(ymlStr)
}
