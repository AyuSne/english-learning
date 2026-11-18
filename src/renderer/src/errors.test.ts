import { describe, expect, it } from 'vitest'
import { failureText, messageOf } from './errors'

describe('messageOf', () => {
  it('保留原始信息，排查时还能看到技术原因', () => {
    expect(messageOf(new Error('No handler registered for home:summary'))).toBe(
      'No handler registered for home:summary'
    )
    expect(messageOf('直接抛出的字符串')).toBe('直接抛出的字符串')
  })
})

describe('failureText', () => {
  it('业务侧已经写好的错误原样给用户看', () => {
    expect(failureText(new Error('本机资料库暂时不可写'), '这次没有完成。')).toBe(
      '本机资料库暂时不可写'
    )
  })

  it('IPC 包装出来的技术错误换成一句人话', () => {
    const error = new Error(
      "Error invoking remote method 'home:summary': No handler registered for 'home:summary'"
    )
    expect(failureText(error, '首页没有读出来。')).toBe('首页没有读出来。')
  })

  it('空消息用兜底文案，界面上不出现空白错误块', () => {
    expect(failureText(new Error(''), '这次没有完成，再试一次。')).toBe(
      '这次没有完成，再试一次。'
    )
    expect(failureText(undefined, '这次没有完成，再试一次。')).toBe(
      '这次没有完成，再试一次。'
    )
  })
})
