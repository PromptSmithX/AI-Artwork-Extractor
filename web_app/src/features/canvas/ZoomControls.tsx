import React from 'react'
import { Kbd } from '../../components/Kbd'

export interface ZoomControlsProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onReset100: () => void
  className?: string
  style?: React.CSSProperties
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset100,
  className = '',
  style,
}) => {
  const percent = Math.round(zoom * 100)

  return (
    <div
      className={`app-zoom-controls ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 6px',
        background: 'rgba(24, 25, 31, 0.85)',
        backdropFilter: 'blur(6px)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-sm)',
        boxShadow: 'var(--shadow-md)',
        color: 'var(--text-secondary)',
        fontSize: '11px',
        userSelect: 'none',
        ...style,
      }}
    >
      <button
        type="button"
        onClick={onZoomOut}
        title="Thu nhỏ (Ctrl -)"
        style={{
          padding: '2px 6px',
          borderRadius: 'var(--radius-xs)',
          color: 'var(--text-primary)',
          fontSize: '14px',
          fontWeight: 'bold',
          lineHeight: 1,
        }}
      >
        -
      </button>

      <button
        type="button"
        onClick={onReset100}
        title="Đặt lại 100%"
        className="tabular-nums"
        style={{
          padding: '2px 6px',
          borderRadius: 'var(--radius-xs)',
          color: 'var(--text-primary)',
          fontSize: '11px',
          minWidth: '40px',
          textAlign: 'center',
        }}
      >
        {percent}%
      </button>

      <button
        type="button"
        onClick={onZoomIn}
        title="Phóng to (Ctrl +)"
        style={{
          padding: '2px 6px',
          borderRadius: 'var(--radius-xs)',
          color: 'var(--text-primary)',
          fontSize: '14px',
          fontWeight: 'bold',
          lineHeight: 1,
        }}
      >
        +
      </button>

      <div style={{ width: '1px', height: '14px', background: 'var(--border-subtle)', margin: '0 2px' }} />

      <button
        type="button"
        onClick={onFit}
        title="Vừa khung nhìn (Phím F)"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 6px',
          borderRadius: 'var(--radius-xs)',
          color: 'var(--text-primary)',
          fontSize: '11px',
          cursor: 'pointer',
        }}
      >
        <span>Fit</span>
        <Kbd>F</Kbd>
      </button>
    </div>
  )
}
