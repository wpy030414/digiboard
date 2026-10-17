/**
 * 右侧属性面板（共享右栏的上 60%）：按选中图层类型分发编辑控件。
 *  - 无选中（或像素基座）：仅提示选中图层
 *  - digit：文本、几何、变换（斜切）、发光、段位样式 —— 「突破像素」的核心调参
 *  - widget：小组件配置（Claude 会话状态：桥接地址、显示项）
 */

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSceneStore, useSelectedLayer } from '@/engine/scene-store'
import type { DigitLayer, Layer, WidgetLayer } from '@/engine/types'

export function PropertyPanel() {
  const layer = useSelectedLayer()
  return (
    <div className="flex h-full w-full flex-col bg-card">
      <div className="flex h-9 items-center px-3" data-testid="prop-header">
        <h2 className="text-sm font-medium">属性</h2>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1" data-testid="prop-scroll">
        <div className="flex flex-col gap-4 p-3">
          {layer === null || layer.type === 'pixel' ? (
            <SceneProps />
          ) : layer.type === 'digit' ? (
            <DigitProps layer={layer} />
          ) : (
            <WidgetProps layer={layer} />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/** 通用字段包装。 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold tracking-wide text-foreground/70">{title}</h3>
      {children}
    </div>
  )
}

/** 通用重命名 + 不透明度（所有图层共有）。 */
function CommonProps({ layer }: { layer: Layer }) {
  const updateLayer = useSceneStore((s) => s.updateLayer)
  return (
    <Section title="小组件">
      <Field label="名称">
        <Input
          value={layer.name}
          data-testid="prop-name"
          onChange={(e) => updateLayer(layer.id, { name: e.target.value })}
          className="h-8"
        />
      </Field>
      <Field label={`不透明度 ${Math.round(layer.opacity * 100)}%`}>
        <Slider
          value={[layer.opacity * 100]}
          min={0}
          max={100}
          step={1}
          data-testid="prop-opacity"
          onValueChange={([v]) => updateLayer(layer.id, { opacity: (v ?? 100) / 100 })}
        />
      </Field>
    </Section>
  )
}

function SceneProps() {
  // 与「小组件」面板的空态文案保持同样的排版（居中、小号、弱化色）
  return (
    <p className="px-2 py-6 text-center text-xs text-muted-foreground" data-testid="prop-empty">
      选中一个小组件以编辑其属性
    </p>
  )
}

function DigitProps({ layer }: { layer: DigitLayer }) {
  const updateLayer = useSceneStore((s) => s.updateLayer)
  const set = <K extends keyof DigitLayer>(k: K, v: DigitLayer[K]) =>
    updateLayer<DigitLayer>(layer.id, { [k]: v } as Partial<DigitLayer>)

  return (
    <>
      <CommonProps layer={layer} />
      <Separator />
      <Section title="数码管内容">
        <Field label="显示文本">
          <Input
            value={layer.text}
            data-testid="prop-digit-text"
            onChange={(e) => set('text', e.target.value)}
            className="h-8 font-mono"
          />
        </Field>
        <Field label="前景色">
          <input
            type="color"
            value={layer.color}
            data-testid="prop-digit-color"
            onChange={(e) => {
              set('color', e.target.value)
              set('glowColor', e.target.value)
            }}
            className="h-8 w-full cursor-pointer rounded border"
          />
        </Field>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">显示暗底衬（灭段）</Label>
          <Switch
            checked={layer.showOffSegments}
            data-testid="prop-off-segments"
            onCheckedChange={(v) => set('showOffSegments', v)}
          />
        </div>
        {layer.showOffSegments && (
          <Field label="灭段颜色">
            <input
              type="color"
              value={layer.offColor}
              onChange={(e) => set('offColor', e.target.value)}
              className="h-8 w-full cursor-pointer rounded border"
            />
          </Field>
        )}
      </Section>

      <Separator />
      <Section title="几何（突破像素限制）">
        <Field label={`字符高度 ${layer.digitHeight.toFixed(1)} 单位`}>
          <Slider
            value={[layer.digitHeight]}
            min={2}
            max={200}
            step={0.5}
            data-testid="prop-digit-height"
            onValueChange={([v]) => set('digitHeight', v ?? layer.digitHeight)}
          />
        </Field>
        <Field label={`宽高比 ${layer.aspect.toFixed(2)}`}>
          <Slider
            value={[layer.aspect]}
            min={0.3}
            max={1.2}
            step={0.01}
            onValueChange={([v]) => set('aspect', v ?? layer.aspect)}
          />
        </Field>
        <Field label={`段厚 ${layer.thicknessRatio.toFixed(3)}`}>
          <Slider
            value={[layer.thicknessRatio]}
            min={0.05}
            max={0.35}
            step={0.005}
            onValueChange={([v]) => set('thicknessRatio', v ?? layer.thicknessRatio)}
          />
        </Field>
        <Field label={`字间距 ${layer.gapRatio.toFixed(2)}`}>
          <Slider
            value={[layer.gapRatio]}
            min={0}
            max={0.6}
            step={0.01}
            onValueChange={([v]) => set('gapRatio', v ?? layer.gapRatio)}
          />
        </Field>
        <Field label="段位样式">
          <Select
            value={layer.segmentStyle}
            onValueChange={(v) => set('segmentStyle', v as DigitLayer['segmentStyle'])}
          >
            <SelectTrigger className="h-8" data-testid="prop-segment-style">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sharp">尖角</SelectItem>
              <SelectItem value="rounded">圆角</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Separator />
      <Section title="变换">
        <Field label={`X 斜切 ${layer.skewX}°`}>
          <Slider
            value={[layer.skewX]}
            min={-60}
            max={60}
            step={1}
            data-testid="prop-skewx"
            onValueChange={([v]) => set('skewX', v ?? 0)}
          />
        </Field>
        <Field label={`Y 斜切 ${layer.skewY}°`}>
          <Slider
            value={[layer.skewY]}
            min={-60}
            max={60}
            step={1}
            onValueChange={([v]) => set('skewY', v ?? 0)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X 位置">
            <Input
              type="number"
              value={Math.round(layer.x * 10) / 10}
              data-testid="prop-x"
              onChange={(e) => set('x', Number(e.target.value))}
              className="h-8"
            />
          </Field>
          <Field label="Y 位置">
            <Input
              type="number"
              value={Math.round(layer.y * 10) / 10}
              data-testid="prop-y"
              onChange={(e) => set('y', Number(e.target.value))}
              className="h-8"
            />
          </Field>
        </div>
      </Section>

      <Separator />
      <Section title="发光">
        <Field label={`强度 ${Math.round(layer.glow * 100)}%`}>
          <Slider
            value={[layer.glow * 100]}
            min={0}
            max={100}
            step={1}
            data-testid="prop-glow"
            onValueChange={([v]) => set('glow', (v ?? 0) / 100)}
          />
        </Field>
        <Field label="发光颜色">
          <input
            type="color"
            value={layer.glowColor}
            onChange={(e) => set('glowColor', e.target.value)}
            className="h-8 w-full cursor-pointer rounded border"
          />
        </Field>
      </Section>
    </>
  )
}

function WidgetProps({ layer }: { layer: WidgetLayer }) {
  const updateLayer = useSceneStore((s) => s.updateLayer)
  const setConfig = (patch: Record<string, unknown>) =>
    updateLayer<WidgetLayer>(layer.id, { config: { ...layer.config, ...patch } })

  const cfg = layer.config as {
    bridgeUrl?: string
    showTokens?: boolean
    showModel?: boolean
    showCwd?: boolean
  }

  return (
    <>
      <CommonProps layer={layer} />
      <Separator />
      <Section title="小组件 · Claude 会话状态">
        <Field label="SSE 桥接地址">
          <Input
            value={cfg.bridgeUrl ?? 'http://localhost:4321/events'}
            data-testid="prop-bridge-url"
            onChange={(e) => setConfig({ bridgeUrl: e.target.value })}
            className="h-8 font-mono text-xs"
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          连接本机 <code className="rounded bg-muted px-1">digiboard-bridge</code>{' '}
          以读取真实会话；未连接时自动使用演示数据。
        </p>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">显示 token 用量</Label>
          <Switch
            checked={cfg.showTokens !== false}
            onCheckedChange={(v) => setConfig({ showTokens: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">显示模型</Label>
          <Switch
            checked={cfg.showModel !== false}
            onCheckedChange={(v) => setConfig({ showModel: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">显示工作目录</Label>
          <Switch
            checked={cfg.showCwd !== false}
            onCheckedChange={(v) => setConfig({ showCwd: v })}
          />
        </div>
      </Section>
      <Separator />
      <Section title="定位">
        <div className="grid grid-cols-2 gap-2">
          <Field label="X">
            <Input
              type="number"
              value={Math.round(layer.x)}
              onChange={(e) => updateLayer<WidgetLayer>(layer.id, { x: Number(e.target.value) })}
              className="h-8"
            />
          </Field>
          <Field label="Y">
            <Input
              type="number"
              value={Math.round(layer.y)}
              onChange={(e) => updateLayer<WidgetLayer>(layer.id, { y: Number(e.target.value) })}
              className="h-8"
            />
          </Field>
          <Field label="宽">
            <Input
              type="number"
              value={Math.round(layer.width)}
              onChange={(e) =>
                updateLayer<WidgetLayer>(layer.id, { width: Number(e.target.value) })
              }
              className="h-8"
            />
          </Field>
          <Field label="高">
            <Input
              type="number"
              value={Math.round(layer.height)}
              onChange={(e) =>
                updateLayer<WidgetLayer>(layer.id, { height: Number(e.target.value) })
              }
              className="h-8"
            />
          </Field>
        </div>
      </Section>
    </>
  )
}
