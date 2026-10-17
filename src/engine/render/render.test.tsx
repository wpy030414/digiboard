import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PixelCanvas, hexToRgba } from './PixelCanvas'
import { DigitLayerView } from './DigitLayerView'
import { WidgetLayerView, registerWidget } from './WidgetLayerView'
import { SceneCanvas } from './SceneCanvas'
import {
  createPixelLayer,
  createDigitLayer,
  createWidgetLayer,
  createDefaultScene,
} from '../factories'
import { DEFAULT_OFF_DOT_COLOR, type Scene } from '../types'

// —— mock canvas 2d context（jsdom 无真实实现）——
interface DotTrace {
  x: number
  y: number
  size: number
  radius: number
}
interface FillTrace {
  fillStyle: string
  dots: DotTrace[]
}

let fills: FillTrace[] = []
let path: DotTrace[] = []

beforeAll(() => {
  const fakeCtx = {
    fillStyle: '',
    clearRect: () => {},
    beginPath: () => {
      path = []
    },
    roundRect: (x: number, y: number, w: number, _h: number, radius: number) => {
      path.push({ x, y, size: w, radius })
    },
    rect: (x: number, y: number, w: number) => {
      path.push({ x, y, size: w, radius: 0 })
    },
    fill: () => {
      fills.push({ fillStyle: String(fakeCtx.fillStyle), dots: path.slice() })
    },
  }
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => fakeCtx,
  ) as unknown as HTMLCanvasElement['getContext']
})

afterEach(() => {
  fills = []
  path = []
})

describe('PixelCanvas — 圆角点阵玩具板', () => {
  it('canvas 显示尺寸 = 网格 × scale，绘制按输出像素密度', () => {
    const layer = createPixelLayer({ w: 8, h: 6 })
    const { container } = render(<PixelCanvas layer={layer} scale={5} />)
    const canvas = container.querySelector('canvas')!
    expect(canvas).toBeTruthy()
    expect(canvas.style.width).toBe('40px')
    expect(canvas.style.height).toBe('30px')
    // backing store 跟随设备像素比（jsdom 下 dpr=1，故每格 5 输出像素）
    expect(canvas.width).toBe(8 * 5)
    expect(canvas.height).toBe(6 * 5)
  })

  it('每格都画一颗灭点圆角方块', () => {
    const layer = createPixelLayer({ w: 4, h: 3 })
    render(<PixelCanvas layer={layer} scale={4} />)
    const off = fills[0]!
    expect(off.fillStyle).toBe(DEFAULT_OFF_DOT_COLOR)
    expect(off.dots).toHaveLength(12)
    // 圆角矩形而非整格：留缝 + 圆角
    expect(off.dots[0]!.size).toBeLessThan(4)
    expect(off.dots[0]!.radius).toBeGreaterThan(0)
  })

  it('点亮的像素在灭点之上追加亮点', () => {
    const layer = createPixelLayer({ w: 4, h: 4 })
    layer.palette = ['#ff8800']
    layer.pixels[0] = 1
    layer.pixels[5] = 1
    render(<PixelCanvas layer={layer} scale={3} />)
    const on = fills[1]!
    expect(on.fillStyle).toBe('#ff8800')
    expect(on.dots).toHaveLength(2)
    expect(on.dots[0]).toMatchObject({ x: 3 * 0.16, y: 3 * 0.16 })
  })

  it('被矢量层占据的格子整块抠除（mask）', () => {
    const layer = createPixelLayer({ w: 4, h: 3 })
    const mask = new Uint8Array(12)
    mask[0] = 1
    mask[5] = 1
    render(<PixelCanvas layer={layer} scale={4} mask={mask} />)
    expect(fills[0]!.dots).toHaveLength(10)
  })

  it('灭点颜色为空时不画灭点，只画亮点', () => {
    const layer = createPixelLayer({ w: 2, h: 2 })
    layer.offColor = ''
    layer.pixels[0] = 1
    render(<PixelCanvas layer={layer} scale={4} />)
    expect(fills).toHaveLength(1)
    expect(fills[0]!.fillStyle).toBe(layer.palette[0])
  })

  it('透明度反映 opacity', () => {
    const layer = createPixelLayer({ w: 2, h: 2 })
    layer.opacity = 0.4
    const { container } = render(<PixelCanvas layer={layer} scale={4} />)
    expect(container.querySelector('canvas')!.style.opacity).toBe('0.4')
  })
})

describe('hexToRgba — 颜色解析', () => {
  it('#rrggbb', () => expect(hexToRgba('#ff0000')).toEqual([255, 0, 0, 255]))
  it('#rgb 展开', () => expect(hexToRgba('#f00')).toEqual([255, 0, 0, 255]))
  it('#rrggbbaa', () => expect(hexToRgba('#00ff0080')).toEqual([0, 255, 0, 128]))
  it('无 # 前缀', () => expect(hexToRgba('0000ff')).toEqual([0, 0, 255, 255]))
})

describe('DigitLayerView — 矢量突破像素限制', () => {
  it('渲染 svg 层与外层 scale 组', () => {
    const layer = createDigitLayer({ w: 80, h: 60 }, { text: '8' })
    const { container } = render(<DigitLayerView layer={layer} scale={4} />)
    const svg = container.querySelector('svg[data-digit-layer]')!
    expect(svg).toBeTruthy()
    // 外层 g 应用 scale(4)：场景单位 → 屏幕像素
    const scaleG = svg.querySelector('g')!
    expect(scaleG.getAttribute('transform')).toBe('scale(4)')
  })

  it('数字 8 点亮七段（含暗底衬则更多 path）', () => {
    const layer = createDigitLayer({ w: 80, h: 60 }, { text: '8', showOffSegments: false })
    const { container } = render(<DigitLayerView layer={layer} scale={1} />)
    const paths = container.querySelectorAll('path')
    expect(paths.length).toBe(7) // a-g 全亮
  })

  it('showOffSegments 时每字符渲染 7 暗底 + 点亮段', () => {
    const layer = createDigitLayer({ w: 80, h: 60 }, { text: '1', showOffSegments: true })
    const { container } = render(<DigitLayerView layer={layer} scale={1} />)
    // '1' 点亮 2 段(b,c) + 7 暗底 = 9
    expect(container.querySelectorAll('path').length).toBe(9)
  })

  it('数码管定位在画布外仍完整渲染（突破网格边界）', () => {
    const layer = createDigitLayer({ w: 40, h: 30 }, { text: '88', x: -50, y: -20 })
    const { container } = render(<DigitLayerView layer={layer} scale={2} />)
    // 负坐标不影响渲染，path 仍然存在
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
    const inner = container.querySelector('g g')!
    const t = inner.getAttribute('transform')!
    expect(t).toMatch(/^matrix\(/)
    // 平移分量应为负（超出左上边界）
    const nums = t.match(/-?\d+\.?\d*/g)!.map(Number)
    expect(nums[4]!).toBeLessThan(0) // e
    expect(nums[5]!).toBeLessThan(0) // f
  })

  it('digitHeight 远大于单格 => 单字符覆盖多像素（突破单像素限制）', () => {
    const layer = createDigitLayer({ w: 80, h: 60 }, { text: '8', digitHeight: 40 })
    const { container } = render(<DigitLayerView layer={layer} scale={1} />)
    const svg = container.querySelector('svg')!
    // 字符高度 40 场景单位 >> 1 网格像素，几何 path 的 y 跨度应达 ~40
    const firstPath = svg.querySelector('path')!.getAttribute('d')!
    const ys = firstPath.match(/-?\d+\.?\d*/g)!.map(Number)
    expect(Math.max(...ys)).toBeGreaterThan(10)
  })

  it('斜切进入变换矩阵（旋转已取消）', () => {
    const layer = createDigitLayer({ w: 80, h: 60 }, { text: '8', skewX: 12 })
    const { container } = render(<DigitLayerView layer={layer} scale={1} />)
    const inner = container.querySelector('g g')!
    const t = inner.getAttribute('transform')!
    const nums = t.match(/-?\d+\.?\d*/g)!.map(Number)
    expect(Math.abs(nums[1]!)).toBeLessThan(1e-6) // b
    expect(Math.abs(nums[2]!)).toBeGreaterThan(0.01) // c（skewX）
  })

  it('glow>0 注入 filter 定义', () => {
    const layer = createDigitLayer({ w: 80, h: 60 }, { text: '8', glow: 0.8 })
    const { container } = render(<DigitLayerView layer={layer} scale={2} />)
    expect(container.querySelector('filter')).toBeTruthy()
    expect(container.querySelector('feGaussianBlur')).toBeTruthy()
  })

  it('小数点字符渲染点、不渲染段位', () => {
    const layer = createDigitLayer({ w: 80, h: 60 }, { text: '.', showOffSegments: false })
    const { container } = render(<DigitLayerView layer={layer} scale={1} />)
    expect(container.querySelectorAll('path').length).toBe(1)
  })
})

describe('WidgetLayerView — 小组件浮层', () => {
  it('未注册时渲染占位含 widgetKind', () => {
    const layer = createWidgetLayer({ w: 80, h: 60 }, 'claude-status')
    render(<WidgetLayerView layer={layer} scale={2} />)
    expect(screen.getByText(/claude-status/)).toBeTruthy()
  })

  it('注册渲染器后渲染自定义内容', () => {
    registerWidget('claude-status', ({ layer }) => (
      <div data-testid="custom-widget">自定义:{layer.name}</div>
    ))
    const layer = createWidgetLayer({ w: 80, h: 60 }, 'claude-status')
    layer.name = 'CC'
    render(<WidgetLayerView layer={layer} scale={2} />)
    expect(screen.getByTestId('custom-widget')).toHaveTextContent('自定义:CC')
  })

  it('尺寸 = width/height × scale', () => {
    const layer = createWidgetLayer({ w: 100, h: 50 }, 'claude-status', { width: 40, height: 20 })
    const { container } = render(<WidgetLayerView layer={layer} scale={3} />)
    const el = container.querySelector('[data-widget-layer]') as HTMLElement
    expect(el.style.width).toBe('120px')
    expect(el.style.height).toBe('60px')
  })
})

describe('SceneCanvas — 多层合成', () => {
  it('渲染默认场景：1 canvas + 1 svg', () => {
    const scene = createDefaultScene({ w: 20, h: 15 })
    const { container } = render(<SceneCanvas scene={scene} scale={4} mode="edit" />)
    expect(container.querySelectorAll('canvas').length).toBe(1)
    expect(container.querySelectorAll('svg[data-digit-layer]').length).toBe(1)
  })

  it('容器尺寸 = size × scale', () => {
    const scene = createDefaultScene({ w: 20, h: 15 })
    const { container } = render(<SceneCanvas scene={scene} scale={4} mode="edit" />)
    const el = container.querySelector('[data-testid="scene-canvas"]') as HTMLElement
    expect(el.style.width).toBe('80px')
    expect(el.style.height).toBe('60px')
  })

  it('visible=false 的图层不渲染', () => {
    const scene = createDefaultScene({ w: 20, h: 15 })
    scene.layers[1]!.visible = false // 数码管
    const { container } = render(<SceneCanvas scene={scene} scale={4} mode="edit" />)
    expect(container.querySelectorAll('svg[data-digit-layer]').length).toBe(0)
  })

  it('图层按数组顺序叠放（DOM 顺序 = z 顺序）', () => {
    const scene: Scene = {
      version: 1,
      size: { w: 10, h: 10 },
      layers: [
        createPixelLayer({ w: 10, h: 10 }),
        createDigitLayer({ w: 10, h: 10 }),
        createWidgetLayer({ w: 10, h: 10 }),
      ],
    }
    const { container } = render(<SceneCanvas scene={scene} scale={2} mode="edit" />)
    const el = container.querySelector('[data-testid="scene-canvas"]')!
    const kids = Array.from(el.children)
    expect(kids[0]!.tagName).toBe('CANVAS')
    expect(kids[1]!.tagName).toBe('svg') // SVG 元素 tagName 保留小写
    expect(kids[2]!.getAttribute('data-widget-layer')).toBeTruthy()
  })
})
