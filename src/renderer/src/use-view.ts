import { useEffect, useState } from 'react'
import { parseView, type View } from './routes'

export function useView(): View {
  const [view, setView] = useState<View>(() => parseView(window.location.hash))

  useEffect(() => {
    const syncFromHash = (): void => setView(parseView(window.location.hash))
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  return view
}
