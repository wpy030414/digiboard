import { expect, type Page } from '@playwright/test'

/**
 * E2E 辅助：通过 dev 态挂到 window 的 __digiboard store 做确定性断言与状态注入，
 * 配合真实 UI 交互（点击/拖拽/输入）覆盖全链路。
 */

export interface SceneSnapshot {
  size: { w: number; h: number }
  layerCount: number
  layers: Array<{ id: string; type: string; visible: boolean; name: string }>
}

/** 读取当前场景的精简快照（经序列化，避免把 Uint8Array 传回 Node）。 */
export async function getScene(page: Page): Promise<SceneSnapshot> {
  return page.evaluate(() => {
    const s = (window as any).__digiboard.scene.getState()
    return {
      size: { ...s.scene.size },
      layerCount: s.scene.layers.length,
      layers: s.scene.layers.map((l: any) => ({
        id: l.id,
        type: l.type,
        visible: l.visible,
        name: l.name,
      })),
    }
  })
}

/** 读取某像素层点亮像素总数。 */
export async function countLitPixels(page: Page, layerIndex = 0): Promise<number> {
  return page.evaluate((idx) => {
    const s = (window as any).__digiboard.scene.getState()
    const px = s.scene.layers.filter((l: any) => l.type === 'pixel')[idx]
    if (!px) return -1
    let n = 0
    for (let i = 0; i < px.pixels.length; i++) if (px.pixels[i]) n++
    return n
  }, layerIndex)
}

/** 读取某像素层指定格点的值。 */
export async function getPixelAt(
  page: Page,
  x: number,
  y: number,
  layerIndex = 0,
): Promise<number> {
  return page.evaluate(
    ({ x, y, idx }) => {
      const s = (window as any).__digiboard.scene.getState()
      const px = s.scene.layers.filter((l: any) => l.type === 'pixel')[idx]
      if (!px) return -1
      return px.pixels[y * px.w + x] ?? 0
    },
    { x, y, idx: layerIndex },
  )
}

/** 直接经 store 画一个像素（绕过指针坐标换算，用于精确断言）。 */
export async function drawPixelViaStore(
  page: Page,
  x: number,
  y: number,
  color: string | null = '#ffaacc',
): Promise<void> {
  await page.evaluate(
    ({ x, y, color }) => (window as any).__digiboard.scene.getState().drawPixel(x, y, color),
    { x, y, color },
  )
}

/** 经 store 直接改数码管文本（用于断言矢量层参数写入 UI）。 */
export async function setDigitTextViaStore(page: Page, text: string): Promise<void> {
  await page.evaluate((text) => {
    const st = (window as any).__digiboard.scene.getState()
    const dg = st.scene.layers.find((l: any) => l.type === 'digit')
    if (dg) st.updateLayer(dg.id, { text })
  }, text)
}

/** 读取数码管层的文本与变换。 */
export async function getDigitLayer(page: Page) {
  return page.evaluate(() => {
    const s = (window as any).__digiboard.scene.getState()
    const dg = s.scene.layers.find((l: any) => l.type === 'digit')
    return dg ? { text: dg.text, skewX: dg.skewX, digitHeight: dg.digitHeight } : null
  })
}

/** 在画布上以鼠标拖拽画一条线（真实指针交互）。返回起止的屏幕坐标。 */
export async function dragOnCanvas(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const box = await page.getByTestId('scene-canvas').boundingBox()
  if (!box) throw new Error('scene-canvas 无 boundingBox')
  await page.mouse.move(box.x + from.x, box.y + from.y)
  await page.mouse.down()
  // 分多步移动，确保 pointermove 连续触发（Bresenham 连线）
  const steps = 8
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps
    const y = from.y + ((to.y - from.y) * i) / steps
    await page.mouse.move(box.x + x, box.y + y)
  }
  await page.mouse.up()
}

/** 等待编辑器就绪（画布 + 工具栏出现）。 */
export interface GotoEditorOptions {
  /** true = 保留新用户首次访问的预设场景，不做空白基线重置（预设相关用例）。 */
  preset?: boolean
}

export async function gotoEditor(page: Page, opts: GotoEditorOptions = {}): Promise<void> {
  await page.goto('/')
  await expect(page.getByTestId('scene-canvas')).toBeVisible()
  await expect(page.getByTestId('tool-pen')).toBeVisible()
  // 除预设用例外，统一回到 80×60 空白默认场景：像素计数、撤销等断言需要确定基线
  if (!opts.preset) {
    await page.evaluate(async () => {
      const mod = await import('/src/engine/factories.ts')
      const st = (window as any).__digiboard.scene.getState()
      st.setScene(mod.createDefaultScene({ w: 80, h: 60 }))
      st.select(null)
    })
  }
}

/** 等待播放页就绪。 */
export async function gotoPlayer(page: Page, query = ''): Promise<void> {
  await page.goto(`/play${query}`)
  await expect(page.getByTestId('player-page')).toBeVisible()
}
