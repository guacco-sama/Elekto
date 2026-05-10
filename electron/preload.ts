import { contextBridge, ipcRenderer } from 'electron'

export interface WorkerAPI {
  sendCommand: (command: unknown) => void
  onResponse: (callback: (response: unknown) => void) => () => void
}

const workerAPI: WorkerAPI = {
  sendCommand: (command: unknown) => {
    ipcRenderer.send('worker-command', command)
  },
  onResponse: (callback: (response: unknown) => void) => {
    const handler = (_: unknown, response: unknown) => callback(response)
    ipcRenderer.on('worker-response', handler)
    return () => ipcRenderer.removeListener('worker-response', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', {
  worker: workerAPI,
})

// Type declarations for renderer
declare global {
  interface Window {
    electronAPI: {
      worker: WorkerAPI
    }
  }
}
