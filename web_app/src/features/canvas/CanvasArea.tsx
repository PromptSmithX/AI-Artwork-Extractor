import React, { useRef, useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../../state/store'
import { EmptyState } from '../../components/EmptyState'
import { SvgBoxOverlay } from './SvgBoxOverlay'
import { ZoomControls } from './ZoomControls'

export interface CanvasAreaProps {
  className?: string
  style?: React.CSSProperties
}

export const CanvasArea: React.FC<CanvasAreaProps> = ({ className = '', style }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const image = useAppStore((s) => s.image)
  const mode = useAppStore((s) => s.mode)
  const box = useAppStore((s) => s.box)
  const setBox = useAppStore((s) => s.setBox)

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0, startPanX: 0, startPanY: 0 })

  // Fit image to view
  const fitToView = useCallback(() => {
    if (!containerRef.current || !image) return
    const containerW = containerRef.current.clientWidth - 48
    const containerH = containerRef.current.clientHeight - 48
    if (containerW <= 0 || containerH <= 0) return

    const scaleW = containerW / image.naturalWidth
    const scaleH = containerH / image.naturalHeight
    const fitScale = Math.min(scaleW, scaleH, 1)

    setZoom(fitScale)
    setPan({ x: 0, y: 0 })
  }, [image])

  // Fit view automatically on image load
  useEffect(() => {
    if (image) {
      fitToView()
    }
  }, [image, fitToView])

  // Spacebar pan listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs/textareas
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true)
      }
      if (e.key === 'f' || e.key === 'F') {
        fitToView()
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false)
        setIsPanning(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [fitToView])

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87
    setZoom((prev) => Math.max(0.1, Math.min(8, prev * zoomFactor)))
  }

  // Pointer down for pan (Middle mouse OR Space + Left click)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (isSpacePressed && e.button === 0)) {
      e.preventDefault()
      setIsPanning(true)
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      }
      ;(e.target as Element).setPointerCapture(e.pointerId)
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      setPan({
        x: panStartRef.current.startPanX + dx,
        y: panStartRef.current.startPanY + dy,
      })
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false)
      try {
        ;(e.target as Element).releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }
  }

  if (!image) {
    return (
      <div
        ref={containerRef}
        className={`app-canvas-area ${className}`}
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-canvas)',
          position: 'relative',
          overflow: 'hidden',
          ...style,
        }}
      >
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          }
          title="Không gian làm việc trống"
          description="Tải ảnh sản phẩm (áo thun, áo khoác, nón, túi xách) từ bảng bên trái để bắt đầu bóc tách artwork."
        />
      </div>
    )
  }

  const displayWidth = image.naturalWidth * zoom
  const displayHeight = image.naturalHeight * zoom

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`app-canvas-area ${className}`}
      style={{
        flex: 1,
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--bg-canvas)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: isPanning ? 'grabbing' : isSpacePressed ? 'grab' : 'default',
        ...style,
      }}
    >
      {/* Zoomed & Panned Image Frame */}
      <div
        style={{
          position: 'absolute',
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          width: displayWidth,
          height: displayHeight,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7)',
          border: '1px solid var(--border-default)',
          lineHeight: 0,
        }}
      >
        <img
          src={image.url}
          alt={image.file.name}
          draggable={false}
          style={{
            width: displayWidth,
            height: displayHeight,
            display: 'block',
            userSelect: 'none',
          }}
        />

        {/* Box Overlay with SVG Drawing & Resizing */}
        <SvgBoxOverlay
          displayWidth={displayWidth}
          displayHeight={displayHeight}
          naturalWidth={image.naturalWidth}
          naturalHeight={image.naturalHeight}
          scale={zoom}
          mode={mode}
          box={box}
          onBoxChange={setBox}
        />
      </div>

      {/* Floating Canvas HUD - Bottom Left */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 8px',
          background: 'rgba(24, 25, 31, 0.75)',
          backdropFilter: 'blur(4px)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          fontSize: '11px',
          color: 'var(--text-secondary)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <span className="tabular-nums">
          {image.naturalWidth} × {image.naturalHeight} px
        </span>
        <span style={{ color: 'var(--border-default)' }}>|</span>
        <span style={{ textTransform: 'uppercase', fontSize: '10px', fontWeight: 600 }}>
          {mode === 'text_box' ? 'Text + Box' : mode === 'box' ? 'Box Mode' : 'Text Mode'}
        </span>
      </div>

      {/* Floating Zoom Controls - Bottom Right */}
      <ZoomControls
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(8, z * 1.25))}
        onZoomOut={() => setZoom((z) => Math.max(0.1, z * 0.8))}
        onFit={fitToView}
        onReset100={() => setZoom(1)}
        style={{ position: 'absolute', bottom: 16, right: 16 }}
      />
    </div>
  )
}
