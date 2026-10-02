import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom 无 canvas 2d 实现，默认 stub 避免 "Not implemented" 噪音；
// 需要精确断言像素的测试（render.test.tsx）会自行覆盖更完整的 mock。
// 仅在 DOM 环境（jsdom）下执行——bridge 测试跑 node 环境无 HTMLCanvasElement。
if (typeof HTMLCanvasElement !== 'undefined') {
  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: HTMLCanvasElement['getContext'] & { __mocked?: boolean }
  }
  if (!proto.getContext.__mocked) {
    const stub = vi.fn(() => null) as unknown as typeof proto.getContext
    stub.__mocked = true
    proto.getContext = stub
  }
}

afterEach(() => {
  cleanup()
})
