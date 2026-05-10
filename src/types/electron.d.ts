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
