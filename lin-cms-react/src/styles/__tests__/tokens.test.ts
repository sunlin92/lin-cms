import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/*
 * 语义 token 对比度核验（docs/ui-design-book.md 7.1 / 12）。
 * 直接解析 index.css 与 themes.css 的真实声明，防止 token 改动破坏可读性。
 */

type LinearRgb = [number, number, number]

const CSS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function parseStylesheet(): Record<string, Record<string, string>> {
  const css = ['src/index.css', 'src/styles/themes.css']
    .map((file) => readFileSync(join(CSS_DIR, file), 'utf8'))
    .join('\n')
  const blocks: Record<string, Record<string, string>> = {}
  const ruleset = /([^{}]+)\{([^{}]*)\}/g
  for (const [, rawSelector, body] of css.matchAll(ruleset)) {
    // 选择器文本可能带着前置注释/指令，取最后一个空白分隔段作为键
    const selector = rawSelector.trim().split(/\s+/).at(-1) ?? ''
    if (
      !selector.startsWith(':root') &&
      !selector.startsWith('.') &&
      !selector.startsWith('html')
    ) {
      continue
    }
    const declarations: Record<string, string> = {}
    // 先剥掉块内注释，避免中文注释混进声明键
    const cleanBody = body.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const declaration of cleanBody.split(';')) {
      const index = declaration.indexOf(':')
      if (index > 0) {
        declarations[declaration.slice(0, index).trim().replace(/^--/, '')] = declaration
          .slice(index + 1)
          .trim()
      }
    }
    blocks[selector] = { ...blocks[selector], ...declarations }
  }
  return blocks
}

const BLOCKS = parseStylesheet()

/** oklch(L C H) → 线性 sRGB（OKLab 标准矩阵） */
function oklchToLinearRgb(lightness: number, chroma: number, hue: number): LinearRgb {
  const rad = (hue * Math.PI) / 180
  const a = chroma * Math.cos(rad)
  const b = chroma * Math.sin(rad)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function hexToLinearRgb(hex: string): LinearRgb {
  const digits = hex.slice(1)
  const expanded = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits
  return [0, 2, 4].map((offset) =>
    srgbToLinear(Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255),
  ) as LinearRgb
}

/** 解析不透明颜色；含 alpha / var() 引用时返回 null（不参与对比断言） */
function parseColor(value: string): LinearRgb | null {
  const oklch = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value)
  if (oklch) return oklchToLinearRgb(Number(oklch[1]), Number(oklch[2]), Number(oklch[3]))
  const hex = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(value)
  if (hex) return hexToLinearRgb(hex[0])
  if (value === 'white') return [1, 1, 1]
  if (value === 'black') return [0, 0, 0]
  return null
}

function luminance(rgb: LinearRgb): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

function contrastRatio(a: LinearRgb, b: LinearRgb): number {
  const first = luminance(a)
  const second = luminance(b)
  const higher = Math.max(first, second)
  const lower = Math.min(first, second)
  return (higher + 0.05) / (lower + 0.05)
}

const THEME_PRESETS = ['lin-classic', 'book-ink', 'palace-vermilion', 'ru-yao-celadon'] as const

/** 组合某一主题 + 明暗模式下的最终 token 集（覆盖顺序与 CSS 级联一致） */
function contextFor(theme: string, dark: boolean): Record<string, string> {
  let context = { ...BLOCKS[':root'] }
  if (dark) context = { ...context, ...BLOCKS['.dark'] }
  context = { ...context, ...BLOCKS[`html[data-theme="${theme}"]`] }
  if (dark) {
    context = { ...context, ...BLOCKS[`html.dark[data-theme="${theme}"]`] }
  }
  return context
}

/** 文本色 token 与背景色 token 的组合（正文/按钮文字均按 4.5:1 校验） */
const TEXT_BACKGROUND_PAIRS: Array<[string, string]> = [
  ['foreground', 'background'],
  ['muted-foreground', 'background'],
  ['primary', 'background'],
  ['primary-foreground', 'primary'],
  ['secondary-foreground', 'secondary'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['sidebar-foreground', 'sidebar'],
  ['sidebar-accent-foreground', 'sidebar-accent'],
  ['destructive-foreground', 'destructive'],
  ['destructive', 'background'],
]

describe('语义 token 对比度（WCAG 2.1 AA ≥ 4.5:1）', () => {
  for (const theme of THEME_PRESETS) {
    for (const dark of [false, true]) {
      const mode = dark ? '深色' : '浅色'
      it(`${theme} · ${mode}`, () => {
        const context = contextFor(theme, dark)
        for (const [textToken, backgroundToken] of TEXT_BACKGROUND_PAIRS) {
          const text = parseColor(context[textToken] ?? '')
          const background = parseColor(context[backgroundToken] ?? '')
          if (!text || !background) {
            throw new Error(
              `${theme} ${mode}：token ${textToken}/${backgroundToken} 缺失或含 alpha，无法核验`,
            )
          }
          const ratio = contrastRatio(text, background)
          expect(
            ratio,
            `${textToken} (#${backgroundToken}) 对比度 ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(4.5)
        }
      })
    }
  }

  it('弹层遮罩 token 在浅色与深色模式下均已定义', () => {
    expect(BLOCKS[':root'].overlay).toBeTruthy()
    expect(BLOCKS['.dark'].overlay).toBeTruthy()
  })
})
