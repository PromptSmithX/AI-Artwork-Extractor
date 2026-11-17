import React from 'react'

export interface PanelProps {
  title?: string
  subtitle?: string
  icon?: React.ReactNode
  badge?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  bodyStyle?: React.CSSProperties
  noPadding?: boolean
}

export const Panel: React.FC<PanelProps> = ({
  title,
  subtitle,
  icon,
  badge,
  actions,
  children,
  className = '',
  style,
  bodyStyle,
  noPadding = false,
}) => {
  return (
    <section
      className={`app-panel ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-panel)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {(title || actions || icon) && (
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: 'var(--bg-panel-header)',
            borderBottom: '1px solid var(--border-subtle)',
            minHeight: '36px',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            {icon && (
              <span style={{ color: 'var(--text-secondary)', display: 'flex', flexShrink: 0 }}>
                {icon}
              </span>
            )}
            {title && (
              <span
                style={{
                  fontWeight: 600,
                  fontSize: '11px',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {title}
              </span>
            )}
            {subtitle && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {subtitle}
              </span>
            )}
            {badge}
          </div>
          {actions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              {actions}
            </div>
          )}
        </header>
      )}
      <div
        style={{
          flex: 1,
          padding: noPadding ? 0 : '12px',
          overflowY: 'auto',
          minHeight: 0,
          ...bodyStyle,
        }}
      >
        {children}
      </div>
    </section>
  )
}
