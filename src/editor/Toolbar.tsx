/**
 * 顶部工具栏：新建、保存、工具切换、画笔颜色、撤销/重做、点阵尺寸、视图缩放、播放。
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
  Play,
  PanelRightClose,
  PanelRightOpen,
  ZoomIn,
  ZoomOut,
  SquareDashed,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Switch } from '@/components/ui/switch'
import { useSceneStore } from '@/engine/scene-store'
import { beadColorForHex, nearestBeadColor } from '@/engine/beads-palette'
import { MAX_SCENE_SIZE, type Tool } from '@/engine/types'
import { NewSceneDialog } from './NewSceneDialog'
import { SaveDialog } from './SaveDialog'

const TOOLS: Array<{ id: Tool; icon: typeof Pen; label: string; key: string }> = [
  { id: 'select', icon: MousePointer2, label: '选择 / 移动矢量层', key: 'V' },
  { id: 'pen', icon: Pen, label: '像素画笔', key: 'B' },
  { id: 'eraser', icon: Eraser, label: '橡皮擦', key: 'E' },
  { id: 'fill', icon: PaintBucket, label: '油漆桶填充', key: 'G' },
  { id: 'picker', icon: Pipette, label: '取色', key: 'I' },
]

interface ToolbarProps {
  scale: number
  setScale: (fn: (s: number) => number) => void
  beads: boolean
  setBeads: (v: boolean) => void
  saveOpen: boolean
  setSaveOpen: (v: boolean) => void
  newOpen: boolean
  setNewOpen: (v: boolean) => void
  onExportPng: () => void
  onExportYaml: () => void
  onPlay: () => void
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export function Toolbar({
  scale,
  setScale,
  beads,
  setBeads,
  saveOpen,
  setSaveOpen,
  newOpen,
  setNewOpen,
  onExportPng,
  onExportYaml,
  onPlay,
  sidebarOpen,
  onToggleSidebar,
}: ToolbarProps) {
  const scene = useSceneStore((s) => s.scene)
  const tool = useSceneStore((s) => s.tool)
  const setTool = useSceneStore((s) => s.setTool)
  const brushColor = useSceneStore((s) => s.brushColor)
  const setBrushColor = useSceneStore((s) => s.setBrushColor)
  const resize = useSceneStore((s) => s.resize)
  const undo = useSceneStore((s) => s.undo)
  const redo = useSceneStore((s) => s.redo)
  const canUndo = useSceneStore((s) => s.past.length > 0)
  const canRedo = useSceneStore((s) => s.future.length > 0)
  const brushBead = beadColorForHex(brushColor)
  const brushCode = brushBead ? brushBead.code : `≈${nearestBeadColor(brushColor).code}`

  // 尺寸输入：本地草稿，Enter/blur 时提交（避免每敲一位就 resize）
  const [wDraft, setWDraft] = useState(String(scene.size.w))
  const [hDraft, setHDraft] = useState(String(scene.size.h))
  useEffect(() => {
    setWDraft(String(scene.size.w))
    setHDraft(String(scene.size.h))
  }, [scene.size.w, scene.size.h])

  const applySize = () => {
    const w = clampInt(wDraft, 1, MAX_SCENE_SIZE)
    const h = clampInt(hDraft, 1, MAX_SCENE_SIZE)
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
            onClick={() => setNewOpen(true)}
          >
            <SquareDashed />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          新建 <kbd className="ml-1 opacity-60">⌘N</kbd>
        </TooltipContent>
      </Tooltip>

      {/* 保存：YAML / PNG 二选一 */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="save-scene"
            aria-label="保存"
            onClick={() => setSaveOpen(true)}
          >
            <Save />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          保存 <kbd className="ml-1 opacity-60">⌘S</kbd>
        </TooltipContent>
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
              <ToggleGroupItem
                value={t.id}
                data-testid={`tool-${t.id}`}
                aria-label={t.label}
                className="aria-checked:border-primary aria-checked:bg-primary/20 aria-checked:text-primary aria-checked:shadow-inner"
              >
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

      {/* 画笔颜色：单层多色混搭，用哪色点哪色；色号常驻显示在色块右侧 */}
      <div className="flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <label
              className="relative inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-input bg-background"
              data-testid="brush-color"
              aria-label="画笔颜色"
            >
              <span className="size-4 rounded-sm" style={{ background: brushColor }} />
              <input
                type="color"
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </label>
          </TooltipTrigger>
          <TooltipContent>画笔颜色 {brushCode}</TooltipContent>
        </Tooltip>
        <span
          className="min-w-9 text-xs tabular-nums text-muted-foreground"
          data-testid="brush-color-code"
        >
          {brushCode}
        </span>
      </div>

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
          max={MAX_SCENE_SIZE}
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
          max={MAX_SCENE_SIZE}
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
          disabled={scale <= MIN_SCALE}
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
          disabled={scale >= MAX_SCALE}
          onClick={() => setScale((s) => clampScale(s * 1.25))}
        >
          <ZoomIn />
        </Button>
      </div>

      <Separator orientation="vertical" className="mx-0.5 h-6" />

      {/* 拼豆模式：直角无缝隙像素 + 行列序号 + 红色标识线 */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{beads ? '拼豆' : '副屏'}</span>
        <Switch
          checked={beads}
          onCheckedChange={setBeads}
          data-testid="beads-mode"
          aria-label="拼豆模式"
        />
      </div>

      <div className="flex-1" />

      {/* 播放：图标按钮（跳转播放页） */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon-sm" data-testid="play" aria-label="播放" onClick={onPlay}>
            <Play className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>播放</TooltipContent>
      </Tooltip>

      {/* 右侧栏（属性 / 小组件）显隐 */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="toggle-sidebar"
            aria-label={sidebarOpen ? '隐藏侧栏' : '显示侧栏'}
            aria-pressed={sidebarOpen}
            onClick={onToggleSidebar}
          >
            {sidebarOpen ? <PanelRightClose /> : <PanelRightOpen />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {sidebarOpen ? '隐藏属性与小组件侧栏' : '显示属性与小组件侧栏'}
        </TooltipContent>
      </Tooltip>

      <SaveDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        onSaveYaml={onExportYaml}
        onSavePng={onExportPng}
      />
      <NewSceneDialog open={newOpen} onOpenChange={setNewOpen} />
    </header>
  )
}

function clampInt(v: string, lo: number, hi: number): number {
  const n = Math.round(Number(v))
  if (Number.isNaN(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}

/** 视图缩放上下限（自适应计算也封顶在这里，导出尺寸因此可控）。 */
const MIN_SCALE = 0.5
const MAX_SCALE = 32

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * 100) / 100))
}
