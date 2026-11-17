import React from 'react'
import { useAppStore } from '../../state/store'
import { Button } from '../../components/Button'

export interface ImageInfoProps {
  className?: string
  style?: React.CSSProperties
}

export const ImageInfo: React.FC<ImageInfoProps> = ({ className = '', style }) => {
  const image = useAppStore((s) => s.image)
  const clearImage = useAppStore((s) => s.clearImage)

  if (!image) return null

  const sizeKb = Math.round(image.file.size / 1024)
  const sizeMb = (image.file.size / (1024 * 1024)).toFixed(1)
  const displaySize = image.file.size > 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`

  // Aspect ratio calculation
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const divisor = gcd(image.naturalWidth, image.naturalHeight)
  const ratioW = Math.round(image.naturalWidth / divisor)
  const ratioH = Math.round(image.naturalHeight / divisor)
  const ratioStr = ratioW < 20 && ratioH < 20 ? `${ratioW}:${ratioH}` : (image.naturalWidth / image.naturalHeight).toFixed(2)

  return (
    <div
      className={`app-image-info ${className}`}
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
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={image.url}
            alt={image.file.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            title={image.file.name}
            style={{
              fontWeight: 600,
              fontSize: '12px',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginBottom: '2px',
            }}
          >
            {image.file.name}
          </div>
          <div
            className="tabular-nums"
            style={{ fontSize: '11px', color: 'var(--text-secondary)' }}
          >
            {image.naturalWidth} × {image.naturalHeight} px ({ratioStr})
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {displaySize} · {image.file.type.replace('image/', '').toUpperCase()}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
        <Button variant="danger" size="sm" onClick={clearImage}>
          Đổi ảnh khác
        </Button>
      </div>
    </div>
  )
}
