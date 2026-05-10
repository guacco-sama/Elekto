import { useCallback, useEffect, useRef, useState } from 'react'

interface WorkerCommand {
  id: string
  type: string
  [key: string]: unknown
}

interface WorkerResponse {
  type: string
  id?: string
  [key: string]: unknown
}

type ResponseHandler = (response: WorkerResponse) => void

export function useWorker() {
  const [isReady, setIsReady] = useState(false)
  const handlersRef = useRef<Map<string, ResponseHandler>>(new Map())
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      console.warn('Electron API not available')
      return
    }

    const unsubscribe = window.electronAPI.worker.onResponse((response: unknown) => {
      const resp = response as WorkerResponse
      if (resp.id && handlersRef.current.has(resp.id)) {
        const handler = handlersRef.current.get(resp.id)
        handler?.(resp)
        handlersRef.current.delete(resp.id)
      }
    })

    cleanupRef.current = unsubscribe
    setIsReady(true)

    // Ping worker to verify connection
    sendCommand({ id: 'ping-init', type: 'ping' })

    return () => {
      unsubscribe?.()
    }
  }, [])

  const sendCommand = useCallback((command: WorkerCommand) => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.worker.sendCommand(command)
    }
  }, [])

  const sendCommandAsync = useCallback(<T extends WorkerResponse>(
    command: Omit<WorkerCommand, 'id'>
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const timeout = setTimeout(() => {
        handlersRef.current.delete(id)
        reject(new Error(`Worker command timeout: ${command.type}`))
      }, 30000)

      handlersRef.current.set(id, (response) => {
        clearTimeout(timeout)
        if (response.type === 'error') {
          reject(new Error((response as unknown as { message: string }).message))
        } else {
          resolve(response as T)
        }
      })

      sendCommand({ ...command, id } as WorkerCommand)
    })
  }, [sendCommand])

  return { isReady, sendCommand, sendCommandAsync }
}
