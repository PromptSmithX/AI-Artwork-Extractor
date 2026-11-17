import React, { useId } from 'react'

export interface SegmentOption<T extends string = string> {
  value: T
  label: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string = string> {
  name?: string
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  fullWidth?: boolean
  className?: string
  style?: React.CSSProperties
}

export function SegmentedControl<T extends string = string>({
  name: nameProp,
  options,
  value,
  onChange,
  size = 'md',
  fullWidth = false,
  className = '',
  style,
}: SegmentedControlProps<T>) {
  const generatedId = useId()
  const groupName = nameProp || `segmented-${generatedId}`

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
          <label
            key={opt.value}
            className={`app-segmented-pill ${isSelected ? 'selected' : ''}`}
            style={{
              flex: fullWidth ? 1 : 'none',
              position: 'relative',
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
            <input
              type="radio"
              name={groupName}
              value={opt.value}
              checked={isSelected}
              aria-checked={isSelected}
              disabled={opt.disabled}
              onChange={() => onChange(opt.value)}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                margin: 0,
                padding: 0,
                cursor: opt.disabled ? 'not-allowed' : 'pointer',
                zIndex: 1,
              }}
            />
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                pointerEvents: 'none',
                position: 'relative',
                zIndex: 0,
              }}
            >
              {opt.icon && (
                <span style={{ display: 'flex', opacity: isSelected ? 1 : 0.7 }}>
                  {opt.icon}
                </span>
              )}
              {opt.label}
            </span>
          </label>
        )
      })}
    </div>
  )
}
