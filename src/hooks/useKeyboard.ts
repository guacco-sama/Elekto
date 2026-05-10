import { useEffect } from 'react'

interface KeyboardShortcuts {
  onPlayPause?: () => void
  onStop?: () => void
  onSelectAll?: () => void
  onEscape?: () => void
  onArrowUp?: () => void
  onArrowDown?: () => void
  onArrowLeft?: () => void
  onArrowRight?: () => void
  onAnalyze?: () => void
  onSearchFocus?: () => void
  onTabSwitch?: (tab: string) => void
  enabled?: boolean
}

export function useKeyboard(shortcuts: KeyboardShortcuts) {
  useEffect(() => {
    if (shortcuts.enabled === false) return

    const handler = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // Allow Escape in inputs
        if (e.key === 'Escape' && shortcuts.onEscape) {
          shortcuts.onEscape()
          e.preventDefault()
        }
        return
      }

      switch (e.key) {
        case ' ':
          e.preventDefault()
          shortcuts.onPlayPause?.()
          break
        case 'Escape':
          shortcuts.onEscape?.()
          break
        case 'ArrowUp':
          e.preventDefault()
          shortcuts.onArrowUp?.()
          break
        case 'ArrowDown':
          e.preventDefault()
          shortcuts.onArrowDown?.()
          break
        case 'ArrowLeft':
          if (e.ctrlKey || e.metaKey) return
          e.preventDefault()
          shortcuts.onArrowLeft?.()
          break
        case 'ArrowRight':
          if (e.ctrlKey || e.metaKey) return
          e.preventDefault()
          shortcuts.onArrowRight?.()
          break
        case 'a':
          if ((e.ctrlKey || e.metaKey) && shortcuts.onSelectAll) {
            e.preventDefault()
            shortcuts.onSelectAll()
          }
          break
        case 'A':
          if (e.shiftKey && !e.ctrlKey && !e.metaKey && shortcuts.onAnalyze) {
            e.preventDefault()
            shortcuts.onAnalyze()
          }
          break
        case '/':
          shortcuts.onSearchFocus?.()
          break
        case '1':
          if (!e.ctrlKey && !e.metaKey) shortcuts.onTabSwitch?.('library')
          break
        case '2':
          if (!e.ctrlKey && !e.metaKey) shortcuts.onTabSwitch?.('scatter')
          break
        case '3':
          if (!e.ctrlKey && !e.metaKey) shortcuts.onTabSwitch?.('graph')
          break
        case '4':
          if (!e.ctrlKey && !e.metaKey) shortcuts.onTabSwitch?.('chapters')
          break
        case '5':
          if (!e.ctrlKey && !e.metaKey) shortcuts.onTabSwitch?.('settings')
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shortcuts])
}
