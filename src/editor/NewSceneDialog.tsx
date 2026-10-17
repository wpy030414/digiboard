/**
 * 新建画布对话框。
 *
 * 两个来源：
 *  - 空白：生成指定尺寸的空像素基座；
 *  - 从图片生成：按 cover 裁切铺满目标尺寸，再做色彩降级（默认 16 色）。
 *
 * 尺寸上限 200×200（`MAX_SCENE_SIZE`），与工具栏输入框一致。
 */

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { clampSceneSize } from '@/engine/factories'
import { DEFAULT_MAX_COLORS, imageFileToPixels } from '@/engine/image-to-pixels'
import { useSceneStore } from '@/engine/scene-store'
import { MAX_SCENE_SIZE } from '@/engine/types'

type SourceMode = 'blank' | 'image'

interface NewSceneDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DEFAULT_W = 40
const DEFAULT_H = 30

export function NewSceneDialog({ open, onOpenChange }: NewSceneDialogProps) {
  const newScene = useSceneStore((s) => s.newScene)
  const [wDraft, setWDraft] = useState(String(DEFAULT_W))
  const [hDraft, setHDraft] = useState(String(DEFAULT_H))
  const [mode, setMode] = useState<SourceMode>('blank')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 每次打开重置为默认空白画布
  useEffect(() => {
    if (!open) return
    setWDraft(String(DEFAULT_W))
    setHDraft(String(DEFAULT_H))
    setMode('blank')
    setFile(null)
    setError(null)
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }, [open])

  // 预览 URL 生命周期
  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const parseSize = () =>
    clampSceneSize({ w: Number(wDraft) || DEFAULT_W, h: Number(hDraft) || DEFAULT_H })

  const handleCreate = async () => {
    const size = parseSize()
    setError(null)
    if (mode === 'image') {
      if (!file) {
        setError('请选择一张图片')
        return
      }
      setBusy(true)
      try {
        const source = await imageFileToPixels(file, size, DEFAULT_MAX_COLORS)
        newScene(size, source)
      } catch (e) {
        setError(e instanceof Error ? e.message : '图片转换失败')
        setBusy(false)
        return
      }
      setBusy(false)
    } else {
      newScene(size)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="new-scene-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建画布</DialogTitle>
          <DialogDescription>
            生成一张空白点阵画布，或从图片生成（cover 裁切 + 色彩降级）。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">宽度（1–{MAX_SCENE_SIZE}）</Label>
              <Input
                type="number"
                min={1}
                max={MAX_SCENE_SIZE}
                value={wDraft}
                data-testid="new-size-w"
                onChange={(e) => setWDraft(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">高度（1–{MAX_SCENE_SIZE}）</Label>
              <Input
                type="number"
                min={1}
                max={MAX_SCENE_SIZE}
                value={hDraft}
                data-testid="new-size-h"
                onChange={(e) => setHDraft(e.target.value)}
                className="h-8"
              />
            </div>
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as SourceMode)}>
            <TabsList className="w-full">
              <TabsTrigger value="blank" className="flex-1" data-testid="new-mode-blank">
                空白画布
              </TabsTrigger>
              <TabsTrigger value="image" className="flex-1" data-testid="new-mode-image">
                从图片生成
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === 'image' && (
            <div className="flex flex-col gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                data-testid="new-image-input"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  setError(null)
                }}
                className="text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-2 file:py-1 file:text-xs"
              />
              <p className="text-xs text-muted-foreground">
                图片按 cover 裁切到目标尺寸，并降级为最多 {DEFAULT_MAX_COLORS}{' '}
                色；透明区域视为灭点。
              </p>
              {preview && (
                <img
                  src={preview}
                  alt="预览"
                  className="max-h-40 w-full rounded-md border object-contain"
                />
              )}
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            size="sm"
            data-testid="new-create"
            disabled={busy || (mode === 'image' && !file)}
            onClick={() => void handleCreate()}
          >
            {busy ? '生成中…' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
