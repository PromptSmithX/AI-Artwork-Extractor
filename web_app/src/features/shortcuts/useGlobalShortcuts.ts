import { useEffect } from 'react'
import { useAppStore } from '../../state/store'

export interface GlobalShortcutsProps {
  onOpenShortcuts: () => void
}

export function useGlobalShortcuts({ onOpenShortcuts }: GlobalShortcutsProps) {
  const setMode = useAppStore((s) => s.setMode)
  const runSegmentation = useAppStore((s) => s.runSegmentation)
  const segmentStatus = useAppStore((s) => s.segmentStatus)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in text fields
      const target = e.target as HTMLElement | null
      const isInput = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)

      // Ctrl + Enter or Cmd + Enter to run SAM 3
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        if (segmentStatus !== 'loading') {
          runSegmentation().catch(() => {})
        }
        return
      }

      if (isInput) return

      // Single-key shortcuts
      switch (e.key) {
        case 'r':
        case 'R':
          e.preventDefault()
          if (segmentStatus !== 'loading') {
            runSegmentation().catch(() => {})
          }
          break

        case 'b':
        case 'B':
          e.preventDefault()
          setMode('box')
          break

        case 't':
        case 'T':
          e.preventDefault()
          setMode('text')
          break

        case '?':
          e.preventDefault()
          onOpenShortcuts()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setMode, runSegmentation, segmentStatus, onOpenShortcuts])
}
