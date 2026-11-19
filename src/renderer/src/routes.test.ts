import { describe, expect, it } from 'vitest'
import { parseView, routeHash, type Route, type View } from './routes'

const ROUTES: readonly Route[] = ['home', 'reading', 'entries', 'chat', 'library', 'settings']

/** 一条视图；没提到的参数都是空。 */
function view(route: Route, overrides: Partial<View> = {}): View {
  return {
    route,
    articleId: null,
    entryId: null,
    entrySentenceId: null,
    reselect: false,
    threadId: null,
    pinId: null,
    fromEntryId: null,
    readingFrom: null,
    ...overrides
  }
}

describe('parseView', () => {
  it('空 hash 回到首页', () => {
    expect(parseView('')).toEqual(view('home'))
  })

  it('六个视图的 hash 都能认回来', () => {
    for (const route of ROUTES) {
      expect(parseView(routeHash(route))).toEqual(view(route))
    }
  })

  it('不认识的路径回到首页', () => {
    expect(parseView('#/nope')).toEqual(view('home'))
    expect(parseView('#/library/extra/more')).toEqual(view('home'))
  })

  it('容忍缺少斜杠的写法', () => {
    expect(parseView('#library')).toEqual(view('library'))
  })

  it('阅读页带文章 id', () => {
    expect(parseView('#/reading/cet6-2024-06-s1-c1')).toEqual(
      view('reading', { articleId: 'cet6-2024-06-s1-c1' })
    )
  })

  it('阅读页没有 id 时仍是阅读页，显示空态', () => {
    expect(parseView('#/reading')).toEqual(view('reading'))
    expect(parseView('#/reading/')).toEqual(view('reading'))
  })

  it('阅读页带要定位的原句，可以顺带进入重新圈定', () => {
    expect(parseView('#/reading/a%20b?sentence=es-1')).toEqual(
      view('reading', { articleId: 'a b', entrySentenceId: 'es-1' })
    )
    expect(parseView('#/reading/a?reselect=1&sentence=es-1')).toEqual(
      view('reading', { articleId: 'a', entrySentenceId: 'es-1', reselect: true })
    )
    // 没有文章就没有可定位的原句；reselect 单独出现也不生效。
    expect(parseView('#/reading?sentence=es-1')).toEqual(view('reading'))
    expect(parseView('#/reading/a?reselect=1')).toEqual(view('reading', { articleId: 'a' }))
  })

  it('词条页带要打开的代码', () => {
    expect(parseView('#/entries/entry-1')).toEqual(view('entries', { entryId: 'entry-1' }))
    expect(parseView('#/entries/%E0%A4%A')).toEqual(view('entries'))
    expect(parseView('#/entries/a/b')).toEqual(view('home'))
  })

  it('词条页可带一条原句定位并从地址恢复', () => {
    const hash = routeHash('entries', { entryId: 'entry 1', entrySentenceId: 'sentence 1' })
    expect(hash).toBe('#/entries/entry%201?sentence=sentence%201')
    expect(parseView(hash)).toEqual(view('entries', { entryId: 'entry 1', entrySentenceId: 'sentence 1' }))
  })

  it('文章库的选中项可以从地址恢复', () => {
    expect(parseView('#/library/a%20b')).toEqual(view('library', { articleId: 'a b' }))
    expect(routeHash('library', { articleId: 'a b' })).toBe('#/library/a%20b')
  })

  it('对话页带要打开的线程，空白线程不带', () => {
    expect(parseView('#/chat')).toEqual(view('chat'))
    expect(parseView('#/chat/')).toEqual(view('chat'))
    expect(parseView('#/chat/thread-1')).toEqual(view('chat', { threadId: 'thread-1' }))
    expect(parseView('#/chat/thread%201')).toEqual(view('chat', { threadId: 'thread 1' }))
    // 编码坏了当没指定线程，多一段就回首页。
    expect(parseView('#/chat/%E0%A4%A')).toEqual(view('chat'))
    expect(parseView('#/chat/a/b')).toEqual(view('home'))
  })

  it('对话页可以带一条要回跳定位的钉住与来源词条', () => {
    expect(parseView('#/chat/thread-1?pin=pin-1&from=entry-1')).toEqual(
      view('chat', { threadId: 'thread-1', pinId: 'pin-1', fromEntryId: 'entry-1' })
    )
    expect(parseView('#/chat/thread-1?pin=pin%201')).toEqual(
      view('chat', { threadId: 'thread-1', pinId: 'pin 1' })
    )
    // 编码坏了的参数当没有，线程照常打开。
    expect(parseView('#/chat/thread-1?pin=%E0%A4%A&from=entry-1')).toEqual(
      view('chat', { threadId: 'thread-1', fromEntryId: 'entry-1' })
    )
    expect(parseView('#/chat?pin=pin-1')).toEqual(view('chat'))
  })

  it('id 按 URL 编码解回来', () => {
    expect(parseView('#/reading/a%20b')).toEqual(view('reading', { articleId: 'a b' }))
  })

  it('多出来的路径段回到首页，编码坏了当没指定文章', () => {
    expect(parseView('#/reading/a/b')).toEqual(view('home'))
    expect(parseView('#/reading/%E0%A4%A')).toEqual(view('reading'))
  })

  it('非阅读页带参数时回到首页，多余查询串不影响路由', () => {
    expect(parseView('#/home/extra')).toEqual(view('home'))
    expect(parseView('#/library?x=1')).toEqual(view('library'))
  })
})

describe('routeHash', () => {
  it('阅读页保留来源，刷新后仍能知道返回哪里', () => {
    for (const readingFrom of ['library', 'home', 'entries', 'search'] as const) {
      const hash = routeHash('reading', { articleId: 'a', readingFrom })
      expect(hash).toBe(`#/reading/a?from=${readingFrom}`)
      expect(parseView(hash)).toEqual(expect.objectContaining({ readingFrom }))
      const emptyHash = routeHash('reading', { readingFrom })
      expect(emptyHash).toBe(`#/reading?from=${readingFrom}`)
      expect(parseView(emptyHash)).toEqual(view('reading', { readingFrom }))
    }
    expect(parseView('#/reading?from=unknown')).toEqual(view('reading'))
    expect(parseView('#/reading/a?from=unknown')).toEqual(
      expect.objectContaining({ readingFrom: null })
    )
  })

  it('阅读页把文章 id 编进 hash', () => {
    expect(routeHash('reading', { articleId: 'a b' })).toBe('#/reading/a%20b')
    expect(routeHash('reading')).toBe('#/reading')
    expect(routeHash('home', { articleId: 'ignored' })).toBe('#/home')
  })

  it('阅读页带上要定位的原句与重新圈定', () => {
    expect(routeHash('reading', { articleId: 'a', entrySentenceId: 'es 1' })).toBe(
      '#/reading/a?sentence=es%201'
    )
    expect(
      routeHash('reading', { articleId: 'a', entrySentenceId: 'es-1', reselect: true })
    ).toBe('#/reading/a?sentence=es-1&reselect=1')
  })

  it('词条页把词条 id 编进 hash', () => {
    expect(routeHash('entries', { entryId: 'entry 1' })).toBe('#/entries/entry%201')
    expect(routeHash('entries')).toBe('#/entries')
  })

  it('对话页把线程 id 编进 hash', () => {
    expect(routeHash('chat', { threadId: 'thread 1' })).toBe('#/chat/thread%201')
    expect(routeHash('chat')).toBe('#/chat')
  })

  it('对话页把要回跳的钉住与来源词条编进 hash', () => {
    expect(routeHash('chat', { threadId: 'thread-1', pinId: 'pin 1', fromEntryId: 'entry 1' })).toBe(
      '#/chat/thread-1?pin=pin%201&from=entry%201'
    )
    expect(routeHash('chat', { threadId: 'thread-1', pinId: 'pin-1' })).toBe(
      '#/chat/thread-1?pin=pin-1'
    )
    expect(routeHash('chat', { threadId: 'thread-1', fromEntryId: 'entry-1' })).toBe(
      '#/chat/thread-1'
    )
  })
})
