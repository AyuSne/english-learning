import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/tokens.css'
import './styles/app.css'
import './styles/chat.css'
import './styles/entries.css'
import './styles/library.css'
import './styles/pins.css'
import './styles/reading.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('缺少 #root 挂载点')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
