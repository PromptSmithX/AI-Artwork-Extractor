import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../core/api/errors'
import { setCanvasFactory, setImageBitmapLoader } from '../core/export/fullCutout'
import { setApiClientFactory, setImageDimensionReader, useAppStore } from './store'
import type { ApiClient } from '../core/api/client'
import type { CandidateAssets, HealthResponse, PromptSuggestion, SegmentResult } from '../core/types'

describe('useAppStore', () => {
  let mockApiClient: Partial<ApiClient>

  beforeEach(() => {
    localStorage.clear()
    setImageDimensionReader(async () => ({ naturalWidth: 800, naturalHeight: 600 }))
    useAppStore.setState({
      connection: { baseUrl: 'http://localhost:8000', token: 'test-token', timeoutMs: 10_000 },
      health: null,
      healthStatus: 'idle',
      healthError: null,
      image: null,
      imageStatus: 'idle',
      imageError: null,
      mode: 'text',
      box: null,
      prompt: '',
      userRequest: '',
      scopePreference: 'auto',
      confidenceThreshold: 0.35,
      suggestion: null,
      suggestStatus: 'idle',
      suggestError: null,
      result: null,
      segmentStatus: 'idle',
      segmentError: null,
      segmentStartedAt: null,
      selectedCandidateId: null,
    })

    mockApiClient = {
      health: vi.fn(),
      suggestPrompt: vi.fn(),
      segment: vi.fn(),
    }
    setApiClientFactory(() => mockApiClient as ApiClient)
  })

  afterEach(() => {
    setApiClientFactory(null)
    setImageDimensionReader(null)
    vi.restoreAllMocks()
  })

  describe('connection & health', () => {
    it('updates connection and persists to storage', () => {
      useAppStore.getState().setConnection({ baseUrl: 'https://new-api.com', token: 'new-tok' })
      expect(useAppStore.getState().connection.baseUrl).toBe('https://new-api.com')
      expect(useAppStore.getState().connection.token).toBe('new-tok')
      expect(localStorage.getItem('aae.baseUrl')).toBe('https://new-api.com')
      expect(localStorage.getItem('aae.token')).toBe('new-tok')
    })

    it('checkHealth sets health on success', async () => {
      const healthData: HealthResponse = {
        status: 'ok',
        gpu: 'T4',
        sam3_loaded: true,
        qwen_loaded: true,
        prompt_assistant_available: true,
        busy: false,
      }
      vi.mocked(mockApiClient.health!).mockResolvedValue(healthData)

      await useAppStore.getState().checkHealth()

      expect(useAppStore.getState().healthStatus).toBe('success')
      expect(useAppStore.getState().health).toEqual(healthData)
      expect(useAppStore.getState().healthError).toBeNull()
    })

    it('checkHealth sets healthError on failure', async () => {
      vi.mocked(mockApiClient.health!).mockRejectedValue(new ApiError('disconnected', null, 'Connection failed'))

      await useAppStore.getState().checkHealth()

      expect(useAppStore.getState().healthStatus).toBe('error')
      expect(useAppStore.getState().health).toBeNull()
      expect(useAppStore.getState().healthError?.kind).toBe('disconnected')
    })
  })

  describe('loadImage & clearImage', () => {
    it('loads image, creates URL, and resets downstream state', async () => {
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-image')

      const dummyFile = new File(['dummy'], 'sample.png', { type: 'image/png' })

      // Pre-set some downstream fields
      useAppStore.setState({
        box: { x1: 10, y1: 10, x2: 50, y2: 50 },
        selectedCandidateId: 3,
      })

      await useAppStore.getState().loadImage(dummyFile)

      const state = useAppStore.getState()
      expect(state.image).toBeDefined()
      expect(state.image?.url).toBe('blob:mock-image')
      expect(state.image?.naturalWidth).toBe(800)
      expect(state.image?.naturalHeight).toBe(600)
      expect(state.imageStatus).toBe('success')
      expect(state.imageError).toBeNull()
      expect(state.box).toBeNull()
      expect(state.selectedCandidateId).toBeNull()

      // Loading another image revokes the previous one
      setImageDimensionReader(async () => ({ naturalWidth: 1000, naturalHeight: 500 }))
      const dummyFile2 = new File(['dummy2'], 'sample2.jpg', { type: 'image/jpeg' })

      await useAppStore.getState().loadImage(dummyFile2)
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock-image')
      expect(useAppStore.getState().image?.naturalWidth).toBe(1000)
    })

    it('rejects unsupported file type without throwing', async () => {
      const badFile = new File(['text'], 'notes.txt', { type: 'text/plain' })
      await useAppStore.getState().loadImage(badFile)
      expect(useAppStore.getState().imageStatus).toBe('error')
      expect(useAppStore.getState().imageError).toContain('Unsupported image type')
      expect(useAppStore.getState().image).toBeNull()
    })

    it('rejects image over 20 MB without throwing', async () => {
      const largeFile = new File([''], 'huge.png', { type: 'image/png' })
      Object.defineProperty(largeFile, 'size', { value: 25 * 1024 * 1024 })
      await useAppStore.getState().loadImage(largeFile)
      expect(useAppStore.getState().imageStatus).toBe('error')
      expect(useAppStore.getState().imageError).toContain('exceeds 20 MB')
    })

    it('handles image decoding failure without throwing', async () => {
      setImageDimensionReader(async () => {
        throw new Error('Image decoding failed')
      })
      const dummyFile = new File(['dummy'], 'broken.png', { type: 'image/png' })
      await useAppStore.getState().loadImage(dummyFile)
      expect(useAppStore.getState().imageStatus).toBe('error')
      expect(useAppStore.getState().imageError).toContain('Image decoding failed')
    })

    it('clearImage revokes URL and resets image state', () => {
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
      useAppStore.setState({
        image: {
          file: new File([''], 'test.png', { type: 'image/png' }),
          url: 'blob:test-url',
          naturalWidth: 100,
          naturalHeight: 100,
        },
        box: { x1: 0, y1: 0, x2: 10, y2: 10 },
      })

      useAppStore.getState().clearImage()

      expect(revokeSpy).toHaveBeenCalledWith('blob:test-url')
      expect(useAppStore.getState().image).toBeNull()
      expect(useAppStore.getState().box).toBeNull()
    })
  })

  describe('askAssistant & usePrompt', () => {
    it('requires image and non-empty userRequest', async () => {
      // No image
      await useAppStore.getState().askAssistant()
      expect(useAppStore.getState().suggestStatus).toBe('error')
      expect(useAppStore.getState().suggestError?.kind).toBe('validation')

      // Has image, empty userRequest
      useAppStore.setState({
        image: { file: new File([''], 't.png', { type: 'image/png' }), url: 'blob:t', naturalWidth: 10, naturalHeight: 10 },
        userRequest: '   ',
        suggestStatus: 'idle',
      })
      await useAppStore.getState().askAssistant()
      expect(useAppStore.getState().suggestStatus).toBe('error')
    })

    it('puts sam_prompt in prompt field if prompt was empty', async () => {
      const suggestion: PromptSuggestion = {
        target_description: 'dragon',
        scope: 'entire_patch',
        sam_prompt: 'golden dragon patch',
        alternative_prompts: ['dragon embroidery'],
        location_hint: 'center',
        needs_clarification: false,
        clarification_question: '',
        reason: 'ok',
      }
      vi.mocked(mockApiClient.suggestPrompt!).mockResolvedValue(suggestion)

      useAppStore.setState({
        image: { file: new File([''], 't.png', { type: 'image/png' }), url: 'blob:t', naturalWidth: 10, naturalHeight: 10 },
        userRequest: 'lấy con rồng',
        prompt: '',
      })

      await useAppStore.getState().askAssistant()

      expect(useAppStore.getState().suggestStatus).toBe('success')
      expect(useAppStore.getState().suggestion).toEqual(suggestion)
      expect(useAppStore.getState().prompt).toBe('golden dragon patch')
    })

    it('overwrites prompt if prompt was the previous suggestion, but preserves user edit', async () => {
      const prevSuggestion: PromptSuggestion = {
        target_description: 'dragon',
        scope: 'entire_patch',
        sam_prompt: 'old dragon patch',
        alternative_prompts: [],
        location_hint: '',
        needs_clarification: false,
        clarification_question: '',
        reason: 'ok',
      }
      const newSuggestion: PromptSuggestion = {
        ...prevSuggestion,
        sam_prompt: 'new dragon patch',
      }
      vi.mocked(mockApiClient.suggestPrompt!).mockResolvedValue(newSuggestion)

      // Case 1: prompt === prevSuggestion.sam_prompt -> gets updated
      useAppStore.setState({
        image: { file: new File([''], 't.png', { type: 'image/png' }), url: 'blob:t', naturalWidth: 10, naturalHeight: 10 },
        userRequest: 'lấy con rồng khác',
        suggestion: prevSuggestion,
        prompt: 'old dragon patch',
      })
      await useAppStore.getState().askAssistant()
      expect(useAppStore.getState().prompt).toBe('new dragon patch')

      // Case 2: prompt was manually edited by user -> preserved!
      useAppStore.setState({
        suggestion: prevSuggestion,
        prompt: 'my custom dragon prompt',
      })
      await useAppStore.getState().askAssistant()
      expect(useAppStore.getState().prompt).toBe('my custom dragon prompt')
    })

    it('usePrompt sets prompt only and never triggers segmentation', () => {
      useAppStore.getState().usePrompt('alternative prompt')
      expect(useAppStore.getState().prompt).toBe('alternative prompt')
      expect(mockApiClient.segment).not.toHaveBeenCalled()
    })
  })

  describe('runSegmentation & cancelSegmentation', () => {
    beforeEach(() => {
      useAppStore.setState({
        image: {
          file: new File([''], 't.png', { type: 'image/png' }),
          url: 'blob:t',
          naturalWidth: 1000,
          naturalHeight: 1000,
        },
      })
    })

    it('validates prompt required for text mode', async () => {
      useAppStore.setState({ mode: 'text', prompt: '' })
      await useAppStore.getState().runSegmentation()
      expect(useAppStore.getState().segmentStatus).toBe('error')
      expect(useAppStore.getState().segmentError?.kind).toBe('validation')
    })

    it('validates box required for box mode', async () => {
      useAppStore.setState({ mode: 'box', box: null })
      await useAppStore.getState().runSegmentation()
      expect(useAppStore.getState().segmentStatus).toBe('error')
      expect(useAppStore.getState().segmentError?.kind).toBe('validation')
    })

    it('validates both prompt and box for text_box mode', async () => {
      useAppStore.setState({ mode: 'text_box', prompt: 'cat', box: null })
      await useAppStore.getState().runSegmentation()
      expect(useAppStore.getState().segmentStatus).toBe('error')

      useAppStore.setState({ mode: 'text_box', prompt: '', box: { x1: 0, y1: 0, x2: 100, y2: 100 } })
      await useAppStore.getState().runSegmentation()
      expect(useAppStore.getState().segmentStatus).toBe('error')
    })

    it('successfully runs segmentation and does not auto-select candidate', async () => {
      const mockResult: SegmentResult = {
        metadata: {
          prompt: 'flower',
          mode: 'text',
          bbox_input: null,
          image_size: [1000, 1000],
          confidence_threshold: 0.35,
          crop_padding_px: 12,
          elapsed_ms: 200,
          num_candidates: 2,
          candidates: [],
        },
        candidates: [],
        zipBlob: new Blob(),
        dispose: vi.fn(),
      }
      vi.mocked(mockApiClient.segment!).mockResolvedValue(mockResult)

      useAppStore.setState({ mode: 'text', prompt: 'flower' })
      await useAppStore.getState().runSegmentation()

      expect(useAppStore.getState().segmentStatus).toBe('success')
      expect(useAppStore.getState().result).toBe(mockResult)
      expect(useAppStore.getState().selectedCandidateId).toBeNull()
    })

    it('disposes previous result before running segmentation', async () => {
      const disposeSpy = vi.fn()
      const prevResult: SegmentResult = {
        metadata: {
          prompt: 'old',
          mode: 'text',
          bbox_input: null,
          image_size: [100, 100],
          confidence_threshold: 0.35,
          crop_padding_px: 12,
          elapsed_ms: 10,
          num_candidates: 0,
          candidates: [],
        },
        candidates: [],
        zipBlob: new Blob(),
        dispose: disposeSpy,
      }
      useAppStore.setState({ result: prevResult, mode: 'text', prompt: 'new prompt' })

      vi.mocked(mockApiClient.segment!).mockResolvedValue({
        metadata: { ...prevResult.metadata, prompt: 'new prompt' },
        candidates: [],
        zipBlob: new Blob(),
        dispose: vi.fn(),
      })

      await useAppStore.getState().runSegmentation()
      expect(disposeSpy).toHaveBeenCalled()
    })

    it('cancelSegmentation aborts in-flight request and returns to idle without error', async () => {
      let aborted = false
      vi.mocked(mockApiClient.segment!).mockImplementation((_req, signal) => {
        return new Promise((_, reject) => {
          signal?.addEventListener('abort', () => {
            aborted = true
            reject(new DOMException('The operation was aborted', 'AbortError'))
          })
        })
      })

      useAppStore.setState({ mode: 'text', prompt: 'test' })

      const promise = useAppStore.getState().runSegmentation()
      expect(useAppStore.getState().segmentStatus).toBe('loading')

      useAppStore.getState().cancelSegmentation()
      await promise

      expect(aborted).toBe(true)
      expect(useAppStore.getState().segmentStatus).toBe('idle')
      expect(useAppStore.getState().segmentError).toBeNull()
    })

    it('disposes late result when request is superseded while in flight', async () => {
      const disposeSpy = vi.fn()
      let resolveFirst: (res: SegmentResult) => void
      const firstPromise = new Promise<SegmentResult>((resolve) => {
        resolveFirst = resolve
      })

      vi.mocked(mockApiClient.segment!)
        .mockReturnValueOnce(firstPromise)
        .mockResolvedValueOnce({
          metadata: {
            prompt: 'second',
            mode: 'text',
            bbox_input: null,
            image_size: [1000, 1000],
            confidence_threshold: 0.35,
            crop_padding_px: 12,
            elapsed_ms: 10,
            num_candidates: 0,
            candidates: [],
          },
          candidates: [],
          zipBlob: new Blob(),
          dispose: vi.fn(),
        })

      useAppStore.setState({ mode: 'text', prompt: 'first' })
      const run1 = useAppStore.getState().runSegmentation()

      // Supersede with a second request
      useAppStore.setState({ prompt: 'second' })
      const run2 = useAppStore.getState().runSegmentation()

      // Now resolve the first request
      resolveFirst!({
        metadata: {
          prompt: 'first',
          mode: 'text',
          bbox_input: null,
          image_size: [1000, 1000],
          confidence_threshold: 0.35,
          crop_padding_px: 12,
          elapsed_ms: 10,
          num_candidates: 0,
          candidates: [],
        },
        candidates: [],
        zipBlob: new Blob(),
        dispose: disposeSpy,
      })

      await run1
      await run2

      // The late first result must have been disposed to prevent leaking URLs
      expect(disposeSpy).toHaveBeenCalledTimes(1)
      expect(useAppStore.getState().result?.metadata.prompt).toBe('second')
    })

    it('selectCandidate sets selectedCandidateId', () => {
      useAppStore.getState().selectCandidate(1)
      expect(useAppStore.getState().selectedCandidateId).toBe(1)
      useAppStore.getState().selectCandidate(null)
      expect(useAppStore.getState().selectedCandidateId).toBeNull()
    })
  })

  describe('getFullCutoutBlob', () => {
    it('returns null if there is no segment result or candidate not found', async () => {
      expect(await useAppStore.getState().getFullCutoutBlob(0)).toBeNull()

      useAppStore.setState({
        result: {
          metadata: {
            prompt: 'test',
            mode: 'text',
            bbox_input: null,
            image_size: [100, 100],
            confidence_threshold: 0.35,
            crop_padding_px: 12,
            elapsed_ms: 10,
            num_candidates: 0,
            candidates: [],
          },
          candidates: [],
          zipBlob: new Blob(),
          dispose: vi.fn(),
        },
      })
      expect(await useAppStore.getState().getFullCutoutBlob(99)).toBeNull()
    })

    it('returns candidate.blobs.cutout immediately if already present (full profile)', async () => {
      const existingCutout = new Blob(['full-cutout'], { type: 'image/png' })
      const candidate: CandidateAssets = {
        meta: {
          id: 0,
          score: 0.9,
          bbox_xyxy_px: [10, 10, 50, 50],
          mask_area_px: 1000,
          files: { cutout: 'candidate_00_cutout.png' },
        },
        urls: {},
        blobs: { cutout: existingCutout },
      }

      useAppStore.setState({
        result: {
          metadata: {
            prompt: 'test',
            mode: 'text',
            bbox_input: null,
            image_size: [1000, 800],
            confidence_threshold: 0.35,
            crop_padding_px: 12,
            elapsed_ms: 10,
            num_candidates: 1,
            candidates: [candidate.meta],
          },
          candidates: [candidate],
          zipBlob: new Blob(),
          dispose: vi.fn(),
        },
      })

      const blob = await useAppStore.getState().getFullCutoutBlob(0)
      expect(blob).toBe(existingCutout)
    })

    it('composes full cutout from cropBlob + cropBox when cutout is absent (lean profile), caches and disposes URL', async () => {
      const cropBlob = new Blob(['crop-bytes'], { type: 'image/png' })
      const composedBlob = new Blob(['composed-bytes'], { type: 'image/png' })
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:composed-url')

      const mockCanvas = {
        width: 1000,
        height: 800,
        getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
        convertToBlob: vi.fn().mockResolvedValue(composedBlob),
      }
      setCanvasFactory(() => mockCanvas as any)
      setImageBitmapLoader(vi.fn().mockResolvedValue({ close: vi.fn() }))

      const candidate: CandidateAssets = {
        meta: {
          id: 0,
          score: 0.9,
          bbox_xyxy_px: [100, 100, 400, 400],
          crop_box_xyxy_px: [88, 88, 412, 412],
          mask_area_px: 5000,
          files: { cutout_crop: 'candidate_00_cutout_crop.png' },
        },
        urls: {},
        blobs: { cutout_crop: cropBlob },
      }

      const origDispose = vi.fn()
      const resultObj = {
        metadata: {
          prompt: 'test',
          mode: 'text' as const,
          bbox_input: null,
          image_size: [1000, 800] as [number, number],
          confidence_threshold: 0.35,
          crop_padding_px: 12,
          export_profile: 'lean' as const,
          elapsed_ms: 10,
          num_candidates: 1,
          candidates: [candidate.meta],
        },
        candidates: [candidate],
        zipBlob: new Blob(),
        dispose: origDispose,
      }

      useAppStore.setState({ result: resultObj })

      // First call composes
      const blob1 = await useAppStore.getState().getFullCutoutBlob(0)
      expect(blob1).toBe(composedBlob)
      expect(candidate.blobs.cutout).toBe(composedBlob)
      expect(candidate.urls.cutout).toBe('blob:composed-url')

      // Second call returns cached without recomposing
      const blob2 = await useAppStore.getState().getFullCutoutBlob(0)
      expect(blob2).toBe(composedBlob)
      expect(mockCanvas.convertToBlob).toHaveBeenCalledTimes(1)

      // Disposing result revokes the composed cutout URL
      resultObj.dispose()
      expect(revokeSpy).toHaveBeenCalledWith('blob:composed-url')
      expect(origDispose).toHaveBeenCalledTimes(1)
    })
  })
})
