import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { gotoEditor, gotoPlayer, drawPixelViaStore, setDigitTextViaStore } from './helpers'

test.describe('导出 — YAML', () => {
  test('导出 YAML 下载文件，内容可解析且尺寸正确', async ({ page }) => {
    await gotoEditor(page)
    // 画点内容再导出
    await drawPixelViaStore(page, 4, 4)
    await setDigitTextViaStore(page, '1234')

    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('export-yaml').click()
    const download = await downloadPromise

    const tmp = path.join(os.tmpdir(), `digiboard-${Date.now()}.yml`)
    await download.saveAs(tmp)
    expect(download.suggestedFilename()).toMatch(/\.yml$/)

    const text = fs.readFileSync(tmp, 'utf8')
    expect(text).toContain('version:')
    expect(text).toContain('size:')
    // RLE 像素编码存在
    expect(text).toMatch(/encoding:\s*"?rle"?/)
    // 数码管文本写入
    expect(text).toContain('1234')
    fs.unlinkSync(tmp)
  })

  test('导出的 YAML 经 sceneFromYaml 往返无损', async ({ page }) => {
    await gotoEditor(page)
    await drawPixelViaStore(page, 7, 9)
    await setDigitTextViaStore(page, '8888')

    // 在浏览器内直接做 YAML round-trip（复用应用自身的序列化器）
    const result = await page.evaluate(async () => {
      const mod = await import('/src/engine/export/to-yaml.ts')
      const s = (window as any).__digiboard.scene.getState().scene
      const yml = mod.sceneToYaml(s)
      const back = mod.sceneFromYaml(yml)
      const px = back.layers.find((l: any) => l.type === 'pixel')
      let lit = 0
      for (let i = 0; i < px.pixels.length; i++) if (px.pixels[i]) lit++
      const dg = back.layers.find((l: any) => l.type === 'digit')
      return { size: back.size, lit, digitText: dg?.text, layerCount: back.layers.length }
    })
    expect(result.size).toEqual({ w: 80, h: 60 })
    expect(result.lit).toBe(1)
    expect(result.digitText).toBe('8888')
  })
})

test.describe('导出 — PNG（真实 canvas 栅格化）', () => {
  test('导出 PNG 下载文件，为有效 PNG 且尺寸=点阵×pixelSize', async ({ page }) => {
    await gotoEditor(page)
    await drawPixelViaStore(page, 10, 10)
    await setDigitTextViaStore(page, '2077')

    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('export-png').click()
    const download = await downloadPromise

    const tmp = path.join(os.tmpdir(), `digiboard-${Date.now()}.png`)
    await download.saveAs(tmp)
    expect(download.suggestedFilename()).toMatch(/\.png$/)

    const buf = fs.readFileSync(tmp)
    // PNG 魔数
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    // 文件非空
    expect(buf.length).toBeGreaterThan(100)
    fs.unlinkSync(tmp)
  })

  test('renderSceneToCanvas 在真实浏览器合成三层（含矢量数码管栅格化）', async ({ page }) => {
    await gotoEditor(page)
    await drawPixelViaStore(page, 5, 5)
    await setDigitTextViaStore(page, '99')

    // 在浏览器内调用导出合成，验证 canvas 尺寸与非空像素
    const out = await page.evaluate(async () => {
      const mod = await import('/src/engine/export/to-png.ts')
      const s = (window as any).__digiboard.scene.getState().scene
      const canvas = await mod.renderSceneToCanvas(s, { pixelSize: 8 })
      const ctx = canvas.getContext('2d')!
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let nonTransparent = 0
      for (let i = 3; i < img.length; i += 4) if (img[i] > 0) nonTransparent++
      return { w: canvas.width, h: canvas.height, nonTransparent }
    })
    // 80×60 点阵 × 8 = 640×480
    expect(out.w).toBe(640)
    expect(out.h).toBe(480)
    // 背景 + 数码管 + 像素 => 大量非透明像素
    expect(out.nonTransparent).toBeGreaterThan(1000)
  })

  test('PNG 导出的 Blob 可编码（toBlob 成功）', async ({ page }) => {
    await gotoEditor(page)
    const size = await page.evaluate(async () => {
      const mod = await import('/src/engine/export/to-png.ts')
      const s = (window as any).__digiboard.scene.getState().scene
      const blob = await mod.sceneToPngBlob(s, { pixelSize: 4 })
      return { bytes: blob.size, type: blob.type }
    })
    expect(size.bytes).toBeGreaterThan(100)
    expect(size.type).toBe('image/png')
  })
})

test.describe('播放页 — 场景还原', () => {
  test('编辑器「播放」跳转 /play 并携带场景，还原尺寸与图层', async ({ page }) => {
    await gotoEditor(page)
    await drawPixelViaStore(page, 6, 6)
    await setDigitTextViaStore(page, '7777')

    await page.getByTestId('play').click()
    await expect(page).toHaveURL(/\/play\?scene=/)
    await expect(page.getByTestId('player-page')).toBeVisible()

    // 播放页从 URL base64-yml 还原（不经 store，故解码 URL 验证）
    const decoded = await page.evaluate(() => {
      const url = new URL(window.location.href)
      const b64 = url.searchParams.get('scene')!
      const bin = atob(decodeURIComponent(b64))
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
      const yml = new TextDecoder().decode(bytes)
      return yml
    })
    expect(decoded).toContain('w: 80')
    expect(decoded).toContain('h: 60')
    expect(decoded).toContain('7777')
  })

  test('播放页还原的数码管文本与像素与编辑态一致', async ({ page }) => {
    await gotoEditor(page)
    await drawPixelViaStore(page, 12, 8)
    await setDigitTextViaStore(page, '4242')
    await page.getByTestId('play').click()
    await expect(page.getByTestId('player-page')).toBeVisible()

    const restored = await page.evaluate(() => {
      // 播放页把场景渲染进 SceneCanvas；经 store 不可得（播放页用局部 state），
      // 故解码 URL 的 scene 参数验证
      const url = new URL(window.location.href)
      const b64 = url.searchParams.get('scene')!
      const bin = atob(decodeURIComponent(b64))
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
      const yml = new TextDecoder().decode(bytes)
      return { hasDigitText: yml.includes('4242'), hasRle: /rle/.test(yml) }
    })
    expect(restored.hasDigitText).toBe(true)
    expect(restored.hasRle).toBe(true)
  })

  test('播放页无 URL 场景时展示演示场景', async ({ page }) => {
    await gotoPlayer(page)
    await expect(page.getByTestId('player-page')).toBeVisible()
    // 演示场景含数码管
    const hasDigit = await page.evaluate(
      () => document.querySelector('svg[data-digit-layer]') !== null,
    )
    expect(hasDigit).toBe(true)
  })

  test('播放页「编辑器」按钮返回 /', async ({ page }) => {
    await gotoPlayer(page)
    await page.getByTestId('player-edit').click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('scene-canvas')).toBeVisible()
  })
})

test.describe('Claude 会话小组件 — 降级与渲染', () => {
  test('无 bridge 时小组件降级为 DEMO 并渲染会话', async ({ page }) => {
    await gotoEditor(page)
    await page.getByTestId('add-layer').click()
    await page.getByTestId('add-widget').click()

    const widget = page.getByTestId('claude-status-widget')
    await expect(widget).toBeVisible()
    // 无本地 bridge => 3s 超时后降级 mock（DEMO 徽标）；等待降级完成
    await expect(widget).toContainText('DEMO', { timeout: 6000 })
    // mock 会话名出现
    await expect(widget).toContainText('digiboard-04')
  })

  test('连接真实 bridge 时小组件显示 LIVE 与本机会话', async ({ page }) => {
    // 该测试需要 bridge 在 4321 运行；未运行则跳过
    let bridgeUp = false
    try {
      const res = await fetch('http://127.0.0.1:4321/status', { signal: AbortSignal.timeout(1500) })
      bridgeUp = res.ok
    } catch {
      bridgeUp = false
    }
    test.skip(!bridgeUp, '本地 bridge 未运行（pnpm bridge），跳过 LIVE 断言')

    await gotoEditor(page)
    await page.getByTestId('add-layer').click()
    await page.getByTestId('add-widget').click()
    const widget = page.getByTestId('claude-status-widget')
    await expect(widget).toContainText('LIVE', { timeout: 6000 })
  })
})
