/**
 * 场景状态管理（zustand）+ 撤销/重做历史栈。
 *
 * 不可变约定：任何会改变像素内容的操作前，先 clone 相关像素层，
 * 使历史栈中的旧场景与新场景不共享同一 Uint8Array 引用。
 * 矢量层是普通对象，天然靠展开复制实现不可变。
 */

import { create } from 'zustand'
import type {
  DigitLayer,
  Layer,
  PixelArtSource,
  PixelLayer,
  Scene,
  SceneSize,
  Tool,
  WidgetLayer,
  WidgetKind,
} from './types'
import { DEFAULT_PIXEL_COLOR } from './types'
import { snapWidgetLayer } from './footprint'
import {
  cloneLayer,
  cloneScene,
  createBlankScene,
  createLayer,
  normalizeScene,
  resizeScene,
} from './factories'
import { bresenhamLine, floodFill, setPixel } from './pixels'
import { loadPersistedScene } from './persistence'
import { loadPresetScene } from './presets'
import { MAX_BEAD_COLORS, nearestBeadColor } from './beads-palette'

const MAX_HISTORY = 100

interface SceneState {
  scene: Scene
  /** 当前选中图层 id。 */
  selectedId: string | null
  tool: Tool
  /** 当前画笔颜色。写入时自动登记进像素基座调色板，实现单层多色混搭。 */
  brushColor: string

  past: Scene[]
  future: Scene[]

  // —— 场景级操作 ——
  setScene: (scene: Scene) => void
  /** 新建空白场景；传入 `source` 时直接作为像素基座内容（图片生成用）。 */
  newScene: (size: SceneSize, source?: PixelArtSource) => void
  resize: (size: SceneSize) => void

  // —— 图层管理 ——
  /** 追加内容层（digit/widget）。像素层是唯一基座，传入 'pixel' 不会新增。 */
  addLayer: (type: Layer['type'], widgetKind?: WidgetKind) => string
  removeLayer: (id: string) => void
  duplicateLayer: (id: string) => string | null
  updateLayer: <T extends Layer>(id: string, patch: Partial<T>) => void
  reorderLayer: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void
  select: (id: string | null) => void
  setTool: (t: Tool) => void
  setBrushColor: (color: string) => void

  // —— 像素绘制（color=null 表示擦除）——
  drawPixel: (x: number, y: number, color: string | null) => void
  drawLine: (x0: number, y0: number, x1: number, y1: number, color: string | null) => void
  fillAt: (x: number, y: number, color: string | null) => void
  clearPixelLayer: (id: string) => void

  // —— 历史 ——
  undo: () => void
  redo: () => void
  /** 提交一次历史快照：把当前 scene 压入 past，清空 future。 */
  commitHistory: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

/**
 * 修改像素层的辅助：找到目标像素层，clone 后交给 mutator 原地改，
 * 返回新的 layers 数组（不改动原数组与其它图层）。
 */
function withPixelLayer(layers: Layer[], id: string, mutate: (px: PixelLayer) => void): Layer[] {
  return layers.map((l) => {
    if (l.id !== id || l.type !== 'pixel') return l
    const copy = cloneLayer(l) as PixelLayer
    mutate(copy)
    return copy
  })
}

/**
 * 把画笔颜色解析为像素值：0=灭，1..=调色板下标+1。
 * 新颜色自动登记进调色板（上限为拼豆色卡 221 色，超出时退回首色）。
 * 必须作用于「已 clone 的图层」，否则会破坏历史快照的不可变性。
 */
function colorToValue(layer: PixelLayer, color: string | null): number {
  if (color === null) return 0
  const idx = layer.palette.indexOf(color)
  if (idx >= 0) return idx + 1
  if (layer.palette.length >= MAX_BEAD_COLORS) return 1
  layer.palette.push(color)
  return layer.palette.length
}

function firstPixelId(scene: Scene): string | null {
  const px = scene.layers.find((l) => l.type === 'pixel')
  return px ? px.id : null
}

export const useSceneStore = create<SceneState>((set, get) => {
  const pushHistory = (scene: Scene) => {
    set((s) => {
      const past = [...s.past, cloneScene(scene)]
      if (past.length > MAX_HISTORY) past.shift()
      return { past, future: [] }
    })
  }

  return {
    // 优先恢复上次编辑（localStorage 防抖持久化）；新用户首次访问展示内置预设屏幕
    scene: loadPersistedScene() ?? loadPresetScene(),
    selectedId: null,
    // 刷新后默认停在指针工具：先观察与选中，再决定是否动笔
    tool: 'select',
    // 画笔颜色统一落在拼豆色卡上（默认粉吸附到 E19）
    brushColor: nearestBeadColor(DEFAULT_PIXEL_COLOR).hex,
    past: [],
    future: [],

    commitHistory: () => pushHistory(get().scene),

    setScene: (scene) => {
      const normalized = normalizeScene(scene)
      set({
        scene: normalized,
        selectedId: normalized.layers.find((l) => l.type !== 'pixel')?.id ?? null,
      })
    },

    newScene: (size, source) =>
      set(() => {
        // 「新建」得到一张干净空白画布：只有像素基座，不带数码管/小组件
        const scene = normalizeScene(createBlankScene(size))
        if (source) {
          const base = scene.layers[0]
          if (base?.type === 'pixel' && source.pixels.length === base.w * base.h) {
            scene.layers[0] = {
              ...base,
              palette: [...source.palette],
              pixels: new Uint8Array(source.pixels),
            }
          }
        }
        return { scene, selectedId: null, past: [], future: [] }
      }),

    resize: (size) =>
      set((s) => {
        pushHistory(s.scene)
        return { scene: resizeScene(s.scene, size) }
      }),

    addLayer: (type, widgetKind) => {
      const scene = get().scene
      // 像素层是唯一基座：不可新增，直接返回现有基座 id
      if (type === 'pixel') return scene.layers.find((l) => l.type === 'pixel')?.id ?? ''
      pushHistory(scene)
      const layer = createLayer(
        type,
        scene.size,
        widgetKind ? ({ widgetKind } as Partial<WidgetLayer>) : {},
      )
      set((s) => ({
        scene: { ...s.scene, layers: [...s.scene.layers, layer] },
        selectedId: layer.id,
      }))
      return layer.id
    },

    removeLayer: (id) =>
      set((s) => {
        const target = s.scene.layers.find((l) => l.id === id)
        // 像素基座不可删除
        if (!target || target.type === 'pixel') return s
        pushHistory(s.scene)
        const layers = s.scene.layers.filter((l) => l.id !== id)
        const selectedId =
          s.selectedId === id
            ? (layers.filter((l) => l.type !== 'pixel').at(-1)?.id ?? null)
            : s.selectedId
        return { scene: { ...s.scene, layers }, selectedId }
      }),

    duplicateLayer: (id) => {
      const scene = get().scene
      const idx = scene.layers.findIndex((l) => l.id === id)
      if (idx < 0) return null
      const src = scene.layers[idx]!
      // 像素基座不可复制（唯一性）
      if (src.type === 'pixel') return null
      pushHistory(scene)
      const copy = cloneLayer(src)
      // 新 id：clone 保留了旧 id，需替换
      const newId = `${src.type.slice(0, 2)}-${Date.now().toString(36)}-cp`
      const newLayer = { ...copy, id: newId, name: `${src.name} 副本` } as Layer
      set((s) => {
        const layers = [...s.scene.layers]
        layers.splice(idx + 1, 0, newLayer)
        return { scene: { ...s.scene, layers }, selectedId: newId }
      })
      return newId
    },

    updateLayer: <T extends Layer>(id: string, patch: Partial<T>) =>
      set((s) => {
        const layers = s.scene.layers.map((l) => {
          if (l.id !== id) return l
          const merged = { ...l, ...patch } as Layer
          // 小组件强制吸附网格：拖拽、属性面板、程序化更新共用这一道闸
          return merged.type === 'widget' ? snapWidgetLayer(merged) : merged
        })
        return { scene: { ...s.scene, layers } }
      }),

    reorderLayer: (id, dir) =>
      set((s) => {
        const layers = [...s.scene.layers]
        const idx = layers.findIndex((l) => l.id === id)
        if (idx < 0) return s
        const item = layers[idx]!
        // 像素基座固定在最底部，不参与排序
        if (item.type === 'pixel') return s
        // 内容层的下界：基座之上（基座始终位于 index 0）
        const floor = layers.some((l) => l.type === 'pixel') ? 1 : 0
        layers.splice(idx, 1)
        let target: number
        switch (dir) {
          case 'up':
            target = Math.min(layers.length, idx + 1)
            break
          case 'down':
            target = Math.max(floor, idx - 1)
            break
          case 'top':
            target = layers.length
            break
          case 'bottom':
            target = floor
            break
        }
        layers.splice(target, 0, item)
        return { scene: { ...s.scene, layers } }
      }),

    select: (id) => set({ selectedId: id }),
    setTool: (t) => set({ tool: t }),
    // 手选颜色也降级到最近的拼豆色号，避免画布出现买不到的豆色
    setBrushColor: (color) => set({ brushColor: nearestBeadColor(color).hex }),

    // —— 像素绘制（作用于选中的像素层，或第一个像素层）——
    drawPixel: (x, y, color) => {
      const s = get()
      const targetId = resolvePixelTarget(s.scene, s.selectedId)
      if (!targetId) return
      set((st) => ({
        scene: {
          ...st.scene,
          layers: withPixelLayer(st.scene.layers, targetId, (px) => {
            setPixel(px.pixels, x, y, px.w, px.h, colorToValue(px, color))
          }),
        },
      }))
    },

    drawLine: (x0, y0, x1, y1, color) => {
      const s = get()
      const targetId = resolvePixelTarget(s.scene, s.selectedId)
      if (!targetId) return
      const pts = bresenhamLine(x0, y0, x1, y1)
      set((st) => ({
        scene: {
          ...st.scene,
          layers: withPixelLayer(st.scene.layers, targetId, (px) => {
            const value = colorToValue(px, color)
            for (const p of pts) setPixel(px.pixels, p.x, p.y, px.w, px.h, value)
          }),
        },
      }))
    },

    fillAt: (x, y, color) => {
      const s = get()
      const targetId = resolvePixelTarget(s.scene, s.selectedId)
      if (!targetId) return
      pushHistory(s.scene)
      set((st) => ({
        scene: {
          ...st.scene,
          layers: withPixelLayer(st.scene.layers, targetId, (px) => {
            floodFill(px.pixels, px.w, px.h, x, y, colorToValue(px, color))
          }),
        },
      }))
    },

    clearPixelLayer: (id) => {
      pushHistory(get().scene)
      set((st) => ({
        scene: {
          ...st.scene,
          layers: withPixelLayer(st.scene.layers, id, (px) => {
            px.pixels.fill(0)
          }),
        },
      }))
    },

    undo: () =>
      set((s) => {
        if (s.past.length === 0) return s
        const past = [...s.past]
        const prev = past.pop()!
        return {
          scene: prev,
          past,
          future: [cloneScene(s.scene), ...s.future],
          selectedId: clampSelection(prev, s.selectedId),
        }
      }),

    redo: () =>
      set((s) => {
        if (s.future.length === 0) return s
        const future = [...s.future]
        const next = future.shift()!
        return {
          scene: next,
          future,
          past: [...s.past, cloneScene(s.scene)],
          selectedId: clampSelection(next, s.selectedId),
        }
      }),

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,
  }
})

function resolvePixelTarget(scene: Scene, selectedId: string | null): string | null {
  if (selectedId) {
    const sel = scene.layers.find((l) => l.id === selectedId)
    if (sel && sel.type === 'pixel') return sel.id
  }
  return firstPixelId(scene)
}

/** undo/redo 后若选中层已不存在，回退到最后一层。 */
function clampSelection(scene: Scene, selectedId: string | null): string | null {
  if (selectedId && scene.layers.some((l) => l.id === selectedId)) return selectedId
  return scene.layers[scene.layers.length - 1]?.id ?? null
}

// —— 便捷 selector hooks ——
export const useScene = () => useSceneStore((s) => s.scene)
export const useSelectedLayer = (): Layer | null =>
  useSceneStore((s) => s.scene.layers.find((l) => l.id === s.selectedId) ?? null)
export const useSelectedDigitLayer = (): DigitLayer | null => {
  const l = useSelectedLayer()
  return l && l.type === 'digit' ? l : null
}
export const useSelectedWidgetLayer = (): WidgetLayer | null => {
  const l = useSelectedLayer()
  return l && l.type === 'widget' ? l : null
}
