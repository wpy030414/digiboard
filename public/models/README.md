# 本地模型

## u2netp.onnx（4.4MB）

- 用途：图片生成时的「主体抠图」，在 Web Worker 里经 onnxruntime-web（WASM）本地推理，图片不出设备。
- 来源：<https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx>
- 论文 / 上游：U²-Net (Qin et al., Pattern Recognition 2020)，Apache-2.0。
- 输入：1×3×320×320，RGB 先除以最大值再按 ImageNet mean/std 归一化。
- 输出：1×1×320×320 显著图，min-max 归一化后作为 alpha。
