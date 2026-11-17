export const ROUTES = ['home', 'reading', 'entries', 'chat', 'library', 'settings'] as const

export type Route = (typeof ROUTES)[number]

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  return (ROUTES as readonly string[]).includes(path) ? (path as Route) : 'home'
}

export function routeHash(route: Route): string {
  return `#/${route}`
}
