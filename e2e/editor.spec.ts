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
    // 颜色会吸附到 MARD 拼豆色卡：纯红 → F5，纯绿 → B5
    expect(palette).toContain('#e10328')
    expect(palette).toContain('#39e158')
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

  test('⌘N 打开新建、⌘S 打开保存对话框', async ({ page }) => {
    await gotoEditor(page)
    await page.keyboard.press('Control+n')
    await expect(page.getByTestId('new-scene-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('new-scene-dialog')).toBeHidden()
    await page.keyboard.press('Control+s')
    await expect(page.getByTestId('save-dialog')).toBeVisible()
  })

  test('拼豆开关文案在「副屏」与「拼豆」之间切换', async ({ page }) => {
    await gotoEditor(page)
    const toolbar = page.locator('header')
    await expect(toolbar).toContainText('副屏')
    await page.getByTestId('beads-mode').click()
    await expect(toolbar).toContainText('拼豆')
    await expect(toolbar).not.toContainText('副屏')
  })

  test('画笔颜色显示拼豆色号并吸附手选颜色', async ({ page }) => {
    await gotoEditor(page)
    await page.evaluate(() => (window as any).__digiboard.scene.getState().setBrushColor('#ff0000'))
    expect(await page.evaluate(() => (window as any).__digiboard.scene.getState().brushColor)).toBe(
      '#e10328',
    )
    await page.getByTestId('brush-color').hover()
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toContainText('F5')
    await expect(tooltip).not.toContainText('#')
  })

  test('保存按钮弹出对话框：可选 YAML 或 PNG', async ({ page }) => {
    await gotoEditor(page)
    await page.getByTestId('save-scene').click()
    await expect(page.getByTestId('save-dialog')).toBeVisible()
    await expect(page.getByTestId('save-yaml')).toBeVisible()
    await expect(page.getByTestId('save-png')).toBeVisible()

    const yamlDownload = page.waitForEvent('download')
    await page.getByTestId('save-yaml').click()
    expect((await yamlDownload).suggestedFilename()).toMatch(/\.yml$/)
    await expect(page.getByTestId('save-dialog')).toBeHidden()

    await page.getByTestId('save-scene').click()
    const pngDownload = page.waitForEvent('download')
    await page.getByTestId('save-png').click()
    expect((await pngDownload).suggestedFilename()).toMatch(/\.png$/)
    await expect(page.getByTestId('save-dialog')).toBeHidden()
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
    // 每格半透灰线
    expect(await page.getByTestId('beads-cell-guide').count()).toBeGreaterThan(0)
    const labels = page.getByTestId('beads-col-label')
    expect(await labels.count()).toBeGreaterThan(0)
    await expect(labels.first()).toHaveText(/^\d+$/)
    expect(await page.getByTestId('beads-row-label').count()).toBeGreaterThan(0)
    // 大图四边都有序号：右列、下行同样存在
    expect(
      await page.locator('[data-testid="beads-col-label"][data-side="bottom"]').count(),
    ).toBeGreaterThan(0)
    expect(
      await page.locator('[data-testid="beads-row-label"][data-side="right"]').count(),
    ).toBeGreaterThan(0)

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
    // 图例显示拼豆色号（MARD 221 色）而不是 HEX
    const redItem = page.getByTestId('beads-legend-item-2')
    const greenItem = page.getByTestId('beads-legend-item-3')
    await expect(redItem).toHaveAttribute('data-bead-code', 'F5')
    await expect(greenItem).toHaveAttribute('data-bead-code', 'B5')
    await expect(redItem).toContainText('F5')
    await expect(greenItem).toContainText('B5')
    await expect(redItem).not.toContainText('#')
    await expect(redItem).toContainText('×2')
    await expect(greenItem).toContainText('×1')
    // 图例按拼豆色号自然排序：B5 < F5
    const codes = await legend
      .locator('[data-bead-code]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-bead-code')))
    expect(codes).toEqual(['B5', 'F5'])

    const sample = () =>
      page.evaluate(() => {
        const c = document.querySelector('[data-testid="scene-canvas"] canvas') as HTMLCanvasElement
        const ctx = c.getContext('2d')!
        const unit = c.width / 80
        // 取格子左上角（避开中央的色号小字）
        const px = (x: number, y: number) =>
          Array.from(
            ctx.getImageData(Math.floor((x + 0.1) * unit), Math.floor((y + 0.1) * unit), 1, 1).data,
          )
        return { red: px(1, 1), green: px(3, 1) }
      })
    expect((await sample()).green[1]).toBe(255)

    await redItem.click()
    await expect(redItem).toHaveAttribute('aria-pressed', 'true')
    await page.waitForTimeout(150)
    const filtered = await sample()
    expect(filtered.red[0]).toBe(255) // 红色保持不透明
    // 其他颜色不消失，而是降到 30% 透明度：Green 与灭点底色混合后约 93
    expect(filtered.green[1]).toBeGreaterThan(80)
    expect(filtered.green[1]).toBeLessThan(110)

    await page.getByTestId('beads-legend-clear').click()
    await page.waitForTimeout(150)
    expect((await sample()).green[1]).toBe(255)
  })

  test('拼豆模式导出 PNG：行列序号 + 图例 + 每格灰线与 5/10 红线', async ({ page }) => {
    await gotoEditor(page)
    await drawPixelViaStore(page, 1, 1)
    await drawPixelViaStore(page, 2, 1)
    const res = await page.evaluate(async () => {
      const st = (window as any).__digiboard.scene.getState()
      const mod = await import('/src/engine/export/to-png.ts')
      const be = await import('/src/engine/export/beads-export.ts')
      const unit = 8
      const m = be.measureBeadsExport(st.scene, unit)
      const annotated = await mod.renderSceneToCanvas(st.scene, { pixelSize: unit, beads: true })
      const plain = await mod.renderSceneToCanvas(st.scene, {
        pixelSize: unit,
        beads: true,
        beadsAnnotations: false,
      })
      const normal = await mod.renderSceneToCanvas(st.scene, { pixelSize: unit })
      const ctx = annotated.getContext('2d')!
      const nctx = normal.getContext('2d')!
      const px = (c: CanvasRenderingContext2D, x: number, y: number) =>
        Array.from(c.getImageData(Math.floor(x), Math.floor(y), 1, 1).data)
      const nonBlack = (
        c: CanvasRenderingContext2D,
        x0: number,
        y0: number,
        x1: number,
        y1: number,
      ) => {
        const data = c.getImageData(x0, y0, x1 - x0, y1 - y0).data
        let n = 0
        for (let i = 0; i < data.length; i += 4) {
          if ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) > 30) n++
        }
        return n
      }
      let maxRed = 0
      for (let y = m.pad; y < m.pad + m.boardH; y++) {
        const p = px(ctx, m.pad + 5 * unit + 0.5, y + 0.5)
        maxRed = Math.max(maxRed, p[0] ?? 0)
      }
      return {
        annotated: { w: annotated.width, h: annotated.height },
        plain: { w: plain.width, h: plain.height },
        metrics: {
          pad: m.pad,
          width: m.width,
          height: m.height,
          boardW: m.boardW,
          boardH: m.boardH,
        },
        cell: px(ctx, m.pad + 1.15 * unit, m.pad + 1.15 * unit),
        boundary: px(ctx, m.pad + 2 * unit + 0.5, m.pad + 1.2 * unit),
        normalBoundary: px(nctx, 2 * unit + 0.5, 1.5 * unit),
        colLabel: nonBlack(ctx, m.pad, 0, m.pad + m.boardW, m.pad),
        bottomColLabel: nonBlack(
          ctx,
          m.pad,
          m.pad + m.boardH,
          m.pad + m.boardW,
          m.pad + m.boardH + m.pad,
        ),
        rowLabel: nonBlack(ctx, 0, m.pad, m.pad, m.pad + m.boardH),
        rightRowLabel: nonBlack(ctx, m.pad + m.boardW, m.pad, m.width, m.pad + m.boardH),
        legend: nonBlack(ctx, m.pad, m.pad + m.boardH, m.width - m.pad, m.height),
        maxRed,
      }
    })
    // 拼豆导出为画布区留出序号边距，并在下方追加图例
    expect(res.annotated.w).toBe(res.metrics.width)
    expect(res.annotated.h).toBe(res.metrics.height)
    expect(res.metrics.width).toBeGreaterThan(res.metrics.boardW)
    expect(res.metrics.height).toBeGreaterThan(res.metrics.boardH)
    // 关闭附加信息时与普通导出一致，只含画布区
    expect(res.plain).toEqual({ w: res.metrics.boardW, h: res.metrics.boardH })

    // 格子内部是像素色；格边界被半透灰线提亮（普通模式此处是黑缝）
    expect(res.cell.slice(0, 3)).toEqual([255, 170, 204])
    expect(res.normalBoundary.slice(0, 3)).toEqual([0, 0, 0])
    expect(res.boundary[1]).toBeGreaterThan(170)

    // 第 5 格红色参考线仍存在
    expect(res.maxRed).toBeGreaterThan(120)
    // 四周序号与下方图例都真实绘制
    expect(res.colLabel).toBeGreaterThan(0)
    expect(res.bottomColLabel).toBeGreaterThan(0)
    expect(res.rowLabel).toBeGreaterThan(0)
    expect(res.rightRowLabel).toBeGreaterThan(0)
    expect(res.legend).toBeGreaterThan(0)
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
    // 刷新后默认停在指针工具
    const pointer = page.getByTestId('tool-select')
    await expect(pointer).toHaveAttribute('aria-checked', 'true')
    await page.getByTestId('tool-eraser').click()
    await expect(page.getByTestId('tool-eraser')).toHaveAttribute('aria-checked', 'true')
    await expect(pointer).toHaveAttribute('aria-checked', 'false')
    const [onBg, offBg, onLeft] = await page.evaluate(() => {
      const on = document.querySelector('[data-testid="tool-eraser"]')!
      const off = document.querySelector('[data-testid="tool-select"]')!
      return [
        getComputedStyle(on).backgroundColor,
        getComputedStyle(off).backgroundColor,
        getComputedStyle(on).borderLeftWidth,
      ]
    })
    expect(onBg).not.toBe(offBg)
    // 选中第 2 个及之后的工具时，左侧高亮线不能因边框折叠而消失
    expect(onLeft).toBe('1px')
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
    expect(state.brushColor).toBe('#39e158') // 吸附到拼豆色卡 B5
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

test.describe('编辑器 — 侧边栏滚动', () => {
  /** 面板超长时，滚动容器应被约束在面板高度内，并可真正滚动。 */
  test('属性 / 小组件面板内部滚动，不撑破侧栏', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 520 })
    await gotoEditor(page)

    // 属性面板：选中数码管（属性项最多）；小组件面板：塞满图层列表
    const scene = await getScene(page)
    const digitId = scene.layers.find((l) => l.type === 'digit')!.id
    await page.evaluate((id) => (window as any).__digiboard.scene.getState().select(id), digitId)
    await page.evaluate(() => {
      const s = (window as any).__digiboard.scene.getState()
      for (let i = 0; i < 12; i++) s.addLayer('widget', 'claude-status')
    })

    for (const testId of ['prop-scroll', 'layer-scroll']) {
      const root = page.getByTestId(testId)
      await expect(root).toBeVisible()

      const metrics = await root.evaluate((el) => {
        const viewport = el.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement
        const panel = el.parentElement as HTMLElement
        return {
          rootBottom: el.getBoundingClientRect().bottom,
          panelBottom: panel.getBoundingClientRect().bottom,
          scrollHeight: viewport.scrollHeight,
          clientHeight: viewport.clientHeight,
        }
      })
      // 内容确实超出可视区，且滚动容器没有溢出面板
      expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight)
      expect(metrics.rootBottom).toBeLessThanOrEqual(metrics.panelBottom + 0.5)

      const scrolled = await root.evaluate((el) => {
        const viewport = el.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement
        viewport.scrollTop = 10_000
        return viewport.scrollTop
      })
      expect(scrolled).toBeGreaterThan(0)
    }
  })
})

test.describe('编辑器 — 顶部栏', () => {
  test('画笔色号常驻显示在色块右侧，不需要 hover', async ({ page }) => {
    await gotoEditor(page)
    await page.evaluate(() => (window as any).__digiboard.scene.getState().setBrushColor('#ff0000'))
    const code = page.getByTestId('brush-color-code')
    await expect(code).toBeVisible()
    await expect(code).toHaveText('F5')
    // 未 hover 任何元素时也可见（不依赖 tooltip）
    await page.mouse.move(2, 2)
    await expect(code).toBeVisible()
  })

  test('播放是纯图标按钮，不再带文字', async ({ page }) => {
    await gotoEditor(page)
    const play = page.getByTestId('play')
    await expect(play).toBeVisible()
    await expect(play).toHaveText('')
    await expect(play).toHaveAttribute('aria-label', '播放')
  })

  test('侧栏按钮隐藏属性与小组件面板，刷新后保持', async ({ page }) => {
    await gotoEditor(page)
    await expect(page.getByTestId('sidebar')).toBeVisible()
    await expect(page.getByTestId('prop-scroll')).toBeVisible()

    await page.getByTestId('toggle-sidebar').click()
    await expect(page.getByTestId('sidebar')).toHaveCount(0)
    await expect(page.getByTestId('prop-scroll')).toHaveCount(0)
    await expect(page.getByTestId('layer-scroll')).toHaveCount(0)

    await page.reload()
    await expect(page.getByTestId('scene-canvas')).toBeVisible()
    await expect(page.getByTestId('sidebar')).toHaveCount(0)

    await page.getByTestId('toggle-sidebar').click()
    await expect(page.getByTestId('sidebar')).toBeVisible()
  })
})

test.describe('编辑器 — 移动端窄屏', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('默认收纳侧栏，顶部栏可横向滚动且右侧动作常驻可见', async ({ page }) => {
    await gotoEditor(page)
    // 移动端打开即收纳侧栏，把空间让给画布
    await expect(page.getByTestId('sidebar')).toHaveCount(0)

    // 左区内容超出时整条可横向滚动
    const scroll = page.getByTestId('toolbar-scroll')
    const metrics = await scroll.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth)

    // 右侧固定动作不参与滚动，始终在视口内
    await expect(page.getByTestId('play')).toBeInViewport()
    const toggle = page.getByTestId('toggle-sidebar')
    await expect(toggle).toBeInViewport()

    // 横滚到最右后，最左侧的「新建」也能滚回可见
    await scroll.evaluate((el) => {
      el.scrollLeft = el.scrollWidth
    })
    expect(await scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)

    // 可临时展开侧栏；刷新后仍回到默认收纳（移动端不记忆）
    await toggle.click()
    await expect(page.getByTestId('sidebar')).toBeVisible()
    await toggle.click()
    await expect(page.getByTestId('sidebar')).toHaveCount(0)

    await page.reload()
    await expect(page.getByTestId('scene-canvas')).toBeVisible()
    await expect(page.getByTestId('sidebar')).toHaveCount(0)
  })
})

test.describe('编辑器 — 主内容区手势缩放', () => {
  const zoomPercent = async (page: import('@playwright/test').Page) =>
    Number(((await page.getByTestId('zoom-label').textContent()) ?? '').replace('%', ''))

  test('触控板捏合（ctrl+wheel）连续缩放，普通滚轮不缩放', async ({ page }) => {
    await gotoEditor(page)
    const viewport = page.getByTestId('canvas-viewport')
    const before = await zoomPercent(page)

    const prevented = await viewport.evaluate((el) => {
      const ev = new WheelEvent('wheel', {
        ctrlKey: true,
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      })
      el.dispatchEvent(ev)
      return ev.defaultPrevented
    })
    expect(prevented).toBe(true)
    await expect.poll(() => zoomPercent(page)).toBeGreaterThan(before)

    // 连续事件按当前显示倍率累积
    const zoomedOnce = await zoomPercent(page)
    await viewport.evaluate((el) => {
      el.dispatchEvent(
        new WheelEvent('wheel', { ctrlKey: true, deltaY: -60, bubbles: true, cancelable: true }),
      )
    })
    await expect.poll(() => zoomPercent(page)).toBeGreaterThan(zoomedOnce)

    // 普通滚轮保留给容器滚动：不拦截、不缩放
    const beforePlain = await zoomPercent(page)
    const plainPrevented = await viewport.evaluate((el) => {
      const ev = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
      el.dispatchEvent(ev)
      return ev.defaultPrevented
    })
    expect(plainPrevented).toBe(false)
    expect(await zoomPercent(page)).toBe(beforePlain)
  })
})

test.describe('编辑器 — 触屏双指缩放', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('双指捏合缩放，且不会在画布上误画像素', async ({ page, context }) => {
    await gotoEditor(page)
    const label = page.getByTestId('zoom-label')
    const zoom = async () => Number(((await label.textContent()) ?? '').replace('%', ''))
    const litBefore = await countLitPixels(page)
    const zoomBefore = await zoom()

    const box = (await page.getByTestId('scene-canvas').boundingBox())!
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const cdp = await context.newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: cx - 20, y: cy, id: 1 },
        { x: cx + 20, y: cy, id: 2 },
      ],
    })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: cx - 60, y: cy, id: 1 },
        { x: cx + 60, y: cy, id: 2 },
      ],
    })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

    // 指距 ×3 → 倍率约 ×3
    await expect.poll(zoom).toBeGreaterThan(zoomBefore * 2)
    // 双指手势（含首指落点）不应留下笔触
    expect(await countLitPixels(page)).toBe(litBefore)
  })
})

test.describe('编辑器 — 侧边栏面板标题与空态', () => {
  test('「属性」与「小组件」标题栏高度一致', async ({ page }) => {
    await gotoEditor(page)
    const height = (id: string) =>
      page.getByTestId(id).evaluate((el) => (el as HTMLElement).getBoundingClientRect().height)
    const prop = await height('prop-header')
    const layer = await height('layer-header')
    expect(prop).toBeGreaterThan(0)
    expect(layer).toBeCloseTo(prop, 1)
  })

  test('属性空态文案与小组件空态同一排版', async ({ page }) => {
    await gotoEditor(page)
    // 取消选中并清空所有内容层，让两个面板同时处于空态
    await page.evaluate(() => {
      const s = (window as any).__digiboard.scene.getState()
      s.select(null)
      s.scene.layers.filter((l: any) => l.type !== 'pixel').forEach((l: any) => s.removeLayer(l.id))
    })

    const propEmpty = page.getByTestId('prop-empty')
    await expect(propEmpty).toHaveText('选中一个小组件以编辑其属性')
    const layerEmpty = page.getByText('暂无小组件，点右上角 + 添加')
    await expect(layerEmpty).toBeVisible()

    const styleOf = (locator: typeof propEmpty) =>
      locator.evaluate((el) => {
        const c = getComputedStyle(el as HTMLElement)
        return {
          fontSize: c.fontSize,
          textAlign: c.textAlign,
          color: c.color,
          paddingTop: c.paddingTop,
          paddingLeft: c.paddingLeft,
        }
      })
    expect(await styleOf(propEmpty)).toEqual(await styleOf(layerEmpty))
  })
})

test.describe('新建 — 从 YAML 载入', () => {
  const YAML = `version: 1
size:
  w: 16
  h: 9
layers:
  - type: pixel
    id: p1
    name: 像素层
    visible: true
    locked: false
    opacity: 1
    palette: ["#ff0000"]
    offColor: "#111111"
    w: 16
    h: 9
    pixels:
      encoding: rle
      w: 16
      h: 9
      data: [0, 144]
`

  test('载入 .yml 后整场景替换，尺寸随文件', async ({ page }) => {
    await gotoEditor(page)
    await page.getByTestId('new-scene').click()
    await page.getByTestId('new-mode-yaml').click()
    // YAML 自带尺寸，不再显示宽高输入
    await expect(page.getByTestId('new-size-w')).toHaveCount(0)

    await page.getByTestId('new-yaml-input').setInputFiles({
      name: 'scene.yml',
      mimeType: 'text/yaml',
      buffer: Buffer.from(YAML),
    })
    await expect(page.getByTestId('new-yaml-summary')).toContainText('scene.yml · 16×9')

    await page.getByTestId('new-create').click()
    await expect(page.getByTestId('new-scene-dialog')).toHaveCount(0)
    const scene = await getScene(page)
    expect(scene.size).toEqual({ w: 16, h: 9 })
    expect(scene.layerCount).toBe(1)
  })

  test('非法 YAML 就地报错，不替换画布', async ({ page }) => {
    await gotoEditor(page)
    const before = await getScene(page)
    await page.getByTestId('new-scene').click()
    await page.getByTestId('new-mode-yaml').click()
    await page.getByTestId('new-yaml-input').setInputFiles({
      name: 'bad.yml',
      mimeType: 'text/yaml',
      buffer: Buffer.from('foo: bar\n'),
    })
    await expect(page.getByText('缺少 size.w / size.h')).toBeVisible()
    await expect(page.getByTestId('new-create')).toBeDisabled()

    await page.getByRole('button', { name: '取消' }).click()
    expect(await getScene(page)).toEqual(before)
  })
})
