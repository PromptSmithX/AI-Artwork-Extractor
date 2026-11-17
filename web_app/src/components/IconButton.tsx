import React from 'react'

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode
  label: string
  active?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  label,
  active = false,
  size = 'md',
  className = '',
  style,
  ...props
}) => {
  const dim = size === 'sm' ? 24 : size === 'lg' ? 36 : 28

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`app-icon-button ${active ? 'active' : ''} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: dim,
        height: dim,
        borderRadius: 'var(--radius-sm)',
        background: active ? 'var(--bg-surface-active)' : 'transparent',
        border: active ? '1px solid var(--border-default)' : '1px solid transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        transition: 'all var(--transition-fast)',
        flexShrink: 0,
        ...style,
      }}
      {...props}
    >
      {icon}
    </button>
  )
}
