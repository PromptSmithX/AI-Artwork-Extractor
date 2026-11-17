import React, { useState } from 'react'
import { useAppStore } from '../../state/store'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'

export interface ConnectionModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({ isOpen, onClose }) => {
  const connection = useAppStore((s) => s.connection)
  const health = useAppStore((s) => s.health)
  const healthStatus = useAppStore((s) => s.healthStatus)
  const healthError = useAppStore((s) => s.healthError)
  const setConnection = useAppStore((s) => s.setConnection)
  const checkHealth = useAppStore((s) => s.checkHealth)

  const [baseUrl, setBaseUrl] = useState(connection.baseUrl)
  const [token, setToken] = useState(connection.token)
  const [showToken, setShowToken] = useState(false)
  const [isTesting, setIsTesting] = useState(false)

  const handleSaveAndTest = async () => {
    setConnection({ baseUrl: baseUrl.trim(), token: token.trim() })
    setIsTesting(true)
    try {
      await checkHealth()
    } finally {
      setIsTesting(false)
    }
  }

  const isConnected = healthStatus === 'success' && health !== null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cài đặt kết nối Colab API" maxWidth="520px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Nhập địa chỉ Cloudflare Quick Tunnel từ Colab notebook để kết nối model SAM 3 và Prompt Assistant.
        </p>

        {/* Base URL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            COLAB API URL (Cloudflare Tunnel)
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://random-words.trycloudflare.com"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Tunnel Colab đã đổi URL? Dán URL mới vào đây và bấm Kiểm tra kết nối.
          </span>
        </div>

        {/* API Bearer Token */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            API BEARER TOKEN
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Nhập secret token từ notebook"
              style={{ width: '100%', paddingRight: '40px', boxSizing: 'border-box' }}
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              style={{
                position: 'absolute',
                right: '8px',
                padding: '4px',
                color: 'var(--text-muted)',
                fontSize: '11px',
                cursor: 'pointer',
              }}
              title={showToken ? 'Ẩn token' : 'Hiện token'}
            >
              {showToken ? 'Ẩn' : 'Hiện'}
            </button>
          </div>
        </div>

        {/* Status card */}
        <div
          style={{
            background: 'var(--bg-canvas)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Trạng thái:</span>
            <span
              style={{
                fontWeight: 600,
                color: isConnected
                  ? 'var(--status-green)'
                  : healthStatus === 'error'
                  ? 'var(--status-red)'
                  : 'var(--text-muted)',
              }}
            >
              {isConnected ? 'Đã kết nối' : healthStatus === 'error' ? 'Mất kết nối' : 'Chưa kết nối'}
            </span>
          </div>

          {health && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              <div>GPU: <strong style={{ color: 'var(--text-primary)' }}>{health.gpu || 'Không phát hiện'}</strong></div>
              <div>SAM 3: <strong style={{ color: health.sam3_loaded ? 'var(--status-green)' : 'var(--status-amber)' }}>{health.sam3_loaded ? 'Đã tải vào VRAM' : 'Chưa tải'}</strong></div>
              <div>Qwen Assistant: <strong style={{ color: health.prompt_assistant_available ? 'var(--status-green)' : 'var(--text-muted)' }}>{health.prompt_assistant_available ? 'Sẵn sàng' : 'Không khả dụng'}</strong></div>
              <div>Server busy: <strong style={{ color: health.busy ? 'var(--status-amber)' : 'var(--status-green)' }}>{health.busy ? 'Có' : 'Không'}</strong></div>
            </div>
          )}

          {healthError && (
            <div style={{ marginTop: '8px', color: 'var(--status-red)', fontSize: '11px' }}>
              {healthError.detail || 'Không thể gửi request tới URL chỉ định'}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button variant="primary" loading={isTesting} onClick={handleSaveAndTest}>
            Lưu &amp; Kiểm tra kết nối
          </Button>
        </div>
      </div>
    </Modal>
  )
}
