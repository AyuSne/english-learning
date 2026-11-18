import { describe, expect, it } from 'vitest'
import { parseInline, parseLearningBody } from './learning-body'

describe('parseInline', () => {
  it('没有标记时是一段文字', () => {
    expect(parseInline('approach = 接近')).toEqual([{ kind: 'text', text: 'approach = 接近' }])
  })

  it('认出粗体、斜体与行内代码', () => {
    expect(parseInline('是 **做法** 不是 *途径*，看 `approach`')).toEqual([
      { kind: 'text', text: '是 ' },
      { kind: 'strong', text: '做法' },
      { kind: 'text', text: ' 不是 ' },
      { kind: 'em', text: '途径' },
      { kind: 'text', text: '，看 ' },
      { kind: 'code', text: 'approach' }
    ])
  })

  it('不配对或像乘法一样的光杆星号原样留着', () => {
    expect(parseInline('2 * 3 = 6，**没闭合')).toEqual([
      { kind: 'text', text: '2 * 3 = 6，**没闭合' }
    ])
  })
})

describe('parseLearningBody', () => {
  it('空行分段，段内换行留着', () => {
    expect(parseLearningBody('第一行\n第二行\n\n下一段')).toEqual([
      {
        kind: 'paragraph',
        lines: [
          [{ kind: 'text', text: '第一行' }],
          [{ kind: 'text', text: '第二行' }]
        ]
      },
      { kind: 'paragraph', lines: [[{ kind: 'text', text: '下一段' }]] }
    ])
  })

  it('标题按级别落到三、四级', () => {
    expect(parseLearningBody('# 词义\n### 辨析')).toEqual([
      { kind: 'heading', level: 3, spans: [{ kind: 'text', text: '词义' }] },
      { kind: 'heading', level: 4, spans: [{ kind: 'text', text: '辨析' }] }
    ])
  })

  it('无序与有序列表各自成块', () => {
    expect(parseLearningBody('- 做法\n- 途径\n\n1. 先读\n2. 再查')).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', text: '做法' }], [{ kind: 'text', text: '途径' }]]
      },
      {
        kind: 'list',
        ordered: true,
        items: [[{ kind: 'text', text: '先读' }], [{ kind: 'text', text: '再查' }]]
      }
    ])
  })

  it('空内容没有块', () => {
    expect(parseLearningBody('  \n \n')).toEqual([])
  })

  it('Windows 换行也能分块', () => {
    expect(parseLearningBody('一\r\n二')).toEqual([
      {
        kind: 'paragraph',
        lines: [[{ kind: 'text', text: '一' }], [{ kind: 'text', text: '二' }]]
      }
    ])
  })
})
