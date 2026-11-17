import React from 'react'

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  tips?: string[]
  className?: string
  style?: React.CSSProperties
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  tips,
  className = '',
  style,
}) => {
  return (
    <div
      className={`app-empty-state ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '32px 24px',
        color: 'var(--text-secondary)',
        userSelect: 'none',
        ...style,
      }}
    >
      {icon && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
            marginBottom: '16px',
          }}
        >
          {icon}
        </div>
      )}
      <h4
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '6px',
        }}
      >
        {title}
      </h4>
      {description && (
        <p
          style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            maxWidth: '360px',
            marginBottom: tips || action ? '16px' : 0,
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}

      {tips && tips.length > 0 && (
        <div
          style={{
            textAlign: 'left',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px',
            marginBottom: action ? '16px' : 0,
            maxWidth: '340px',
            fontSize: '11px',
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Gợi ý khắc phục:
          </div>
          <ul style={{ paddingLeft: '16px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {tips.map((tip, idx) => (
              <li key={idx}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      {action && <div>{action}</div>}
    </div>
  )
}
