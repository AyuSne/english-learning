import { useEffect, useState } from 'react'
import { parseRoute, type Route } from './routes'

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))

  useEffect(() => {
    const syncFromHash = (): void => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  return route
}
