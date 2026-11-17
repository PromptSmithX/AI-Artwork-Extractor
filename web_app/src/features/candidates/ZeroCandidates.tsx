import React from 'react'

export interface ZeroCandidatesProps {
  className?: string
  style?: React.CSSProperties
}

export const ZeroCandidates: React.FC<ZeroCandidatesProps> = ({ className = '', style }) => {
  return (
    <div
      className={`app-zero-candidates ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '12px 18px',
        background: 'var(--bg-canvas)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        width: '100%',
        ...style,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'var(--status-amber-bg)',
          border: '1px solid var(--status-amber-border)',
          color: 'var(--status-amber)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: '14px',
          fontWeight: 'bold',
        }}
      >
        !
      </div>

      <div style={{ flex: 1, fontSize: '11px' }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
          0 candidate tìm thấy
        </div>
        <div style={{ color: 'var(--text-secondary)' }}>
          Thử các bước sau: <strong>1.</strong> Dùng cụm từ tiếng Anh ngắn gọn hơn · <strong>2.</strong> Chuyển sang chế độ Box và khoanh vùng đối tượng · <strong>3.</strong> Hạ ngưỡng tự tin (Confidence) xuống 0.20 – 0.25.
        </div>
      </div>
    </div>
  )
}
