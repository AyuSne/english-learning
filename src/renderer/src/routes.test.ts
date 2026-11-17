import { describe, expect, it } from 'vitest'
import { parseRoute, routeHash, type Route } from './routes'

const ROUTES: readonly Route[] = ['home', 'reading', 'entries', 'chat', 'library', 'settings']

describe('parseRoute', () => {
  it('空 hash 回到首页', () => {
    expect(parseRoute('')).toBe('home')
  })

  it('六个视图的 hash 都能认回来', () => {
    for (const route of ROUTES) {
      expect(parseRoute(routeHash(route))).toBe(route)
    }
  })

  it('不认识的路径回到首页', () => {
    expect(parseRoute('#/nope')).toBe('home')
    expect(parseRoute('#/library/extra')).toBe('home')
  })

  it('容忍缺少斜杠的写法', () => {
    expect(parseRoute('#library')).toBe('library')
  })
})
