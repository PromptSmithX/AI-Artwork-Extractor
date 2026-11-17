import React from 'react'
import type { Mode } from '../../core/types'
import { useAppStore } from '../../state/store'
import { SegmentedControl } from '../../components/SegmentedControl'

export interface ModeSelectorProps {
  className?: string
  style?: React.CSSProperties
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({ className = '', style }) => {
  const mode = useAppStore((s) => s.mode)
  const setMode = useAppStore((s) => s.setMode)

  return (
    <div
      className={`app-mode-selector ${className}`}
      style={{ display: 'flex', flexDirection: 'column', gap: '6px', ...style }}
    >
      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
        CHẾ ĐỘ TÁCH (MODE)
      </label>
      <SegmentedControl<Mode>
        value={mode}
        onChange={setMode}
        fullWidth
        options={[
          { value: 'text', label: 'Text (T)' },
          { value: 'box', label: 'Box (B)' },
          { value: 'text_box', label: 'Text + Box' },
        ]}
      />
    </div>
  )
}
