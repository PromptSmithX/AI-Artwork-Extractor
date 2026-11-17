import React from 'react'

export interface SegmentOption<T extends string = string> {
  value: T
  label: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  fullWidth?: boolean
  className?: string
  style?: React.CSSProperties
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  size = 'md',
  fullWidth = false,
  className = '',
  style,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      className={`app-segmented-control ${className}`}
      style={{
        display: fullWidth ? 'flex' : 'inline-flex',
        alignItems: 'center',
        background: 'var(--bg-canvas)',
        padding: '2px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        userSelect: 'none',
        ...style,
      }}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            style={{
              flex: fullWidth ? 1 : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: size === 'sm' ? '3px 8px' : '5px 12px',
              fontSize: size === 'sm' ? '11px' : '12px',
              fontWeight: isSelected ? 600 : 400,
              color: isSelected
                ? 'var(--text-primary)'
                : opt.disabled
                ? 'var(--text-muted)'
                : 'var(--text-secondary)',
              background: isSelected ? 'var(--bg-surface)' : 'transparent',
              borderRadius: 'var(--radius-xs)',
              boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
              border: isSelected ? '1px solid var(--border-default)' : '1px solid transparent',
              transition: 'all var(--transition-fast)',
              cursor: opt.disabled ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.icon && (
              <span style={{ display: 'flex', opacity: isSelected ? 1 : 0.7 }}>
                {opt.icon}
              </span>
            )}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
