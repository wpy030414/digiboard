import { describe, it, expect } from 'vitest'
import { loadPresetScene } from './presets'

describe('内置预设场景', () => {
  it('解析为 40×30，含像素基座、数码管时钟与 Claude 小组件', () => {
    const scene = loadPresetScene()
    expect(scene.size).toEqual({ w: 40, h: 30 })
    expect(scene.layers[0]?.type).toBe('pixel')

    const digit = scene.layers.find((l) => l.type === 'digit')
    expect(digit?.type).toBe('digit')
    if (digit?.type === 'digit') {
      expect(digit.clockMode).toBe('time')
      expect(digit.clockShowSeconds).toBe(true)
      expect(digit.clockHour12).toBe(false)
    }

    const widget = scene.layers.find((l) => l.type === 'widget')
    expect(widget?.type).toBe('widget')
    if (widget?.type === 'widget') {
      expect(widget.widgetKind).toBe('claude-status')
      // 小组件读档即吸附整数网格
      expect(Number.isInteger(widget.x)).toBe(true)
      expect(Number.isInteger(widget.y)).toBe(true)
      expect(Number.isInteger(widget.width)).toBe(true)
      expect(Number.isInteger(widget.height)).toBe(true)
    }
  })

  it('每次加载返回独立场景对象，互不共享可变数据', () => {
    const a = loadPresetScene()
    const b = loadPresetScene()
    const pxA = a.layers[0]
    const pxB = b.layers[0]
    expect(pxA?.type).toBe('pixel')
    expect(pxB?.type).toBe('pixel')
    if (pxA?.type === 'pixel' && pxB?.type === 'pixel') {
      expect(pxA.pixels).not.toBe(pxB.pixels)
      pxA.pixels[0] = 255
      expect(pxB.pixels[0]).not.toBe(255)
    }
  })
})
