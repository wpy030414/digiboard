/**
 * 视口判定：与 Tailwind 断点保持一致（md = 768px），供「窄屏默认收起」一类初始化逻辑使用。
 */

/** 窄屏（移动端）媒体查询：最大宽度 767px。 */
export const MOBILE_MEDIA_QUERY = '(max-width: 767px)'

/** 当前是否移动端视口；无 matchMedia 的环境（SSR / jsdom）按桌面端处理。 */
export function isMobileViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches
  } catch {
    return false
  }
}
