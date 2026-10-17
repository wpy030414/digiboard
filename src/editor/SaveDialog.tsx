/**
 * 保存对话框：在 YAML 场景文件与 PNG 成品图之间选择。
 *
 * 两者走与工具栏导出按钮相同的处理器；拼豆模式下 PNG 会附带行列序号与图例，
 * 对话框里也把这个差异直接写出来，避免用户误以为导出的是纯图案。
 */

import { FileCode2, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface SaveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaveYaml: () => void
  onSavePng: () => void
}

export function SaveDialog({ open, onOpenChange, onSaveYaml, onSavePng }: SaveDialogProps) {
  const choose = (save: () => void) => {
    save()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="save-dialog" showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>保存</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            data-testid="save-yaml"
            onClick={() => choose(onSaveYaml)}
            className="flex flex-col items-start gap-1 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
          >
            <FileCode2 className="size-5 text-primary" />
            <span className="text-sm font-medium">YAML 场景</span>
          </button>

          <button
            type="button"
            data-testid="save-png"
            onClick={() => choose(onSavePng)}
            className="flex flex-col items-start gap-1 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
          >
            <ImageIcon className="size-5 text-primary" />
            <span className="text-sm font-medium">PNG 图片</span>
          </button>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
