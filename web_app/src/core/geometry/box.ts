/**
 * Box geometry helpers (pure functions, fully unit-tested).
 */
import type { BoxXYXY } from '../types'

/** Two drag points in DISPLAY px (any order) → original-image px box, clamped. scale = displayW / naturalW. */
export function displayDragToImageBox(
  a: { x: number; y: number },
  b: { x: number; y: number },
  scale: number,
  naturalW: number,
  naturalH: number,
): BoxXYXY {
  if (scale <= 0) {
    throw new Error('Scale must be strictly positive')
  }
  if (naturalW <= 0 || naturalH <= 0) {
    throw new Error('Natural dimensions must be positive integers')
  }

  const x1Disp = Math.min(a.x, b.x)
  const x2Disp = Math.max(a.x, b.x)
  const y1Disp = Math.min(a.y, b.y)
  const y2Disp = Math.max(a.y, b.y)

  const imgX1 = x1Disp / scale
  const imgY1 = y1Disp / scale
  const imgX2 = x2Disp / scale
  const imgY2 = y2Disp / scale

  const clampedX1 = Math.max(0, Math.min(naturalW, imgX1))
  const clampedX2 = Math.max(0, Math.min(naturalW, imgX2))
  const clampedY1 = Math.max(0, Math.min(naturalH, imgY1))
  const clampedY2 = Math.max(0, Math.min(naturalH, imgY2))

  return {
    x1: Math.min(clampedX1, clampedX2),
    y1: Math.min(clampedY1, clampedY2),
    x2: Math.max(clampedX1, clampedX2),
    y2: Math.max(clampedY1, clampedY2),
  }
}

/** Original-image px box → display px box. */
export function imageBoxToDisplay(box: BoxXYXY, scale: number): BoxXYXY {
  const x1 = Math.min(box.x1, box.x2) * scale
  const x2 = Math.max(box.x1, box.x2) * scale
  const y1 = Math.min(box.y1, box.y2) * scale
  const y2 = Math.max(box.y1, box.y2) * scale

  return { x1, y1, x2, y2 }
}

/** Pixel box → normalized [cx, cy, w, h] in [0,1]. Throws on zero area. */
export function boxToNormCxCyWh(
  box: BoxXYXY,
  naturalW: number,
  naturalH: number,
): [number, number, number, number] {
  if (naturalW <= 0 || naturalH <= 0) {
    throw new Error('Image dimensions must be positive')
  }

  const minX = Math.max(0, Math.min(naturalW, Math.min(box.x1, box.x2)))
  const maxX = Math.max(0, Math.min(naturalW, Math.max(box.x1, box.x2)))
  const minY = Math.max(0, Math.min(naturalH, Math.min(box.y1, box.y2)))
  const maxY = Math.max(0, Math.min(naturalH, Math.max(box.y1, box.y2)))

  const wPx = maxX - minX
  const hPx = maxY - minY

  if (wPx <= 0 || hPx <= 0) {
    throw new Error(`Zero-area bounding box: width=${wPx}, height=${hPx}`)
  }

  const normW = Math.min(1, Math.max(0, wPx / naturalW))
  const normH = Math.min(1, Math.max(0, hPx / naturalH))
  const normCx = Math.min(1, Math.max(0, (minX + wPx / 2) / naturalW))
  const normCy = Math.min(1, Math.max(0, (minY + hPx / 2) / naturalH))

  return [normCx, normCy, normW, normH]
}

/** Normalized [cx, cy, w, h] → pixel box. */
export function normCxCyWhToBox(
  norm: [number, number, number, number],
  naturalW: number,
  naturalH: number,
): BoxXYXY {
  if (naturalW <= 0 || naturalH <= 0) {
    throw new Error('Image dimensions must be positive')
  }

  const [cx, cy, w, h] = norm
  if (w <= 0 || h <= 0) {
    throw new Error(`Zero-area bounding box: w=${w}, h=${h}`)
  }

  const cX = Math.max(0, Math.min(1, cx))
  const cY = Math.max(0, Math.min(1, cy))
  const normW = Math.max(0, Math.min(1, w))
  const normH = Math.max(0, Math.min(1, h))

  const x1 = (cX - normW / 2) * naturalW
  const y1 = (cY - normH / 2) * naturalH
  const x2 = (cX + normW / 2) * naturalW
  const y2 = (cY + normH / 2) * naturalH

  const clampedX1 = Math.max(0, Math.min(naturalW, x1))
  const clampedY1 = Math.max(0, Math.min(naturalH, y1))
  const clampedX2 = Math.max(0, Math.min(naturalW, x2))
  const clampedY2 = Math.max(0, Math.min(naturalH, y2))

  if (clampedX2 <= clampedX1 || clampedY2 <= clampedY1) {
    throw new Error('Zero-area bounding box after clamping to image bounds')
  }

  return {
    x1: clampedX1,
    y1: clampedY1,
    x2: clampedX2,
    y2: clampedY2,
  }
}

/** True when the box is large enough to send (>= minPx on both sides). */
export function isUsableBox(box: BoxXYXY | null, minPx = 4): boolean {
  if (!box) {
    return false
  }
  const w = Math.abs(box.x2 - box.x1)
  const h = Math.abs(box.y2 - box.y1)
  return w >= minPx && h >= minPx
}
