import React from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: React.ReactNode
  loading?: boolean
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  children,
  className = '',
  disabled,
  style,
  ...props
}) => {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    borderRadius: 'var(--radius-sm)',
    fontWeight: 500,
    fontSize: size === 'sm' ? '11px' : size === 'lg' ? '14px' : '12px',
    padding:
      size === 'sm'
        ? '4px 8px'
        : size === 'lg'
        ? '10px 18px'
        : '6px 12px',
    transition: 'all var(--transition-fast)',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    ...style,
  }

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'var(--accent-primary)',
      color: 'var(--accent-contrast)',
      boxShadow: 'var(--shadow-sm)',
    },
    secondary: {
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      color: 'var(--text-primary)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-secondary)',
    },
    danger: {
      background: 'var(--status-red-bg)',
      border: '1px solid var(--status-red-border)',
      color: 'var(--status-red)',
    },
  }

  return (
    <button
      style={{ ...baseStyle, ...variantStyles[variant] }}
      className={`app-button variant-${variant} size-${size} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span
          style={{
            display: 'inline-block',
            width: size === 'sm' ? 12 : 14,
            height: size === 'sm' ? 12 : 14,
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
          }}
        />
      ) : (
        icon
      )}
      {children}
    </button>
  )
}
