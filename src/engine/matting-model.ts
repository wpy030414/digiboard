/**
 * 主体抠图：主线程负责解码与归一化，Worker 负责 ONNX 推理。
 *
 * 模型（u2netp，4.4MB）随站点托管在 `public/models/`，推理完全在本机；
 * 图片不会离开设备。Worker 只在用户勾选「主体抠图」时按需创建。
 */

import type { Matte } from './matting'

export type MattingPhase = 'download' | 'init' | 'infer'

export interface MattingProgress {
  phase: MattingPhase
  /** 0–1；init/infer 阶段无细粒度进度时给 0。 */
  progress: number
}

/** U²-Net-p 的固定输入边长。 */
const INPUT = 320

/** rembg 的 U²-Net 预处理：先除以最大值，再按 ImageNet 均值/方差归一化。 */
const MEAN = [0.485, 0.456, 0.406] as const
const STD = [0.229, 0.224, 0.225] as const

/**
 * 识别主体并返回蒙版。
 *
 * @param file 原始图片
 * @param onProgress 下载 / 初始化 / 推理进度回调
 */
export async function segmentSubject(
  file: File,
  onProgress?: (progress: MattingProgress) => void,
): Promise<Matte> {
  const input = await prepareInput(file)
  const worker = new Worker(new URL('../workers/matting.worker.ts', import.meta.url), {
    type: 'module',
  })
  try {
    return await new Promise<Matte>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent) => {
        const message = event.data as
          | ({ type: 'progress' } & MattingProgress)
          | { type: 'result'; width: number; height: number; data: Uint8Array }
          | { type: 'error'; message: string }
        if (message.type === 'progress') {
          onProgress?.({ phase: message.phase, progress: message.progress })
        } else if (message.type === 'result') {
          resolve({ width: message.width, height: message.height, data: message.data })
        } else {
          reject(new Error(message.message))
        }
      }
      worker.onerror = (event) => reject(new Error(event.message || '主体抠图 Worker 初始化失败'))
      worker.postMessage({ type: 'segment', input, modelUrl: modelUrl() }, [input.buffer])
    })
  } finally {
    worker.terminate()
  }
}

/** 解码图片 → 320×320 RGB → NCHW Float32 张量。 */
async function prepareInput(file: File): Promise<Float32Array> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = INPUT
    canvas.height = INPUT
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前浏览器不支持 canvas 2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, INPUT, INPUT)
    const data = ctx.getImageData(0, 0, INPUT, INPUT).data

    // 与 rembg 一致：先按全图最大值归一化到 0–1
    let max = 1e-6
    for (let i = 0; i < INPUT * INPUT; i++) {
      const o = i * 4
      const r = data[o] ?? 0
      const g = data[o + 1] ?? 0
      const b = data[o + 2] ?? 0
      if (r > max) max = r
      if (g > max) max = g
      if (b > max) max = b
    }

    const n = INPUT * INPUT
    const input = new Float32Array(3 * n)
    for (let i = 0; i < n; i++) {
      const o = i * 4
      for (let c = 0; c < 3; c++) {
        input[c * n + i] = ((data[o + c] ?? 0) / max - MEAN[c]!) / STD[c]!
      }
    }
    return input
  } finally {
    bitmap.close?.()
  }
}

/** 模型地址跟随 Vite base（GitHub Pages 子路径下同样正确）。 */
function modelUrl(): string {
  const base = import.meta.env.BASE_URL
  return `${base.endsWith('/') ? base : `${base}/`}models/u2netp.onnx`
}
