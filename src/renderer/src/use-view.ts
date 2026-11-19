import { useEffect, useState } from 'react'
import { currentView, restoreCurrentView } from './navigate'
import type { View } from './routes'

export function useView(): View {
  const [view, setView] = useState<View>(restoreCurrentView)

  useEffect(() => {
    const syncFromHash = (): void => setView(currentView())
    window.addEventListener('hashchange', syncFromHash)
    window.addEventListener('route-replaced', syncFromHash)
    return () => {
      window.removeEventListener('hashchange', syncFromHash)
      window.removeEventListener('route-replaced', syncFromHash)
    }
  }, [])

  return view
}
