import { useEffect, useState } from 'react'
import type { ImportReport } from '../../shared/library'
import { resolveTheme, type AppBootstrap } from '../../shared/types'
import { loadBootstrap } from './api'
import { setChatModel } from './chat/store'
import { GlobalNav } from './components/GlobalNav'
import { ChatPage } from './pages/ChatPage'
import { EntriesPage } from './pages/EntriesPage'
import { HomePage } from './pages/HomePage'
import { LibraryPage } from './pages/LibraryPage'
import { ReadingPage } from './pages/ReadingPage'
import { SettingsPage } from './pages/SettingsPage'
import { setThemePreference, useSystemPrefersDark, useThemePreference } from './theme'
import { useView } from './use-view'

export function App() {
  const view = useView()
  const themePreference = useThemePreference()
  const systemPrefersDark = useSystemPrefersDark()
  const [bootstrap, setBootstrap] = useState<AppBootstrap | null>(null)
  const [corpusImport, setCorpusImport] = useState<ImportReport | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    loadBootstrap().then(
      (value) => {
        if (active) {
          setChatModel(value.chatModel)
          setThemePreference(value.theme)
          setCorpusImport(value.corpusImport)
          setBootstrap(value)
        }
      },
      (error: unknown) => {
        if (active) setBootError(error instanceof Error ? error.message : String(error))
      }
    )
    return () => {
      active = false
    }
  }, [])

  // 跟随系统时，Windows 切深浅不用重启；浅色与深色则按选择固定。
  useEffect(() => {
    document.documentElement.dataset.theme = resolveTheme(
      themePreference,
      systemPrefersDark
    )
  }, [themePreference, systemPrefersDark])

  if (bootError !== null) {
    return (
      <div className="boot boot-error" role="alert">
        <h1>启动失败</h1>
        <p>{bootError}</p>
        <button type="button" className="button" onClick={() => window.location.reload()}>
          再试一次
        </button>
      </div>
    )
  }

  if (!bootstrap) {
    return <div className="boot" aria-busy="true" />
  }

  // 阅读页收起全局栏，注意力只留在文章上；其余五页保留左栏。
  if (view.route === 'reading') {
    return (
      <ReadingPage
        articleId={view.articleId}
        entrySentenceId={view.entrySentenceId}
        reselect={view.reselect}
      />
    )
  }

  const mainClass =
    view.route === 'chat'
      ? 'main main-chat'
      : view.route === 'settings'
        ? 'main main-settings'
        : 'main'

  return (
    <div className="app">
      <GlobalNav route={view.route} />
      <main className={mainClass}>
        {view.route === 'home' ? (
          <HomePage />
        ) : view.route === 'entries' ? (
          <EntriesPage entryId={view.entryId} />
        ) : view.route === 'chat' ? (
          <ChatPage
            threadId={view.threadId}
            pinId={view.pinId}
            fromEntryId={view.fromEntryId}
          />
        ) : view.route === 'library' ? (
          <LibraryPage
            articleId={view.articleId}
            corpusImport={corpusImport ?? bootstrap.corpusImport}
            onReimport={setCorpusImport}
          />
        ) : (
          <SettingsPage />
        )}
      </main>
    </div>
  )
}
