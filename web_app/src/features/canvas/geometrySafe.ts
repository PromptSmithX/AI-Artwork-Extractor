import type { BoxXYXY } from '../../core/types'
import * as boxCore from '../../core/geometry/box'

export function safeDisplayDragToImageBox(
  a: { x: number; y: number },
  b: { x: number; y: number },
  scale: number,
  naturalW: number,
  naturalH: number,
): BoxXYXY {
  try {
    const raw = boxCore.displayDragToImageBox(a, b, scale, naturalW, naturalH)
    return {
      x1: Math.round(raw.x1),
      y1: Math.round(raw.y1),
      x2: Math.round(raw.x2),
      y2: Math.round(raw.y2),
    }
  } catch {
    const s = scale > 0 ? scale : 1
    const x1 = Math.max(0, Math.min(naturalW, Math.min(a.x, b.x) / s))
    const y1 = Math.max(0, Math.min(naturalH, Math.min(a.y, b.y) / s))
    const x2 = Math.max(0, Math.min(naturalW, Math.max(a.x, b.x) / s))
    const y2 = Math.max(0, Math.min(naturalH, Math.max(a.y, b.y) / s))
    return {
      x1: Math.round(x1),
      y1: Math.round(y1),
      x2: Math.round(x2),
      y2: Math.round(y2),
    }
  }
}

export function safeImageBoxToDisplay(box: BoxXYXY, scale: number): BoxXYXY {
  try {
    return boxCore.imageBoxToDisplay(box, scale)
  } catch {
    return {
      x1: box.x1 * scale,
      y1: box.y1 * scale,
      x2: box.x2 * scale,
      y2: box.y2 * scale,
    }
  }
}

export function safeIsUsableBox(box: BoxXYXY | null, minPx = 4): boolean {
  if (!box) return false
  try {
    return boxCore.isUsableBox(box, minPx)
  } catch {
    const w = Math.abs(box.x2 - box.x1)
    const h = Math.abs(box.y2 - box.y1)
    return w >= minPx && h >= minPx
  }
}
