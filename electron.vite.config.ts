import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// 渲染层不加载任何远程内容：脚本、样式、图片都取自应用包内。开发态由 Vite 注入
// 内联的 React Refresh 预置脚本与 HMR WebSocket，因此单独放宽这两项。
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' ws:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'app-content-security-policy',
    transformIndexHtml(_html, context) {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: context.server ? DEV_CSP : PROD_CSP
          },
          injectTo: 'head-prepend'
        }
      ]
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react(), contentSecurityPolicy()]
  }
})
