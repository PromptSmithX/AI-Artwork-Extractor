import React, { useState } from 'react'

export interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
}) => {
  const [visible, setVisible] = useState(false)

  const posStyles: Record<string, React.CSSProperties> = {
    top: {
      bottom: 'calc(100% + 6px)',
      left: '50%',
      transform: 'translateX(-50%)',
    },
    bottom: {
      top: 'calc(100% + 6px)',
      left: '50%',
      transform: 'translateX(-50%)',
    },
    left: {
      right: 'calc(100% + 6px)',
      top: '50%',
      transform: 'translateY(-50%)',
    },
    right: {
      left: 'calc(100% + 6px)',
      top: '50%',
      transform: 'translateY(-50%)',
    },
  }

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && content && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            zIndex: 1000,
            background: 'var(--bg-surface-active)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            padding: '4px 8px',
            fontSize: '11px',
            borderRadius: 'var(--radius-xs)',
            whiteSpace: 'nowrap',
            boxShadow: 'var(--shadow-md)',
            pointerEvents: 'none',
            animation: 'fadeIn 0.1s ease',
            ...posStyles[position],
          }}
        >
          {content}
        </div>
      )}
    </div>
  )
}
