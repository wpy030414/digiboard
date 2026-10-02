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
  PixelLayer,
  Scene,
  SceneSize,
  Tool,
  WidgetLayer,
  WidgetKind,
} from './types'
import {
  cloneLayer,
  cloneScene,
  createDefaultScene,
  createLayer,
  createPixelLayer,
  resizeScene,
} from './factories'
import { bresenhamLine, floodFill, setPixel } from './pixels'

const MAX_HISTORY = 100

interface SceneState {
  scene: Scene
  /** 当前选中图层 id。 */
  selectedId: string | null
  tool: Tool
  /** 像素画笔当前前景（点亮）——单色，作用于所有像素层。 */
  brushValue: 0 | 1

  past: Scene[]
  future: Scene[]

  // —— 场景级操作 ——
  setScene: (scene: Scene) => void
  newScene: (size: SceneSize) => void
  resize: (size: SceneSize) => void
  setBackground: (bg: string | null) => void

  // —— 图层管理 ——
  addLayer: (type: Layer['type'], widgetKind?: WidgetKind) => string
  addPixelLayer: () => string
  removeLayer: (id: string) => void
  duplicateLayer: (id: string) => string | null
  updateLayer: <T extends Layer>(id: string, patch: Partial<T>) => void
  reorderLayer: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void
  select: (id: string | null) => void
  setTool: (t: Tool) => void
  setBrushValue: (v: 0 | 1) => void

  // —— 像素绘制 ——
  drawPixel: (x: number, y: number, value: 0 | 1) => void
  drawLine: (x0: number, y0: number, x1: number, y1: number, value: 0 | 1) => void
  fillAt: (x: number, y: number, value: 0 | 1) => void
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
    scene: createDefaultScene(),
    selectedId: null,
    tool: 'pen',
    brushValue: 1,
    past: [],
    future: [],

    commitHistory: () => pushHistory(get().scene),

    setScene: (scene) => set({ scene, selectedId: scene.layers[0]?.id ?? null }),

    newScene: (size) =>
      set(() => {
        const scene = createDefaultScene(size)
        return {
          scene,
          selectedId: scene.layers[scene.layers.length - 1]?.id ?? null,
          past: [],
          future: [],
        }
      }),

    resize: (size) =>
      set((s) => {
        pushHistory(s.scene)
        return { scene: resizeScene(s.scene, size) }
      }),

    setBackground: (bg) => set((s) => ({ scene: { ...s.scene, background: bg } })),

    addLayer: (type, widgetKind) => {
      const scene = get().scene
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

    addPixelLayer: () => {
      const scene = get().scene
      pushHistory(scene)
      const layer = createPixelLayer(scene.size)
      set((s) => ({
        scene: { ...s.scene, layers: [...s.scene.layers, layer] },
        selectedId: layer.id,
      }))
      return layer.id
    },

    removeLayer: (id) =>
      set((s) => {
        pushHistory(s.scene)
        const layers = s.scene.layers.filter((l) => l.id !== id)
        const selectedId =
          s.selectedId === id ? (layers[layers.length - 1]?.id ?? null) : s.selectedId
        return { scene: { ...s.scene, layers }, selectedId }
      }),

    duplicateLayer: (id) => {
      const scene = get().scene
      const idx = scene.layers.findIndex((l) => l.id === id)
      if (idx < 0) return null
      pushHistory(scene)
      const src = scene.layers[idx]!
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
        const layers = s.scene.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l))
        return { scene: { ...s.scene, layers } }
      }),

    reorderLayer: (id, dir) =>
      set((s) => {
        const layers = [...s.scene.layers]
        const idx = layers.findIndex((l) => l.id === id)
        if (idx < 0) return s
        const [item] = layers.splice(idx, 1)
        let target: number
        switch (dir) {
          case 'up':
            target = Math.min(layers.length, idx + 1)
            break
          case 'down':
            target = Math.max(0, idx - 1)
            break
          case 'top':
            target = layers.length
            break
          case 'bottom':
            target = 0
            break
        }
        layers.splice(target, 0, item!)
        return { scene: { ...s.scene, layers } }
      }),

    select: (id) => set({ selectedId: id }),
    setTool: (t) => set({ tool: t }),
    setBrushValue: (v) => set({ brushValue: v }),

    // —— 像素绘制（作用于选中的像素层，或第一个像素层）——
    drawPixel: (x, y, value) => {
      const s = get()
      const targetId = resolvePixelTarget(s.scene, s.selectedId)
      if (!targetId) return
      set((st) => ({
        scene: {
          ...st.scene,
          layers: withPixelLayer(st.scene.layers, targetId, (px) => {
            setPixel(px.pixels, x, y, px.w, px.h, value)
          }),
        },
      }))
    },

    drawLine: (x0, y0, x1, y1, value) => {
      const s = get()
      const targetId = resolvePixelTarget(s.scene, s.selectedId)
      if (!targetId) return
      const pts = bresenhamLine(x0, y0, x1, y1)
      set((st) => ({
        scene: {
          ...st.scene,
          layers: withPixelLayer(st.scene.layers, targetId, (px) => {
            for (const p of pts) setPixel(px.pixels, p.x, p.y, px.w, px.h, value)
          }),
        },
      }))
    },

    fillAt: (x, y, value) => {
      const s = get()
      const targetId = resolvePixelTarget(s.scene, s.selectedId)
      if (!targetId) return
      pushHistory(s.scene)
      set((st) => ({
        scene: {
          ...st.scene,
          layers: withPixelLayer(st.scene.layers, targetId, (px) => {
            floodFill(px.pixels, px.w, px.h, x, y, value)
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
