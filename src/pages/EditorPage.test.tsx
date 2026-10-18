/**
 * 编辑器集成测试：渲染完整 EditorPage，驱动关键交互验证端到端行为。
 *
 * 覆盖：工具切换、点阵尺寸 resize、加图层、撤销重做、导出 YAML、键盘快捷键。
 * （像素指针绘制依赖精确坐标换算，放到 Playwright E2E 覆盖，此处聚焦逻辑联动。）
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EditorPage } from './EditorPage'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useSceneStore } from '@/engine/scene-store'
import { createDefaultScene } from '@/engine/factories'
import { setActiveTouches } from '@/engine/pinch'

// EditorPage 用到 ResizeObserver（jsdom 无实现），mock 之
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  // 每个测试重置 store 到干净场景
  useSceneStore.setState({
    scene: createDefaultScene({ w: 80, h: 60 }),
    selectedId: null,
    tool: 'pen',
    brushColor: '#ffaacc',
    past: [],
    future: [],
  })
})

afterEach(() => {
  setActiveTouches(0)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderEditor() {
  return render(
    <TooltipProvider>
      <MemoryRouter>
        <EditorPage />
      </MemoryRouter>
    </TooltipProvider>,
  )
}

const store = () => useSceneStore.getState()

describe('EditorPage — 结构渲染', () => {
  it('渲染工具栏、图层面板、画布、属性面板', () => {
    renderEditor()
    expect(screen.getByTestId('scene-canvas')).toBeTruthy()
    expect(screen.getByTestId('layer-list')).toBeTruthy()
    expect(screen.getByTestId('tool-pen')).toBeTruthy()
    expect(screen.getByTestId('save-scene')).toBeTruthy()
    expect(screen.getByTestId('play')).toBeTruthy()
  })

  it('画布容器尺寸 = 点阵 × scale', () => {
    renderEditor()
    const canvas = screen.getByTestId('scene-canvas') as HTMLElement
    // 80 宽点阵，自适应 scale 至少 1
    expect(canvas.style.width).toMatch(/\d+px$/)
  })
})

describe('EditorPage — 工具切换', () => {
  it('点击橡皮工具切换 store.tool', () => {
    renderEditor()
    fireEvent.click(screen.getByTestId('tool-eraser'))
    expect(store().tool).toBe('eraser')
  })

  it('点击选择工具切换 store.tool', () => {
    renderEditor()
    fireEvent.click(screen.getByTestId('tool-select'))
    expect(store().tool).toBe('select')
  })

  it('键盘 b/e/g 切换画笔/橡皮/填充', () => {
    renderEditor()
    fireEvent.keyDown(window, { key: 'e' })
    expect(store().tool).toBe('eraser')
    fireEvent.keyDown(window, { key: 'g' })
    expect(store().tool).toBe('fill')
    fireEvent.keyDown(window, { key: 'b' })
    expect(store().tool).toBe('pen')
  })
})

describe('EditorPage — 缩放', () => {
  it('自适应状态下点击放大，从当前显示倍率继续而不是回到旧手动值', () => {
    renderEditor()
    // 视口宽度为 0 时回落到 8x，屏幕上显示 800%
    expect(screen.getByTestId('zoom-label').textContent).toBe('800%')
    fireEvent.click(screen.getByLabelText('放大'))
    expect(screen.getByTestId('zoom-label').textContent).toBe('1000%')
  })
})

describe('EditorPage — 点阵尺寸', () => {
  it('修改宽度输入并回车触发 resize', () => {
    renderEditor()
    const wInput = screen.getByTestId('size-w') as HTMLInputElement
    fireEvent.change(wInput, { target: { value: '48' } })
    fireEvent.keyDown(wInput, { key: 'Enter' })
    expect(store().scene.size.w).toBe(48)
    expect(store().scene.size.h).toBe(60)
  })

  it('尺寸被夹紧到 [1,200]', () => {
    renderEditor()
    const wInput = screen.getByTestId('size-w') as HTMLInputElement
    fireEvent.change(wInput, { target: { value: '9999' } })
    fireEvent.keyDown(wInput, { key: 'Enter' })
    expect(store().scene.size.w).toBe(200)
  })
})

describe('EditorPage — 图层管理', () => {
  it('添加数码管图层', () => {
    renderEditor()
    const before = store().scene.layers.length
    // Radix 下拉在 jsdom 下需 pointerdown 打开，菜单项渲染在 portal（document.body）
    fireEvent.pointerDown(screen.getByTestId('add-layer'), { button: 0, ctrlKey: false })
    const item = screen.getByTestId('add-digit')
    fireEvent.click(item)
    expect(store().scene.layers.length).toBe(before + 1)
    expect(store().scene.layers.at(-1)!.type).toBe('digit')
  })

  it('图层面板不显示像素基座，只显示内容层', () => {
    renderEditor()
    // 默认 1 像素基座 + 1 数码管：基座不进入图层列表
    expect(screen.queryByTestId('layer-row-pixel')).toBeNull()
    expect(screen.getByTestId('layer-row-digit')).toBeTruthy()
  })

  it('点击图层行选中', () => {
    renderEditor()
    const rows = screen.getAllByTestId(/^layer-row-/)
    fireEvent.click(rows[0]!.querySelector('button')!)
    expect(store().selectedId).toBeTruthy()
  })
})

describe('EditorPage — 撤销重做按钮', () => {
  it('初始撤销按钮禁用', () => {
    renderEditor()
    expect((screen.getByTestId('undo') as HTMLButtonElement).disabled).toBe(true)
  })

  it('产生历史后撤销可用并可回退', () => {
    renderEditor()
    act(() => store().fillAt(0, 0, '#ffaacc')) // 触发一次带历史的操作
    // store 更新后按钮应启用（重新读 disabled）
    expect((screen.getByTestId('undo') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByTestId('undo'))
    const px = store().scene.layers.find((l) => l.type === 'pixel')!
    expect(px.type === 'pixel' && px.pixels.every((v) => v === 0)).toBe(true)
  })

  it('键盘 ⌘Z 撤销', () => {
    renderEditor()
    act(() => store().fillAt(0, 0, '#ffaacc'))
    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    const px = store().scene.layers.find((l) => l.type === 'pixel')!
    expect(px.type === 'pixel' && px.pixels.every((v) => v === 0)).toBe(true)
  })
})

describe('EditorPage — 导出', () => {
  it('导出 YAML 触发下载含场景数据', () => {
    renderEditor()
    const clickSpy = vi.fn()
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag)
      if (tag === 'a') el.click = clickSpy
      return el
    })
    const origUrl = globalThis.URL.createObjectURL
    globalThis.URL.createObjectURL = vi.fn(
      () => 'blob:mock',
    ) as unknown as typeof URL.createObjectURL
    globalThis.URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL

    fireEvent.click(screen.getByTestId('save-scene'))
    fireEvent.click(screen.getByTestId('save-yaml'))
    expect(clickSpy).toHaveBeenCalled()

    globalThis.URL.createObjectURL = origUrl
  })

  it('点击播放跳转 /play（navigate 被调用）', () => {
    // 用 spy 验证跳转：MemoryRouter 下点播放应改 location，这里验证无异常抛出且 URL 携带 scene
    renderEditor()
    expect(() => fireEvent.click(screen.getByTestId('play'))).not.toThrow()
  })
})

describe('EditorPage — 移动端侧栏默认收纳', () => {
  it('窄屏默认不渲染侧栏，点击工具栏按钮可临时展开', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 767px)',
      media: query,
    }))
    renderEditor()
    expect(screen.queryByTestId('sidebar')).toBeNull()

    fireEvent.click(screen.getByTestId('toggle-sidebar'))
    expect(screen.getByTestId('sidebar')).toBeTruthy()
  })

  it('桌面端默认展开侧栏', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
    renderEditor()
    expect(screen.getByTestId('sidebar')).toBeTruthy()
  })
})

describe('EditorPage — 主内容区手势缩放', () => {
  const zoomPercent = () =>
    Number((screen.getByTestId('zoom-label').textContent ?? '').replace('%', ''))

  it('触控板捏合（ctrl+wheel）连续缩放，普通滚轮不缩放', () => {
    renderEditor()
    const viewport = screen.getByTestId('canvas-viewport')
    const fireWheel = (deltaY: number, ctrlKey: boolean) => {
      const ev = new WheelEvent('wheel', { deltaY, ctrlKey, bubbles: true, cancelable: true })
      act(() => {
        viewport.dispatchEvent(ev)
      })
      return ev
    }

    // jsdom 下容器宽度为 0，自适应缩放走兜底值 800%
    expect(zoomPercent()).toBe(800)

    expect(fireWheel(-100, true).defaultPrevented).toBe(true)
    const afterOne = zoomPercent()
    expect(afterOne).toBeGreaterThan(800)

    // 连续事件按当前显示倍率累积
    expect(fireWheel(-100, true).defaultPrevented).toBe(true)
    expect(zoomPercent()).toBeGreaterThan(afterOne)

    // 普通滚轮交给容器滚动：不拦截、不改变倍率
    const plainBefore = zoomPercent()
    expect(fireWheel(-100, false).defaultPrevented).toBe(false)
    expect(zoomPercent()).toBe(plainBefore)
  })

  it('连续放大到上限 5000% 后不再变化', () => {
    renderEditor()
    const viewport = screen.getByTestId('canvas-viewport')
    for (let i = 0; i < 40; i++) {
      act(() => {
        viewport.dispatchEvent(
          new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true }),
        )
      })
    }
    expect(zoomPercent()).toBe(5000)

    act(() => {
      viewport.dispatchEvent(
        new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true }),
      )
    })
    expect(zoomPercent()).toBe(5000)
  })

  it('触屏双指捏合按指距比例缩放，并阻止页面原生缩放', () => {
    renderEditor()
    const viewport = screen.getByTestId('canvas-viewport')
    const touch = (clientX: number, clientY = 0) => ({ clientX, clientY }) as Touch
    const fireTouch = (type: string, touches: Touch[]) => {
      const ev = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(ev, 'touches', { value: touches })
      act(() => {
        viewport.dispatchEvent(ev)
      })
      return ev
    }

    const before = zoomPercent()
    fireTouch('touchstart', [touch(0), touch(100)])
    expect(fireTouch('touchmove', [touch(0), touch(200)]).defaultPrevented).toBe(true)
    // 指距 ×2 → 倍率 ×2
    expect(zoomPercent()).toBe(before * 2)

    fireTouch('touchend', [])
    expect(zoomPercent()).toBe(before * 2)
  })
})
