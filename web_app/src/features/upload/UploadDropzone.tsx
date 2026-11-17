import React, { useRef, useState, useEffect } from 'react'
import { useAppStore } from '../../state/store'
import { useToast } from '../../components/useToast'
import { Spinner } from '../../components/Spinner'

export interface UploadDropzoneProps {
  className?: string
  style?: React.CSSProperties
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({ className = '', style }) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const loadImage = useAppStore((s) => s.loadImage)
  const imageStatus = useAppStore((s) => s.imageStatus)
  const imageError = useAppStore((s) => s.imageError)
  const { showToast } = useToast()

  // Display error toast when image loading fails
  useEffect(() => {
    if (imageError) {
      showToast({
        title: 'Lỗi tải ảnh',
        message: imageError,
        kind: 'error',
      })
    }
  }, [imageError, showToast])

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      showToast({
        title: 'Định dạng không hỗ trợ',
        message: 'Vui lòng chọn file JPG, PNG hoặc WebP.',
        kind: 'error',
      })
      return
    }

    // Validate size (20 MB limit)
    const maxMb = 20
    if (file.size > maxMb * 1024 * 1024) {
      showToast({
        title: 'File quá lớn',
        message: `Kích thước ảnh vượt quá giới hạn ${maxMb}MB.`,
        kind: 'error',
      })
      return
    }

    try {
      await loadImage(file)
    } catch (err: unknown) {
      showToast({
        title: 'Lỗi tải ảnh',
        message: err instanceof Error ? err.message : 'Không thể đọc file ảnh',
        kind: 'error',
      })
    }
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`app-upload-dropzone ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        border: `1.5px dashed ${isDragOver ? 'var(--accent-primary)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)',
        background: isDragOver ? 'var(--accent-subtle)' : 'var(--bg-canvas)',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
        textAlign: 'center',
        userSelect: 'none',
        ...style,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isDragOver ? 'var(--accent-primary)' : 'var(--text-secondary)',
          marginBottom: '10px',
        }}
      >
        {imageStatus === 'loading' ? (
          <Spinner size={20} />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        )}
      </div>

      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
        {imageStatus === 'loading' ? 'Đang đọc kích thước ảnh...' : 'Kéo thả hoặc chọn ảnh sản phẩm'}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        JPG, PNG, WebP tối đa 20MB
      </div>
    </div>
  )
}
