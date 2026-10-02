// @vitest-environment node
/**
 * bridge/server.mjs 纯函数单测（node 环境，不启动服务器）。
 *
 * 覆盖：cwd 转义、status 归一、CORS 白名单、jsonl 尾部反向扫描、PID 判活。
 * （会话聚合 collectSessions 依赖真实 ~/.claude 与存活进程，放到 E2E 覆盖。）
 */

import { describe, it, expect } from 'vitest'
import {
  escapeCwd,
  normalizeStatus,
  originAllowed,
  parseTailFromText,
  pidAlive,
} from './server.mjs'

describe('bridge — escapeCwd', () => {
  it('斜杠转连字符且开头带连字符', () => {
    expect(escapeCwd('/Users/xrl/Repos/digiboard')).toBe('-Users-xrl-Repos-digiboard')
  })

  it('点号等非字母数字一律转连字符（有损转义）', () => {
    expect(escapeCwd('/a/b.c-d')).toBe('-a-b-c-d')
  })

  it('与真实 Claude 目录命名一致（github.io 案例）', () => {
    expect(escapeCwd('/Users/xrl/Documents/Repos/wpy030414.github.io')).toBe(
      '-Users-xrl-Documents-Repos-wpy030414-github-io',
    )
  })
})

describe('bridge — normalizeStatus', () => {
  it('保留合法状态 busy/idle/waiting', () => {
    expect(normalizeStatus('busy')).toBe('busy')
    expect(normalizeStatus('idle')).toBe('idle')
    expect(normalizeStatus('waiting')).toBe('waiting')
  })

  it('未知状态归为 unknown', () => {
    expect(normalizeStatus('exited')).toBe('unknown')
    expect(normalizeStatus('')).toBe('unknown')
    expect(normalizeStatus(undefined)).toBe('unknown')
  })
})

describe('bridge — originAllowed (CORS)', () => {
  it('放行本机 localhost/127.0.0.1 任意端口', () => {
    expect(originAllowed('http://localhost:5173')).toBe(true)
    expect(originAllowed('http://127.0.0.1:4173')).toBe(true)
    expect(originAllowed('https://localhost:8443')).toBe(true)
  })

  it('拒绝外部 Origin', () => {
    expect(originAllowed('https://evil.com')).toBe(false)
    expect(originAllowed('http://localhost.evil.com')).toBe(false)
  })

  it('无 Origin（非浏览器请求）放行', () => {
    expect(originAllowed(undefined)).toBe(true)
    expect(originAllowed('')).toBe(true)
  })

  it('非法 URL 拒绝', () => {
    expect(originAllowed('not a url')).toBe(false)
  })
})

describe('bridge — parseTailFromText (jsonl 反向扫描)', () => {
  const line = (o) => JSON.stringify(o)

  it('提取 model / usage / 最近 tool / 最近 prompt', () => {
    const text = [
      line({ type: 'last-prompt', lastPrompt: '用户最后输入' }),
      line({
        type: 'assistant',
        timestamp: '2026-10-02T10:00:00.000Z',
        message: {
          model: 'claude-opus-4-8',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 999,
            cache_creation_input_tokens: 7,
          },
          content: [
            { type: 'text', text: '助手回复' },
            { type: 'tool_use', name: 'Edit' },
          ],
        },
      }),
    ].join('\n')
    const out = parseTailFromText(text)
    expect(out.model).toBe('claude-opus-4-8')
    expect(out.usage).toEqual({ input: 100, output: 50, cacheRead: 999, cacheCreation: 7 })
    expect(out.lastTool).toBe('Edit')
    expect(out.lastPrompt).toBe('用户最后输入')
    expect(out.lastAssistantText).toBe('助手回复')
  })

  it('反向扫描：取最靠近末尾的 assistant（跳过尾部控制行）', () => {
    const text = [
      line({ type: 'assistant', message: { model: 'OLD', usage: {} } }),
      line({ type: 'assistant', message: { model: 'NEW', usage: {} } }),
      line({ type: 'mode', mode: 'normal' }),
      line({ type: 'permission-mode', permissionMode: 'default' }),
    ].join('\n')
    expect(parseTailFromText(text).model).toBe('NEW')
  })

  it('跳过解析失败的半行（截断/损坏）', () => {
    const text = [
      '{"type":"assistant","message":{"model":"ok"', // 半行，损坏
      line({ type: 'assistant', message: { model: 'good', usage: {} } }),
    ].join('\n')
    // headTruncated=false 时首行也参与，但损坏行被跳过，取到 good
    expect(parseTailFromText(text).model).toBe('good')
  })

  it('headTruncated 时丢弃被截断的首行', () => {
    const text = [
      'st garbage tail of a cut line', // 被截断的首行
      line({ type: 'assistant', message: { model: 'valid', usage: {} } }),
    ].join('\n')
    expect(parseTailFromText(text, true).model).toBe('valid')
  })

  it('空文本安全返回空对象', () => {
    expect(parseTailFromText('')).toEqual({})
  })

  it('无 assistant 时 model 为 undefined', () => {
    const text = line({ type: 'user', message: { content: 'hi' } })
    expect(parseTailFromText(text).model).toBeUndefined()
  })

  it('usage 缺失字段回退为 0', () => {
    const text = line({ type: 'assistant', message: { model: 'm', usage: {} } })
    expect(parseTailFromText(text).usage).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheCreation: 0,
    })
  })
})

describe('bridge — pidAlive', () => {
  it('当前进程存活', () => {
    expect(pidAlive(process.pid)).toBe(true)
  })

  it('非法/不存在的 PID 判死', () => {
    expect(pidAlive(0)).toBe(false)
    expect(pidAlive(-1)).toBe(false)
    expect(pidAlive(999999999)).toBe(false) // 极不可能存在的 PID
    expect(pidAlive('abc')).toBe(false)
  })
})
