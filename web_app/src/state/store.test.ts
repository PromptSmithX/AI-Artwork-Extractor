import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../core/api/errors'
import { setApiClientFactory, useAppStore } from './store'
import type { ApiClient } from '../core/api/client'
import type { HealthResponse, PromptSuggestion, SegmentResult } from '../core/types'

describe('useAppStore', () => {
  let mockApiClient: Partial<ApiClient>

  beforeEach(() => {
    localStorage.clear()
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
      // Attach mock dimensions for test reader
      ;(dummyFile as unknown as { _mockWidth: number; _mockHeight: number })._mockWidth = 800
      ;(dummyFile as unknown as { _mockWidth: number; _mockHeight: number })._mockHeight = 600

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
      expect(state.box).toBeNull()
      expect(state.selectedCandidateId).toBeNull()

      // Loading another image revokes the previous one
      const dummyFile2 = new File(['dummy2'], 'sample2.jpg', { type: 'image/jpeg' })
      ;(dummyFile2 as unknown as { _mockWidth: number; _mockHeight: number })._mockWidth = 1000
      ;(dummyFile2 as unknown as { _mockWidth: number; _mockHeight: number })._mockHeight = 500

      await useAppStore.getState().loadImage(dummyFile2)
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock-image')
    })

    it('rejects unsupported file type', async () => {
      const badFile = new File(['text'], 'notes.txt', { type: 'text/plain' })
      await expect(useAppStore.getState().loadImage(badFile)).rejects.toThrow(/Unsupported image type/)
      expect(useAppStore.getState().imageStatus).toBe('error')
      expect(useAppStore.getState().imageError).toContain('Unsupported image type')
    })

    it('rejects image over 20 MB', async () => {
      const largeFile = new File([''], 'huge.png', { type: 'image/png' })
      Object.defineProperty(largeFile, 'size', { value: 25 * 1024 * 1024 })
      await expect(useAppStore.getState().loadImage(largeFile)).rejects.toThrow(/exceeds 20 MB/)
      expect(useAppStore.getState().imageStatus).toBe('error')
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

    it('selectCandidate sets selectedCandidateId', () => {
      useAppStore.getState().selectCandidate(1)
      expect(useAppStore.getState().selectedCandidateId).toBe(1)
      useAppStore.getState().selectCandidate(null)
      expect(useAppStore.getState().selectedCandidateId).toBeNull()
    })
  })
})
