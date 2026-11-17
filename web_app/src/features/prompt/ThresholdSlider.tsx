import React from 'react'
import { useAppStore } from '../../state/store'
import { Slider } from '../../components/Slider'

export interface ThresholdSliderProps {
  className?: string
  style?: React.CSSProperties
}

export const ThresholdSlider: React.FC<ThresholdSliderProps> = ({ className = '', style }) => {
  const threshold = useAppStore((s) => s.confidenceThreshold)
  const setThreshold = useAppStore((s) => s.setConfidenceThreshold)

  return (
    <Slider
      label="NGƯỠNG TỰ TIN (CONFIDENCE)"
      value={threshold}
      onChange={setThreshold}
      min={0.05}
      max={0.95}
      step={0.05}
      formatValue={(v) => `${(v * 100).toFixed(0)}%`}
      hint="Ngưỡng càng thấp cho ra nhiều candidate hơn; ngưỡng cao giữ mask sắc nét."
      className={className}
      style={style}
    />
  )
}
