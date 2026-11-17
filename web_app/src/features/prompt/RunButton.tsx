import React, { useState, useEffect } from 'react'
import { ApiError } from '../../core/api/errors'
import { useAppStore } from '../../state/store'
import { Button } from '../../components/Button'
import { Kbd } from '../../components/Kbd'
import { useToast } from '../../components/useToast'

export interface RunButtonProps {
  className?: string
  style?: React.CSSProperties
}

export const RunButton: React.FC<RunButtonProps> = ({ className = '', style }) => {
  const image = useAppStore((s) => s.image)
  const mode = useAppStore((s) => s.mode)
  const box = useAppStore((s) => s.box)
  const prompt = useAppStore((s) => s.prompt)
  const segmentStatus = useAppStore((s) => s.segmentStatus)
  const segmentStartedAt = useAppStore((s) => s.segmentStartedAt)
  const runSegmentation = useAppStore((s) => s.runSegmentation)
  const cancelSegmentation = useAppStore((s) => s.cancelSegmentation)
  const { showToast, showApiErrorToast } = useToast()

  const [elapsedMs, setElapsedMs] = useState(0)
  const isLoading = segmentStatus === 'loading'

  // Elapsed timer while running
  useEffect(() => {
    if (!isLoading) return

    const start = segmentStartedAt || Date.now()
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - start)
    }, 100)

    return () => {
      clearInterval(timer)
      setElapsedMs(0)
    }
  }, [isLoading, segmentStartedAt])

  // Validation
  let disabledReason = ''
  if (!image) {
    disabledReason = 'Vui lòng upload ảnh sản phẩm'
  } else if ((mode === 'text' || mode === 'text_box') && !prompt.trim()) {
    disabledReason = 'Cần nhập prompt tiếng Anh'
  } else if ((mode === 'box' || mode === 'text_box') && !box) {
    disabledReason = 'Cần vẽ box trên canvas'
  }

  const handleRun = async () => {
    if (disabledReason) {
      showToast({
        title: 'Chưa đủ điều kiện chạy',
        message: disabledReason,
        kind: 'warning',
      })
      return
    }

    try {
      await runSegmentation()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        showApiErrorToast(err.kind, err.detail || err.message)
      } else {
        showToast({
          title: 'Lỗi bóc tách SAM 3',
          message: err instanceof Error ? err.message : 'Đã có lỗi xảy ra',
          kind: 'error',
        })
      }
    }
  }

  if (isLoading) {
    const seconds = (elapsedMs / 1000).toFixed(1)
    return (
      <div
        className={`app-run-button-loading ${className}`}
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          ...style,
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: 'var(--bg-surface-active)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          <span
            style={{
              width: 14,
              height: 14,
              border: '2px solid var(--accent-primary)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite',
            }}
          />
          <span>Đang bóc tách SAM 3...</span>
          <span className="tabular-nums" style={{ color: 'var(--status-amber)' }}>
            {seconds}s
          </span>
        </div>

        <Button variant="danger" size="lg" onClick={cancelSegmentation}>
          Hủy
        </Button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...style }}>
      <Button
        variant="primary"
        size="lg"
        disabled={Boolean(disabledReason)}
        onClick={handleRun}
        className={`app-run-button ${className}`}
        style={{
          width: '100%',
          padding: '12px 20px',
          fontSize: '13px',
          fontWeight: 600,
          boxShadow: disabledReason ? 'none' : '0 2px 10px rgba(99, 102, 241, 0.4)',
        }}
        icon={
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        }
      >
        <span>Chạy SAM 3</span>
        <div style={{ display: 'inline-flex', gap: '3px', marginLeft: '6px' }}>
          <Kbd>Ctrl</Kbd>
          <Kbd>Enter</Kbd>
        </div>
      </Button>

      {disabledReason && (
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
          {disabledReason}
        </span>
      )}
    </div>
  )
}
