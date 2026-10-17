import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite-plus'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * 部署基路径：GitHub Pages 项目站点挂在 `/<repo>/` 下（本项目为 `/digiboard/`），
 * 资源与路由都必须带此前缀。本地 dev / preview / e2e 保持根路径；
 * 需要复现线上构建时用 `DIGIBOARD_BASE=/digiboard/ pnpm build` 覆盖。
 */
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base =
  process.env.DIGIBOARD_BASE ??
  (process.env.GITHUB_ACTIONS === 'true' && repoName ? `/${repoName}/` : '/')

// Vite+ 单一配置：dev/build/preview + test(vitest) + lint(oxlint) + fmt(oxfmt)
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'bridge/**/*.test.mjs'],
  },
  lint: {
    ignorePatterns: ['dist/**', 'playwright-report/**', 'test-results/**'],
  },
  fmt: {
    semi: false,
    singleQuote: true,
  },
})
