import { contextBridge, ipcRenderer } from 'electron'
import { createBridge } from './bridge'

// 渲染层唯一能碰到主进程的对象。contextIsolation + sandbox 下别再暴露其它东西。
contextBridge.exposeInMainWorld('api', createBridge(ipcRenderer))
