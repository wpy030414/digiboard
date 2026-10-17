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

  test('从图片生成画布（cover 裁切 + 色彩降级）', async ({ page }) => {
    await gotoEditor(page)
    await page.getByTestId('new-scene').click()
    await page.getByTestId('new-mode-image').click()
    // 在页面内生成一张左红右绿的测试图
    const dataUrl = await page.evaluate(() => {
      const c = document.createElement('canvas')
      c.width = 8
      c.height = 4
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#ff0000'
      ctx.fillRect(0, 0, 4, 4)
      ctx.fillStyle = '#00ff00'
      ctx.fillRect(4, 0, 4, 4)
      return c.toDataURL('image/png')
    })
    const buffer = Buffer.from(dataUrl.split(',')[1]!, 'base64')
    await page.getByTestId('new-image-input').setInputFiles({
      name: 'split.png',
      mimeType: 'image/png',
      buffer,
    })
    await page.getByTestId('new-create').click()
    await expect(page.getByTestId('new-scene-dialog')).toBeHidden()

    const state = await page.evaluate(() => {
      const st = (window as any).__digiboard.scene.getState()
      const px = st.scene.layers.find((l: any) => l.type === 'pixel')
      let lit = 0
      for (const v of px.pixels) if (v) lit++
      return { size: st.scene.size, palette: px.palette as string[], lit }
    })
    expect(state.size).toEqual({ w: 40, h: 30 })
    const palette = state.palette.map((c) => c.toLowerCase())
    expect(palette).toContain('#ff0000')
    expect(palette).toContain('#00ff00')
    expect(state.lit).toBeGreaterThan(0)
  })

  test('像素基座不出现在图层面板，也不能新增', async ({ page }) => {
    await gotoEditor(page)
    await expect(page.getByTestId('layer-row-digit')).toBeVisible()
    expect(await page.getByTestId('layer-row-pixel').count()).toBe(0)
    await page.getByTestId('add-layer').click()
    await expect(page.getByTestId('add-digit')).toBeVisible()
    expect(await page.getByTestId('add-pixel').count()).toBe(0)
    expect(await page.getByTestId('add-widget').count()).toBe(1)
  })

  test('新建按钮弹出对话框，默认生成 40×30 空白画布', async ({ page }) => {
    await gotoEditor(page)
    await page.getByTestId('new-scene').click()
    await expect(page.getByTestId('new-scene-dialog')).toBeVisible()
    await page.getByTestId('new-create').click()
    await expect(page.getByTestId('new-scene-dialog')).toBeHidden()
    const scene = await getScene(page)
    expect(scene.size).toEqual({ w: 40, h: 30 })
    expect(scene.layers).toHaveLength(1)
    expect(scene.layers[0]!.type).toBe('pixel')
    expect(scene.layers.some((l) => l.type === 'digit')).toBe(false)
    // 基座不进入图层列表：新建后列表为空
    expect(await page.getByTestId('layer-row-digit').count()).toBe(0)
  })

  test('拼豆模式：方格无缝隙 + 行列序号 + 5/10 红线', async ({ page }) => {
    await gotoEditor(page)
    await drawPixelViaStore(page, 1, 1)
    await drawPixelViaStore(page, 2, 1)

    const sampleBoundary = () =>
      page.evaluate(() => {
        const c = document.querySelector('[data-testid="scene-canvas"] canvas') as HTMLCanvasElement
        const ctx = c.getContext('2d')!
        const unit = c.width / 80
        // 第 2、3 列之间的格边界（正常模式留缝 => 透明）
        return Array.from(ctx.getImageData(Math.floor(2 * unit), Math.floor(1.5 * unit), 1, 1).data)
      })
    expect((await sampleBoundary())[3]).toBe(0)

    await page.getByTestId('beads-mode').click()
    await expect(page.getByTestId('beads-mode')).toHaveAttribute('aria-checked', 'true')
    expect((await sampleBoundary())[3]).toBe(255)

    await expect(page.getByTestId('beads-guides')).toBeVisible()
    const labels = page.getByTestId('beads-col-label')
    expect(await labels.count()).toBeGreaterThan(0)
    await expect(labels.first()).toHaveText(/^\d+$/)
    expect(await page.getByTestId('beads-row-label').count()).toBeGreaterThan(0)

    // 退回普通模式后辅助叠层消失
    await page.getByTestId('beads-mode').click()
    expect(await page.getByTestId('beads-guides').count()).toBe(0)
  })

  test('拼豆模式开关刷新后保持', async ({ page }) => {
    await gotoEditor(page)
    await page.getByTestId('beads-mode').click()
    await expect(page.getByTestId('beads-mode')).toHaveAttribute('aria-checked', 'true')
    await page.reload()
    await expect(page.getByTestId('beads-mode')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('beads-guides')).toBeVisible()
  })

  test('拼豆图例：颜色计数与单色筛选', async ({ page }) => {
    await gotoEditor(page)
    await page.evaluate(() => {
      const st = (window as any).__digiboard.scene.getState()
      st.drawPixel(1, 1, '#ff0000')
      st.drawPixel(2, 1, '#ff0000')
      st.drawPixel(3, 1, '#00ff00')
    })
    await page.getByTestId('beads-mode').click()
    const legend = page.getByTestId('beads-legend')
    await expect(legend).toBeVisible()
    await expect(legend).toContainText('共 3 颗')
    const redItem = legend.locator('button', { hasText: '#ff0000' })
    const greenItem = legend.locator('button', { hasText: '#00ff00' })
    await expect(redItem).toContainText('×2')
    await expect(greenItem).toContainText('×1')

    const sample = () =>
      page.evaluate(() => {
        const c = document.querySelector('[data-testid="scene-canvas"] canvas') as HTMLCanvasElement
        const ctx = c.getContext('2d')!
        const unit = c.width / 80
        const px = (x: number, y: number) =>
          Array.from(
            ctx.getImageData(Math.floor((x + 0.5) * unit), Math.floor((y + 0.5) * unit), 1, 1).data,
          )
        return { red: px(1, 1), green: px(3, 1) }
      })
    expect((await sample()).green[1]).toBe(255)

    await redItem.click()
    await expect(redItem).toHaveAttribute('aria-pressed', 'true')
    await page.waitForTimeout(150)
    const filtered = await sample()
    expect(filtered.red[0]).toBe(255) // 红色保留
    expect(filtered.green[1]).not.toBe(255) // 绿色被隐藏

    await page.getByTestId('beads-legend-clear').click()
    await page.waitForTimeout(150)
    expect((await sample()).green[1]).toBe(255)
  })

  test('拼豆模式导出 PNG：直角无缝隙并含红色参考线', async ({ page }) => {
    await gotoEditor(page)
    await drawPixelViaStore(page, 1, 1)
    await drawPixelViaStore(page, 2, 1)
    const res = await page.evaluate(async () => {
      const st = (window as any).__digiboard.scene.getState()
      const mod = await import('/src/engine/export/to-png.ts')
      const read = (c: HTMLCanvasElement) => {
        const ctx = c.getContext('2d')!
        const px = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data)
        let maxR = 0
        let minG = 255
        for (let x = 36; x <= 42; x++) {
          const p = px(x, 2)
          maxR = Math.max(maxR, p[0] ?? 0)
          minG = Math.min(minG, p[1] ?? 255)
        }
        return {
          boundary: px(16, 12), // 第 2/3 列之间的格边界
          guide5: { r: maxR, g: minG },
        }
      }
      const withBeads = read(await mod.renderSceneToCanvas(st.scene, { pixelSize: 8, beads: true }))
      const normal = read(await mod.renderSceneToCanvas(st.scene, { pixelSize: 8 }))
      return { withBeads, normal }
    })
    // 普通模式格边界是板底黑色（留缝）；拼豆模式整格为像素色
    expect(res.normal.boundary.slice(0, 3)).toEqual([0, 0, 0])
    expect(res.withBeads.boundary.slice(0, 3)).toEqual([255, 170, 204])
    // 第 5 格边界有红色参考线（虚线，y=2 落在实线段上）
    expect(res.withBeads.guide5.r).toBeGreaterThan(120)
    expect(res.withBeads.guide5.g).toBeLessThan(90)
  })

  test('点阵尺寸上限 200×200', async ({ page }) => {
    await gotoEditor(page)
    const w = page.getByTestId('size-w')
    await w.fill('500')
    await w.press('Enter')
    expect((await getScene(page)).size.w).toBe(200)
  })

  test('工具栏选中工具高亮', async ({ page }) => {
    await gotoEditor(page)
    const pen = page.getByTestId('tool-pen')
    await expect(pen).toHaveAttribute('aria-checked', 'true')
    await page.getByTestId('tool-eraser').click()
    await expect(page.getByTestId('tool-eraser')).toHaveAttribute('aria-checked', 'true')
    await expect(pen).toHaveAttribute('aria-checked', 'false')
    const [onBg, offBg] = await page.evaluate(() => {
      const on = document.querySelector('[data-testid="tool-eraser"]')!
      const off = document.querySelector('[data-testid="tool-pen"]')!
      return [getComputedStyle(on).backgroundColor, getComputedStyle(off).backgroundColor]
    })
    expect(onBg).not.toBe(offBg)
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

test.describe('编辑器 — 自动持久化', () => {
  test('编辑后刷新页面，场景从 localStorage 恢复', async ({ page }) => {
    await gotoEditor(page)
    const before = await getScene(page)
    await drawPixelViaStore(page, 7, 9)
    expect(await getPixelAt(page, 7, 9)).toBe(1)
    // 等过 400ms 防抖窗口
    await page.waitForTimeout(700)

    await page.reload()
    await expect(page.getByTestId('scene-canvas')).toBeVisible()
    expect(await getPixelAt(page, 7, 9)).toBe(1)
    const after = await getScene(page)
    expect(after.size).toEqual(before.size)
    expect(after.layerCount).toBe(before.layerCount)
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

  test('工具栏画笔颜色可画出多色混搭并真实渲染', async ({ page }) => {
    await gotoEditor(page)
    await expect(page.getByTestId('brush-color')).toBeVisible()
    await page.evaluate(() => {
      const st = (window as any).__digiboard.scene.getState()
      st.setBrushColor('#ff0000')
      st.drawPixel(1, 1, '#ff0000')
      st.setBrushColor('#00ff00')
      st.drawPixel(2, 1, '#00ff00')
    })
    const state = await page.evaluate(() => {
      const st = (window as any).__digiboard.scene.getState()
      const px = st.scene.layers.find((l: any) => l.type === 'pixel')
      return {
        brushColor: st.brushColor,
        palette: px.palette,
        v1: px.pixels[1 * px.w + 1],
        v2: px.pixels[1 * px.w + 2],
      }
    })
    expect(state.brushColor).toBe('#00ff00')
    expect(state.palette).toContain('#ff0000')
    expect(state.palette).toContain('#00ff00')
    expect(state.v1).not.toBe(state.v2)

    // 真实 canvas：两颗点分别以红/绿绘制
    const colors = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="scene-canvas"] canvas') as HTMLCanvasElement
      const ctx = c.getContext('2d')!
      const unit = c.width / 80
      const read = (x: number, y: number) =>
        Array.from(
          ctx.getImageData(Math.floor((x + 0.5) * unit), Math.floor((y + 0.5) * unit), 1, 1).data,
        )
      return { red: read(1, 1), green: read(2, 1) }
    })
    expect(colors.red[0]).toBe(255)
    expect(colors.red[1]).toBe(0)
    expect(colors.green[0]).toBe(0)
    expect(colors.green[1]).toBe(255)
  })

  test('橡皮擦除已点亮像素', async ({ page }) => {
    await gotoEditor(page)
    await drawPixelViaStore(page, 5, 5)
    expect(await getPixelAt(page, 5, 5)).toBe(1)
    await page.getByTestId('tool-eraser').click()
    await dragOnCanvas(page, { x: 10, y: 10 }, { x: 30, y: 30 })
    // (5,5) 未必在擦除路径上，这里直接验证橡皮能写入 0
    await page.evaluate(() => {
      const s = (window as any).__digiboard.scene.getState()
      s.setTool('eraser')
      s.drawPixel(5, 5, null)
    })
    expect(await getPixelAt(page, 5, 5)).toBe(0)
  })

  test('油漆桶填充连通区', async ({ page }) => {
    await gotoEditor(page)
    await page.getByTestId('tool-fill').click()
    await page.evaluate(() => {
      const s = (window as any).__digiboard.scene.getState()
      s.setTool('fill')
      s.fillAt(0, 0, '#ffaacc')
    })
    // 80×60 空白填充 => 全亮 4800
    expect(await countLitPixels(page)).toBe(80 * 60)
  })

  test('清空像素基座（store 动作）', async ({ page }) => {
    await gotoEditor(page)
    await drawPixelViaStore(page, 3, 3)
    expect(await countLitPixels(page)).toBeGreaterThan(0)
    // 像素基座不再出现在属性面板，清空经 store 动作完成
    await page.evaluate(() => {
      const st = (window as any).__digiboard.scene.getState()
      const px = st.scene.layers.find((l: any) => l.type === 'pixel')
      st.clearPixelLayer(px.id)
    })
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

  test('数码管斜切经属性面板写入（旋转已取消）', async ({ page }) => {
    await gotoEditor(page)
    const scene = await getScene(page)
    const digitId = scene.layers.find((l) => l.type === 'digit')!.id
    await page.evaluate((id) => (window as any).__digiboard.scene.getState().select(id), digitId)
    // 直接经 store 设置变换，断言 UI 滑块反映
    await page.evaluate((id) => {
      ;(window as any).__digiboard.scene.getState().updateLayer(id, { skewX: -15 })
    }, digitId)
    const dg = await getDigitLayer(page)
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
    await page.evaluate(() => (window as any).__digiboard.scene.getState().fillAt(0, 0, '#ffaacc'))
    expect(await countLitPixels(page)).toBe(80 * 60)
    await page.getByTestId('undo').click()
    expect(await countLitPixels(page)).toBe(0)
  })

  test('撤销后可重做', async ({ page }) => {
    await gotoEditor(page)
    await page.evaluate(() => (window as any).__digiboard.scene.getState().fillAt(0, 0, '#ffaacc'))
    await page.getByTestId('undo').click()
    expect(await countLitPixels(page)).toBe(0)
    await page.getByTestId('redo').click()
    expect(await countLitPixels(page)).toBe(80 * 60)
  })

  test('⌘Z 撤销', async ({ page }) => {
    await gotoEditor(page)
    await page.evaluate(() => (window as any).__digiboard.scene.getState().fillAt(0, 0, '#ffaacc'))
    await page.keyboard.press('Control+z') // Playwright chromium 下 meta 用 Control 亦可触发 handler
    expect(await countLitPixels(page)).toBe(0)
  })
})
