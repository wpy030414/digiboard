import { defineConfig, devices } from '@playwright/test'

/**
 * E2E 配置：用 vp dev 起真实开发服务器，Chromium 跑全链路交互测试。
 *
 * 为什么用 Playwright 而非纯 jsdom：PNG 导出依赖真实 canvas 2D
 * （createImageData/drawImage/SVG 栅格化/toBlob），jsdom 无实现；
 * 矢量数码管的「突破像素限制」也需要真实浏览器渲染 + 截图验证。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // 共享 dev server，串行更稳
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 8_000 },

  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5273' },
    },
  ],

  webServer: {
    // 专用端口，避开其它项目可能占用的 5173/5174
    command: 'pnpm dev --port 5273 --strictPort',
    url: 'http://localhost:5273',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
