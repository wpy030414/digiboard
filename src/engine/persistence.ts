/**
 * 场景自动持久化 —— 每次编辑后防抖写入 localStorage。
 *
 * 编辑器的所有改动都汇入 zustand store，EditorPage 订阅 scene 引用变化，
 * 经 `createScenePersister` 防抖（默认 400ms）后把场景序列化为 YAML 存入
 * localStorage。刷新页面时 store 初始化会优先读回它，避免误关丢失工作。
 *
 * 边界：
 *  - 存储不可用（隐私模式 / 配额满 / SSR）时静默降级，不影响编辑；
 *  - 只持久化场景本身，不持久化撤销栈、选中态与工具态。
 */

import type { Scene } from './types'
import { sceneFromYaml, sceneToYaml } from './export/to-yaml'

/** localStorage 键名。带版本号，未来格式变更可平滑弃用。 */
export const SCENE_STORAGE_KEY = 'digiboard.scene.v1'

/** 拼豆模式开关的本地偏好键（UI 偏好，不属于场景数据）。 */
export const BEADS_STORAGE_KEY = 'digiboard.ui.beads.v1'

/** 右侧栏（属性 / 小组件）显隐的本地偏好键。 */
export const SIDEBAR_STORAGE_KEY = 'digiboard.ui.sidebar.v1'

/** 默认防抖时长（毫秒）：足够吞掉画笔拖拽的高频中间态。 */
export const PERSIST_DEBOUNCE_MS = 400

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** 读取上次持久化的场景；没有、损坏或存储不可用时返回 null。 */
export function loadPersistedScene(key = SCENE_STORAGE_KEY): Scene | null {
  const s = storage()
  if (!s) return null
  try {
    const text = s.getItem(key)
    if (!text) return null
    return sceneFromYaml(text)
  } catch {
    return null
  }
}

/** 立即把场景写入 localStorage（失败静默忽略）。 */
export function savePersistedScene(scene: Scene, key = SCENE_STORAGE_KEY): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(key, sceneToYaml(scene))
  } catch {
    // 配额满或隐私模式：自动保存是尽力而为，不打断编辑
  }
}

/** 读取拼豆模式偏好（默认关闭）。 */
export function loadBeadsMode(key = BEADS_STORAGE_KEY): boolean {
  const s = storage()
  if (!s) return false
  try {
    return s.getItem(key) === '1'
  } catch {
    return false
  }
}

/** 保存拼豆模式偏好。 */
export function saveBeadsMode(on: boolean, key = BEADS_STORAGE_KEY): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(key, on ? '1' : '0')
  } catch {
    // 忽略配额/隐私模式错误
  }
}

/** 读取右侧栏是否展开（默认展开）。 */
export function loadSidebarVisible(key = SIDEBAR_STORAGE_KEY): boolean {
  const s = storage()
  if (!s) return true
  try {
    return s.getItem(key) !== '0'
  } catch {
    return true
  }
}

/** 保存右侧栏显隐偏好。 */
export function saveSidebarVisible(on: boolean, key = SIDEBAR_STORAGE_KEY): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(key, on ? '1' : '0')
  } catch {
    // 忽略配额/隐私模式错误
  }
}

export interface ScenePersister {
  /** 记录最新场景并（重新）开始防抖计时。 */
  schedule(scene: Scene): void
  /** 立即落盘未保存的改动。 */
  flush(): void
  /** 丢弃未保存的改动并停止计时。 */
  cancel(): void
}

/**
 * 创建一个防抖持久化器。
 *
 * 同一时刻只保留最新一次待写入场景；连续编辑只会产生一次写入。
 */
export function createScenePersister(
  delay = PERSIST_DEBOUNCE_MS,
  write: (scene: Scene) => void = savePersistedScene,
): ScenePersister {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: Scene | null = null

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (pending) {
      const scene = pending
      pending = null
      write(scene)
    }
  }

  return {
    schedule(scene) {
      pending = scene
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(flush, delay)
    },
    flush,
    cancel() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      pending = null
    },
  }
}
