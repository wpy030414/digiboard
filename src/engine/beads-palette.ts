/**
 * MARD 拼豆 221 色卡（国内主流参考色卡）。
 *
 * 数据来源：HansBug/pindou-color-data 的 `mard-221-alfonse-doudou` 版本
 * （Alfonse 公开色卡 + 豆豆工坊核对，2026-05-19 生成）。HEX 仅为屏幕参考值，
 * 与实体豆粒存在色差；需要精确配色时以实体色卡为准。
 *
 * 画布的调色板上限与色卡一致：像素值是 8 位，0 保留给灭点，1..221 对应调色板，
 * 因此一块板子最多 221 种亮色——恰好是一套 MARD 221 色拼豆。
 */

export interface BeadColor {
  /** 拼豆色号，如 A1 / H7 / M15。 */
  code: string
  /** 屏幕参考色，`#rrggbb` 小写。 */
  hex: string
  /** 色系分组（A–H、M）。 */
  group: string
}

/** MARD 221 色，顺序与官方色卡一致（按色系与色号排列）。 */
export const BEAD_COLORS: readonly BeadColor[] = [
  { code: 'A1', hex: '#faf5cd', group: 'A' },
  { code: 'A2', hex: '#fcfed6', group: 'A' },
  { code: 'A3', hex: '#fcff92', group: 'A' },
  { code: 'A4', hex: '#f7ec5c', group: 'A' },
  { code: 'A5', hex: '#f0d83a', group: 'A' },
  { code: 'A6', hex: '#fda951', group: 'A' },
  { code: 'A7', hex: '#fa8c4f', group: 'A' },
  { code: 'A8', hex: '#fbda4d', group: 'A' },
  { code: 'A9', hex: '#f79d5f', group: 'A' },
  { code: 'A10', hex: '#f47e38', group: 'A' },
  { code: 'A11', hex: '#fedb99', group: 'A' },
  { code: 'A12', hex: '#fda276', group: 'A' },
  { code: 'A13', hex: '#fec667', group: 'A' },
  { code: 'A14', hex: '#f75842', group: 'A' },
  { code: 'A15', hex: '#fbf65e', group: 'A' },
  { code: 'A16', hex: '#feff97', group: 'A' },
  { code: 'A17', hex: '#fde173', group: 'A' },
  { code: 'A18', hex: '#fcbf80', group: 'A' },
  { code: 'A19', hex: '#fd7e77', group: 'A' },
  { code: 'A20', hex: '#f9d666', group: 'A' },
  { code: 'A21', hex: '#fae393', group: 'A' },
  { code: 'A22', hex: '#edf878', group: 'A' },
  { code: 'A23', hex: '#e4c8ba', group: 'A' },
  { code: 'A24', hex: '#f3f6a9', group: 'A' },
  { code: 'A25', hex: '#fdf785', group: 'A' },
  { code: 'A26', hex: '#ffc734', group: 'A' },
  { code: 'B1', hex: '#dff13b', group: 'B' },
  { code: 'B2', hex: '#64f343', group: 'B' },
  { code: 'B3', hex: '#a1f586', group: 'B' },
  { code: 'B4', hex: '#5fdf34', group: 'B' },
  { code: 'B5', hex: '#39e158', group: 'B' },
  { code: 'B6', hex: '#64e0a4', group: 'B' },
  { code: 'B7', hex: '#3eae7c', group: 'B' },
  { code: 'B8', hex: '#1d9b54', group: 'B' },
  { code: 'B9', hex: '#2a5037', group: 'B' },
  { code: 'B10', hex: '#9ad1ba', group: 'B' },
  { code: 'B11', hex: '#627032', group: 'B' },
  { code: 'B12', hex: '#1a6e3d', group: 'B' },
  { code: 'B13', hex: '#c8e87d', group: 'B' },
  { code: 'B14', hex: '#abe84f', group: 'B' },
  { code: 'B15', hex: '#305335', group: 'B' },
  { code: 'B16', hex: '#c0ed9c', group: 'B' },
  { code: 'B17', hex: '#9eb33e', group: 'B' },
  { code: 'B18', hex: '#e6ed4f', group: 'B' },
  { code: 'B19', hex: '#26b78e', group: 'B' },
  { code: 'B20', hex: '#cbeccf', group: 'B' },
  { code: 'B21', hex: '#18616a', group: 'B' },
  { code: 'B22', hex: '#0a4241', group: 'B' },
  { code: 'B23', hex: '#343b1a', group: 'B' },
  { code: 'B24', hex: '#e8faa6', group: 'B' },
  { code: 'B25', hex: '#4e846d', group: 'B' },
  { code: 'B26', hex: '#907c35', group: 'B' },
  { code: 'B27', hex: '#d0e0af', group: 'B' },
  { code: 'B28', hex: '#9ee5bb', group: 'B' },
  { code: 'B29', hex: '#c6df5f', group: 'B' },
  { code: 'B30', hex: '#e3fbb1', group: 'B' },
  { code: 'B31', hex: '#b4e691', group: 'B' },
  { code: 'B32', hex: '#92ad60', group: 'B' },
  { code: 'C1', hex: '#f0fee4', group: 'C' },
  { code: 'C2', hex: '#abf8fe', group: 'C' },
  { code: 'C3', hex: '#a2e0f7', group: 'C' },
  { code: 'C4', hex: '#44cdfb', group: 'C' },
  { code: 'C5', hex: '#06aadf', group: 'C' },
  { code: 'C6', hex: '#54a7e9', group: 'C' },
  { code: 'C7', hex: '#3977ca', group: 'C' },
  { code: 'C8', hex: '#0f52bd', group: 'C' },
  { code: 'C9', hex: '#3349c3', group: 'C' },
  { code: 'C10', hex: '#3cbce3', group: 'C' },
  { code: 'C11', hex: '#2aded3', group: 'C' },
  { code: 'C12', hex: '#1e334e', group: 'C' },
  { code: 'C13', hex: '#cde7fe', group: 'C' },
  { code: 'C14', hex: '#d5fcf7', group: 'C' },
  { code: 'C15', hex: '#21c5c4', group: 'C' },
  { code: 'C16', hex: '#1858a2', group: 'C' },
  { code: 'C17', hex: '#02d1f3', group: 'C' },
  { code: 'C18', hex: '#213244', group: 'C' },
  { code: 'C19', hex: '#18869d', group: 'C' },
  { code: 'C20', hex: '#1a70a9', group: 'C' },
  { code: 'C21', hex: '#bcddfc', group: 'C' },
  { code: 'C22', hex: '#6bb1bb', group: 'C' },
  { code: 'C23', hex: '#c8e2fd', group: 'C' },
  { code: 'C24', hex: '#7ec5f9', group: 'C' },
  { code: 'C25', hex: '#a9e8e0', group: 'C' },
  { code: 'C26', hex: '#42adcf', group: 'C' },
  { code: 'C27', hex: '#d0def9', group: 'C' },
  { code: 'C28', hex: '#bdcee8', group: 'C' },
  { code: 'C29', hex: '#364a89', group: 'C' },
  { code: 'D1', hex: '#acb7ef', group: 'D' },
  { code: 'D2', hex: '#868dd3', group: 'D' },
  { code: 'D3', hex: '#3554af', group: 'D' },
  { code: 'D4', hex: '#162d7b', group: 'D' },
  { code: 'D5', hex: '#b34ec6', group: 'D' },
  { code: 'D6', hex: '#b37bdc', group: 'D' },
  { code: 'D7', hex: '#8758a9', group: 'D' },
  { code: 'D8', hex: '#e3d2fe', group: 'D' },
  { code: 'D9', hex: '#d5b9f4', group: 'D' },
  { code: 'D10', hex: '#301a49', group: 'D' },
  { code: 'D11', hex: '#beb9e2', group: 'D' },
  { code: 'D12', hex: '#dc99ce', group: 'D' },
  { code: 'D13', hex: '#b5038d', group: 'D' },
  { code: 'D14', hex: '#862993', group: 'D' },
  { code: 'D15', hex: '#2f1f8c', group: 'D' },
  { code: 'D16', hex: '#e2e4f0', group: 'D' },
  { code: 'D17', hex: '#c7d3f9', group: 'D' },
  { code: 'D18', hex: '#9a64b8', group: 'D' },
  { code: 'D19', hex: '#d8c2d9', group: 'D' },
  { code: 'D20', hex: '#9a35ad', group: 'D' },
  { code: 'D21', hex: '#940595', group: 'D' },
  { code: 'D22', hex: '#38389a', group: 'D' },
  { code: 'D23', hex: '#eadbf8', group: 'D' },
  { code: 'D24', hex: '#768ae1', group: 'D' },
  { code: 'D25', hex: '#4950c2', group: 'D' },
  { code: 'D26', hex: '#d6c6eb', group: 'D' },
  { code: 'E1', hex: '#f6d4cb', group: 'E' },
  { code: 'E2', hex: '#fcc1dd', group: 'E' },
  { code: 'E3', hex: '#f6bde8', group: 'E' },
  { code: 'E4', hex: '#e8649e', group: 'E' },
  { code: 'E5', hex: '#f0569f', group: 'E' },
  { code: 'E6', hex: '#eb4172', group: 'E' },
  { code: 'E7', hex: '#c53674', group: 'E' },
  { code: 'E8', hex: '#fddbe9', group: 'E' },
  { code: 'E9', hex: '#e376c7', group: 'E' },
  { code: 'E10', hex: '#d13b95', group: 'E' },
  { code: 'E11', hex: '#f7dad4', group: 'E' },
  { code: 'E12', hex: '#f693bf', group: 'E' },
  { code: 'E13', hex: '#b5026a', group: 'E' },
  { code: 'E14', hex: '#fad4bf', group: 'E' },
  { code: 'E15', hex: '#f5c9ca', group: 'E' },
  { code: 'E16', hex: '#fbf4ec', group: 'E' },
  { code: 'E17', hex: '#f7e3ec', group: 'E' },
  { code: 'E18', hex: '#f9c8db', group: 'E' },
  { code: 'E19', hex: '#f6bbd1', group: 'E' },
  { code: 'E20', hex: '#d7c6ce', group: 'E' },
  { code: 'E21', hex: '#c09da4', group: 'E' },
  { code: 'E22', hex: '#b38c9f', group: 'E' },
  { code: 'E23', hex: '#937d8a', group: 'E' },
  { code: 'E24', hex: '#debee5', group: 'E' },
  { code: 'F1', hex: '#fe9381', group: 'F' },
  { code: 'F2', hex: '#f63d4b', group: 'F' },
  { code: 'F3', hex: '#ee4e3e', group: 'F' },
  { code: 'F4', hex: '#fb2a40', group: 'F' },
  { code: 'F5', hex: '#e10328', group: 'F' },
  { code: 'F6', hex: '#913635', group: 'F' },
  { code: 'F7', hex: '#911932', group: 'F' },
  { code: 'F8', hex: '#bb0126', group: 'F' },
  { code: 'F9', hex: '#e0677a', group: 'F' },
  { code: 'F10', hex: '#874628', group: 'F' },
  { code: 'F11', hex: '#592323', group: 'F' },
  { code: 'F12', hex: '#f3536b', group: 'F' },
  { code: 'F13', hex: '#f45c45', group: 'F' },
  { code: 'F14', hex: '#fcadb2', group: 'F' },
  { code: 'F15', hex: '#d50527', group: 'F' },
  { code: 'F16', hex: '#f8c0a9', group: 'F' },
  { code: 'F17', hex: '#e89b7d', group: 'F' },
  { code: 'F18', hex: '#d07f4a', group: 'F' },
  { code: 'F19', hex: '#be454a', group: 'F' },
  { code: 'F20', hex: '#c69495', group: 'F' },
  { code: 'F21', hex: '#f2b8c6', group: 'F' },
  { code: 'F22', hex: '#f7c3d0', group: 'F' },
  { code: 'F23', hex: '#ed806c', group: 'F' },
  { code: 'F24', hex: '#e09daf', group: 'F' },
  { code: 'F25', hex: '#e84854', group: 'F' },
  { code: 'G1', hex: '#ffe4d3', group: 'G' },
  { code: 'G2', hex: '#fcc6ac', group: 'G' },
  { code: 'G3', hex: '#f1c4a5', group: 'G' },
  { code: 'G4', hex: '#dcb387', group: 'G' },
  { code: 'G5', hex: '#e7b34e', group: 'G' },
  { code: 'G6', hex: '#e3a014', group: 'G' },
  { code: 'G7', hex: '#985c3a', group: 'G' },
  { code: 'G8', hex: '#713d2f', group: 'G' },
  { code: 'G9', hex: '#e4b685', group: 'G' },
  { code: 'G10', hex: '#da8c42', group: 'G' },
  { code: 'G11', hex: '#dac898', group: 'G' },
  { code: 'G12', hex: '#fec993', group: 'G' },
  { code: 'G13', hex: '#b2714b', group: 'G' },
  { code: 'G14', hex: '#8b684c', group: 'G' },
  { code: 'G15', hex: '#f6f8e3', group: 'G' },
  { code: 'G16', hex: '#f2d8c1', group: 'G' },
  { code: 'G17', hex: '#77544e', group: 'G' },
  { code: 'G18', hex: '#ffe3d5', group: 'G' },
  { code: 'G19', hex: '#dd7d41', group: 'G' },
  { code: 'G20', hex: '#a5452f', group: 'G' },
  { code: 'G21', hex: '#b38561', group: 'G' },
  { code: 'H1', hex: '#ffffff', group: 'H' },
  { code: 'H2', hex: '#fbfbfb', group: 'H' },
  { code: 'H3', hex: '#b4b4b4', group: 'H' },
  { code: 'H4', hex: '#878787', group: 'H' },
  { code: 'H5', hex: '#464648', group: 'H' },
  { code: 'H6', hex: '#2c2c2c', group: 'H' },
  { code: 'H7', hex: '#010101', group: 'H' },
  { code: 'H8', hex: '#e7d6dc', group: 'H' },
  { code: 'H9', hex: '#efedee', group: 'H' },
  { code: 'H10', hex: '#ebebeb', group: 'H' },
  { code: 'H11', hex: '#cdcdcd', group: 'H' },
  { code: 'H12', hex: '#fdf6ee', group: 'H' },
  { code: 'H13', hex: '#f4edf1', group: 'H' },
  { code: 'H14', hex: '#ced7d4', group: 'H' },
  { code: 'H15', hex: '#9aa6a6', group: 'H' },
  { code: 'H16', hex: '#1b1213', group: 'H' },
  { code: 'H17', hex: '#f0eeef', group: 'H' },
  { code: 'H18', hex: '#fcfff6', group: 'H' },
  { code: 'H19', hex: '#f2eee5', group: 'H' },
  { code: 'H20', hex: '#96a09f', group: 'H' },
  { code: 'H21', hex: '#f8fbe6', group: 'H' },
  { code: 'H22', hex: '#cacad2', group: 'H' },
  { code: 'H23', hex: '#9b9c94', group: 'H' },
  { code: 'M1', hex: '#bbc6b6', group: 'M' },
  { code: 'M2', hex: '#909994', group: 'M' },
  { code: 'M3', hex: '#697e81', group: 'M' },
  { code: 'M4', hex: '#e0d4bc', group: 'M' },
  { code: 'M5', hex: '#d1ccaf', group: 'M' },
  { code: 'M6', hex: '#b0aa86', group: 'M' },
  { code: 'M7', hex: '#b0a796', group: 'M' },
  { code: 'M8', hex: '#ae8082', group: 'M' },
  { code: 'M9', hex: '#a68862', group: 'M' },
  { code: 'M10', hex: '#c4b3bb', group: 'M' },
  { code: 'M11', hex: '#9d7693', group: 'M' },
  { code: 'M12', hex: '#644b51', group: 'M' },
  { code: 'M13', hex: '#c79266', group: 'M' },
  { code: 'M14', hex: '#c27563', group: 'M' },
  { code: 'M15', hex: '#747d7a', group: 'M' },
]

/** 拼豆色卡颜色数，也是画布调色板的硬上限。 */
export const MAX_BEAD_COLORS = BEAD_COLORS.length

const HEX_TO_BEAD = new Map(BEAD_COLORS.map((c) => [c.hex, c]))

/** 精确色号查询：颜色必须与色卡 HEX 完全一致（忽略大小写与 # 写法差异）。 */
export function beadColorForHex(hex: string): BeadColor | undefined {
  const rgb = parseHex(hex)
  if (!rgb) return undefined
  return HEX_TO_BEAD.get(toHex(rgb))
}

/**
 * 拼豆色号自然排序：先比色系字母，再比数字（A1 < A9 < A10 < B1）。
 * 纯字符串比较会把 A10 排到 A9 前面，和图例阅读习惯相反。
 */
export function compareBeadCode(a: string, b: string): number {
  const ma = /^([A-Z]+)(\d+)$/.exec(a)
  const mb = /^([A-Z]+)(\d+)$/.exec(b)
  if (ma && mb) {
    const ga = ma[1]!
    const gb = mb[1]!
    if (ga !== gb) return ga < gb ? -1 : 1
    return Number(ma[2]) - Number(mb[2])
  }
  return a.localeCompare(b)
}

/**
 * 色块上的取反色文字：亮色块用近黑字，暗色块用白字。
 * 用亮度阈值而不是 RGB 取补，保证任意色号上的小字都有足够对比度。
 */
export function invertedTextColor(hex: string): string {
  const [r, g, b] = parseHex(hex) ?? [0, 0, 0]
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance > 150 ? '#101014' : '#ffffff'
}

const nearestCache = new Map<string, BeadColor>()

/**
 * 取最接近的拼豆色（RGB 欧氏距离平方）。非法颜色按黑色处理。
 * 结果缓存，图例可在每次渲染时无成本调用。
 */
export function nearestBeadColor(hex: string): BeadColor {
  const rgb = parseHex(hex) ?? [0, 0, 0]
  const key = toHex(rgb)
  const cached = nearestCache.get(key)
  if (cached) return cached
  let best = BEAD_COLORS[0]!
  let bestDist = Infinity
  for (const bead of BEAD_COLORS) {
    const [br, bg, bb] = parseHex(bead.hex)!
    const d = (rgb[0] - br) ** 2 + (rgb[1] - bg) ** 2 + (rgb[2] - bb) ** 2
    if (d < bestDist) {
      bestDist = d
      best = bead
    }
  }
  nearestCache.set(key, best)
  return best
}

/** `#rgb` / `#rrggbb` / 无 # → [r,g,b]；无法解析返回 null。 */
function parseHex(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    const r = parseInt(h[0]! + h[0]!, 16)
    const g = parseInt(h[1]! + h[1]!, 16)
    const b = parseInt(h[2]! + h[2]!, 16)
    return [r, g, b]
  }
  if (/^[0-9a-fA-F]{6}$/.test(h)) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  return null
}

function toHex(rgb: readonly [number, number, number]): string {
  const part = (v: number) => v.toString(16).padStart(2, '0')
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`
}
