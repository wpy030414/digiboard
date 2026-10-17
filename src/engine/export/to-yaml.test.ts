import { describe, it, expect } from 'vitest'
import { sceneToYaml, sceneFromYaml, sceneToBase64Yaml, sceneFromBase64Yaml } from './to-yaml'
import {
  createDefaultScene,
  createPixelLayer,
  createDigitLayer,
  createWidgetLayer,
} from '../factories'
import type { DigitLayer, PixelLayer, Scene, WidgetLayer } from '../types'
import { countLit, getPixel } from '../pixels'

describe('to-yaml — round-trip 无损', () => {
  it('默认场景 round-trip 后尺寸与图层数一致', () => {
    const scene = createDefaultScene({ w: 40, h: 30 })
    const back = sceneFromYaml(sceneToYaml(scene))
    expect(back.size).toEqual({ w: 40, h: 30 })
    expect(back.layers.length).toBe(scene.layers.length)
  })

  it('像素内容无损还原（RLE 编解码）', () => {
    const scene = createDefaultScene({ w: 16, h: 16 })
    const px = scene.layers[0] as PixelLayer
    // 画一个 L 形
    for (let i = 0; i < 16; i++) px.pixels[i * 16 + 0] = 1
    for (let i = 0; i < 16; i++) px.pixels[15 * 16 + i] = 1
    px.pixels[5 * 16 + 7] = 1
    const lit = countLit(px.pixels)

    const back = sceneFromYaml(sceneToYaml(scene))
    const px2 = back.layers[0] as PixelLayer
    expect(countLit(px2.pixels)).toBe(lit)
    expect(getPixel(px2.pixels, 0, 0, 16)).toBe(1)
    expect(getPixel(px2.pixels, 7, 5, 16)).toBe(1)
    expect(getPixel(px2.pixels, 8, 8, 16)).toBe(0)
  })

  it('调色板多色 round-trip 无损', () => {
    const scene = createDefaultScene({ w: 8, h: 8 })
    const px = scene.layers[0] as PixelLayer
    px.palette = ['#ff0000', '#00ff00', '#0000ff']
    px.pixels[0] = 1
    px.pixels[1] = 2
    px.pixels[2] = 3
    const back = sceneFromYaml(sceneToYaml(scene))
    const px2 = back.layers[0] as PixelLayer
    expect(px2.palette).toEqual(['#ff0000', '#00ff00', '#0000ff'])
    expect(getPixel(px2.pixels, 0, 0, 8)).toBe(1)
    expect(getPixel(px2.pixels, 1, 0, 8)).toBe(2)
    expect(getPixel(px2.pixels, 2, 0, 8)).toBe(3)
  })

  it('旧版单色 color 字段迁移为调色板首色', () => {
    const yml = [
      'version: 1',
      'size: { w: 4, h: 4 }',
      'layers:',
      '  - id: px-1',
      '    name: 像素层',
      '    type: pixel',
      '    visible: true',
      '    locked: false',
      '    opacity: 1',
      "    color: '#abcdef'",
      "    offColor: '#17171d'",
      '    w: 4',
      '    h: 4',
      '    pixels: { encoding: rle, w: 4, h: 4, data: [1, 1, 15, 0] }',
    ].join('\n')
    const back = sceneFromYaml(yml)
    const px = back.layers[0] as PixelLayer
    expect(px.palette).toEqual(['#abcdef'])
    expect(getPixel(px.pixels, 0, 0, 4)).toBe(1)
    expect(px).not.toHaveProperty('color')
  })

  it('数码管全部参数无损还原', () => {
    const scene = createDefaultScene({ w: 40, h: 30 })
    const dg = scene.layers[1] as DigitLayer
    Object.assign(dg, {
      text: 'A-1.5',
      x: 12.5,
      y: -3.25,
      digitHeight: 48,
      skewX: -12,
      skewY: 7,
      glow: 0.77,
      color: '#ff2200',
      glowColor: '#ffaa00',
      segmentStyle: 'rounded' as const,
      showOffSegments: false,
      opacity: 0.6,
    })
    const back = sceneFromYaml(sceneToYaml(scene))
    const dg2 = back.layers[1] as DigitLayer
    expect(dg2.text).toBe('A-1.5')
    expect(dg2.x).toBe(12.5)
    expect(dg2.y).toBe(-3.25)
    expect(dg2.digitHeight).toBe(48)
    expect(dg2.skewX).toBe(-12)
    expect(dg2.skewY).toBe(7)
    expect(dg2.glow).toBeCloseTo(0.77)
    expect(dg2.color).toBe('#ff2200')
    expect(dg2.glowColor).toBe('#ffaa00')
    expect(dg2.segmentStyle).toBe('rounded')
    expect(dg2.showOffSegments).toBe(false)
    expect(dg2.opacity).toBe(0.6)
  })

  it('小组件配置与定位无损还原', () => {
    const wg = createWidgetLayer({ w: 40, h: 30 }, 'claude-status')
    wg.config = { bridgeUrl: 'http://localhost:9999/events', showTokens: false }
    wg.x = 5
    wg.y = 6
    wg.width = 30
    wg.height = 12
    const scene: Scene = { version: 1, size: { w: 40, h: 30 }, layers: [wg] }
    const back = sceneFromYaml(sceneToYaml(scene))
    // 场景缺像素层：读档自动补齐基座到最底部
    expect(back.layers[0]!.type).toBe('pixel')
    const wg2 = back.layers.find((l) => l.type === 'widget') as WidgetLayer
    expect(wg2.widgetKind).toBe('claude-status')
    expect(wg2.config).toEqual({ bridgeUrl: 'http://localhost:9999/events', showTokens: false })
    expect(wg2.x).toBe(5)
    expect(wg2.width).toBe(30)
  })

  it('图层顺序与可见/锁定/透明度保留', () => {
    const scene: Scene = {
      version: 1,
      size: { w: 10, h: 10 },
      layers: [
        createPixelLayer({ w: 10, h: 10 }),
        createDigitLayer({ w: 10, h: 10 }),
        createWidgetLayer({ w: 10, h: 10 }),
      ],
    }
    scene.layers[1]!.visible = false
    scene.layers[2]!.locked = true
    scene.layers[0]!.opacity = 0.5
    const back = sceneFromYaml(sceneToYaml(scene))
    expect(back.layers.map((l) => l.type)).toEqual(['pixel', 'digit', 'widget'])
    expect(back.layers[1]!.visible).toBe(false)
    expect(back.layers[2]!.locked).toBe(true)
    expect(back.layers[0]!.opacity).toBe(0.5)
  })

  it('读档时像素基座归一到最底部，多余的像素层被合并', () => {
    const pxA = createPixelLayer({ w: 4, h: 4 })
    const pxB = createPixelLayer({ w: 4, h: 4 })
    pxA.pixels[1] = 1 // (1,0)
    pxB.pixels[4 * 2 + 3] = 1 // (3,2)
    const scene: Scene = {
      version: 1,
      size: { w: 4, h: 4 },
      layers: [createDigitLayer({ w: 4, h: 4 }), pxA, pxB],
    }
    const back = sceneFromYaml(sceneToYaml(scene))
    expect(back.layers[0]!.type).toBe('pixel')
    expect(back.layers.filter((l) => l.type === 'pixel')).toHaveLength(1)
    const merged = back.layers[0] as PixelLayer
    expect(getPixel(merged.pixels, 1, 0, 4)).toBe(1)
    expect(getPixel(merged.pixels, 3, 2, 4)).toBe(1)
  })

  it('旧 YAML 里的 background 字段被忽略（底色固定黑色）', () => {
    const scene = createDefaultScene({ w: 10, h: 10 })
    const yml = sceneToYaml(scene).replace('layers:', 'background: "#ff0000"\nlayers:')
    const back = sceneFromYaml(yml)
    expect('background' in back).toBe(false)
  })
})

describe('to-yaml — base64 URL 编码', () => {
  it('base64 round-trip 无损', () => {
    const scene = createDefaultScene({ w: 20, h: 12 })
    ;(scene.layers[0] as PixelLayer).pixels[3] = 1
    const back = sceneFromBase64Yaml(sceneToBase64Yaml(scene))
    expect(back.size).toEqual({ w: 20, h: 12 })
    expect(getPixel((back.layers[0] as PixelLayer).pixels, 3, 0, 20)).toBe(1)
  })

  it('中文图层名经 base64 往返不乱码', () => {
    const scene = createDefaultScene({ w: 10, h: 10 })
    scene.layers[1]!.name = '数码管·主显示'
    const back = sceneFromBase64Yaml(sceneToBase64Yaml(scene))
    expect(back.layers[1]!.name).toBe('数码管·主显示')
  })

  it('base64 是纯 ASCII（可安全入 URL）', () => {
    const b64 = sceneToBase64Yaml(createDefaultScene({ w: 8, h: 8 }))
    expect(b64).toMatch(/^[A-Za-z0-9+/=]+$/)
  })
})

describe('to-yaml — 错误处理', () => {
  it('非对象输入抛错', () => {
    expect(() => sceneFromYaml('just a string')).toThrow()
  })

  it('缺 size 抛错', () => {
    expect(() => sceneFromYaml('layers: []')).toThrow(/size/)
  })

  it('layers 非数组抛错', () => {
    expect(() => sceneFromYaml('size:\n  w: 4\n  h: 4\nlayers: 3')).toThrow(/layers/)
  })

  it('超过 200×200 的场景拒绝加载', () => {
    const yml = ['version: 1', 'size: { w: 500, h: 60 }', 'layers: []'].join('\n')
    expect(() => sceneFromYaml(yml)).toThrow(/尺寸超限/)
  })

  it('YAML 语法错误抛错', () => {
    expect(() => sceneFromYaml(':\n  - bad: [')).toThrow()
  })
})

describe('to-yaml — 紧凑性', () => {
  it('大面积空白像素 RLE 极短', () => {
    const scene: Scene = {
      version: 1,
      size: { w: 200, h: 200 },
      layers: [createPixelLayer({ w: 200, h: 200 })],
    }
    const yml = sceneToYaml(scene)
    // 40000 像素全灭 => RLE data 应为 [40000, 0]，yml 里就两个数
    expect(yml).toContain('40000')
    expect(yml.length).toBeLessThan(600)
  })
})
