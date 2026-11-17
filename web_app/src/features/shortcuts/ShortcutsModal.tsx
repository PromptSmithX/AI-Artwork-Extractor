import React from 'react'
import { Modal } from '../../components/Modal'
import { Kbd } from '../../components/Kbd'

export interface ShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const shortcuts = [
    { keys: [<Kbd key="r">R</Kbd>, <span key="or">hoặc</span>, <Kbd key="ctrl">Ctrl</Kbd>, <Kbd key="enter">Enter</Kbd>], desc: 'Chạy bóc tách SAM 3' },
    { keys: [<Kbd key="b">B</Kbd>], desc: 'Chuyển sang chế độ vẽ Box (Box mode)' },
    { keys: [<Kbd key="t">T</Kbd>], desc: 'Chuyển sang chế độ nhập Text (Text mode)' },
    { keys: [<Kbd key="esc">Esc</Kbd>, <span key="or2">/</span>, <Kbd key="del">Delete</Kbd>], desc: 'Xóa khung Box đang vẽ trên Canvas' },
    { keys: [<Kbd key="left">←</Kbd>, <Kbd key="right">→</Kbd>], desc: 'Duyệt chuyển đổi giữa các Mask Candidate' },
    { keys: [<Kbd key="f">F</Kbd>], desc: 'Fit ảnh vừa vặn khung nhìn Canvas' },
    { keys: [<Kbd key="space">Space</Kbd>, <span key="plus">+</span>, <span key="drag">Kéo chuột</span>], desc: 'Di chuyển Canvas (Pan)' },
    { keys: [<Kbd key="q">?</Kbd>], desc: 'Mở bảng phím tắt này' },
  ]

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bảng phím tắt (Keyboard Shortcuts)" maxWidth="480px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          Các phím tắt hỗ trợ thao tác nhanh cho designer trong quá trình kiểm tra và tách artwork:
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            background: 'var(--bg-canvas)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px',
          }}
        >
          {shortcuts.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 0',
                borderBottom: idx < shortcuts.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                {item.desc}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {item.keys}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
