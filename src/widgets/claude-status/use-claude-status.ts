/**
 * useClaudeStatus —— 驱动 Claude 会话状态 store 的连接 hook。
 *
 * 生命周期：
 *  1. mount：connection='connecting'，向 bridgeUrl 建 EventSource
 *  2. 收到首条 message => 解析 payload => setPayload（connection='live'）
 *  3. onerror / 3s 内无首条 => connection='mock'，启动 mock 心跳，关闭 EventSource
 *  4. unmount：关闭 EventSource、停心跳
 *
 * 全应用只需一处调用（App 根组件挂一次，store 是单例）。
 * @param urlOverride 可选，覆盖 store 默认 bridgeUrl（通常来自场景里小组件图层的 config.bridgeUrl）。
 */

import { useEffect } from 'react'
import { useClaudeStatusStore, startMockHeartbeat, stopMockHeartbeat } from './status-store'
import type { ClaudeStatusPayload } from './types'

const CONNECT_TIMEOUT = 3000

export function useClaudeStatus(urlOverride?: string): void {
  const storeUrl = useClaudeStatusStore((s) => s.bridgeUrl)
  const bridgeUrl = urlOverride || storeUrl

  useEffect(() => {
    const store = useClaudeStatusStore.getState()
    store.setConnection('connecting')

    let es: EventSource | null = null
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | null = null

    const fallbackToMock = () => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      try {
        es?.close()
      } catch {
        /* 忽略 */
      }
      useClaudeStatusStore.getState().setConnection('mock')
      startMockHeartbeat()
    }

    const goLive = (payload: ClaudeStatusPayload) => {
      settled = true
      if (timeout) clearTimeout(timeout)
      stopMockHeartbeat()
      useClaudeStatusStore.getState().setPayload(payload)
    }

    // EventSource 在浏览器不支持时（如测试环境）直接降级
    if (typeof EventSource === 'undefined') {
      fallbackToMock()
      return () => stopMockHeartbeat()
    }

    try {
      es = new EventSource(bridgeUrl)
    } catch {
      fallbackToMock()
      return () => stopMockHeartbeat()
    }

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as ClaudeStatusPayload
        if (Array.isArray(data.sessions)) goLive(data)
      } catch {
        // 非 JSON 消息（如心跳注释）忽略
      }
    }
    es.onerror = () => fallbackToMock()

    // 超时未连上则降级，避免副屏一直空等
    timeout = setTimeout(() => {
      if (!settled) fallbackToMock()
    }, CONNECT_TIMEOUT)

    return () => {
      settled = true
      if (timeout) clearTimeout(timeout)
      try {
        es?.close()
      } catch {
        /* 忽略 */
      }
      stopMockHeartbeat()
    }
  }, [bridgeUrl])
}
