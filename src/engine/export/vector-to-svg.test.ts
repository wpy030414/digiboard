import { describe, it, expect, vi } from 'vitest'
import {
  digitLayerToSvg,
  widgetLayerToSvg,
  sceneVectorToSvg,
  vectorLayerToSvgDoc,
} from './vector-to-svg'
import { createDigitLayer, createWidgetLayer, createDefaultScene } from '../factories'
import type { DigitLayer } from '../types'

describe('vector-to-svg — 数码管层序列化', () => {
  it('输出含 scale 与变换矩阵的 <g> 结构', () => {
    const layer = createDigitLayer({ w: 80, h: 60 }, { text: '8', glow: 0 })
    const svg = digitLayerToSvg(layer, 4)
    expect(svg).toContain('<g transform="scale(4)">')
    expect(svg).toMatch(/matrix\(/)
  })

  it('数字 8 生成 7 段点亮 path（无暗底衬时）', () => {
    const layer = createDigitLayer(
      { w: 80, h: 60 },
      {
        text: '8',
        showOffSegments: false,
        glow: 0,
      },
    )
    const svg = digitLayerToSvg(layer, 1)
    // 7 段 path（fill 用 layer.color）
    const litFills = svg.split(`fill="${layer.color}"`).length - 1
    expect(litFills).toBe(7)
  })

  it('showOffSegments 时额外生成 7 段暗底 path', () => {
    const layer = createDigitLayer(
      { w: 80, h: 60 },
      {
        text: '8',
        showOffSegments: true,
        glow: 0,
      },
    )
    const svg = digitLayerToSvg(layer, 1)
    const offFills = svg.split(`fill="${layer.offColor}"`).length - 1
    expect(offFills).toBe(7)
  })

  it('glow>0 注入 feGaussianBlur 滤镜定义', () => {
    const layer = createDigitLayer({ w: 80, h: 60 }, { text: '8', glow: 0.8 })
    const svg = digitLayerToSvg(layer, 2)
    expect(svg).toContain('<filter')
    expect(svg).toContain('feGaussianBlur')
    expect(svg).toContain(`filter="url(#glow-${layer.id})"`)
  })

  it('glow=0 不注入滤镜', () => {
    const layer = createDigitLayer({ w: 80, h: 60 }, { text: '8', glow: 0 })
    const svg = digitLayerToSvg(layer, 2)
    expect(svg).not.toContain('feGaussianBlur')
  })

  it('小数点字符只生成点、不生成段位', () => {
    const layer = createDigitLayer({ w: 80, h: 60 }, { text: '.', showOffSegments: false, glow: 0 })
    const svg = digitLayerToSvg(layer, 1)
    const litFills = svg.split(`fill="${layer.color}"`).length - 1
    expect(litFills).toBe(1) // 仅小数点方块
  })

  it('冒号生成上下两个点的单条 path', () => {
    const layer = createDigitLayer({ w: 80, h: 60 }, { text: ':', showOffSegments: false, glow: 0 })
    const svg = digitLayerToSvg(layer, 1)
    const litFills = svg.split(`fill="${layer.color}"`).length - 1
    expect(litFills).toBe(1)
    expect(svg).toMatch(/d="[^"]*M [^"]*M /)
  })

  it('时钟模式导出时取当前时间快照（text 被忽略）', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 9, 18, 15, 4, 5))
      const layer = createDigitLayer(
        { w: 80, h: 60 },
        { text: '9999', clockMode: 'time', showOffSegments: false, glow: 0 },
      )
      const svg = digitLayerToSvg(layer, 1)
      // "15:04" => 2 + 5 + 1(冒号) + 6 + 4 = 18
      const litFills = svg.split(`fill="${layer.color}"`).length - 1
      expect(litFills).toBe(18)
      expect(svg).not.toContain('9999')
    } finally {
      vi.useRealTimers()
    }
  })

  it('颜色值被 XML 转义（防注入）', () => {
    const layer = createDigitLayer({ w: 80, h: 60 }, { text: '8', glow: 0 })
    // 恶意颜色含引号与尖括号
    layer.color = '"><script>x</script>'
    const svg = digitLayerToSvg(layer, 1)
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
    expect(svg).toContain('&quot;')
  })

  it('多字符文本横向排布（多个 translate 组）', () => {
    const layer = createDigitLayer(
      { w: 80, h: 60 },
      { text: '123', showOffSegments: false, glow: 0 },
    )
    const svg = digitLayerToSvg(layer, 1)
    const groups = svg.split('<g transform="translate(').length - 1
    expect(groups).toBe(3)
  })
})

describe('vector-to-svg — 小组件层序列化', () => {
  it('无快照时渲染占位文本 widget: kind', () => {
    const layer = createWidgetLayer({ w: 80, h: 60 }, 'claude-status')
    const svg = widgetLayerToSvg(layer, 2)
    expect(svg).toContain('widget: claude-status')
    expect(svg).toContain('<rect')
  })

  it('有快照时渲染状态/名称/模型/cwd/token', () => {
    const layer = createWidgetLayer({ w: 80, h: 60 }, 'claude-status')
    const svg = widgetLayerToSvg(layer, 2, {
      status: 'busy',
      name: 'digiboard-04',
      model: 'claude-opus-4-8',
      cwd: '/Users/xrl/Repos/digiboard',
      tokens: 1234,
    })
    expect(svg).toContain('busy')
    expect(svg).toContain('digiboard-04')
    expect(svg).toContain('claude-opus-4-8')
    expect(svg).toContain('1234 tok')
  })

  it('文本被转义（防注入）', () => {
    const layer = createWidgetLayer({ w: 80, h: 60 }, 'claude-status')
    const svg = widgetLayerToSvg(layer, 2, { name: '<b>&"</b>' })
    expect(svg).not.toContain('<b>')
    expect(svg).toContain('&lt;b&gt;')
    expect(svg).toContain('&amp;')
  })

  it('长 cwd 被缩短', () => {
    const layer = createWidgetLayer({ w: 80, h: 60 }, 'claude-status')
    const svg = widgetLayerToSvg(layer, 2, { cwd: '/Users/xrl/Documents/Repos/some/deep/path' })
    expect(svg).toContain('…/')
  })
})

describe('vector-to-svg — 场景级序列化', () => {
  it('sceneVectorToSvg 输出完整 SVG 文档（含 xmlns 与 viewBox）', () => {
    const scene = createDefaultScene({ w: 40, h: 30 })
    const svg = sceneVectorToSvg(scene, 2)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('width="80"')
    expect(svg).toContain('height="60"')
    expect(svg).toContain('viewBox="0 0 80 60"')
    expect(svg.endsWith('</svg>')).toBe(true)
  })

  it('不可见图层被跳过', () => {
    const scene = createDefaultScene({ w: 40, h: 30 })
    const digit = scene.layers.find((l) => l.type === 'digit') as DigitLayer
    digit.visible = false
    const svg = sceneVectorToSvg(scene, 2)
    // 数码管被隐藏后不应出现其 glow filter
    expect(svg).not.toContain(`glow-${digit.id}`)
  })

  it('像素层不进入矢量 SVG（像素走 canvas 合成）', () => {
    const scene = createDefaultScene({ w: 40, h: 30 })
    const svg = sceneVectorToSvg(scene, 2)
    expect(svg).not.toContain('imageData')
  })

  it('vectorLayerToSvgDoc 为单个矢量层产出完整文档', () => {
    const scene = createDefaultScene({ w: 40, h: 30 })
    const digit = scene.layers.find((l) => l.type === 'digit') as DigitLayer
    const svg = vectorLayerToSvgDoc(digit, scene, 3)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('width="120"') // 40*3
    expect(svg).toContain(`glow-${digit.id}`)
  })

  it('widget 层文档携带快照文本', () => {
    const scene = createDefaultScene({ w: 40, h: 30 })
    const widget = createWidgetLayer({ w: 40, h: 30 }, 'claude-status')
    scene.layers.push(widget)
    const svg = vectorLayerToSvgDoc(widget, scene, 2, { status: 'idle' })
    expect(svg).toContain('idle')
  })

  it('斜切进入变换矩阵（旋转已取消）', () => {
    const scene = createDefaultScene({ w: 40, h: 30 })
    const digit = scene.layers.find((l) => l.type === 'digit') as DigitLayer
    digit.skewX = 12
    const svg = vectorLayerToSvgDoc(digit, scene, 1)
    const m = svg.match(/matrix\(([-\d.\s]+)\)/)
    expect(m).toBeTruthy()
    const nums = (m?.[1] ?? '').trim().split(/\s+/).map(Number)
    expect(Math.abs(nums[1] ?? 0)).toBeLessThan(1e-6) // b 分量（无旋转）
    expect(Math.abs(nums[2] ?? 0)).toBeGreaterThan(0.01) // c 分量（skewX）
  })
})
