/**
 * 顶部工具栏：工具切换、撤销/重做、点阵尺寸、视图缩放、网格、导出、播放。
 */

import { useEffect, useState } from 'react'
import {
  MousePointer2,
  Pen,
  Eraser,
  PaintBucket,
  Pipette,
  Undo2,
  Redo2,
  Grid3x3,
  Play,
  FileCode2,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  SquareDashed,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSceneStore } from '@/engine/scene-store'
import type { Tool } from '@/engine/types'

const TOOLS: Array<{ id: Tool; icon: typeof Pen; label: string; key: string }> = [
  { id: 'select', icon: MousePointer2, label: '选择 / 移动矢量层', key: 'V' },
  { id: 'pen', icon: Pen, label: '像素画笔', key: 'B' },
  { id: 'eraser', icon: Eraser, label: '橡皮擦', key: 'E' },
  { id: 'fill', icon: PaintBucket, label: '油漆桶填充', key: 'G' },
  { id: 'picker', icon: Pipette, label: '取色（点亮/熄灭）', key: 'I' },
]

interface ToolbarProps {
  scale: number
  setScale: (fn: (s: number) => number) => void
  showGrid: boolean
  setShowGrid: (v: boolean) => void
  onExportPng: () => void
  onExportYaml: () => void
  onPlay: () => void
}

export function Toolbar({
  scale,
  setScale,
  showGrid,
  setShowGrid,
  onExportPng,
  onExportYaml,
  onPlay,
}: ToolbarProps) {
  const scene = useSceneStore((s) => s.scene)
  const tool = useSceneStore((s) => s.tool)
  const setTool = useSceneStore((s) => s.setTool)
  const resize = useSceneStore((s) => s.resize)
  const newScene = useSceneStore((s) => s.newScene)
  const undo = useSceneStore((s) => s.undo)
  const redo = useSceneStore((s) => s.redo)
  const canUndo = useSceneStore((s) => s.past.length > 0)
  const canRedo = useSceneStore((s) => s.future.length > 0)

  // 尺寸输入：本地草稿，Enter/blur 时提交（避免每敲一位就 resize）
  const [wDraft, setWDraft] = useState(String(scene.size.w))
  const [hDraft, setHDraft] = useState(String(scene.size.h))
  useEffect(() => {
    setWDraft(String(scene.size.w))
    setHDraft(String(scene.size.h))
  }, [scene.size.w, scene.size.h])

  const applySize = () => {
    const w = clampInt(wDraft, 1, 512)
    const h = clampInt(hDraft, 1, 512)
    if (w !== scene.size.w || h !== scene.size.h) resize({ w, h })
    setWDraft(String(w))
    setHDraft(String(h))
  }

  return (
    <header className="flex items-center gap-1.5 border-b bg-card px-2 py-1.5">
      {/* 新建 */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="new-scene"
            onClick={() => newScene({ w: 80, h: 60 })}
          >
            <SquareDashed />
          </Button>
        </TooltipTrigger>
        <TooltipContent>新建 80×60 场景</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-0.5 h-6" />

      {/* 工具组 */}
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={tool}
        onValueChange={(v) => v && setTool(v as Tool)}
      >
        {TOOLS.map((t) => (
          <Tooltip key={t.id}>
            <TooltipTrigger asChild>
              <ToggleGroupItem value={t.id} data-testid={`tool-${t.id}`} aria-label={t.label}>
                <t.icon className="size-4" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>
              {t.label} <kbd className="ml-1 opacity-60">{t.key}</kbd>
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>

      <Separator orientation="vertical" className="mx-0.5 h-6" />

      {/* 撤销 / 重做 */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={undo}
            disabled={!canUndo}
            data-testid="undo"
            aria-label="撤销"
          >
            <Undo2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>撤销 ⌘Z</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={redo}
            disabled={!canRedo}
            data-testid="redo"
            aria-label="重做"
          >
            <Redo2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>重做 ⌘⇧Z</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-0.5 h-6" />

      {/* 点阵尺寸 */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">点阵</span>
        <Input
          type="number"
          min={1}
          max={512}
          value={wDraft}
          data-testid="size-w"
          onChange={(e) => setWDraft(e.target.value)}
          onBlur={applySize}
          onKeyDown={(e) => e.key === 'Enter' && applySize()}
          className="h-7 w-14 px-1.5 text-center"
        />
        <span className="text-xs text-muted-foreground">×</span>
        <Input
          type="number"
          min={1}
          max={512}
          value={hDraft}
          data-testid="size-h"
          onChange={(e) => setHDraft(e.target.value)}
          onBlur={applySize}
          onKeyDown={(e) => e.key === 'Enter' && applySize()}
          className="h-7 w-14 px-1.5 text-center"
        />
      </div>

      <Separator orientation="vertical" className="mx-0.5 h-6" />

      {/* 缩放 */}
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="缩小"
          onClick={() => setScale((s) => clampScale(s / 1.25))}
        >
          <ZoomOut />
        </Button>
        <span
          className="w-12 text-center text-xs tabular-nums text-muted-foreground"
          data-testid="zoom-label"
        >
          {Math.round(scale * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="放大"
          onClick={() => setScale((s) => clampScale(s * 1.25))}
        >
          <ZoomIn />
        </Button>
      </div>

      {/* 网格 */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={showGrid ? 'secondary' : 'ghost'}
            size="icon-sm"
            data-testid="toggle-grid"
            aria-label="网格"
            aria-pressed={showGrid}
            onClick={() => setShowGrid(!showGrid)}
          >
            <Grid3x3 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>网格辅助线</TooltipContent>
      </Tooltip>

      <div className="flex-1" />

      {/* 导出 */}
      <Button variant="outline" size="sm" data-testid="export-yaml" onClick={onExportYaml}>
        <FileCode2 className="size-4" />
        导出 YAML
      </Button>
      <Button variant="outline" size="sm" data-testid="export-png" onClick={onExportPng}>
        <ImageIcon className="size-4" />
        导出 PNG
      </Button>
      <Separator orientation="vertical" className="mx-0.5 h-6" />
      <Button size="sm" data-testid="play" onClick={onPlay}>
        <Play className="size-4" />
        播放
      </Button>
    </header>
  )
}

function clampInt(v: string, lo: number, hi: number): number {
  const n = Math.round(Number(v))
  if (Number.isNaN(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}

function clampScale(s: number): number {
  return Math.min(32, Math.max(0.5, Math.round(s * 100) / 100))
}
