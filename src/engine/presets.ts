/**
 * 内置预设场景 —— 新用户第一次打开页面时看到的默认屏幕。
 *
 * 预设以 YAML（场景交换格式）随包内置，经 `sceneFromYaml` 解析后与读档完全同路，
 * 因此不需要为预设维护第二套场景结构。用户在 localStorage 中一旦有持久化场景，
 * 就以持久化场景为准（见 scene-store 的初始化顺序）。
 *
 * 解析失败时退回 `createDefaultScene()`，保证页面始终有可渲染的场景。
 */

import presetYaml from '@/assets/presets/default-screen.yml?raw'
import type { Scene } from './types'
import { createDefaultScene } from './factories'
import { sceneFromYaml } from './export/to-yaml'

/** 加载内置预设场景（每次返回新的场景对象，调用方可安全修改）。 */
export function loadPresetScene(): Scene {
  try {
    return sceneFromYaml(presetYaml)
  } catch (e) {
    console.warn('[preset] 预设场景解析失败，已退回默认场景', e)
    return createDefaultScene()
  }
}
