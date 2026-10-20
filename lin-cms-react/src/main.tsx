import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyThemeToDocument, useThemeStore } from '@/stores/theme'
import App from './App'
import './index.css'

// 应用启动前同步主题状态到 <html>（首帧前的引导脚本见 index.html）
const { themeId, isDark } = useThemeStore.getState()
applyThemeToDocument(themeId, isDark)

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('未找到 #root 挂载节点')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
