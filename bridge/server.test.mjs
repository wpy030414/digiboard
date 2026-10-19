// @vitest-environment node
/**
 * bridge/server.mjs 纯函数单测（node 环境，不启动服务器）。
 *
 * 覆盖：cwd 转义、status 归一、CORS（默认全放行 / 白名单收紧 / 响应头）、
 * jsonl 尾部反向扫描、PID 判活。
 * （会话聚合 collectSessions 依赖真实 ~/.claude 与存活进程，放到 E2E 覆盖。）
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  escapeCwd,
  normalizeStatus,
  originAllowed,
  allowedOrigins,
  corsHeaders,
  trimOrigin,
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
  afterEach(() => {
    delete process.env.DIGIBOARD_ORIGIN
  })

  it('默认放行任意 Origin（公网部署的副屏也能连）', () => {
    expect(originAllowed('https://demo.xrl.im')).toBe(true)
    expect(originAllowed('http://localhost:5173')).toBe(true)
    expect(originAllowed('https://wpy030414.github.io')).toBe(true)
    expect(originAllowed('http://evil.com')).toBe(true)
  })

  it('无 Origin（非浏览器请求）放行', () => {
    expect(originAllowed(undefined)).toBe(true)
    expect(originAllowed('')).toBe(true)
  })

  it('设置 DIGIBOARD_ORIGIN 后收紧到白名单', () => {
    process.env.DIGIBOARD_ORIGIN = 'https://demo.xrl.im'
    expect(originAllowed('https://demo.xrl.im')).toBe(true)
    expect(originAllowed('https://evil.com')).toBe(false)
    expect(originAllowed('http://localhost:5273')).toBe(false)
  })

  it('白名单末尾斜杠不敏感', () => {
    process.env.DIGIBOARD_ORIGIN = 'https://demo.xrl.im/'
    expect(originAllowed('https://demo.xrl.im')).toBe(true)
  })

  it('白名单支持多值（逗号或空格分隔）', () => {
    process.env.DIGIBOARD_ORIGIN = 'https://a.example,https://b.example'
    expect(originAllowed('https://a.example')).toBe(true)
    expect(originAllowed('https://b.example')).toBe(true)
    expect(originAllowed('https://c.example')).toBe(false)

    process.env.DIGIBOARD_ORIGIN = 'https://a.example https://b.example'
    expect(allowedOrigins()).toEqual(['https://a.example', 'https://b.example'])
  })

  it('空白名单等价于不设限', () => {
    process.env.DIGIBOARD_ORIGIN = '   '
    expect(allowedOrigins()).toEqual([])
    expect(originAllowed('https://whatever.example')).toBe(true)
  })

  it('非法 URL 在无白名单时仍放行（不再做 URL 解析）', () => {
    expect(originAllowed('not a url')).toBe(true)
  })
})

describe('bridge — corsHeaders', () => {
  afterEach(() => {
    delete process.env.DIGIBOARD_ORIGIN
  })

  it('默认返回通配符 ACAO，且始终带方法与头白名单', () => {
    expect(corsHeaders('https://demo.xrl.im')).toEqual({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Cache-Control',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    })
    expect(corsHeaders(undefined)['Access-Control-Allow-Origin']).toBe('*')
  })

  it('有白名单时回显确切 Origin 并带 Vary', () => {
    process.env.DIGIBOARD_ORIGIN = 'https://demo.xrl.im'
    expect(corsHeaders('https://demo.xrl.im')).toMatchObject({
      'Access-Control-Allow-Origin': 'https://demo.xrl.im',
      Vary: 'Origin',
    })
  })

  it('白名单未命中时不下发 ACAO（浏览器会拦截）', () => {
    process.env.DIGIBOARD_ORIGIN = 'https://demo.xrl.im'
    expect(corsHeaders('https://evil.com')['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('仅在预检声明私有网络访问时下发 PNA 头', () => {
    expect(
      corsHeaders('https://demo.xrl.im', { privateNetwork: true })[
        'Access-Control-Allow-Private-Network'
      ],
    ).toBe('true')
    expect(
      corsHeaders('https://demo.xrl.im')['Access-Control-Allow-Private-Network'],
    ).toBeUndefined()
  })
})

describe('bridge — trimOrigin', () => {
  it('去掉末尾斜杠，保留其余部分', () => {
    expect(trimOrigin('https://demo.xrl.im/')).toBe('https://demo.xrl.im')
    expect(trimOrigin('https://demo.xrl.im///')).toBe('https://demo.xrl.im')
    expect(trimOrigin('https://demo.xrl.im')).toBe('https://demo.xrl.im')
    expect(trimOrigin(undefined)).toBe('')
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
