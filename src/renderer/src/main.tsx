import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { resolveTheme } from '../../shared/types'
import { App } from './App'
import './styles/tokens.css'
import './styles/app.css'
import './styles/chat.css'
import './styles/entries.css'
import './styles/dictionary.css'
import './styles/library.css'
import './styles/pins.css'
import './styles/reading.css'
import './styles/settings.css'

// 首帧先按系统深浅兜底，bootstrap 读到本机偏好后再对齐，避免深色下闪一片白。
document.documentElement.dataset.theme = resolveTheme(
  'system',
  window.matchMedia('(prefers-color-scheme: dark)').matches
)

const container = document.getElementById('root')
if (!container) {
  throw new Error('缺少 #root 挂载点')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
