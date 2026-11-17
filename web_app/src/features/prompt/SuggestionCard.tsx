import React from 'react'
import type { Scope } from '../../core/types'
import { useAppStore } from '../../state/store'

export interface SuggestionCardProps {
  className?: string
  style?: React.CSSProperties
}

const scopeLabels: Record<Scope, { label: string; bg: string; color: string; border: string }> = {
  entire_patch: {
    label: 'Toàn bộ patch',
    bg: 'rgba(56, 189, 248, 0.15)',
    color: '#38bdf8',
    border: 'rgba(56, 189, 248, 0.35)',
  },
  inner_artwork: {
    label: 'Artwork bên trong',
    bg: 'rgba(192, 132, 252, 0.15)',
    color: '#c084fc',
    border: 'rgba(192, 132, 252, 0.35)',
  },
  individual_decoration: {
    label: 'Họa tiết độc lập',
    bg: 'rgba(16, 185, 129, 0.15)',
    color: '#10b981',
    border: 'rgba(16, 185, 129, 0.35)',
  },
  unknown: {
    label: 'Chưa rõ phạm vi',
    bg: 'rgba(245, 158, 11, 0.15)',
    color: '#f59e0b',
    border: 'rgba(245, 158, 11, 0.35)',
  },
}

export const SuggestionCard: React.FC<SuggestionCardProps> = ({ className = '', style }) => {
  const suggestion = useAppStore((s) => s.suggestion)
  const applyPrompt = useAppStore((s) => s.usePrompt)
  const currentPrompt = useAppStore((s) => s.prompt)

  if (!suggestion) return null

  const scopeConfig = scopeLabels[suggestion.scope] || scopeLabels.unknown

  return (
    <div
      className={`app-suggestion-card ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        fontSize: '12px',
        animation: 'fadeIn 0.2s ease-out',
        ...style,
      }}
    >
      {/* Scope Badge & Location */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            fontSize: '10px',
            fontWeight: 600,
            background: scopeConfig.bg,
            color: scopeConfig.color,
            border: `1px solid ${scopeConfig.border}`,
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
          }}
        >
          {scopeConfig.label}
        </span>

        {suggestion.location_hint && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            📍 {suggestion.location_hint}
          </span>
        )}
      </div>

      {/* Target Description */}
      <div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
          Đối tượng phát hiện:
        </div>
        <div style={{ fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.4 }}>
          {suggestion.target_description}
        </div>
      </div>

      {/* Reason */}
      {suggestion.reason && (
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.35 }}>
          “{suggestion.reason}”
        </div>
      )}

      {/* Clarification Warning if needed */}
      {suggestion.needs_clarification && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '6px',
            padding: '8px',
            background: 'var(--status-amber-bg)',
            border: '1px solid var(--status-amber-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--status-amber)',
            fontSize: '11px',
          }}
        >
          <span style={{ fontWeight: 'bold' }}>⚠️</span>
          <span>
            {suggestion.clarification_question || 'Yêu cầu còn mơ hồ, vui lòng vẽ thêm khung Box hoặc mô tả chi tiết hơn.'}
          </span>
        </div>
      )}

      {/* Alternative Prompts Chips */}
      {suggestion.alternative_prompts && suggestion.alternative_prompts.length > 0 && (
        <div style={{ marginTop: '4px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
            Prompt thay thế (Click để dùng):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {/* Primary prompt as chip */}
            <button
              type="button"
              onClick={() => applyPrompt(suggestion.sam_prompt)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                background:
                  currentPrompt === suggestion.sam_prompt
                    ? 'var(--accent-primary)'
                    : 'var(--bg-canvas)',
                color:
                  currentPrompt === suggestion.sam_prompt
                    ? 'var(--accent-contrast)'
                    : 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              ★ {suggestion.sam_prompt}
            </button>

            {/* Alternatives */}
            {suggestion.alternative_prompts.map((alt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => applyPrompt(alt)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11px',
                  background:
                    currentPrompt === alt
                      ? 'var(--accent-primary)'
                      : 'var(--bg-canvas)',
                  color:
                    currentPrompt === alt
                      ? 'var(--accent-contrast)'
                      : 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
              >
                {alt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Kept Prompt Hint when prompt differs from suggestion */}
      {suggestion.sam_prompt !== currentPrompt && (
        <div
          className="app-suggestion-kept-hint"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 8px',
            background: 'var(--bg-canvas)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            marginTop: '2px',
          }}
        >
          <span style={{ fontSize: '12px' }}>💡</span>
          <span>Prompt hiện tại được giữ nguyên — bấm ★ để dùng gợi ý</span>
        </div>
      )}
    </div>
  )
}
