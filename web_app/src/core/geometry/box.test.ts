import { describe, expect, it } from 'vitest'
import {
  boxToNormCxCyWh,
  displayDragToImageBox,
  imageBoxToDisplay,
  isUsableBox,
  normCxCyWhToBox,
} from './box'
import type { BoxXYXY } from '../types'

describe('box geometry', () => {
  describe('displayDragToImageBox', () => {
    it('handles top-left to bottom-right drag', () => {
      const box = displayDragToImageBox({ x: 100, y: 50 }, { x: 300, y: 250 }, 0.5, 1000, 800)
      expect(box).toEqual({ x1: 200, y1: 100, x2: 600, y2: 500 })
    })

    it('handles reverse drag (bottom-right to top-left)', () => {
      const box = displayDragToImageBox({ x: 300, y: 250 }, { x: 100, y: 50 }, 0.5, 1000, 800)
      expect(box).toEqual({ x1: 200, y1: 100, x2: 600, y2: 500 })
    })

    it('handles diagonal top-right to bottom-left drag', () => {
      const box = displayDragToImageBox({ x: 300, y: 50 }, { x: 100, y: 250 }, 0.5, 1000, 800)
      expect(box).toEqual({ x1: 200, y1: 100, x2: 600, y2: 500 })
    })

    it('clamps points beyond image bounds', () => {
      const box = displayDragToImageBox({ x: -50, y: -20 }, { x: 600, y: 500 }, 0.5, 1000, 800)
      expect(box).toEqual({ x1: 0, y1: 0, x2: 1000, y2: 800 })
    })

    it('throws on non-positive scale or natural dimensions', () => {
      expect(() => displayDragToImageBox({ x: 0, y: 0 }, { x: 10, y: 10 }, 0, 100, 100)).toThrow()
      expect(() => displayDragToImageBox({ x: 0, y: 0 }, { x: 10, y: 10 }, 1, 0, 100)).toThrow()
      expect(() => displayDragToImageBox({ x: 0, y: 0 }, { x: 10, y: 10 }, 1, 100, -5)).toThrow()
    })
  })

  describe('imageBoxToDisplay', () => {
    it('scales box coordinates to display pixels', () => {
      const imgBox: BoxXYXY = { x1: 200, y1: 100, x2: 600, y2: 500 }
      const dispBox = imageBoxToDisplay(imgBox, 0.5)
      expect(dispBox).toEqual({ x1: 100, y1: 50, x2: 300, y2: 250 })
    })
  })

  describe('boxToNormCxCyWh & normCxCyWhToBox round-trip', () => {
    it('accurately round-trips normalized coordinates', () => {
      const naturalW = 1200
      const naturalH = 800
      const originalBox: BoxXYXY = { x1: 300, y1: 200, x2: 900, y2: 600 }

      const norm = boxToNormCxCyWh(originalBox, naturalW, naturalH)
      // cx: (300 + 300) / 1200 = 0.5
      // cy: (200 + 200) / 800 = 0.5
      // w: 600 / 1200 = 0.5
      // h: 400 / 800 = 0.5
      expect(norm[0]).toBeCloseTo(0.5)
      expect(norm[1]).toBeCloseTo(0.5)
      expect(norm[2]).toBeCloseTo(0.5)
      expect(norm[3]).toBeCloseTo(0.5)

      const recovered = normCxCyWhToBox(norm, naturalW, naturalH)
      expect(recovered.x1).toBeCloseTo(originalBox.x1)
      expect(recovered.y1).toBeCloseTo(originalBox.y1)
      expect(recovered.x2).toBeCloseTo(originalBox.x2)
      expect(recovered.y2).toBeCloseTo(originalBox.y2)
    })

    it('throws on zero-area box in boxToNormCxCyWh', () => {
      expect(() => boxToNormCxCyWh({ x1: 10, y1: 10, x2: 10, y2: 50 }, 100, 100)).toThrow(/Zero-area/)
      expect(() => boxToNormCxCyWh({ x1: 10, y1: 10, x2: 50, y2: 10 }, 100, 100)).toThrow(/Zero-area/)
    })

    it('throws on zero-area in normCxCyWhToBox', () => {
      expect(() => normCxCyWhToBox([0.5, 0.5, 0, 0.2], 100, 100)).toThrow(/Zero-area/)
      expect(() => normCxCyWhToBox([0.5, 0.5, 0.2, 0], 100, 100)).toThrow(/Zero-area/)
    })
  })

  describe('isUsableBox', () => {
    it('returns false for null', () => {
      expect(isUsableBox(null)).toBe(false)
    })

    it('returns false for dimensions below minPx', () => {
      expect(isUsableBox({ x1: 10, y1: 10, x2: 12, y2: 20 }, 4)).toBe(false)
      expect(isUsableBox({ x1: 10, y1: 10, x2: 20, y2: 13 }, 4)).toBe(false)
    })

    it('returns true for dimensions >= minPx', () => {
      expect(isUsableBox({ x1: 10, y1: 10, x2: 14, y2: 14 }, 4)).toBe(true)
      expect(isUsableBox({ x1: 10, y1: 10, x2: 100, y2: 100 }, 4)).toBe(true)
    })
  })
})
