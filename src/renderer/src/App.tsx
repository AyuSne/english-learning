import { useEffect, useState } from 'react'
import type { AppBootstrap } from '../../shared/types'
import { loadBootstrap } from './api'
import { GlobalNav } from './components/GlobalNav'
import { routeLabel } from './navigation'
import { ChatPage } from './pages/ChatPage'
import { EntriesPage } from './pages/EntriesPage'
import { HomePage } from './pages/HomePage'
import { LibraryPage } from './pages/LibraryPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { ReadingPage } from './pages/ReadingPage'
import { useView } from './use-view'

export function App() {
  const view = useView()
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

  // 阅读页收起全局栏，注意力只留在文章上。其余五页保留左栏。
  if (view.route === 'reading') {
    return (
      <ReadingPage
        articleId={view.articleId}
        entrySentenceId={view.entrySentenceId}
        reselect={view.reselect}
      />
    )
  }

  const currentLabel = routeLabel(view.route)

  return (
    <div className="app">
      <GlobalNav route={view.route} />
      <main className={view.route === 'chat' ? 'main main-chat' : 'main'}>
        {view.route === 'home' ? (
          <HomePage />
        ) : view.route === 'entries' ? (
          <EntriesPage entryId={view.entryId} />
        ) : view.route === 'chat' ? (
          <ChatPage />
        ) : view.route === 'library' ? (
          <LibraryPage corpusImport={bootstrap.corpusImport} />
        ) : (
          <PlaceholderPage title={currentLabel} />
        )}
      </main>
    </div>
  )
}
