import { contextBridge, ipcRenderer } from 'electron'

export interface WorkerAPI {
  sendCommand: (command: unknown) => void
  onResponse: (callback: (response: unknown) => void) => () => void
}

export interface AudioAPI {
  readAudioFile: (filePath: string) => Promise<ArrayBuffer>
}

export interface DialogAPI {
  selectFolder: () => Promise<{ canceled: boolean; filePaths: string[] }>
  saveFile: (opts: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<{ canceled: boolean; filePath: string }>
  selectDirectory: (opts: { title?: string; defaultPath?: string; buttonLabel?: string }) => Promise<{ canceled: boolean; filePaths: string[] }>
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

const audioAPI: AudioAPI = {
  readAudioFile: (filePath: string) =>
    ipcRenderer.invoke('read-audio-file', filePath),
}

const dialogAPI: DialogAPI = {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  saveFile: (opts) => ipcRenderer.invoke('save-file', opts),
  selectDirectory: (opts) => ipcRenderer.invoke('select-directory', opts),
}

contextBridge.exposeInMainWorld('electronAPI', {
  worker: workerAPI,
  audio: audioAPI,
  dialog: dialogAPI,
})
