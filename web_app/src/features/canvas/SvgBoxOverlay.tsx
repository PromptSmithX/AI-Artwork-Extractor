import React, { useRef, useState, useEffect, useCallback } from 'react'
import type { BoxXYXY, Mode } from '../../core/types'
import {
  safeDisplayDragToImageBox,
  safeImageBoxToDisplay,
  safeIsUsableBox,
} from './geometrySafe'

export interface SvgBoxOverlayProps {
  displayWidth: number
  displayHeight: number
  naturalWidth: number
  naturalHeight: number
  scale: number
  mode: Mode
  box: BoxXYXY | null
  onBoxChange: (box: BoxXYXY | null) => void
}

type DragAction =
  | { type: 'create'; startX: number; startY: number }
  | { type: 'move'; startX: number; startY: number; origBox: BoxXYXY }
  | { type: 'resize'; handle: string; startX: number; startY: number; origBox: BoxXYXY }

export const SvgBoxOverlay: React.FC<SvgBoxOverlayProps> = ({
  displayWidth,
  displayHeight,
  naturalWidth,
  naturalHeight,
  scale,
  mode,
  box,
  onBoxChange,
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragAction, setDragAction] = useState<DragAction | null>(null)

  const isBoxActive = mode === 'box' || mode === 'text_box'
  const isTextMode = mode === 'text'

  // Convert image box to display box
  const displayBox = box ? safeImageBoxToDisplay(box, scale) : null
  const boxW = displayBox ? Math.max(0, displayBox.x2 - displayBox.x1) : 0
  const boxH = displayBox ? Math.max(0, displayBox.y2 - displayBox.y1) : 0
  const origW = box ? Math.round(Math.abs(box.x2 - box.x1)) : 0
  const origH = box ? Math.round(Math.abs(box.y2 - box.y1)) : 0

  const getSvgPoint = useCallback((e: React.PointerEvent | PointerEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 }
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }, [])

  // Start creating a new box
  const handleSvgPointerDown = (e: React.PointerEvent) => {
    if (!isBoxActive || e.button !== 0) return
    const pt = getSvgPoint(e)
    setDragAction({ type: 'create', startX: pt.x, startY: pt.y })
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  // Start moving the box
  const handleBoxPointerDown = (e: React.PointerEvent) => {
    if (!isBoxActive || !box || e.button !== 0) return
    e.stopPropagation()
    const pt = getSvgPoint(e)
    setDragAction({
      type: 'move',
      startX: pt.x,
      startY: pt.y,
      origBox: { ...box },
    })
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  // Start resizing
  const handleHandlePointerDown = (e: React.PointerEvent, handle: string) => {
    if (!isBoxActive || !box || e.button !== 0) return
    e.stopPropagation()
    const pt = getSvgPoint(e)
    setDragAction({
      type: 'resize',
      handle,
      startX: pt.x,
      startY: pt.y,
      origBox: { ...box },
    })
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragAction || !isBoxActive) return
    const pt = getSvgPoint(e)

    if (dragAction.type === 'create') {
      const newBox = safeDisplayDragToImageBox(
        { x: dragAction.startX, y: dragAction.startY },
        { x: pt.x, y: pt.y },
        scale,
        naturalWidth,
        naturalHeight,
      )
      onBoxChange(newBox)
    } else if (dragAction.type === 'move') {
      const dxPx = (pt.x - dragAction.startX) / scale
      const dyPx = (pt.y - dragAction.startY) / scale
      const bw = dragAction.origBox.x2 - dragAction.origBox.x1
      const bh = dragAction.origBox.y2 - dragAction.origBox.y1

      let newX1 = Math.round(dragAction.origBox.x1 + dxPx)
      let newY1 = Math.round(dragAction.origBox.y1 + dyPx)
      newX1 = Math.max(0, Math.min(naturalWidth - bw, newX1))
      newY1 = Math.max(0, Math.min(naturalHeight - bh, newY1))

      onBoxChange({
        x1: newX1,
        y1: newY1,
        x2: newX1 + bw,
        y2: newY1 + bh,
      })
    } else if (dragAction.type === 'resize') {
      const dxPx = (pt.x - dragAction.startX) / scale
      const dyPx = (pt.y - dragAction.startY) / scale
      let { x1, y1, x2, y2 } = dragAction.origBox

      if (dragAction.handle.includes('w')) x1 = Math.max(0, Math.min(x2 - 4, Math.round(x1 + dxPx)))
      if (dragAction.handle.includes('e')) x2 = Math.min(naturalWidth, Math.max(x1 + 4, Math.round(x2 + dxPx)))
      if (dragAction.handle.includes('n')) y1 = Math.max(0, Math.min(y2 - 4, Math.round(y1 + dyPx)))
      if (dragAction.handle.includes('s')) y2 = Math.min(naturalHeight, Math.max(y1 + 4, Math.round(y2 + dyPx)))

      onBoxChange({ x1, y1, x2, y2 })
    }
  }

  const handlePointerUp = () => {
    if (!dragAction) return
    if (dragAction.type === 'create' && box && !safeIsUsableBox(box, 6)) {
      onBoxChange(null)
    }
    setDragAction(null)
  }

  // Keyboard shortcut: Delete, Backspace, or Esc to clear box
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isBoxActive) return
      if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Escape') {
        if (box) {
          e.preventDefault()
          onBoxChange(null)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [box, isBoxActive, onBoxChange])

  // Handles configuration: 8 points
  const handleSize = 8
  const halfH = handleSize / 2

  const handles = displayBox && isBoxActive ? [
    { id: 'nw', x: displayBox.x1, y: displayBox.y1, cursor: 'nwse-resize' },
    { id: 'n', x: displayBox.x1 + boxW / 2, y: displayBox.y1, cursor: 'ns-resize' },
    { id: 'ne', x: displayBox.x2, y: displayBox.y1, cursor: 'nesw-resize' },
    { id: 'e', x: displayBox.x2, y: displayBox.y1 + boxH / 2, cursor: 'ew-resize' },
    { id: 'se', x: displayBox.x2, y: displayBox.y2, cursor: 'nwse-resize' },
    { id: 's', x: displayBox.x1 + boxW / 2, y: displayBox.y2, cursor: 'ns-resize' },
    { id: 'sw', x: displayBox.x1, y: displayBox.y2, cursor: 'nesw-resize' },
    { id: 'w', x: displayBox.x1, y: displayBox.y1 + boxH / 2, cursor: 'ew-resize' },
  ] : []

  return (
    <svg
      ref={svgRef}
      width={displayWidth}
      height={displayHeight}
      onPointerDown={handleSvgPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: displayWidth,
        height: displayHeight,
        cursor: isBoxActive ? 'crosshair' : 'default',
        userSelect: 'none',
        pointerEvents: isBoxActive ? 'auto' : 'none',
        opacity: isTextMode ? 0.35 : 1,
      }}
    >
      {/* Box Drawing */}
      {displayBox && boxW > 0 && boxH > 0 && (
        <g>
          {/* Main selection rectangle */}
          <rect
            x={displayBox.x1}
            y={displayBox.y1}
            width={boxW}
            height={boxH}
            fill="rgba(99, 102, 241, 0.16)"
            stroke="var(--accent-primary)"
            strokeWidth="2"
            strokeDasharray="5 3"
            onPointerDown={handleBoxPointerDown}
            style={{
              cursor: isBoxActive ? 'move' : 'default',
              pointerEvents: isBoxActive ? 'auto' : 'none',
            }}
          />

          {/* Dimension readout tag */}
          <g transform={`translate(${displayBox.x1}, ${Math.max(18, displayBox.y1 - 6)})`}>
            <rect
              x="0"
              y="-16"
              width={Math.max(90, `${origW} × ${origH} px`.length * 7)}
              height="18"
              rx="3"
              fill="rgba(19, 20, 24, 0.85)"
              stroke="var(--border-default)"
              strokeWidth="1"
            />
            <text
              x="6"
              y="-3"
              fill="var(--text-primary)"
              fontSize="10"
              fontFamily="var(--font-mono)"
              fontWeight="bold"
            >
              {origW} × {origH} px
            </text>
          </g>

          {/* Resize handles */}
          {handles.map((h) => (
            <rect
              key={h.id}
              x={h.x - halfH}
              y={h.y - halfH}
              width={handleSize}
              height={handleSize}
              fill="var(--text-primary)"
              stroke="var(--accent-primary)"
              strokeWidth="2"
              rx="1"
              onPointerDown={(e) => handleHandlePointerDown(e, h.id)}
              style={{
                cursor: h.cursor,
                pointerEvents: 'auto',
              }}
            />
          ))}
        </g>
      )}
    </svg>
  )
}
