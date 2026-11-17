import React, { useState, useCallback } from 'react'
import type { ApiErrorKind } from '../core/api/errors'
import { ToastContext, formatApiErrorMessage, type ToastItem } from './useToast'

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    ({ title, message, kind = 'info', durationMs = 5000 }: Omit<ToastItem, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setToasts((prev) => [...prev, { id, title, message, kind, durationMs }])
      if (durationMs > 0) {
        setTimeout(() => {
          removeToast(id)
        }, durationMs)
      }
    },
    [removeToast],
  )

  const showApiErrorToast = useCallback(
    (kind: ApiErrorKind, detail?: string) => {
      showToast({
        title: 'Lỗi',
        message: formatApiErrorMessage(kind, detail),
        kind: 'error',
        durationMs: 7000,
      })
    },
    [showToast],
  )

  return (
    <ToastContext.Provider value={{ toasts, showToast, showApiErrorToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  )
}

export const ToastContainer: React.FC<{
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxWidth: '400px',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const isError = toast.kind === 'error'
        const isWarning = toast.kind === 'warning'
        const isSuccess = toast.kind === 'success'

        const borderColor = isError
          ? 'var(--status-red-border)'
          : isWarning
          ? 'var(--status-amber-border)'
          : isSuccess
          ? 'var(--status-green-border)'
          : 'var(--border-default)'

        const bg = isError
          ? 'var(--status-red-bg)'
          : isWarning
          ? 'var(--status-amber-bg)'
          : isSuccess
          ? 'var(--status-green-bg)'
          : 'var(--bg-surface)'

        const accent = isError
          ? 'var(--status-red)'
          : isWarning
          ? 'var(--status-amber)'
          : isSuccess
          ? 'var(--status-green)'
          : 'var(--accent-primary)'

        return (
          <div
            key={toast.id}
            role="alert"
            style={{
              pointerEvents: 'auto',
              background: bg,
              border: `1px solid ${borderColor}`,
              borderLeft: `4px solid ${accent}`,
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '12px',
              color: 'var(--text-primary)',
              animation: 'fadeIn 0.15s ease-out',
            }}
          >
            <div style={{ flex: 1 }}>
              {toast.title && (
                <div style={{ fontWeight: 600, marginBottom: '2px', color: accent }}>
                  {toast.title}
                </div>
              )}
              <div style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>
                {toast.message}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Đóng"
              style={{
                color: 'var(--text-muted)',
                padding: '2px',
                borderRadius: 'var(--radius-xs)',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
