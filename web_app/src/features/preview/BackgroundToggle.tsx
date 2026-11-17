import React from 'react'
import { SegmentedControl } from '../../components/SegmentedControl'

export type PreviewBackground = 'checker' | 'dark' | 'light'

export interface BackgroundToggleProps {
  value: PreviewBackground
  onChange: (value: PreviewBackground) => void
  size?: 'sm' | 'md'
  className?: string
  style?: React.CSSProperties
}

export const BackgroundToggle: React.FC<BackgroundToggleProps> = ({
  value,
  onChange,
  size = 'sm',
  className = '',
  style,
}) => {
  return (
    <SegmentedControl<PreviewBackground>
      value={value}
      onChange={onChange}
      size={size}
      className={className}
      style={style}
      options={[
        { value: 'checker', label: 'Nền caro' },
        { value: 'dark', label: 'Nền tối' },
        { value: 'light', label: 'Nền sáng' },
      ]}
    />
  )
}
