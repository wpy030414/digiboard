/**
 * 右下方「小组件」面板：内容层树（自顶向下 = z 从高到低）、增删、显隐、锁定、排序、选中。
 *
 * 与属性面板共享右侧栏（属性 60% 在上、小组件 40% 在下）。
 * 像素层是画布基座，不是可编辑的内容图层：它不出现在列表里、不可增删，
 * 并永远位于图层栈最底部（见 `normalizeScene` 与 store 守卫）。
 */

import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  Plus,
  Square,
  Hash,
  LayoutGrid,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useSceneStore } from '@/engine/scene-store'
import type { Layer, LayerType } from '@/engine/types'

const TYPE_META: Record<LayerType, { icon: typeof Hash; label: string }> = {
  pixel: { icon: LayoutGrid, label: '像素层' },
  digit: { icon: Hash, label: '数码管' },
  widget: { icon: Square, label: '小组件' },
}

export function LayerPanel() {
  const scene = useSceneStore((s) => s.scene)
  const selectedId = useSceneStore((s) => s.selectedId)
  const select = useSceneStore((s) => s.select)
  const updateLayer = useSceneStore((s) => s.updateLayer)
  const removeLayer = useSceneStore((s) => s.removeLayer)
  const duplicateLayer = useSceneStore((s) => s.duplicateLayer)
  const reorderLayer = useSceneStore((s) => s.reorderLayer)
  const addLayer = useSceneStore((s) => s.addLayer)

  // 只列出内容层（digit/widget）；像素基座不参与图层管理
  // 面板显示顺序：z 高在上 => 反转 layers 数组
  const displayLayers = scene.layers.filter((l) => l.type !== 'pixel').reverse()

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <div className="flex h-9 items-center justify-between px-3" data-testid="layer-header">
        <h2 className="text-sm font-medium">小组件</h2>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  data-testid="add-layer"
                  aria-label="添加小组件"
                >
                  <Plus />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>添加小组件</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem data-testid="add-digit" onClick={() => addLayer('digit')}>
              <Hash className="size-4" /> 数码管
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="add-widget"
              onClick={() => addLayer('widget', 'claude-status')}
            >
              <Square className="size-4" /> Claude 会话小组件
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1" data-testid="layer-scroll">
        <ul className="flex flex-col gap-0.5 p-1.5" data-testid="layer-list">
          {displayLayers.map((layer, di) => {
            const idx = scene.layers.length - 1 - di // 实际数组下标（像素基座固定在最前）
            return (
              <LayerRow
                key={layer.id}
                layer={layer}
                idx={idx}
                total={scene.layers.length}
                selected={layer.id === selectedId}
                onSelect={() => select(layer.id)}
                onToggleVisible={() => updateLayer(layer.id, { visible: !layer.visible })}
                onToggleLock={() => updateLayer(layer.id, { locked: !layer.locked })}
                onDuplicate={() => duplicateLayer(layer.id)}
                onRemove={() => removeLayer(layer.id)}
                onReorder={(dir) => reorderLayer(layer.id, dir)}
              />
            )
          })}
          {displayLayers.length === 0 && (
            <li className="px-2 py-6 text-center text-xs text-muted-foreground">
              暂无小组件，点右上角 + 添加
            </li>
          )}
        </ul>
      </ScrollArea>
    </div>
  )
}

interface LayerRowProps {
  layer: Layer
  idx: number
  total: number
  selected: boolean
  onSelect: () => void
  onToggleVisible: () => void
  onToggleLock: () => void
  onDuplicate: () => void
  onRemove: () => void
  onReorder: (dir: 'up' | 'down' | 'top' | 'bottom') => void
}

function LayerRow({
  layer,
  idx,
  total,
  selected,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onDuplicate,
  onRemove,
  onReorder,
}: LayerRowProps) {
  const meta = TYPE_META[layer.type]
  const Icon = meta.icon

  return (
    <li
      className={cn(
        'group flex items-center gap-1 rounded-md px-1.5 py-1 text-sm transition-colors',
        selected ? 'bg-primary/15 text-foreground' : 'hover:bg-accent',
        !layer.visible && 'opacity-50',
      )}
      data-testid={`layer-row-${layer.type}`}
      data-selected={selected}
    >
      <button
        type="button"
        className="flex flex-1 items-center gap-1.5 truncate text-left"
        onClick={onSelect}
        data-layer-id={layer.id}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{layer.name}</span>
      </button>

      <div
        className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 data-[selected=true]:opacity-100"
        data-selected={selected}
      >
        <IconBtn
          label={layer.visible ? '隐藏' : '显示'}
          onClick={onToggleVisible}
          testId={`vis-${layer.id}`}
        >
          {layer.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </IconBtn>
        <IconBtn
          label={layer.locked ? '解锁' : '锁定'}
          onClick={onToggleLock}
          testId={`lock-${layer.id}`}
        >
          {layer.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
        </IconBtn>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`操作 ${layer.name}`}
              className="size-5"
            >
              <ChevronsUp className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem disabled={idx === total - 1} onClick={() => onReorder('top')}>
              <ChevronsUp className="size-4" /> 置顶
            </DropdownMenuItem>
            <DropdownMenuItem disabled={idx === total - 1} onClick={() => onReorder('up')}>
              <ChevronUp className="size-4" /> 上移
            </DropdownMenuItem>
            <DropdownMenuItem disabled={idx === 0} onClick={() => onReorder('down')}>
              <ChevronDown className="size-4" /> 下移
            </DropdownMenuItem>
            <DropdownMenuItem disabled={idx === 0} onClick={() => onReorder('bottom')}>
              <ChevronsDown className="size-4" /> 置底
            </DropdownMenuItem>
            <Separator />
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="size-4" /> 复制
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onRemove}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" /> 删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

function IconBtn({
  label,
  onClick,
  testId,
  children,
}: {
  label: string
  onClick: () => void
  testId?: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-5"
          aria-label={label}
          data-testid={testId}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
