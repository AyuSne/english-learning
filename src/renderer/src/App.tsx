import { useEffect, useState } from 'react'
import type { AppBootstrap } from '../../shared/types'
import { loadBootstrap } from './api'
import { GlobalNav } from './components/GlobalNav'
import { routeLabel } from './navigation'
import { HomePage } from './pages/HomePage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { useRoute } from './use-route'

export function App() {
  const route = useRoute()
  const [bootstrap, setBootstrap] = useState<AppBootstrap | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    loadBootstrap().then(
      (value) => {
        if (active) setBootstrap(value)
      },
      (error: unknown) => {
        if (active) setBootError(error instanceof Error ? error.message : String(error))
      }
    )
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (bootstrap) {
      document.documentElement.dataset.theme = bootstrap.theme
    }
  }, [bootstrap])

  if (bootError !== null) {
    return (
      <div className="boot boot-error" role="alert">
        <h1>启动失败</h1>
        <p>{bootError}</p>
      </div>
    )
  }

  if (!bootstrap) {
    return <div className="boot" aria-busy="true" />
  }

  const currentLabel = routeLabel(route)

  return (
    <div className="app">
      <GlobalNav route={route} />
      <main className="main">
        {route === 'home' ? <HomePage /> : <PlaceholderPage title={currentLabel} />}
      </main>
    </div>
  )
}
