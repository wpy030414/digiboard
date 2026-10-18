import { afterEach, describe, expect, it, vi } from 'vitest'
import { isMobileViewport, MOBILE_MEDIA_QUERY } from './viewport'

/** 构造最小 matchMedia 替身。 */
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isMobileViewport', () => {
  it('窄屏媒体查询命中时返回 true', () => {
    stubMatchMedia(true)
    expect(isMobileViewport()).toBe(true)
  })

  it('宽屏时返回 false', () => {
    stubMatchMedia(false)
    expect(isMobileViewport()).toBe(false)
  })

  it('无 matchMedia（SSR / jsdom）时按桌面端处理', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(isMobileViewport()).toBe(false)
  })

  it('查询串与 Tailwind md 断点一致', () => {
    expect(MOBILE_MEDIA_QUERY).toBe('(max-width: 767px)')
  })
})
