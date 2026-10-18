/**
 * 双指（捏合）手势的全局状态。
 *
 * 触摸事件由编辑器主内容区统一统计，画布只读取这里的状态：
 * 触屏上第二根手指可能落在画布外，靠画布自身的 pointer 事件无法感知，
 * 因此需要一个跨元素共享的「正在双指操作」信号，避免捏合时误画像素。
 */

let activeTouches = 0
const pinchStartListeners = new Set<() => void>()

/** 更新当前落在主内容区上的触摸点数量（由 touchstart/move/end 调用）。 */
export function setActiveTouches(n: number): void {
  const wasPinching = activeTouches >= 2
  activeTouches = n
  if (activeTouches >= 2 && !wasPinching) {
    for (const fn of pinchStartListeners) fn()
  }
}

/** 是否处于双指手势中：此时画布不响应绘制与拖拽。 */
export function isPinching(): boolean {
  return activeTouches >= 2
}

/** 订阅「双指手势开始」，返回取消订阅函数。 */
export function onPinchStart(fn: () => void): () => void {
  pinchStartListeners.add(fn)
  return () => {
    pinchStartListeners.delete(fn)
  }
}
