import { describe, it, expect } from 'vitest'
import {
  IDENTITY,
  multiply,
  translate,
  rotate,
  skew,
  scale,
  apply,
  invert,
  layerToScene,
  sceneToLayer,
  layerBounds,
  pointInBounds,
  matrixToSvg,
  matrixToCss,
  type Vec2,
} from './transform'

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

describe('transform — 基础矩阵', () => {
  it('identity 不改变点', () => {
    const p = apply(IDENTITY, { x: 3, y: 4 })
    expect(p).toEqual({ x: 3, y: 4 })
  })

  it('translate 平移点', () => {
    const p = apply(translate(2, 5), { x: 1, y: 1 })
    expect(p).toEqual({ x: 3, y: 6 })
  })

  it('scale 缩放点', () => {
    const p = apply(scale(2, 3), { x: 1, y: 1 })
    expect(p).toEqual({ x: 2, y: 3 })
  })

  it('rotate 90° 将 (1,0) 变为 (0,1)', () => {
    const p = apply(rotate(90), { x: 1, y: 0 })
    expect(near(p.x, 0)).toBe(true)
    expect(near(p.y, 1)).toBe(true)
  })

  it('rotate 360° 回到原点', () => {
    const p = apply(rotate(360), { x: 2, y: 3 })
    expect(near(p.x, 2)).toBe(true)
    expect(near(p.y, 3)).toBe(true)
  })

  it('skew X 使 y 分量贡献到 x', () => {
    const p = apply(skew(45, 0), { x: 0, y: 1 })
    expect(near(p.x, 1)).toBe(true) // tan(45)=1
    expect(near(p.y, 1)).toBe(true)
  })
})

describe('transform — 乘法与逆', () => {
  it('乘 identity 不变', () => {
    const m = translate(3, 4)
    const r = multiply(m, IDENTITY)
    expect(r.map((v) => Math.round(v * 1e6) / 1e6)).toEqual(m.map((v) => Math.round(v * 1e6) / 1e6))
  })

  it('矩阵乘其逆 = identity', () => {
    const m = multiply(translate(5, -2), rotate(37))
    const inv = invert(m)!
    const id = multiply(m, inv)
    expect(near(id[0]!, 1)).toBe(true)
    expect(near(id[1]!, 0)).toBe(true)
    expect(near(id[4]!, 0)).toBe(true)
    expect(near(id[5]!, 0)).toBe(true)
  })

  it('退化矩阵（全零）不可逆返回 null', () => {
    expect(invert([0, 0, 0, 0, 0, 0])).toBeNull()
  })

  it('逆矩阵往返变换点', () => {
    const m = multiply(translate(4, 4), rotate(30))
    const inv = invert(m)!
    const p: Vec2 = { x: 7, y: 9 }
    const back = apply(inv, apply(m, p))
    expect(near(back.x, p.x, 1e-9)).toBe(true)
    expect(near(back.y, p.y, 1e-9)).toBe(true)
  })
})

describe('transform — 图层变换', () => {
  const base = { x: 10, y: 20, width: 8, height: 6, rotation: 0, skewX: 0, skewY: 0 }

  it('无旋转时局部原点对应锚点', () => {
    const m = layerToScene(base)
    const p = apply(m, { x: 0, y: 0 })
    expect(near(p.x, 10)).toBe(true)
    expect(near(p.y, 20)).toBe(true)
  })

  it('无旋转时局部右下角对应锚点+宽高', () => {
    const m = layerToScene(base)
    const p = apply(m, { x: 8, y: 6 })
    expect(near(p.x, 18)).toBe(true)
    expect(near(p.y, 26)).toBe(true)
  })

  it('sceneToLayer 是 layerToScene 的逆', () => {
    const t = { ...base, rotation: 25, skewX: 8 }
    const fwd = layerToScene(t)
    const bwd = sceneToLayer(t)!
    const p = apply(bwd, apply(fwd, { x: 3, y: 2 }))
    expect(near(p.x, 3, 1e-9)).toBe(true)
    expect(near(p.y, 2, 1e-9)).toBe(true)
  })

  it('旋转 180° 时 AABB 与未旋转同尺寸（矩形对称）', () => {
    const b0 = layerBounds(base)
    const b1 = layerBounds({ ...base, rotation: 180 })
    expect(near(b0.width, b1.width, 1e-6)).toBe(true)
    expect(near(b0.height, b1.height, 1e-6)).toBe(true)
  })

  it('旋转 45° 时 AABB 变大（对角线扫掠）', () => {
    const b0 = layerBounds(base)
    const b45 = layerBounds({ ...base, rotation: 45 })
    expect(b45.width).toBeGreaterThan(b0.width)
  })
})

describe('transform — 命中测试', () => {
  it('点在框内', () => {
    expect(pointInBounds({ x: 5, y: 5 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(true)
  })
  it('点在框外', () => {
    expect(pointInBounds({ x: 15, y: 5 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(false)
  })
  it('容差扩展命中', () => {
    expect(pointInBounds({ x: 11, y: 5 }, { x: 0, y: 0, width: 10, height: 10 }, 2)).toBe(true)
  })
})

describe('transform — 序列化', () => {
  it('SVG matrix 字符串格式正确', () => {
    expect(matrixToSvg(translate(1, 2))).toBe('matrix(1 0 0 1 1 2)')
  })
  it('CSS matrix 字符串用逗号分隔', () => {
    expect(matrixToCss(translate(1, 2))).toBe('matrix(1, 0, 0, 1, 1, 2)')
  })
})
