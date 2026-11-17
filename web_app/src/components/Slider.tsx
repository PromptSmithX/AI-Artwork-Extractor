import React from 'react'

export interface SliderProps {
  label?: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  formatValue?: (val: number) => string
  hint?: string
  className?: string
  style?: React.CSSProperties
}

export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
  formatValue = (v) => v.toFixed(2),
  hint,
  className = '',
  style,
}) => {
  const percentage = Math.round(((value - min) / (max - min)) * 100)

  return (
    <div
      className={`app-slider-container ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        userSelect: 'none',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
        }}
      >
        {label && (
          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
            {label}
          </span>
        )}
        <span
          className="tabular-nums"
          style={{
            color: 'var(--text-primary)',
            background: 'var(--bg-canvas)',
            padding: '1px 6px',
            borderRadius: 'var(--radius-xs)',
            border: '1px solid var(--border-subtle)',
            fontSize: '11px',
          }}
        >
          {formatValue(value)}
        </span>
      </div>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{
            width: '100%',
            height: '6px',
            borderRadius: 'var(--radius-full)',
            background: `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${percentage}%, var(--bg-surface-active) ${percentage}%, var(--bg-surface-active) 100%)`,
            appearance: 'none',
            outline: 'none',
            cursor: 'pointer',
          }}
        />
      </div>

      {hint && (
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          {hint}
        </span>
      )}
    </div>
  )
}
