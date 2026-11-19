import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './parse-markdown'

describe('parseMarkdown', () => {
  it('空行分段，段内的 CRLF 与 LF 都有自己的源区间', () => {
    expect(parseMarkdown('😀\r\n同\n同\r\n \t\r\n后\r\n')).toEqual([
      {
        kind: 'paragraph', start: 0, end: 7, spans: [
          { kind: 'text', text: '😀', start: 0, end: 2 },
          { kind: 'break', text: '\r\n', start: 2, end: 4 },
          { kind: 'text', text: '同', start: 4, end: 5 },
          { kind: 'break', text: '\n', start: 5, end: 6 },
          { kind: 'text', text: '同', start: 6, end: 7 }
        ]
      },
      {
        kind: 'paragraph', start: 13, end: 14, spans: [
          { kind: 'text', text: '后', start: 13, end: 14 }
        ]
      }
    ])
  })

  it('标题和两类列表跳过标记，同时报告块和列表项的源区间', () => {
    const source = '# 同\r\n### 同\n- 同\n+ 同\n1. 同\n2) 😀'
    expect(parseMarkdown(source)).toEqual([
      {
        kind: 'heading', level: 3, start: 0, end: 3,
        spans: [{ kind: 'text', text: '同', start: 2, end: 3 }]
      },
      {
        kind: 'heading', level: 4, start: 5, end: 10,
        spans: [{ kind: 'text', text: '同', start: 9, end: 10 }]
      },
      {
        kind: 'list', ordered: false, start: 11, end: 18, items: [
          { start: 11, end: 14, spans: [{ kind: 'text', text: '同', start: 13, end: 14 }] },
          { start: 15, end: 18, spans: [{ kind: 'text', text: '同', start: 17, end: 18 }] }
        ]
      },
      {
        kind: 'list', ordered: true, start: 19, end: 29, items: [
          { start: 19, end: 23, spans: [{ kind: 'text', text: '同', start: 22, end: 23 }] },
          { start: 24, end: 29, spans: [{ kind: 'text', text: '😀', start: 27, end: 29 }] }
        ]
      }
    ])
  })

  it('粗体、斜体可互相嵌套，代码中的星号仍是源文本', () => {
    expect(parseMarkdown('**同 *同* `*x*`**\n*斜 **粗***')).toEqual([
      {
        kind: 'paragraph', start: 0, end: 25, spans: [
          { kind: 'strong', start: 0, end: 15, children: [
            { kind: 'text', text: '同 ', start: 2, end: 4 },
            { kind: 'em', start: 4, end: 7, children: [
              { kind: 'text', text: '同', start: 5, end: 6 }
            ] },
            { kind: 'text', text: ' ', start: 7, end: 8 },
            { kind: 'code', text: '*x*', start: 9, end: 12 }
          ] },
          { kind: 'break', text: '\n', start: 15, end: 16 },
          { kind: 'em', start: 16, end: 25, children: [
            { kind: 'text', text: '斜 ', start: 17, end: 19 },
            { kind: 'strong', start: 19, end: 24, children: [
              { kind: 'text', text: '粗', start: 21, end: 22 }
            ] }
          ] }
        ]
      }
    ])
  })
})
