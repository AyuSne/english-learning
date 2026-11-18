import { expect, type Page } from '@playwright/test'

/**
 * 实测对比度：从真实渲染出来的 computed style 取字色与（逐层合成的）底色，
 * 按 WCAG 相对亮度公式算比值。背景从元素自身往上叠到 html，半透明层先合成。
 */
export type ContrastSample = {
  /** 断言里显示的名字，比如「正文」。 */
  label: string
  /** 页面上的选择器，只取第一个命中。 */
  selector: string
  /** 默认 4.5:1（正文与 12px 以上文字）。 */
  minimum?: number
}

export type ContrastResult = {
  label: string
  selector: string
  found: boolean
  ratio: number
  foreground: string
  background: string
  minimum: number
}

type RawColor = { r: number; g: number; b: number; a: number }

/**
 * 采样一组元素并断言每一处都达到最小对比度。失败信息逐条列出实测值，
 * 不只是一句「对比度不足」。
 */
export async function expectReadableText(
  page: Page,
  samples: readonly ContrastSample[]
): Promise<void> {
  const results = await page.evaluate((list) => {
    const parse = (value: string): RawColor => {
      const match = value.match(/rgba?\(([^)]+)\)/)
      if (match === null) {
        if (value.startsWith('#')) {
          const hex = value.slice(1)
          const full =
            hex.length === 3
              ? hex
                  .split('')
                  .map((part) => part + part)
                  .join('')
              : hex.slice(0, 6)
          return {
            r: parseInt(full.slice(0, 2), 16),
            g: parseInt(full.slice(2, 4), 16),
            b: parseInt(full.slice(4, 6), 16),
            a: 1
          }
        }
        return { r: 0, g: 0, b: 0, a: 0 }
      }
      const parts = match[1]?.split(/[,\s/]+/).filter(Boolean) ?? []
      return {
        r: Number(parts[0] ?? 0),
        g: Number(parts[1] ?? 0),
        b: Number(parts[2] ?? 0),
        a: parts[3] === undefined ? 1 : Number(parts[3])
      }
    }

    const over = (top: RawColor, bottom: RawColor): RawColor => ({
      r: top.r * top.a + bottom.r * (1 - top.a),
      g: top.g * top.a + bottom.g * (1 - top.a),
      b: top.b * top.a + bottom.b * (1 - top.a),
      a: 1
    })

    const luminance = (color: RawColor): number => {
      const channel = (value: number): number => {
        const normalized = value / 255
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4
      }
      return (
        0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
      )
    }

    const ratioOf = (a: RawColor, b: RawColor): number => {
      const first = luminance(a)
      const second = luminance(b)
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
    }

    const describe = (color: RawColor): string =>
      `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`

    /** 从元素往上收集不透明/半透明底色，再按「底 → 顶」合成。 */
    const backgroundOf = (element: Element): RawColor => {
      const layers: RawColor[] = []
      for (let node: Element | null = element; node !== null; node = node.parentElement) {
        const color = parse(getComputedStyle(node).backgroundColor)
        if (color.a > 0) layers.push(color)
      }
      let base: RawColor = { r: 255, g: 255, b: 255, a: 1 }
      for (const layer of layers.reverse()) {
        base = over(layer, base)
      }
      return base
    }

    return list.map((sample) => {
      const element = document.querySelector(sample.selector)
      if (element === null) {
        return {
          label: sample.label,
          selector: sample.selector,
          found: false,
          ratio: 0,
          foreground: '',
          background: '',
          minimum: sample.minimum ?? 4.5
        }
      }
      const background = backgroundOf(element)
      const foreground = over(parse(getComputedStyle(element).color), background)
      return {
        label: sample.label,
        selector: sample.selector,
        found: true,
        ratio: ratioOf(foreground, background),
        foreground: describe(foreground),
        background: describe(background),
        minimum: sample.minimum ?? 4.5
      }
    })
  }, samples)

  const failures = results.filter(
    (result) => !result.found || result.ratio + 1e-9 < result.minimum
  )
  const report = results
    .map(
      (result) =>
        `${result.label}（${result.selector}）：${
          result.found ? `${result.ratio.toFixed(2)}:1` : '元素不存在'
        }${result.found ? ` · 字色 ${result.foreground} · 底色 ${result.background}` : ''}`
    )
    .join('\n')

  expect(failures, `对比度未达到要求的项：\n${report}`).toEqual([])
}

/** 按 WCAG 公式算两个十六进制颜色的对比度，用来验证 token 契约。 */
export function hexContrast(foreground: string, background: string): number {
  const parse = (hex: string): [number, number, number] => {
    const value = hex.replace('#', '')
    const full =
      value.length === 3
        ? value
            .split('')
            .map((part) => part + part)
            .join('')
        : value
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16)
    ]
  }
  const luminance = (hex: string): number => {
    const channels = parse(hex).map((value) => {
      const normalized = value / 255
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
  }
  const first = luminance(foreground)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}
