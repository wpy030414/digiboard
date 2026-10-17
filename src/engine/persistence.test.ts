import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createScenePersister,
  loadPersistedScene,
  savePersistedScene,
  SCENE_STORAGE_KEY,
} from './persistence'
import { createDefaultScene } from './factories'
import type { PixelLayer, Scene } from './types'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('savePersistedScene / loadPersistedScene — 往返', () => {
  it('场景经 YAML 存回 localStorage 后可无损恢复', () => {
    const scene = createDefaultScene({ w: 12, h: 8 })
    const px = scene.layers[0] as PixelLayer
    px.pixels[3 * 12 + 4] = 1
    savePersistedScene(scene)

    const back = loadPersistedScene()
    expect(back).not.toBeNull()
    expect(back!.size).toEqual({ w: 12, h: 8 })
    expect(back!.layers).toHaveLength(scene.layers.length)
    const px2 = back!.layers[0] as PixelLayer
    expect(px2.pixels[3 * 12 + 4]).toBe(1)
    expect(px2.offColor).toBe(px.offColor)
  })

  it('没有存档时返回 null', () => {
    expect(loadPersistedScene()).toBeNull()
  })

  it('存档损坏时返回 null 而不抛错', () => {
    localStorage.setItem(SCENE_STORAGE_KEY, 'not: [valid')
    expect(loadPersistedScene()).toBeNull()
  })

  it('空字符串存档返回 null', () => {
    localStorage.setItem(SCENE_STORAGE_KEY, '')
    expect(loadPersistedScene()).toBeNull()
  })
})

describe('createScenePersister — 防抖', () => {
  it('连续编辑只落盘一次，且写的是最新场景', () => {
    vi.useFakeTimers()
    const write = vi.fn()
    const persister = createScenePersister(400, write)

    const a = createDefaultScene({ w: 10, h: 10 })
    const b: Scene = { ...a, size: { w: 20, h: 20 } }
    persister.schedule(a)
    vi.advanceTimersByTime(200)
    persister.schedule(b)
    expect(write).not.toHaveBeenCalled()

    vi.advanceTimersByTime(400)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith(b)
  })

  it('flush 立即写入未落盘的场景', () => {
    vi.useFakeTimers()
    const write = vi.fn()
    const persister = createScenePersister(400, write)
    const scene = createDefaultScene({ w: 6, h: 6 })
    persister.schedule(scene)
    persister.flush()
    expect(write).toHaveBeenCalledWith(scene)
    // 计时器已清空，不会再写第二次
    persister.flush()
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('cancel 丢弃待写入场景', () => {
    vi.useFakeTimers()
    const write = vi.fn()
    const persister = createScenePersister(400, write)
    persister.schedule(createDefaultScene({ w: 4, h: 4 }))
    persister.cancel()
    vi.advanceTimersByTime(1000)
    expect(write).not.toHaveBeenCalled()
  })

  it('默认写入走 localStorage', () => {
    vi.useFakeTimers()
    const persister = createScenePersister(400)
    persister.schedule(createDefaultScene({ w: 5, h: 5 }))
    persister.flush()
    expect(localStorage.getItem(SCENE_STORAGE_KEY)).toContain('size')
  })
})

describe('拼豆模式偏好', () => {
  it('保存后可读回', async () => {
    const { loadBeadsMode, saveBeadsMode, BEADS_STORAGE_KEY } = await import('./persistence')
    expect(loadBeadsMode()).toBe(false)
    saveBeadsMode(true)
    expect(loadBeadsMode()).toBe(true)
    expect(localStorage.getItem(BEADS_STORAGE_KEY)).toBe('1')
    saveBeadsMode(false)
    expect(loadBeadsMode()).toBe(false)
  })
})

describe('右侧栏显隐偏好', () => {
  it('默认展开，保存后可读回', async () => {
    const { loadSidebarVisible, saveSidebarVisible, SIDEBAR_STORAGE_KEY } =
      await import('./persistence')
    expect(loadSidebarVisible()).toBe(true)
    saveSidebarVisible(false)
    expect(loadSidebarVisible()).toBe(false)
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('0')
    saveSidebarVisible(true)
    expect(loadSidebarVisible()).toBe(true)
  })

  it('存储不可用时不抛错且按默认展开处理', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { loadSidebarVisible } = await import('./persistence')
    expect(loadSidebarVisible()).toBe(true)
    spy.mockRestore()
  })
})
