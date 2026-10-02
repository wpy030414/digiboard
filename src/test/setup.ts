import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom 无 canvas 2d 实现，默认 stub 避免 "Not implemented" 噪音；
// 需要精确断言像素的测试（render.test.tsx）会自行覆盖更完整的 mock。
if (!HTMLCanvasElement.prototype.getContext.__mocked) {
  const stub = vi.fn(() => null) as unknown as HTMLCanvasElement['getContext'] & {
    __mocked?: boolean
  }
  stub.__mocked = true
  HTMLCanvasElement.prototype.getContext = stub
}

afterEach(() => {
  cleanup()
})
