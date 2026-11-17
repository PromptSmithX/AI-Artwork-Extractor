import React, { useState, useRef } from 'react'

export interface CompareSliderProps {
  originalUrl: string
  cutoutUrl: string
  backgroundClass?: string
  backgroundStyle?: React.CSSProperties
  className?: string
  style?: React.CSSProperties
}

export const CompareSlider: React.FC<CompareSliderProps> = ({
  originalUrl,
  cutoutUrl,
  backgroundClass = 'checkerboard-pattern',
  backgroundStyle,
  className = '',
  style,
}) => {
  const [sliderPos, setSliderPos] = useState(50) // percentage 0 - 100
  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true
    updatePosition(e.clientX)
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      updatePosition(e.clientX)
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false
    try {
      ;(e.target as Element).releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const updatePosition = (clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100))
    setSliderPos(percent)
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`app-compare-slider ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '320px',
        maxHeight: '520px',
        overflow: 'hidden',
        userSelect: 'none',
        cursor: 'ew-resize',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-default)',
        ...style,
      }}
    >
      {/* Background Layer: Cutout with chosen background */}
      <div
        className={backgroundClass}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...backgroundStyle,
        }}
      >
        <img
          src={cutoutUrl}
          alt="Cutout Artwork"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
            padding: '2px 8px',
            borderRadius: 'var(--radius-xs)',
            background: 'rgba(0, 0, 0, 0.75)',
            color: 'var(--text-primary)',
            fontSize: '10px',
            fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          TÁCH NỀN (CUTOUT)
        </div>
      </div>

      {/* Foreground Clipped Layer: Original */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-canvas)',
        }}
      >
        <img
          src={originalUrl}
          alt="Original Product"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            padding: '2px 8px',
            borderRadius: 'var(--radius-xs)',
            background: 'rgba(0, 0, 0, 0.75)',
            color: 'var(--text-primary)',
            fontSize: '10px',
            fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          ẢNH GỐC (ORIGINAL)
        </div>
      </div>

      {/* Divider Bar & Handle */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${sliderPos}%`,
          width: '2px',
          background: 'var(--accent-primary)',
          boxShadow: '0 0 6px rgba(0, 0, 0, 0.8)',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: 'var(--text-primary)',
            border: '2px solid var(--accent-primary)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            color: 'var(--text-inverse)',
            fontWeight: 'bold',
          }}
        >
          ↔
        </div>
      </div>
    </div>
  )
}
