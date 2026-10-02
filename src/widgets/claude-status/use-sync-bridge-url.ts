/**
 * useSyncBridgeUrl —— 把场景里 Claude 小组件图层的 config.bridgeUrl 同步到状态 store。
 *
 * 场景（含播放页从 YAML/URL 还原的）里的 bridgeUrl 是持久化的连接地址；
 * App 根组件的 useClaudeStatus 读 store.bridgeUrl 建连，故此处只需把
 * 场景值写进 store，连接会自动跟随。EditorPage 与 PlayerPage 各自调用。
 */

import { useEffect } from 'react'
import type { Scene, WidgetLayer } from '@/engine/types'
import { useClaudeStatusStore } from './status-store'

export function useSyncBridgeUrl(scene: Scene): void {
  const setBridgeUrl = useClaudeStatusStore((s) => s.setBridgeUrl)

  // 取第一个 claude-status 小组件图层的 bridgeUrl（通常只有一个）
  const widget = scene.layers.find(
    (l): l is WidgetLayer => l.type === 'widget' && l.widgetKind === 'claude-status',
  )
  const bridgeUrl = widget?.config.bridgeUrl as string | undefined

  useEffect(() => {
    if (bridgeUrl) setBridgeUrl(bridgeUrl)
  }, [bridgeUrl, setBridgeUrl])
}
