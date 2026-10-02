/**
 * 编辑器页面：工具栏 + 图层面板 + 合成画布 + 属性面板 的四区布局。
 * 负责：视图缩放/网格状态、导出 png/yml、跳转播放页、键盘快捷键。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Toolbar } from '@/editor/Toolbar'
import { LayerPanel } from '@/editor/LayerPanel'
import { PropertyPanel } from '@/editor/PropertyPanel'
import { SceneCanvas } from '@/engine/render/SceneCanvas'
import { useSceneStore } from '@/engine/scene-store'
import { sceneToBase64Yaml, sceneToYaml } from '@/engine/export/to-yaml'
import { downloadScenePng, downloadText } from '@/engine/export/to-png'
import { useSyncBridgeUrl } from '@/widgets/claude-status/use-sync-bridge-url'

/** 让画布按容器宽度自适应缩放（fit），并可手动覆盖。 */
function useAutoScale(containerW: number, sceneW: number) {
  const fit = sceneW > 0 && containerW > 0 ? Math.floor((containerW - 24) / sceneW) : 8
  return Math.min(32, Math.max(1, fit))
}

export function EditorPage() {
  const scene = useSceneStore((s) => s.scene)
  const undo = useSceneStore((s) => s.undo)
  const redo = useSceneStore((s) => s.redo)
  const setTool = useSceneStore((s) => s.setTool)
  const navigate = useNavigate()

  // 把场景里 Claude 小组件的 bridgeUrl 同步给状态 store（驱动 App 的 SSE 连接）
  useSyncBridgeUrl(scene)

  const [scale, setScaleState] = useState(6)
  const [showGrid, setShowGrid] = useState(true)
  const [autoFit, setAutoFit] = useState(true)
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

  const setScale = useCallback((fn: (s: number) => number) => {
    setAutoFit(false)
    setScaleState((prev) => Math.round(fn(prev) * 100) / 100)
  }, [])

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
        handleExportYaml()
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
      pixelSize: Math.max(4, Math.round(effectiveScale)),
    })
  }, [scene, effectiveScale])

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
        showGrid={showGrid}
        setShowGrid={setShowGrid}
        onExportPng={handleExportPng}
        onExportYaml={handleExportYaml}
        onPlay={handlePlay}
      />
      <div className="flex min-h-0 flex-1">
        <LayerPanel />
        <main
          ref={viewportRef}
          className="relative flex min-w-0 flex-1 items-center justify-center overflow-auto bg-muted/40 p-3"
        >
          <div className="relative">
            <div
              className="absolute -inset-px rounded-sm ring-1 ring-border"
              aria-hidden
              style={{ pointerEvents: 'none' }}
            />
            <SceneCanvas scene={scene} scale={effectiveScale} mode="edit" showGrid={showGrid} />
          </div>
          <div className="pointer-events-none absolute bottom-2 right-3 text-xs tabular-nums text-muted-foreground">
            {scene.size.w}×{scene.size.h} · {effectiveScale}x{autoFit && ' · 自适应'}
          </div>
        </main>
        <PropertyPanel />
      </div>
    </div>
  )
}
