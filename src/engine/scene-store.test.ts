import { describe, it, expect, beforeEach } from 'vitest'
import { useSceneStore } from './scene-store'
import { createDefaultScene } from './factories'
import type { DigitLayer, PixelLayer } from './types'
import { countLit, getPixel } from './pixels'

/** 每个测试前重置 store 到干净场景。 */
function reset(w = 8, h = 6) {
  useSceneStore.setState({
    scene: createDefaultScene({ w, h }),
    selectedId: null,
    tool: 'pen',
    brushColor: '#ffaacc',
    past: [],
    future: [],
  })
}

const store = () => useSceneStore.getState()
const scene = () => store().scene
const pixelLayers = () => scene().layers.filter((l) => l.type === 'pixel') as PixelLayer[]
const digitLayers = () => scene().layers.filter((l) => l.type === 'digit') as DigitLayer[]

describe('scene-store — 初始化', () => {
  beforeEach(() => reset())

  it('默认场景含一个像素层和一个数码管层', () => {
    expect(pixelLayers().length).toBe(1)
    expect(digitLayers().length).toBe(1)
  })

  it('默认尺寸为 8x6（测试参数）', () => {
    expect(scene().size).toEqual({ w: 8, h: 6 })
    expect(pixelLayers()[0]!.pixels.length).toBe(48)
  })
})

describe('scene-store — 新建场景', () => {
  beforeEach(() => reset())

  it('newScene 生成指定尺寸、仅含像素层的空白场景', () => {
    store().newScene({ w: 40, h: 30 })
    expect(scene().size).toEqual({ w: 40, h: 30 })
    expect(scene().layers).toHaveLength(1)
    expect(scene().layers[0]!.type).toBe('pixel')
    const px = scene().layers[0] as PixelLayer
    expect(px.pixels.length).toBe(40 * 30)
    expect(countLit(px.pixels)).toBe(0)
  })

  it('newScene 夹紧到 200×200 上限', () => {
    store().newScene({ w: 500, h: 999 })
    expect(scene().size).toEqual({ w: 200, h: 200 })
    expect(pixelLayers()[0]!.pixels.length).toBe(200 * 200)
  })

  it('newScene 可直接注入图片生成的像素来源', () => {
    const palette = ['#ff0000', '#00ff00']
    const pixels = new Uint8Array(40 * 30)
    pixels[0] = 1
    pixels[1] = 2
    store().newScene({ w: 40, h: 30 }, { palette, pixels })
    const px = pixelLayers()[0]!
    expect(px.palette).toEqual(palette)
    expect(px.pixels[0]).toBe(1)
    expect(px.pixels[1]).toBe(2)
    // 外部缓冲不被共享
    pixels[0] = 0
    expect(px.pixels[0]).toBe(1)
  })

  it('newScene 清空撤销/重做栈', () => {
    store().drawPixel(0, 0, '#ffaacc')
    store().commitHistory()
    expect(store().canUndo()).toBe(true)
    store().newScene({ w: 40, h: 30 })
    expect(store().canUndo()).toBe(false)
    expect(store().canRedo()).toBe(false)
  })
})

describe('scene-store — 像素绘制', () => {
  beforeEach(() => reset())

  it('drawPixel 点亮指定格', () => {
    store().drawPixel(2, 3, '#ffaacc')
    expect(getPixel(pixelLayers()[0]!.pixels, 2, 3, 8)).toBe(1)
    expect(countLit(pixelLayers()[0]!.pixels)).toBe(1)
  })

  it('drawPixel 越界安全', () => {
    expect(() => store().drawPixel(99, 99, '#ffaacc')).not.toThrow()
    expect(countLit(pixelLayers()[0]!.pixels)).toBe(0)
  })

  it('drawLine 连续点亮', () => {
    store().drawLine(0, 0, 3, 0, '#ffaacc')
    expect(countLit(pixelLayers()[0]!.pixels)).toBe(4)
  })

  it('fillAt 填满整块空白', () => {
    store().fillAt(0, 0, '#ffaacc')
    expect(countLit(pixelLayers()[0]!.pixels)).toBe(48)
  })

  it('绘制前不可变：旧引用不被就地修改', () => {
    const before = pixelLayers()[0]!.pixels
    store().drawPixel(0, 0, '#ffaacc')
    // 原缓冲应保持不变（clone 后修改副本）
    expect(countLit(before)).toBe(0)
  })
})

describe('scene-store — 图层管理', () => {
  beforeEach(() => reset())

  it('addLayer 增加数码管层并选中', () => {
    const id = store().addLayer('digit')
    expect(digitLayers().length).toBe(2)
    expect(store().selectedId).toBe(id)
  })

  it("像素基座唯一：addLayer('pixel') 不会新增", () => {
    const before = pixelLayers().length
    const id = store().addLayer('pixel')
    expect(pixelLayers().length).toBe(before)
    expect(id).toBe(pixelLayers()[0]!.id)
  })

  it('像素基座不可删除', () => {
    const id = pixelLayers()[0]!.id
    store().removeLayer(id)
    expect(scene().layers.some((l) => l.id === id)).toBe(true)
    expect(pixelLayers().length).toBe(1)
  })

  it('removeLayer 删除并回退选中', () => {
    const id = digitLayers()[0]!.id
    store().removeLayer(id)
    expect(digitLayers().length).toBe(0)
    expect(scene().layers.some((l) => l.id === id)).toBe(false)
  })

  it('像素基座不可复制', () => {
    const id = pixelLayers()[0]!.id
    expect(store().duplicateLayer(id)).toBeNull()
    expect(pixelLayers().length).toBe(1)
  })

  it('duplicateLayer 复制内容层并产生新 id', () => {
    const id = digitLayers()[0]!.id
    const newId = store().duplicateLayer(id)
    expect(newId).toBeTruthy()
    expect(newId).not.toBe(id)
    expect(digitLayers().length).toBe(2)
  })

  it('updateLayer 局部更新数码管参数', () => {
    const id = digitLayers()[0]!.id
    store().updateLayer<DigitLayer>(id, { text: '42', skewX: 15 })
    const dl = digitLayers()[0]!
    expect(dl.text).toBe('42')
    expect(dl.skewX).toBe(15)
  })

  it('updateLayer 不影响其它字段', () => {
    const id = digitLayers()[0]!.id
    const before = digitLayers()[0]!.color
    store().updateLayer<DigitLayer>(id, { text: '7' })
    expect(digitLayers()[0]!.color).toBe(before)
  })
})

describe('scene-store — 图层排序', () => {
  beforeEach(() => {
    reset()
    store().addLayer('digit') // 现在有 px, dg, dg
  })

  const ids = () => scene().layers.map((l) => l.id)

  it('reorder top 移到最后', () => {
    const first = ids()[1]!
    store().reorderLayer(first, 'top')
    expect(ids()[ids().length - 1]).toBe(first)
  })

  it('reorder bottom 落到基座正上方（永不超过像素层）', () => {
    const last = ids()[ids().length - 1]!
    store().reorderLayer(last, 'bottom')
    expect(ids()[0]).toBe(pixelLayers()[0]!.id)
    expect(ids()[1]).toBe(last)
  })

  it('reorder up/down 相邻交换', () => {
    const before = ids()
    store().reorderLayer(before[1]!, 'up')
    const after = ids()
    expect(after[2]).toBe(before[1])
  })

  it('像素基座不参与排序', () => {
    const base = pixelLayers()[0]!.id
    store().reorderLayer(base, 'top')
    expect(ids()[0]).toBe(base)
  })
})

describe('scene-store — resize', () => {
  beforeEach(() => reset(8, 6))

  it('resize 改变场景与像素层尺寸', () => {
    store().resize({ w: 12, h: 10 })
    expect(scene().size).toEqual({ w: 12, h: 10 })
    expect(pixelLayers()[0]!.pixels.length).toBe(120)
  })

  it('resize 保留左上角重叠内容', () => {
    store().drawPixel(1, 1, '#ffaacc')
    store().resize({ w: 12, h: 10 })
    expect(getPixel(pixelLayers()[0]!.pixels, 1, 1, 12)).toBe(1)
  })

  it('resize 缩小时裁剪不报错', () => {
    store().drawPixel(7, 5, '#ffaacc')
    expect(() => store().resize({ w: 4, h: 4 })).not.toThrow()
    expect(pixelLayers()[0]!.pixels.length).toBe(16)
  })

  it('resize 记录历史可撤销', () => {
    store().resize({ w: 12, h: 10 })
    store().undo()
    expect(scene().size).toEqual({ w: 8, h: 6 })
  })
})

describe('scene-store — 撤销/重做', () => {
  beforeEach(() => reset())

  it('初始无历史', () => {
    expect(store().canUndo()).toBe(false)
    expect(store().canRedo()).toBe(false)
  })

  it('fillAt 提交历史后可 undo', () => {
    store().fillAt(0, 0, '#ffaacc')
    expect(countLit(pixelLayers()[0]!.pixels)).toBe(48)
    expect(store().canUndo()).toBe(true)
    store().undo()
    expect(countLit(pixelLayers()[0]!.pixels)).toBe(0)
  })

  it('undo 后可 redo', () => {
    store().fillAt(0, 0, '#ffaacc')
    store().undo()
    expect(store().canRedo()).toBe(true)
    store().redo()
    expect(countLit(pixelLayers()[0]!.pixels)).toBe(48)
  })

  it('多步操作逐步撤销', () => {
    store().fillAt(0, 0, '#ffaacc') // 空白 -> 全亮(48)，历史存入「空白」
    store().clearPixelLayer(pixelLayers()[0]!.id) // 全亮 -> 清空(0)，历史存入「全亮」
    store().undo() // 回到全亮
    expect(countLit(pixelLayers()[0]!.pixels)).toBe(48)
    store().undo() // 回到最初空白
    expect(countLit(pixelLayers()[0]!.pixels)).toBe(0)
  })

  it('commitHistory 用于连续绘制前打点（如笔画起点）', () => {
    // drawPixel 本身不入历史（属连续操作），编辑器在笔画开始前手动 commitHistory
    store().commitHistory() // 存入「空白」
    store().drawPixel(0, 0, '#ffaacc')
    store().drawPixel(1, 1, '#ffaacc')
    expect(countLit(pixelLayers()[0]!.pixels)).toBe(2)
    store().undo() // 一次撤销回到笔画前的空白
    expect(countLit(pixelLayers()[0]!.pixels)).toBe(0)
  })

  it('undo 到空栈不再变化', () => {
    store().fillAt(0, 0, '#ffaacc')
    store().undo()
    store().undo()
    store().undo()
    expect(store().past.length).toBe(0)
    expect(store().canUndo()).toBe(false)
  })

  it('addLayer 可撤销', () => {
    const before = scene().layers.length
    store().addLayer('digit')
    expect(scene().layers.length).toBe(before + 1)
    store().undo()
    expect(scene().layers.length).toBe(before)
  })

  it('removeLayer 可撤销', () => {
    const before = scene().layers.length
    store().removeLayer(digitLayers()[0]!.id)
    store().undo()
    expect(scene().layers.length).toBe(before)
  })

  it('undo 后选中层若消失则回退', () => {
    const id = store().addLayer('digit')
    store().select(id)
    store().undo() // 图层被移除
    expect(scene().layers.some((l) => l.id === id)).toBe(false)
    // selectedId 应指向仍存在的层或 null
    expect(
      store().selectedId === null || scene().layers.some((l) => l.id === store().selectedId),
    ).toBe(true)
  })
})

describe('scene-store — 历史容量', () => {
  beforeEach(() => reset())

  it('历史栈不超过 100', () => {
    for (let i = 0; i < 130; i++) {
      store().commitHistory()
    }
    expect(store().past.length).toBeLessThanOrEqual(100)
  })
})
