/**
 * Box geometry helpers. STUB — implemented by W7 (pure functions, fully unit-tested).
 */
import type { BoxXYXY } from '../types'

/** Two drag points in DISPLAY px (any order) → original-image px box, clamped. scale = displayW / naturalW. */
export function displayDragToImageBox(
  _a: { x: number; y: number },
  _b: { x: number; y: number },
  _scale: number,
  _naturalW: number,
  _naturalH: number,
): BoxXYXY {
  throw new Error('not implemented (W7)')
}

/** Original-image px box → display px box. */
export function imageBoxToDisplay(_box: BoxXYXY, _scale: number): BoxXYXY {
  throw new Error('not implemented (W7)')
}

/** Pixel box → normalized [cx, cy, w, h] in [0,1]. Throws on zero area. */
export function boxToNormCxCyWh(
  _box: BoxXYXY,
  _naturalW: number,
  _naturalH: number,
): [number, number, number, number] {
  throw new Error('not implemented (W7)')
}

/** Normalized [cx, cy, w, h] → pixel box. */
export function normCxCyWhToBox(
  _norm: [number, number, number, number],
  _naturalW: number,
  _naturalH: number,
): BoxXYXY {
  throw new Error('not implemented (W7)')
}

/** True when the box is large enough to send (>= minPx on both sides). */
export function isUsableBox(_box: BoxXYXY | null, _minPx = 4): boolean {
  throw new Error('not implemented (W7)')
}
