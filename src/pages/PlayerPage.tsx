/**
 * 播放页：全屏只读渲染一个场景，适合当作电子副屏常驻展示。
 *
 * 载入来源（优先级）：
 *  1. URL query `?scene=<base64-yml>`（编辑器「播放」跳转而来）
 *  2. 无来源时展示内置预设屏幕
 *
 * 本地 YAML 的导入入口已迁移到编辑器「新建 → 从 YAML 载入」，播放页保持纯展示。
 * 自适应：scale = min(视口宽/场景宽, 视口高/场景高)，等比铺满、居中。
 * 按 F 进入全屏，按 E 返回编辑器。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Pencil, Maximize, Minimize } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SceneCanvas } from '@/engine/render/SceneCanvas'
import type { Scene } from '@/engine/types'
import { loadPresetScene } from '@/engine/presets'
import { sceneFromBase64Yaml } from '@/engine/export/to-yaml'
import { useSyncBridgeUrl } from '@/widgets/claude-status/use-sync-bridge-url'

export function PlayerPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [scene] = useState<Scene>(() => {
    const b64 = searchParams.get('scene')
    if (b64) {
      try {
        return sceneFromBase64Yaml(b64)
      } catch (e) {
        console.warn('URL 场景解析失败，使用内置预设场景', e)
      }
    }
    return loadPresetScene()
  })
  const [scale, setScale] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 把场景里 Claude 小组件的 bridgeUrl 同步给状态 store（驱动 App 的 SSE 连接）
  useSyncBridgeUrl(scene)

  // 自适应缩放铺满
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const fit = () => {
      const s = Math.min(
        (el.clientWidth - 16) / scene.size.w,
        (el.clientHeight - 16) / scene.size.h,
      )
      setScale(Math.max(0.1, Math.floor(s * 100) / 100))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [scene.size.w, scene.size.h])

  // 全屏：进入 / 退出共用同一个切换动作（Esc 退出时也要同步图标状态）
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void containerRef.current?.requestFullscreen?.()
    }
  }, [])

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', sync)
    sync()
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  // 键盘：F 全屏，E 返回编辑器
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'f') {
        toggleFullscreen()
      } else if (e.key.toLowerCase() === 'e') {
        navigate('/')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, toggleFullscreen])

  return (
    <div
      ref={containerRef}
      className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-black"
      data-testid="player-page"
    >
      <SceneCanvas scene={scene} scale={scale} mode="play" />

      {/* 悬浮控制（鼠标移动时显现，副屏常驻时自动隐藏干扰）：返回键在右上、全屏在左上 */}
      <div className="group absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100">
        <Button
          variant="secondary"
          size="sm"
          data-testid="player-edit"
          onClick={() => navigate('/')}
        >
          <Pencil className="size-4" /> 回到编辑器
        </Button>
      </div>

      <div className="group absolute left-3 top-3 flex gap-1.5 opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100">
        <Button
          variant="secondary"
          size="sm"
          data-testid="player-fullscreen"
          aria-label={fullscreen ? '退出全屏' : '全屏'}
          aria-pressed={fullscreen}
          onClick={toggleFullscreen}
        >
          {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        </Button>
      </div>

      {!searchParams.get('scene') && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/40">
          预设屏幕 · 在编辑器「新建 → 从 YAML 载入」打开自己的场景 · F 全屏 · E 返回编辑器
        </div>
      )}
    </div>
  )
}
