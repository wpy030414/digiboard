/**
 * 主体抠图 Worker：只做 ONNX 推理，避免 1s 级推理阻塞编辑器。
 *
 * 协议：
 *   收 { type:'segment', input: Float32Array, modelUrl: string }
 *   发 { type:'progress', phase, progress } | { type:'result', width, height, data } | { type:'error', message }
 */

import * as ort from 'onnxruntime-web/wasm'
import ortMjsUrl from '../ort/ort-wasm-simd-threaded.mjs?url'
import ortWasmUrl from '../ort/ort-wasm-simd-threaded.wasm?url'

// 自托管 wasm：vite.config.ts 的 copyOrtRuntime 插件把运行时复制到 src/ort/，`?url` 由 Vite
// 在 dev 直接服务、在 build 输出到 assets/，不依赖 CDN。
ort.env.wasm.wasmPaths = { mjs: ortMjsUrl, wasm: ortWasmUrl }
ort.env.wasm.numThreads = 1
ort.env.logLevel = 'error'

const SIZE = 320

interface MattingScope {
  onmessage: ((event: MessageEvent) => void) | null
  postMessage: (message: unknown, transfer?: Transferable[]) => void
}

const scope = self as unknown as MattingScope

const post = (message: unknown, transfer: Transferable[] = []): void => {
  scope.postMessage(message, transfer)
}

let sessionPromise: Promise<ort.InferenceSession> | null = null

function getSession(modelUrl: string): Promise<ort.InferenceSession> {
  sessionPromise ??= createSession(modelUrl)
  return sessionPromise
}

async function createSession(modelUrl: string): Promise<ort.InferenceSession> {
  post({ type: 'progress', phase: 'download', progress: 0 })
  const buffer = await fetchModel(modelUrl)
  post({ type: 'progress', phase: 'init', progress: 1 })
  return ort.InferenceSession.create(buffer, { executionProviders: ['wasm'] })
}

/** 带进度的模型下载；HTTP 缓存命中时 content-length 仍可用。 */
async function fetchModel(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`模型下载失败（HTTP ${response.status}）`)
  const total = Number(response.headers.get('content-length') ?? 0)
  const body = response.body
  if (!body) return response.arrayBuffer()

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      received += value.byteLength
      if (total > 0) post({ type: 'progress', phase: 'download', progress: received / total })
    }
  }
  const merged = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged.buffer
}

scope.onmessage = (event: MessageEvent) => {
  const message = event.data as
    | { type: 'segment'; input: Float32Array; modelUrl: string }
    | undefined
  if (message?.type !== 'segment') return
  void run(message.input, message.modelUrl)
}

async function run(input: Float32Array, modelUrl: string): Promise<void> {
  try {
    const session = await getSession(modelUrl)
    post({ type: 'progress', phase: 'infer', progress: 0 })
    const inputName = session.inputNames[0]
    const outputName = session.outputNames[0]
    if (!inputName || !outputName) throw new Error('模型输入/输出名称缺失')

    const tensor = new ort.Tensor('float32', input, [1, 3, SIZE, SIZE])
    const output = await session.run({ [inputName]: tensor })
    const raw = output[outputName]?.data
    if (!(raw instanceof Float32Array)) throw new Error('模型输出格式异常')

    let min = Infinity
    let max = -Infinity
    for (const v of raw) {
      if (v < min) min = v
      if (v > max) max = v
    }
    const range = max - min || 1
    const mask = new Uint8Array(SIZE * SIZE)
    for (let i = 0; i < mask.length; i++) {
      const v = ((raw[i] ?? 0) - min) / range
      mask[i] = Math.max(0, Math.min(255, Math.round(v * 255)))
    }
    post({ type: 'result', width: SIZE, height: SIZE, data: mask }, [mask.buffer])
  } catch (error) {
    post({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
