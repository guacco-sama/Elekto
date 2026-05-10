declare global {
  interface AudioAPI {
    readAudioFile: (filePath: string) => Promise<ArrayBuffer>
  }

  interface WorkerAPI {
    sendCommand: (command: unknown) => void
    onResponse: (callback: (response: unknown) => void) => () => void
  }

  interface Window {
    electronAPI: {
      worker: WorkerAPI
      audio: AudioAPI
    }
  }
}

export {}
