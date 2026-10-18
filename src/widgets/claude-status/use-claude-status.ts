/**
 * useClaudeStatus —— 驱动 Claude 会话状态 store 的连接 hook。
 *
 * 生命周期：
 *  1. mount：connection='connecting'，向 bridgeUrl 建 EventSource
 *  2. 收到首条 message => 解析 payload => setPayload（connection='live'）
 *  3. onerror / 3s 内无首条 => connection='error'，清空会话，关闭 EventSource
 *  4. 已 live 后连接中断 => 立即置为断开并清空；EventSource 自动重连成功后恢复
 *  5. unmount：关闭 EventSource
 *
 * 注意：断连时不注入任何演示数据——没数据就是没数据，小组件只显示 DISCONNECT。
 * 全应用只需一处调用（App 根组件挂一次，store 是单例）。
 * @param urlOverride 可选，覆盖 store 默认 bridgeUrl（通常来自场景里小组件图层的 config.bridgeUrl）。
 */

import { useEffect } from 'react'
import { useClaudeStatusStore } from './status-store'
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

    /** 断开：清空会话并标记 error（不启动任何演示数据）。 */
    const disconnect = () => {
      useClaudeStatusStore.getState().setConnection('error')
      useClaudeStatusStore.getState().clearSessions()
    }

    const fallbackToDisconnect = () => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      try {
        es?.close()
      } catch {
        /* 忽略 */
      }
      disconnect()
    }

    const goLive = (payload: ClaudeStatusPayload) => {
      settled = true
      if (timeout) clearTimeout(timeout)
      useClaudeStatusStore.getState().setPayload(payload)
    }

    // EventSource 在浏览器不支持时（如测试环境）直接断开
    if (typeof EventSource === 'undefined') {
      fallbackToDisconnect()
      return
    }

    try {
      es = new EventSource(bridgeUrl)
    } catch {
      fallbackToDisconnect()
      return
    }

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as ClaudeStatusPayload
        if (Array.isArray(data.sessions)) goLive(data)
      } catch {
        // 非 JSON 消息（如心跳注释）忽略
      }
    }
    es.onerror = () => {
      // 首次连接失败 => 直接断开并关闭；已 live 过 => 暂时置为断开，
      // 保留 EventSource 让其自动重连，收到新 payload 后恢复 live。
      if (settled) disconnect()
      else fallbackToDisconnect()
    }

    // 超时未连上则断开，避免副屏一直空等
    timeout = setTimeout(() => {
      if (!settled) fallbackToDisconnect()
    }, CONNECT_TIMEOUT)

    return () => {
      settled = true
      if (timeout) clearTimeout(timeout)
      try {
        es?.close()
      } catch {
        /* 忽略 */
      }
    }
  }, [bridgeUrl])
}
