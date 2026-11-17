import type { SegmentMetadata } from './types'

describe('types', () => {
  it('accepts a contract metadata example', () => {
    const meta: SegmentMetadata = {
      prompt: 'square embroidered fabric patch', mode: 'text_box', bbox_input: [0.5, 0.4, 0.3, 0.25],
      image_size: [1200, 900], confidence_threshold: 0.35, crop_padding_px: 12, elapsed_ms: 2310,
      num_candidates: 1, num_candidates_total: 1,
      candidates: [{ id: 0, score: 0.91, bbox_xyxy_px: [410, 250, 780, 560], mask_area_px: 90210,
        files: { mask: 'candidate_00_mask.png' } }],
    }
    expect(meta.candidates).toHaveLength(1)
  })
})
