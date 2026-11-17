import React from 'react'

export interface SpinnerProps {
  size?: number
  color?: string
  className?: string
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 16,
  color = 'currentColor',
  className = '',
}) => {
  return (
    <svg
      className={`app-spinner ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        animation: 'spin 0.75s linear infinite',
        display: 'inline-block',
        verticalAlign: 'middle',
      }}
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  )
}
