declare global {
  interface AudioAPI {
    readAudioFile: (filePath: string) => Promise<ArrayBuffer>
  }

  interface WorkerAPI {
    sendCommand: (command: unknown) => void
    onResponse: (callback: (response: unknown) => void) => () => void
  }

  interface DialogAPI {
    selectFolder: () => Promise<{ canceled: boolean; filePaths: string[] }>
    saveFile: (opts: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<{ canceled: boolean; filePath: string }>
    selectDirectory: (opts: { title?: string; defaultPath?: string; buttonLabel?: string }) => Promise<{ canceled: boolean; filePaths: string[] }>
  }

  interface Window {
    electronAPI: {
      worker: WorkerAPI
      audio: AudioAPI
      dialog: DialogAPI
    }
  }
}

export {}
