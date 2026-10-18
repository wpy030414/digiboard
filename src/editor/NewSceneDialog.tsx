/**
 * 新建对话框。
 *
 * 三个来源：
 *  - 空白：生成指定尺寸的空像素基座；
 *  - 从 YAML 载入：读取导出的 .yml 场景文件（尺寸与图层随文件还原）；
 *  - 从图片生成：按 cover 裁切铺满目标尺寸，再做结构保持型像素化
 *    （色数按格子数自适应，8–32 色；Kuwahara 预滤波 + Oklab 调色板）。
 *
 * 尺寸上限 200×200（`MAX_SCENE_SIZE`），与工具栏输入框一致；YAML 超限由解析层直接拒绝。
 */

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { clampSceneSize } from '@/engine/factories'
import { sceneFromYaml } from '@/engine/export/to-yaml'
import { imageFileToPixels } from '@/engine/image-to-pixels'
import { segmentSubject } from '@/engine/matting-model'
import type { Matte } from '@/engine/matting'
import { useSceneStore } from '@/engine/scene-store'
import { MAX_SCENE_SIZE, type Scene } from '@/engine/types'

type SourceMode = 'blank' | 'yaml' | 'image'

interface NewSceneDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DEFAULT_W = 40
const DEFAULT_H = 30

export function NewSceneDialog({ open, onOpenChange }: NewSceneDialogProps) {
  const newScene = useSceneStore((s) => s.newScene)
  const setScene = useSceneStore((s) => s.setScene)
  const [wDraft, setWDraft] = useState(String(DEFAULT_W))
  const [hDraft, setHDraft] = useState(String(DEFAULT_H))
  const [mode, setMode] = useState<SourceMode>('blank')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  // 从 YAML 载入：选文件即解析校验，确认后整场景替换
  const [yamlScene, setYamlScene] = useState<Scene | null>(null)
  const [yamlName, setYamlName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 主体抠图：可选增强项，失败时静默退回普通模式
  const [matting, setMatting] = useState(false)
  const [mattingStatus, setMattingStatus] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const yamlRef = useRef<HTMLInputElement>(null)

  // 每次打开重置为默认空白画布
  useEffect(() => {
    if (!open) return
    setWDraft(String(DEFAULT_W))
    setHDraft(String(DEFAULT_H))
    setMode('blank')
    setFile(null)
    setYamlScene(null)
    setYamlName(null)
    setError(null)
    setBusy(false)
    setMatting(false)
    setMattingStatus(null)
    if (fileRef.current) fileRef.current.value = ''
    if (yamlRef.current) yamlRef.current.value = ''
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
    clampSceneSize({
      w: Number(wDraft) || DEFAULT_W,
      h: Number(hDraft) || DEFAULT_H,
    })

  const handleYamlFile = async (f: File) => {
    setError(null)
    setYamlScene(null)
    setYamlName(null)
    try {
      const scene = sceneFromYaml(await f.text())
      setYamlScene(scene)
      setYamlName(f.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法解析 YAML')
    }
  }

  const handleCreate = async () => {
    setError(null)
    if (mode === 'yaml') {
      if (!yamlScene) {
        setError('请选择一个 YAML 文件')
        return
      }
      setScene(yamlScene)
      onOpenChange(false)
      return
    }
    const size = parseSize()
    if (mode === 'image') {
      if (!file) {
        setError('请选择一张图片')
        return
      }
      setBusy(true)
      setMattingStatus(null)
      let matte: Matte | null = null
      if (matting) {
        try {
          matte = await segmentSubject(file, (progress) => {
            if (progress.phase === 'download') {
              setMattingStatus(`正在下载抠图模型 ${Math.round(progress.progress * 100)}%`)
            } else if (progress.phase === 'init') {
              setMattingStatus('正在初始化抠图模型…')
            } else {
              setMattingStatus('正在识别主体…')
            }
          })
        } catch (e) {
          // 抠图是增强项：失败不阻断生成，退回普通模式
          console.warn('[matting] 主体抠图失败，已退回普通模式', e)
          matte = null
        }
      }
      try {
        const source = await imageFileToPixels(file, size, { matte })
        newScene(size, source)
      } catch (e) {
        setError(e instanceof Error ? e.message : '图片转换失败')
        setBusy(false)
        setMattingStatus(null)
        return
      }
      setMattingStatus(null)
      setBusy(false)
    } else {
      newScene(size)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="new-scene-dialog" showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {mode !== 'yaml' && (
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
          )}

          <Tabs value={mode} onValueChange={(v) => setMode(v as SourceMode)}>
            <TabsList className="w-full">
              <TabsTrigger value="blank" className="flex-1" data-testid="new-mode-blank">
                空白画布
              </TabsTrigger>
              <TabsTrigger value="yaml" className="flex-1" data-testid="new-mode-yaml">
                从 YAML 载入
              </TabsTrigger>
              <TabsTrigger value="image" className="flex-1" data-testid="new-mode-image">
                从图片生成
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === 'yaml' && (
            <div className="flex flex-col gap-2">
              <input
                ref={yamlRef}
                type="file"
                accept=".yml,.yaml,text/yaml"
                data-testid="new-yaml-input"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleYamlFile(f)
                  else {
                    setYamlScene(null)
                    setYamlName(null)
                  }
                }}
                className="text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-2 file:py-1 file:text-xs"
              />
              {yamlScene && (
                <p className="text-xs text-muted-foreground" data-testid="new-yaml-summary">
                  {yamlName} · {yamlScene.size.w}×{yamlScene.size.h} · {yamlScene.layers.length}{' '}
                  个图层
                </p>
              )}
            </div>
          )}

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
              {preview && (
                <img
                  src={preview}
                  alt="预览"
                  className="max-h-40 w-full rounded-md border object-contain"
                />
              )}
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={matting}
                  disabled={busy}
                  data-testid="new-matting"
                  onChange={(e) => setMatting(e.target.checked)}
                  className="size-3.5 accent-primary"
                />
                主体抠图（本地运行，首次加载约 4.4MB）
              </label>
              {mattingStatus && (
                <p className="text-xs text-muted-foreground" data-testid="new-matting-status">
                  {mattingStatus}
                </p>
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
            disabled={busy || (mode === 'image' && !file) || (mode === 'yaml' && !yamlScene)}
            onClick={() => void handleCreate()}
          >
            {busy ? '生成中…' : mode === 'yaml' ? '载入' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
