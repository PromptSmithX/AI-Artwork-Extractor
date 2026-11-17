import React from 'react'
import { useAppStore } from '../../state/store'
import { safeIsLikelyNonEnglish } from './safePromptUtils'

export interface SamPromptInputProps {
  className?: string
  style?: React.CSSProperties
}

export const SamPromptInput: React.FC<SamPromptInputProps> = ({ className = '', style }) => {
  const prompt = useAppStore((s) => s.prompt)
  const setPrompt = useAppStore((s) => s.setPrompt)
  const mode = useAppStore((s) => s.mode)

  const isNonEnglish = safeIsLikelyNonEnglish(prompt)
  const isBoxOnly = mode === 'box'

  return (
    <div
      className={`app-sam-prompt-input ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        opacity: isBoxOnly ? 0.6 : 1,
        ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          SAM 3 TEXT PROMPT {isBoxOnly ? '(Không bắt buộc ở Box mode)' : '(Bắt buộc)'}
        </label>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          English only
        </span>
      </div>

      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={isBoxOnly ? 'Bỏ trống để tách theo Box hoặc nhập thêm mô tả' : 'Ví dụ: embroidered patch, logo, floral design'}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          borderColor: isNonEnglish ? 'var(--status-amber)' : undefined,
          background: 'var(--bg-canvas)',
          fontSize: '12px',
        }}
      />

      {isNonEnglish && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            color: 'var(--status-amber)',
            lineHeight: 1.3,
          }}
        >
          <span>⚠️</span>
          <span>
            SAM 3 chỉ hiểu tiếng Anh. Vui lòng dịch hoặc dùng cụm danh từ tiếng Anh (ví dụ: embroidered patch).
          </span>
        </div>
      )}
    </div>
  )
}
