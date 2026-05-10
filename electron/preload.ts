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
}

contextBridge.exposeInMainWorld('electronAPI', {
  worker: workerAPI,
  audio: audioAPI,
  dialog: dialogAPI,
})
