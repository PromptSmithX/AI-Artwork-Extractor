import React from 'react'
import { useAppStore } from '../../state/store'
import { Spinner } from '../../components/Spinner'

export interface ConnectionStatusProps {
  onOpenSettings: () => void
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ onOpenSettings }) => {
  const health = useAppStore((s) => s.health)
  const healthStatus = useAppStore((s) => s.healthStatus)
  const segmentStatus = useAppStore((s) => s.segmentStatus)

  const isBusy = health?.busy || segmentStatus === 'loading'
  const isConnected = healthStatus === 'success' && health !== null
  const isError = healthStatus === 'error'
  const isLoading = healthStatus === 'loading'

  let statusBg = 'var(--bg-surface)'
  let statusBorder = 'var(--border-default)'
  let statusColor = 'var(--text-secondary)'
  let dotColor = 'var(--text-muted)'
  let label = 'Chưa kết nối'

  if (isLoading) {
    statusColor = 'var(--status-amber)'
    dotColor = 'var(--status-amber)'
    label = 'Đang kiểm tra...'
  } else if (isBusy) {
    statusBg = 'var(--status-amber-bg)'
    statusBorder = 'var(--status-amber-border)'
    statusColor = 'var(--status-amber)'
    dotColor = 'var(--status-amber)'
    label = 'Server bận'
  } else if (isConnected) {
    statusBg = 'var(--status-green-bg)'
    statusBorder = 'var(--status-green-border)'
    statusColor = 'var(--status-green)'
    dotColor = 'var(--status-green)'
    label = health.gpu ? `${health.gpu}` : 'Đã kết nối'
  } else if (isError) {
    statusBg = 'var(--status-red-bg)'
    statusBorder = 'var(--status-red-border)'
    statusColor = 'var(--status-red)'
    dotColor = 'var(--status-red)'
    label = 'Mất kết nối'
  }

  return (
    <button
      type="button"
      onClick={onOpenSettings}
      title="Cài đặt kết nối Colab API"
      aria-label="Cài đặt kết nối API"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 10px',
        borderRadius: 'var(--radius-full)',
        background: statusBg,
        border: `1px solid ${statusBorder}`,
        color: statusColor,
        fontSize: '11px',
        fontWeight: 500,
        transition: 'all var(--transition-fast)',
        cursor: 'pointer',
      }}
    >
      {isLoading ? (
        <Spinner size={10} color={dotColor} />
      ) : (
        <span
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: dotColor,
            boxShadow: isConnected ? `0 0 6px ${dotColor}` : 'none',
          }}
        />
      )}
      <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {isConnected && (
        <div style={{ display: 'flex', gap: '3px', alignItems: 'center', opacity: 0.75 }}>
          <span
            title={health.sam3_loaded ? 'SAM 3 đã sẵn sàng' : 'SAM 3 chưa nạp'}
            style={{
              padding: '1px 4px',
              borderRadius: '2px',
              background: health.sam3_loaded ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.1)',
              fontSize: '9px',
              fontWeight: 600,
            }}
          >
            SAM
          </span>
          <span
            title={health.qwen_loaded ? 'Qwen đã nạp' : 'Qwen chưa nạp'}
            style={{
              padding: '1px 4px',
              borderRadius: '2px',
              background: health.qwen_loaded ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.1)',
              fontSize: '9px',
              fontWeight: 600,
            }}
          >
            QWEN
          </span>
        </div>
      )}
    </button>
  )
}
