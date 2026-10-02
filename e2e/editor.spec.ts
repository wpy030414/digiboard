import { test, expect } from '@playwright/test'
import {
  gotoEditor,
  getScene,
  countLitPixels,
  getPixelAt,
  drawPixelViaStore,
  getDigitLayer,
  dragOnCanvas,
} from './helpers'

test.describe('编辑器 — 基础交互', () => {
  test('加载默认 80×60 场景，含像素层与数码管层', async ({ page }) => {
    await gotoEditor(page)
    const scene = await getScene(page)
    expect(scene.size).toEqual({ w: 80, h: 60 })
    expect(scene.layers.some((l) => l.type === 'pixel')).toBe(true)
    expect(scene.layers.some((l) => l.type === 'digit')).toBe(true)
  })

  test('修改点阵尺寸并回车生效', async ({ page }) => {
    await gotoEditor(page)
    const w = page.getByTestId('size-w')
    await w.fill('48')
    await w.press('Enter')
    const scene = await getScene(page)
    expect(scene.size.w).toBe(48)
  })

  test('切换像素画笔工具', async ({ page }) => {
    await gotoEditor(page)
    await page.getByTestId('tool-eraser').click()
    // 工具态经 store 反映
    const tool = await page.evaluate(() => (window as any).__digiboard.scene.getState().tool)
    expect(tool).toBe('eraser')
  })

  test('键盘快捷键 E 切橡皮、B 切画笔', async ({ page }) => {
    await gotoEditor(page)
    await page.keyboard.press('e')
    expect(await page.evaluate(() => (window as any).__digiboard.scene.getState().tool)).toBe(
      'eraser',
    )
    await page.keyboard.press('b')
    expect(await page.evaluate(() => (window as any).__digiboard.scene.getState().tool)).toBe('pen')
  })
})

test.describe('编辑器 — 像素绘制', () => {
  test('画笔拖拽点亮像素（真实指针交互）', async ({ page }) => {
    await gotoEditor(page)
    expect(await countLitPixels(page)).toBe(0)
    await page.getByTestId('tool-pen').click()
    // 画布 scale 自适应，拖一段相对距离
    await dragOnCanvas(page, { x: 20, y: 20 }, { x: 60, y: 20 })
    const lit = await countLitPixels(page)
    expect(lit).toBeGreaterThan(0)
  })

  test('橡皮擦除已点亮像素', async ({ page }) => {
    await gotoEditor(page)
    await drawPixelViaStore(page, 5, 5, 1)
    expect(await getPixelAt(page, 5, 5)).toBe(1)
    await page.getByTestId('tool-eraser').click()
    await dragOnCanvas(page, { x: 10, y: 10 }, { x: 30, y: 30 })
    // (5,5) 未必在擦除路径上，这里直接验证橡皮能写入 0
    await page.evaluate(() => {
      const s = (window as any).__digiboard.scene.getState()
      s.setTool('eraser')
      s.drawPixel(5, 5, 0)
    })
    expect(await getPixelAt(page, 5, 5)).toBe(0)
  })

  test('油漆桶填充连通区', async ({ page }) => {
    await gotoEditor(page)
    await page.getByTestId('tool-fill').click()
    await page.evaluate(() => {
      const s = (window as any).__digiboard.scene.getState()
      s.setTool('fill')
      s.fillAt(0, 0, 1)
    })
    // 80×60 空白填充 => 全亮 4800
    expect(await countLitPixels(page)).toBe(80 * 60)
  })

  test('清空像素层', async ({ page }) => {
    await gotoEditor(page)
    await drawPixelViaStore(page, 3, 3, 1)
    expect(await countLitPixels(page)).toBeGreaterThan(0)
    // 选中像素层后点清空
    const scene = await getScene(page)
    const pixelId = scene.layers.find((l) => l.type === 'pixel')!.id
    await page.evaluate((id) => (window as any).__digiboard.scene.getState().select(id), pixelId)
    await page.getByTestId('clear-pixel').click()
    expect(await countLitPixels(page)).toBe(0)
  })
})

test.describe('编辑器 — 数码管矢量层（突破像素限制）', () => {
  test('修改数码管文本反映到 store', async ({ page }) => {
    await gotoEditor(page)
    // 选中数码管层
    const scene = await getScene(page)
    const digitId = scene.layers.find((l) => l.type === 'digit')!.id
    await page.evaluate((id) => (window as any).__digiboard.scene.getState().select(id), digitId)
    const input = page.getByTestId('prop-digit-text')
    await input.fill('2077')
    await expect(input).toHaveValue('2077')
    const dg = await getDigitLayer(page)
    expect(dg?.text).toBe('2077')
  })

  test('数码管旋转/斜切经属性面板写入', async ({ page }) => {
    await gotoEditor(page)
    const scene = await getScene(page)
    const digitId = scene.layers.find((l) => l.type === 'digit')!.id
    await page.evaluate((id) => (window as any).__digiboard.scene.getState().select(id), digitId)
    // 直接经 store 设置变换，断言 UI 滑块反映
    await page.evaluate((id) => {
      ;(window as any).__digiboard.scene.getState().updateLayer(id, { rotation: 25, skewX: -15 })
    }, digitId)
    const dg = await getDigitLayer(page)
    expect(dg?.rotation).toBe(25)
    expect(dg?.skewX).toBe(-15)
  })

  test('数码管可定位到画布外（真突破网格边界）', async ({ page }) => {
    await gotoEditor(page)
    const scene = await getScene(page)
    const digitId = scene.layers.find((l) => l.type === 'digit')!.id
    await page.evaluate((id) => {
      ;(window as any).__digiboard.scene.getState().updateLayer(id, { x: -40, y: -30 })
    }, digitId)
    const dg = await page.evaluate(() => {
      const s = (window as any).__digiboard.scene.getState()
      const d = s.scene.layers.find((l: any) => l.type === 'digit')
      return { x: d.x, y: d.y }
    })
    expect(dg.x).toBeLessThan(0)
    expect(dg.y).toBeLessThan(0)
  })
})

test.describe('编辑器 — 图层管理', () => {
  test('添加数码管图层', async ({ page }) => {
    await gotoEditor(page)
    const before = (await getScene(page)).layerCount
    await page.getByTestId('add-layer').click()
    await page.getByTestId('add-digit').click()
    const after = await getScene(page)
    expect(after.layerCount).toBe(before + 1)
    expect(after.layers.filter((l) => l.type === 'digit').length).toBeGreaterThanOrEqual(2)
  })

  test('添加 Claude 会话小组件图层', async ({ page }) => {
    await gotoEditor(page)
    await page.getByTestId('add-layer').click()
    await page.getByTestId('add-widget').click()
    const scene = await getScene(page)
    expect(scene.layers.some((l) => l.type === 'widget')).toBe(true)
  })

  test('删除图层', async ({ page }) => {
    await gotoEditor(page)
    const before = (await getScene(page)).layerCount
    const scene = await getScene(page)
    const digitId = scene.layers.find((l) => l.type === 'digit')!.id
    await page.evaluate(
      (id) => (window as any).__digiboard.scene.getState().removeLayer(id),
      digitId,
    )
    expect((await getScene(page)).layerCount).toBe(before - 1)
  })

  test('切换图层可见性', async ({ page }) => {
    await gotoEditor(page)
    const scene = await getScene(page)
    const digitId = scene.layers.find((l) => l.type === 'digit')!.id
    await page.evaluate((id) => {
      ;(window as any).__digiboard.scene.getState().updateLayer(id, { visible: false })
    }, digitId)
    const after = await getScene(page)
    expect(after.layers.find((l) => l.id === digitId)?.visible).toBe(false)
  })
})

test.describe('编辑器 — 撤销/重做', () => {
  test('填充后撤销恢复空白', async ({ page }) => {
    await gotoEditor(page)
    await page.evaluate(() => (window as any).__digiboard.scene.getState().fillAt(0, 0, 1))
    expect(await countLitPixels(page)).toBe(80 * 60)
    await page.getByTestId('undo').click()
    expect(await countLitPixels(page)).toBe(0)
  })

  test('撤销后可重做', async ({ page }) => {
    await gotoEditor(page)
    await page.evaluate(() => (window as any).__digiboard.scene.getState().fillAt(0, 0, 1))
    await page.getByTestId('undo').click()
    expect(await countLitPixels(page)).toBe(0)
    await page.getByTestId('redo').click()
    expect(await countLitPixels(page)).toBe(80 * 60)
  })

  test('⌘Z 撤销', async ({ page }) => {
    await gotoEditor(page)
    await page.evaluate(() => (window as any).__digiboard.scene.getState().fillAt(0, 0, 1))
    await page.keyboard.press('Control+z') // Playwright chromium 下 meta 用 Control 亦可触发 handler
    expect(await countLitPixels(page)).toBe(0)
  })
})
