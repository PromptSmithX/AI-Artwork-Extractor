import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  composeFullCutout,
  setCanvasFactory,
  setImageBitmapLoader,
  type Canvas2DContextLike,
  type CanvasElementLike,
} from './fullCutout'

describe('composeFullCutout', () => {
  beforeEach(() => {
    setCanvasFactory(null)
    setImageBitmapLoader(null)
  })

  afterEach(() => {
    setCanvasFactory(null)
    setImageBitmapLoader(null)
    vi.restoreAllMocks()
  })

  describe('argument validation', () => {
    const validBlob = new Blob(['img'], { type: 'image/png' })

    it('throws if cropBlob is missing', async () => {
      await expect(
        composeFullCutout(null as unknown as Blob, [10, 10, 50, 50], [100, 100]),
      ).rejects.toThrow(/cropBlob is required/)
    })

    it('throws if cropBox is invalid or has non-positive area', async () => {
      await expect(
        composeFullCutout(validBlob, [10, 10, 10, 50], [100, 100]),
      ).rejects.toThrow(/Zero or negative crop box dimensions/)

      await expect(
        composeFullCutout(validBlob, [10, 50, 50, 10], [100, 100]),
      ).rejects.toThrow(/Zero or negative crop box dimensions/)

      await expect(
        composeFullCutout(validBlob, [10, 10] as unknown as [number, number, number, number], [100, 100]),
      ).rejects.toThrow(/4-element tuple/)

      await expect(
        composeFullCutout(validBlob, [NaN, 10, 50, 50], [100, 100]),
      ).rejects.toThrow(/finite numbers/)
    })

    it('throws if imageSize is invalid', async () => {
      await expect(
        composeFullCutout(validBlob, [10, 10, 50, 50], [0, 100]),
      ).rejects.toThrow(/Invalid imageSize/)

      await expect(
        composeFullCutout(validBlob, [10, 10, 50, 50], [100, -5]),
      ).rejects.toThrow(/Invalid imageSize/)

      await expect(
        composeFullCutout(validBlob, [10, 10, 50, 50], [100] as unknown as [number, number]),
      ).rejects.toThrow(/2-element tuple/)
    })
  })

  describe('composition with mock canvas', () => {
    it('creates canvas of imageSize and draws crop at (x0, y0)', async () => {
      const mockBlob = new Blob(['png-bytes'], { type: 'image/png' })
      const drawImageSpy = vi.fn()
      const mockBitmap = { close: vi.fn() }

      const mockContext: Canvas2DContextLike = {
        drawImage: drawImageSpy,
      }

      const mockCanvas: CanvasElementLike = {
        width: 1200,
        height: 800,
        getContext: vi.fn().mockReturnValue(mockContext),
        convertToBlob: vi.fn().mockResolvedValue(mockBlob),
      }

      const canvasFactorySpy = vi.fn().mockReturnValue(mockCanvas)
      setCanvasFactory(canvasFactorySpy)
      setImageBitmapLoader(vi.fn().mockResolvedValue(mockBitmap))

      const cropBlob = new Blob(['crop'], { type: 'image/png' })
      const result = await composeFullCutout(cropBlob, [150, 200, 450, 600], [1200, 800])

      expect(canvasFactorySpy).toHaveBeenCalledWith(1200, 800)
      expect(drawImageSpy).toHaveBeenCalledWith(mockBitmap, 150, 200)
      expect(mockBitmap.close).toHaveBeenCalled()
      expect(result).toBe(mockBlob)
    })

    it('supports fallback to canvas.toBlob when convertToBlob is not available', async () => {
      const mockBlob = new Blob(['png-bytes-fallback'], { type: 'image/png' })
      const mockBitmap = { close: vi.fn() }

      const mockCanvas: CanvasElementLike = {
        width: 500,
        height: 500,
        getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
        toBlob: (cb: (b: Blob | null) => void) => cb(mockBlob),
      }

      setCanvasFactory(() => mockCanvas)
      setImageBitmapLoader(vi.fn().mockResolvedValue(mockBitmap))

      const result = await composeFullCutout(new Blob(), [10, 10, 100, 100], [500, 500])
      expect(result).toBe(mockBlob)
    })
  })

  describe('pixel test (when real canvas is supported)', () => {
    const hasCanvasContext = (() => {
      if (typeof OffscreenCanvas !== 'undefined') {
        try {
          const c = new OffscreenCanvas(10, 10)
          return !!c.getContext('2d')
        } catch {
          return false
        }
      }
      return false
    })()

    it.skipIf(!hasCanvasContext)('preserves exact RGB values of opaque crop pixels', async () => {
      // Create a 2x2 crop with distinct RGB values
      const c = new OffscreenCanvas(2, 2)
      const ctx = c.getContext('2d')!
      const imgData = ctx.createImageData(2, 2)
      // Pixel 0,0: Red [255, 0, 0, 255]
      imgData.data[0] = 255
      imgData.data[1] = 0
      imgData.data[2] = 0
      imgData.data[3] = 255
      ctx.putImageData(imgData, 0, 0)
      const cropBlob = await c.convertToBlob({ type: 'image/png' })

      // Compose onto a 10x10 canvas at position (3, 4)
      const composedBlob = await composeFullCutout(cropBlob, [3, 4, 5, 6], [10, 10])

      const bmp = await createImageBitmap(composedBlob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
      const testCanvas = new OffscreenCanvas(10, 10)
      const testCtx = testCanvas.getContext('2d')!
      testCtx.drawImage(bmp, 0, 0)
      const readData = testCtx.getImageData(3, 4, 1, 1).data

      expect(readData[0]).toBe(255)
      expect(readData[1]).toBe(0)
      expect(readData[2]).toBe(0)
      expect(readData[3]).toBe(255)
    })
  })
})
