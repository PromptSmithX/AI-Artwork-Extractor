import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors'
import { parseSegmentZip } from './parseResult'
import type { SegmentMetadata } from '../types'

// 1x1 transparent PNG bytes
const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
])

describe('parseSegmentZip', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses valid result zip with candidates and creates object URLs', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => `blob:mock-${(blob as Blob).size}`)

    const metadata: SegmentMetadata = {
      prompt: 'embroidered patch',
      mode: 'text',
      bbox_input: null,
      image_size: [800, 600],
      confidence_threshold: 0.35,
      crop_padding_px: 12,
      elapsed_ms: 120,
      num_candidates: 1,
      num_candidates_total: 1,
      candidates: [
        {
          id: 0,
          score: 0.95,
          bbox_xyxy_px: [100, 100, 400, 400],
          mask_area_px: 5000,
          files: {
            mask: 'candidate_00_mask.png',
            overlay: 'candidate_00_overlay.png',
            cutout: 'candidate_00_cutout.png',
            cutout_crop: 'candidate_00_cutout_crop.png',
          },
        },
      ],
    }

    const zip = new JSZip()
    const folder = zip.folder('result')!
    folder.file('metadata.json', JSON.stringify(metadata))
    folder.file('candidate_00_mask.png', TINY_PNG)
    folder.file('candidate_00_overlay.png', TINY_PNG)
    folder.file('candidate_00_cutout.png', TINY_PNG)
    folder.file('candidate_00_cutout_crop.png', TINY_PNG)

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const result = await parseSegmentZip(zipBlob)

    expect(result.metadata.prompt).toBe('embroidered patch')
    expect(result.candidates).toHaveLength(1)
    const cand = result.candidates[0]
    expect(cand.urls.mask).toBeDefined()
    expect(cand.urls.overlay).toBeDefined()
    expect(cand.urls.cutout).toBeDefined()
    expect(cand.urls.cutout_crop).toBeDefined()
    expect(cand.blobs.mask).toBeInstanceOf(Blob)
    expect(result.zipBlob).toBe(zipBlob)

    expect(createSpy).toHaveBeenCalledTimes(4)

    // Call dispose and verify revocation
    result.dispose()
    expect(revokeSpy).toHaveBeenCalledTimes(4)
  })

  it('parses lean profile zip without candidate cutout.png file', async () => {
    const metadata: SegmentMetadata = {
      prompt: 'patch',
      mode: 'text',
      bbox_input: null,
      image_size: [800, 600],
      confidence_threshold: 0.35,
      crop_padding_px: 12,
      export_profile: 'lean',
      overlay_max_side: 768,
      elapsed_ms: 100,
      num_candidates: 1,
      num_candidates_total: 1,
      candidates: [
        {
          id: 0,
          score: 0.9,
          bbox_xyxy_px: [100, 100, 400, 400],
          crop_box_xyxy_px: [88, 88, 412, 412],
          mask_area_px: 5000,
          files: {
            mask: 'candidate_00_mask.png',
            overlay: 'candidate_00_overlay.png',
            cutout_crop: 'candidate_00_cutout_crop.png',
          },
        },
      ],
    }

    const zip = new JSZip()
    const folder = zip.folder('result')!
    folder.file('metadata.json', JSON.stringify(metadata))
    folder.file('candidate_00_mask.png', TINY_PNG)
    folder.file('candidate_00_overlay.png', TINY_PNG)
    folder.file('candidate_00_cutout_crop.png', TINY_PNG)

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const result = await parseSegmentZip(zipBlob)

    expect(result.metadata.export_profile).toBe('lean')
    expect(result.candidates).toHaveLength(1)
    const cand = result.candidates[0]
    expect(cand.blobs.mask).toBeDefined()
    expect(cand.blobs.overlay).toBeDefined()
    expect(cand.blobs.cutout_crop).toBeDefined()
    expect(cand.blobs.cutout).toBeUndefined()
    expect(cand.meta.crop_box_xyxy_px).toEqual([88, 88, 412, 412])

    result.dispose()
  })

  it('falls back to root metadata.json if result/ prefix is absent', async () => {
    const metadata: SegmentMetadata = {
      prompt: 'cat',
      mode: 'text',
      bbox_input: null,
      image_size: [100, 100],
      confidence_threshold: 0.35,
      crop_padding_px: 12,
      elapsed_ms: 50,
      num_candidates: 0,
      candidates: [],
    }

    const zip = new JSZip()
    zip.file('metadata.json', JSON.stringify(metadata))

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const result = await parseSegmentZip(zipBlob)

    expect(result.metadata.prompt).toBe('cat')
    expect(result.candidates).toHaveLength(0)
  })

  it('throws ApiError server if metadata.json is missing', async () => {
    const zip = new JSZip()
    zip.file('other.txt', 'hello')
    const zipBlob = await zip.generateAsync({ type: 'blob' })

    await expect(parseSegmentZip(zipBlob)).rejects.toThrow(ApiError)
    try {
      await parseSegmentZip(zipBlob)
    } catch (err) {
      expect((err as ApiError).kind).toBe('server')
    }
  })

  it('throws ApiError server if metadata.json is malformed JSON', async () => {
    const zip = new JSZip()
    zip.file('metadata.json', '{ bad json ...')
    const zipBlob = await zip.generateAsync({ type: 'blob' })

    await expect(parseSegmentZip(zipBlob)).rejects.toThrow(ApiError)
  })

  it('throws ApiError server if metadata shape is invalid', async () => {
    const zip = new JSZip()
    zip.file('metadata.json', JSON.stringify({ prompt: 123 }))
    const zipBlob = await zip.generateAsync({ type: 'blob' })

    await expect(parseSegmentZip(zipBlob)).rejects.toThrow(ApiError)
  })

  it('throws ApiError server if input is not a valid zip', async () => {
    const badBlob = new Blob(['not a zip file'], { type: 'application/zip' })
    await expect(parseSegmentZip(badBlob)).rejects.toThrow(ApiError)
  })
})
