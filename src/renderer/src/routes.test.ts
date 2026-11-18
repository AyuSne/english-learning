import { describe, expect, it } from 'vitest'
import { parseView, routeHash, type Route } from './routes'

const ROUTES: readonly Route[] = ['home', 'reading', 'entries', 'chat', 'library', 'settings']

describe('parseView', () => {
  it('空 hash 回到首页', () => {
    expect(parseView('')).toEqual({ route: 'home', articleId: null })
  })

  it('六个视图的 hash 都能认回来', () => {
    for (const route of ROUTES) {
      expect(parseView(routeHash(route))).toEqual({ route, articleId: null })
    }
  })

  it('不认识的路径回到首页', () => {
    expect(parseView('#/nope')).toEqual({ route: 'home', articleId: null })
    expect(parseView('#/library/extra')).toEqual({ route: 'home', articleId: null })
  })

  it('容忍缺少斜杠的写法', () => {
    expect(parseView('#library')).toEqual({ route: 'library', articleId: null })
  })

  it('阅读页带文章 id', () => {
    expect(parseView('#/reading/cet6-2024-06-s1-c1')).toEqual({
      route: 'reading',
      articleId: 'cet6-2024-06-s1-c1'
    })
  })

  it('阅读页没有 id 时仍是阅读页，显示空态', () => {
    expect(parseView('#/reading')).toEqual({ route: 'reading', articleId: null })
    expect(parseView('#/reading/')).toEqual({ route: 'reading', articleId: null })
  })

  it('id 按 URL 编码解回来', () => {
    expect(parseView('#/reading/a%20b')).toEqual({ route: 'reading', articleId: 'a b' })
  })

  it('多出来的路径段回到首页，编码坏了当没指定文章', () => {
    expect(parseView('#/reading/a/b')).toEqual({ route: 'home', articleId: null })
    expect(parseView('#/reading/%E0%A4%A')).toEqual({ route: 'reading', articleId: null })
  })

  it('非阅读页带参数时回到首页', () => {
    expect(parseView('#/home/extra')).toEqual({ route: 'home', articleId: null })
  })
})

describe('routeHash', () => {
  it('阅读页把文章 id 编进 hash', () => {
    expect(routeHash('reading', { articleId: 'a b' })).toBe('#/reading/a%20b')
    expect(routeHash('reading')).toBe('#/reading')
    expect(routeHash('library', { articleId: 'ignored' })).toBe('#/library')
  })
})
