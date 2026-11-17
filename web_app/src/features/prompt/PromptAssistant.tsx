import React from 'react'
import type { ScopePreference } from '../../core/types'
import { ApiError } from '../../core/api/errors'
import { useAppStore } from '../../state/store'
import { Button } from '../../components/Button'
import { useToast } from '../../components/useToast'

export interface PromptAssistantProps {
  className?: string
  style?: React.CSSProperties
}

export const PromptAssistant: React.FC<PromptAssistantProps> = ({ className = '', style }) => {
  const image = useAppStore((s) => s.image)
  const userRequest = useAppStore((s) => s.userRequest)
  const setUserRequest = useAppStore((s) => s.setUserRequest)
  const scopePreference = useAppStore((s) => s.scopePreference)
  const setScopePreference = useAppStore((s) => s.setScopePreference)
  const suggestStatus = useAppStore((s) => s.suggestStatus)
  const askAssistant = useAppStore((s) => s.askAssistant)
  const health = useAppStore((s) => s.health)
  const { showToast, showApiErrorToast } = useToast()

  const isAvailable = health?.prompt_assistant_available ?? true
  const isLoading = suggestStatus === 'loading'

  const handleAsk = async () => {
    if (!image) {
      showToast({
        title: 'Chưa có ảnh',
        message: 'Vui lòng upload ảnh sản phẩm trước khi hỏi Qwen Assistant.',
        kind: 'warning',
      })
      return
    }

    if (!userRequest.trim()) {
      showToast({
        title: 'Chưa nhập mô tả',
        message: 'Vui lòng nhập yêu cầu của bạn bằng tiếng Việt.',
        kind: 'warning',
      })
      return
    }

    try {
      await askAssistant()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        showApiErrorToast(err.kind, err.detail || err.message)
      } else {
        showToast({
          title: 'Lỗi Prompt Assistant',
          message: err instanceof Error ? err.message : 'Không thể kết nối tới Qwen',
          kind: 'error',
        })
      }
    }
  }

  return (
    <div
      className={`app-prompt-assistant ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px',
        background: 'var(--bg-canvas)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: isAvailable ? 'var(--status-blue)' : 'var(--text-muted)',
            }}
          />
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            PROMPT ASSISTANT (QWEN-VL)
          </span>
        </div>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          {isAvailable ? 'Tiếng Việt → English SAM' : 'Tạm tắt'}
        </span>
      </div>

      {/* Textarea */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <textarea
          rows={3}
          value={userRequest}
          onChange={(e) => setUserRequest(e.target.value)}
          placeholder='Ví dụ: "Lấy toàn bộ patch vuông ở ngực áo, bao gồm viền vải thêu"'
          disabled={isLoading}
          style={{
            width: '100%',
            resize: 'vertical',
            fontSize: '12px',
            lineHeight: 1.4,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Scope Preference Select & Button */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <select
          value={scopePreference}
          onChange={(e) => setScopePreference(e.target.value as ScopePreference)}
          disabled={isLoading}
          style={{ flex: 1, fontSize: '11px', height: '28px' }}
        >
          <option value="auto">Phạm vi: Tự động (Auto)</option>
          <option value="entire_patch">Toàn bộ patch (gồm viền)</option>
          <option value="inner_artwork">Chỉ artwork bên trong</option>
          <option value="individual_decoration">Họa tiết độc lập</option>
        </select>

        <Button
          variant="secondary"
          size="sm"
          loading={isLoading}
          disabled={!image || !userRequest.trim()}
          onClick={handleAsk}
          icon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          }
        >
          Hỏi Qwen
        </Button>
      </div>
    </div>
  )
}
