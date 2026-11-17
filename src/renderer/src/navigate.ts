import { routeHash, type Route } from './routes'

export function navigate(route: Route): void {
  window.location.hash = routeHash(route)
}
