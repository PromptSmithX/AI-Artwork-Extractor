import React from 'react'

export interface KbdProps {
  children: React.ReactNode
  className?: string
}

export const Kbd: React.FC<KbdProps> = ({ children, className = '' }) => {
  return (
    <kbd
      className={`app-kbd ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 5px',
        fontSize: '10px',
        fontFamily: 'var(--font-mono)',
        fontWeight: 500,
        color: 'var(--text-secondary)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-xs)',
        boxShadow: '0 1px 0 rgba(0,0,0,0.3)',
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {children}
    </kbd>
  )
}
