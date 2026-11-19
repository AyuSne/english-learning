import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LearningBody } from './learning-body'

function renderBody(body: string): string {
  return renderToStaticMarkup(createElement(LearningBody, { body }))
}

function semanticMarkup(html: string): string {
  return html.replace(/<\/?span\b[^>]*>/g, '').replace(/<(\w+)\b[^>]*>/g, '<$1>')
}

it('学习内容保留语义排版与换行，不把正文当成 HTML', () => {
  const body = '# 同\r\n### 同\n\n**粗 *斜* `码`**\r\n<small>字</small>\n\n- 同\n\n1. 同'
  const html = renderBody(body)

  expect(semanticMarkup(html)).toBe(
    '<div><h3>同</h3><h4>同</h4>' +
      '<p><strong>粗 <em>斜</em> <code>码</code></strong>\r\n&lt;small&gt;字&lt;/small&gt;</p>' +
      '<ul><li>同</li></ul><ol><li>同</li></ol></div>'
  )
})

it.each([
  ['approach = 接近', '<p>approach = 接近</p>'],
  ['是 **做法** 不是 *途径*，看 `approach`', '<p>是 <strong>做法</strong> 不是 <em>途径</em>，看 <code>approach</code></p>'],
  ['2 * 3 = 6，**没闭合', '<p>2 * 3 = 6，**没闭合</p>'],
  ['  \n \n', '']
])('学习内容 %j 按原有规则渲染', (body, markup) => {
  expect(semanticMarkup(renderBody(body))).toBe(`<div>${markup}</div>`)
})
