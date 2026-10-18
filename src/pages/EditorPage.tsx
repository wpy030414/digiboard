/**
 * 编辑器页面：工具栏 + 合成画布 + 右侧共享栏（属性 60% / 小组件 40%）。
 * 负责：视图缩放/网格状态、导出 png/yml、跳转播放页、键盘快捷键。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Toolbar, MAX_SCALE, clampScale } from '@/editor/Toolbar'
import { LayerPanel } from '@/editor/LayerPanel'
import { PropertyPanel } from '@/editor/PropertyPanel'
import { SceneCanvas } from '@/engine/render/SceneCanvas'
import { BEADS_LABEL_PAD } from '@/engine/render/BeadsOverlay'
import { useSceneStore } from '@/engine/scene-store'
import { sceneToBase64Yaml, sceneToYaml } from '@/engine/export/to-yaml'
import { downloadScenePng, downloadText } from '@/engine/export/to-png'
import { beadsExportUnit } from '@/engine/export/beads-export'
import { useSyncBridgeUrl } from '@/widgets/claude-status/use-sync-bridge-url'
import { usePersistScene } from '@/editor/use-persist-scene'
import { isMobileViewport } from '@/lib/viewport'
import { setActiveTouches } from '@/engine/pinch'
import { BeadsLegend } from '@/editor/BeadsLegend'
import {
  loadBeadsMode,
  loadSidebarVisible,
  saveBeadsMode,
  saveSidebarVisible,
} from '@/engine/persistence'
import type { PixelLayer } from '@/engine/types'

/** 让画布按容器宽度自适应缩放（fit），并可手动覆盖。 */
function useAutoScale(containerW: number, sceneW: number) {
  const fit = sceneW > 0 && containerW > 0 ? Math.floor((containerW - 24) / sceneW) : 8
  return Math.min(MAX_SCALE, Math.max(1, fit))
}

export function EditorPage() {
  const scene = useSceneStore((s) => s.scene)
  const undo = useSceneStore((s) => s.undo)
  const redo = useSceneStore((s) => s.redo)
  const setTool = useSceneStore((s) => s.setTool)
  const navigate = useNavigate()

  // 把场景里 Claude 小组件的 bridgeUrl 同步给状态 store（驱动 App 的 SSE 连接）
  useSyncBridgeUrl(scene)
  // 每步编辑防抖持久化到 localStorage（刷新后可恢复）
  usePersistScene()

  const [scale, setScaleState] = useState(6)
  const [autoFit, setAutoFit] = useState(true)
  const [beads, setBeadsState] = useState(() => loadBeadsMode())
  // 新建 / 保存对话框（⌘N / ⌘S 与工具栏按钮共用）
  const [newOpen, setNewOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  // 右侧栏（属性 / 小组件）显隐：移动端默认收纳（窄屏优先给画布），桌面端沿用偏好
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobileViewport() && loadSidebarVisible())
  // 图例筛选：只显示某个颜色（像素值 1..），null = 全部
  const [beadsFilter, setBeadsFilter] = useState<number | null>(null)

  const setBeads = useCallback((on: boolean) => {
    setBeadsState(on)
    saveBeadsMode(on)
    if (!on) setBeadsFilter(null)
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      // 移动端不记忆：展开只是临时查看，下次打开仍默认收纳
      if (!isMobileViewport()) saveSidebarVisible(!prev)
      return !prev
    })
  }, [])

  const pixelLayer = scene.layers.find((l): l is PixelLayer => l.type === 'pixel')
  const pixelLayerId = pixelLayer?.id

  // 换场景/改尺寸后，旧的筛选色号可能已失效
  useEffect(() => {
    setBeadsFilter(null)
  }, [pixelLayerId, scene.size.w, scene.size.h])
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportW, setViewportW] = useState(0)

  // 监听视口宽度做自适应缩放
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (cr) setViewportW(cr.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fittedScale = useAutoScale(viewportW, scene.size.w)
  const effectiveScale = autoFit ? fittedScale : scale

  const setScale = useCallback(
    (fn: (s: number) => number) => {
      setAutoFit(false)
      // 自适应状态下屏幕上显示的是 fittedScale：缩放要从它接着走，
      // 否则会从上次手动缩放值（初始 6）起跳，出现 3200% → 750% 的断崖。
      setScaleState((prev) => {
        const base = autoFit ? fittedScale : prev
        return Math.round(fn(base) * 100) / 100
      })
    },
    [autoFit, fittedScale],
  )

  // 手势缩放基准：fit 态下屏幕显示的是 fittedScale，手势要从它接着走
  const effectiveScaleRef = useRef(effectiveScale)
  useEffect(() => {
    effectiveScaleRef.current = effectiveScale
  }, [effectiveScale])

  /**
   * 按倍率连续缩放（手势用）：直接以「当前显示倍率」为基准，
   * 同一帧内的多个事件也能正确累积，不会从旧 state 起跳。
   */
  const zoomBy = useCallback((factor: number) => {
    const next = clampScale(effectiveScaleRef.current * factor)
    if (next === effectiveScaleRef.current) return
    effectiveScaleRef.current = next
    setAutoFit(false)
    setScaleState(next)
  }, [])

  // 主内容区手势缩放：触控板捏合（浏览器上报为 ctrl+wheel）与触屏双指捏合
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      // 普通滚轮留给容器滚动，只接管捏合（macOS/Windows 均以 ctrlKey 上报）
      if (!e.ctrlKey) return
      e.preventDefault()
      // deltaMode=1 的设备按「行」上报
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      zoomBy(Math.exp(-delta * 0.002))
    }

    let pinchDist = 0
    const distance = (t: TouchList) =>
      Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY)

    const onTouchStart = (e: TouchEvent) => {
      setActiveTouches(e.touches.length)
      pinchDist = e.touches.length === 2 ? distance(e.touches) : 0
    }

    const onTouchMove = (e: TouchEvent) => {
      setActiveTouches(e.touches.length)
      if (e.touches.length !== 2) {
        pinchDist = 0
        return
      }
      // 阻止浏览器原生缩放/滚动，改由画布自身无级缩放
      e.preventDefault()
      const d = distance(e.touches)
      if (pinchDist > 0 && d > 0) zoomBy(d / pinchDist)
      pinchDist = d
    }

    const onTouchEnd = (e: TouchEvent) => {
      setActiveTouches(e.touches.length)
      pinchDist = 0
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [zoomBy])

  // 键盘快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      // 输入框内不拦截
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        setSaveOpen(true)
        return
      }
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setNewOpen(true)
        return
      }
      if (mod) return
      switch (e.key.toLowerCase()) {
        case 'v':
          setTool('select')
          break
        case 'b':
          setTool('pen')
          break
        case 'e':
          setTool('eraser')
          break
        case 'g':
          setTool('fill')
          break
        case 'i':
          setTool('picker')
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, setTool, scene])

  const handleExportPng = useCallback(() => {
    void downloadScenePng(scene, `digiboard-${scene.size.w}x${scene.size.h}.png`, {
      // 拼豆成品与屏幕缩放无关，固定用高密度导出；普通模式仍跟随当前倍率
      pixelSize: beads ? beadsExportUnit(scene) : Math.max(4, Math.round(effectiveScale)),
      beads,
    })
  }, [scene, effectiveScale, beads])

  const handleExportYaml = useCallback(() => {
    downloadText(sceneToYaml(scene), `digiboard-${scene.size.w}x${scene.size.h}.yml`)
  }, [scene])

  const handlePlay = useCallback(() => {
    const b64 = sceneToBase64Yaml(scene)
    navigate(`/play?scene=${encodeURIComponent(b64)}`)
  }, [scene, navigate])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Toolbar
        scale={effectiveScale}
        setScale={setScale}
        beads={beads}
        setBeads={setBeads}
        saveOpen={saveOpen}
        setSaveOpen={setSaveOpen}
        newOpen={newOpen}
        setNewOpen={setNewOpen}
        onExportPng={handleExportPng}
        onExportYaml={handleExportYaml}
        onPlay={handlePlay}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <main
            ref={viewportRef}
            data-testid="canvas-viewport"
            className="relative flex min-w-0 flex-1 overflow-auto bg-muted/40 p-3"
          >
            {/* m-auto 而不是 items/justify-center：内容超出视口时居中会把上/左侧
                的溢出部分挤出可滚动区域，导致大倍率下画布顶部被吃掉且滚不上去 */}
            <div className="m-auto flex flex-col items-center gap-2">
              <div className="relative" style={beads ? { padding: BEADS_LABEL_PAD } : undefined}>
                <div
                  className="absolute -inset-px rounded-sm ring-1 ring-border"
                  aria-hidden
                  style={{ pointerEvents: 'none' }}
                />
                <SceneCanvas
                  scene={scene}
                  scale={effectiveScale}
                  mode="edit"
                  beads={beads}
                  onlyValue={beads ? beadsFilter : null}
                />
              </div>
            </div>
          </main>
          {/* 图例固定在画布区下方、撑满整栏：不随画布倍率变化，也不随画布滚走 */}
          {beads && pixelLayer && (
            <div
              className="max-h-52 shrink-0 overflow-y-auto border-t bg-card p-2"
              data-testid="beads-legend-bar"
            >
              <BeadsLegend
                layer={pixelLayer}
                selectedValue={beadsFilter}
                onSelect={setBeadsFilter}
              />
            </div>
          )}
        </div>
        {/* 右侧共享栏：属性在上（60%），小组件在下（40%）；可整体收起 */}
        {sidebarOpen && (
          <aside
            className="flex h-full w-72 shrink-0 flex-col border-l bg-card"
            data-testid="sidebar"
          >
            <div className="flex min-h-0 flex-[3] flex-col">
              <PropertyPanel />
            </div>
            <div className="flex min-h-0 flex-[2] flex-col border-t">
              <LayerPanel />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
