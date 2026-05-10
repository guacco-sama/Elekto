import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'child_process'
import { join } from 'path'
import { readFile } from 'fs/promises'

let mainWindow: BrowserWindow | null
let workerProcess: ReturnType<typeof spawn> | null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#12121a',
      symbolColor: '#e8e8f8',
      height: 48,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Load Vite dev server in development, built files in production
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    if (workerProcess) {
      workerProcess.kill()
      workerProcess = null
    }
  })
}

function spawnWorker() {
  const isDev = !!process.env.VITE_DEV_SERVER_URL
  const workerPath = isDev
    ? join(__dirname, '../../worker/target/debug/djcuration-worker')
    : join(process.resourcesPath, 'djcuration-worker')

  workerProcess = spawn(workerPath, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })

  workerProcess.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().trim().split('\n')
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line)
          mainWindow?.webContents.send('worker-response', response)
        } catch (e) {
          console.log('[worker]', line)
        }
      }
    }
  })

  workerProcess.stderr?.on('data', (data: Buffer) => {
    console.error('[worker error]', data.toString())
  })

  workerProcess.on('exit', (code) => {
    console.log(`Worker exited with code ${code}`)
    workerProcess = null
  })
}

// IPC handlers
ipcMain.on('worker-command', (_, command: unknown) => {
  if (workerProcess?.stdin?.writable) {
    workerProcess.stdin.write(JSON.stringify(command) + '\n')
  }
})

ipcMain.handle('read-audio-file', async (_, filePath: string) => {
  const buffer = await readFile(filePath)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
})

app.whenReady().then(() => {
  createWindow()
  spawnWorker()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      spawnWorker()
    }
  })
})

app.on('window-all-closed', () => {
  if (workerProcess) {
    workerProcess.kill()
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
