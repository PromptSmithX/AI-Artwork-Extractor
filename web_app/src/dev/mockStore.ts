/**
 * Dev-only mock store & fixtures for designing and testing UI states.
 * Allows simulating every state: empty, loaded, assistant_ready, segmenting, results, 0 candidates, error.
 */
import { useAppStore } from '../state/store'
import type {
  BoxXYXY,
  CandidateAssets,
  HealthResponse,
  Mode,
  PromptSuggestion,
  ScopePreference,
  SegmentResult,
} from '../core/types'
import { ApiError } from '../core/api/errors'

// Generate sample SVG data URLs for instant rendering without external network
function createSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const SAMPLE_IMAGE_WIDTH = 1200
export const SAMPLE_IMAGE_HEIGHT = 900

export const SAMPLE_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SAMPLE_IMAGE_WIDTH}" height="${SAMPLE_IMAGE_HEIGHT}" viewBox="0 0 ${SAMPLE_IMAGE_WIDTH} ${SAMPLE_IMAGE_HEIGHT}">
  <rect width="100%" height="100%" fill="#1e293b"/>
  <!-- Denim texture background effect -->
  <pattern id="denim" width="20" height="20" patternUnits="userSpaceOnUse">
    <path d="M0 10 L20 10 M10 0 L10 20" stroke="#334155" stroke-width="1"/>
  </pattern>
  <rect width="100%" height="100%" fill="url(#denim)" opacity="0.3"/>
  <!-- Patch border and base -->
  <rect x="360" y="220" width="480" height="460" rx="24" fill="#3b82f6" stroke="#fbbf24" stroke-width="12" stroke-dasharray="16 8"/>
  <rect x="380" y="240" width="440" height="420" rx="16" fill="#1d4ed8"/>
  <!-- Inner Artwork: Heart Flower -->
  <path d="M600 360 C560 300 480 320 480 390 C480 470 600 560 600 560 C600 560 720 470 720 390 C720 320 640 300 600 360 Z" fill="#f43f5e" stroke="#ffe4e6" stroke-width="6"/>
  <!-- Center flower detail -->
  <circle cx="600" cy="420" r="32" fill="#fbbf24"/>
  <text x="600" y="620" fill="#f8fafc" font-family="sans-serif" font-size="28" font-weight="bold" text-anchor="middle">ARTWORK STUDIO</text>
</svg>`

export const SAMPLE_OVERLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SAMPLE_IMAGE_WIDTH}" height="${SAMPLE_IMAGE_HEIGHT}" viewBox="0 0 ${SAMPLE_IMAGE_WIDTH} ${SAMPLE_IMAGE_HEIGHT}">
  <rect width="100%" height="100%" fill="#1e293b"/>
  <rect x="360" y="220" width="480" height="460" rx="24" fill="#38bdf8" fill-opacity="0.55" stroke="#0284c7" stroke-width="6"/>
</svg>`

export const SAMPLE_MASK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SAMPLE_IMAGE_WIDTH}" height="${SAMPLE_IMAGE_HEIGHT}" viewBox="0 0 ${SAMPLE_IMAGE_WIDTH} ${SAMPLE_IMAGE_HEIGHT}">
  <rect width="100%" height="100%" fill="#000000"/>
  <rect x="360" y="220" width="480" height="460" rx="24" fill="#ffffff"/>
</svg>`

export const SAMPLE_CUTOUT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SAMPLE_IMAGE_WIDTH}" height="${SAMPLE_IMAGE_HEIGHT}" viewBox="0 0 ${SAMPLE_IMAGE_WIDTH} ${SAMPLE_IMAGE_HEIGHT}">
  <rect x="360" y="220" width="480" height="460" rx="24" fill="#3b82f6" stroke="#fbbf24" stroke-width="12" stroke-dasharray="16 8"/>
  <rect x="380" y="240" width="440" height="420" rx="16" fill="#1d4ed8"/>
  <path d="M600 360 C560 300 480 320 480 390 C480 470 600 560 600 560 C600 560 720 470 720 390 C720 320 640 300 600 360 Z" fill="#f43f5e" stroke="#ffe4e6" stroke-width="6"/>
  <circle cx="600" cy="420" r="32" fill="#fbbf24"/>
  <text x="600" y="620" fill="#f8fafc" font-family="sans-serif" font-size="28" font-weight="bold" text-anchor="middle">ARTWORK STUDIO</text>
</svg>`

export const SAMPLE_CROP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="504" height="484" viewBox="0 0 504 484">
  <rect x="12" y="12" width="480" height="460" rx="24" fill="#3b82f6" stroke="#fbbf24" stroke-width="12" stroke-dasharray="16 8"/>
  <rect x="32" y="32" width="440" height="420" rx="16" fill="#1d4ed8"/>
  <path d="M252 152 C212 92 132 112 132 182 C132 262 252 352 252 352 C252 352 372 262 372 182 C372 112 292 92 252 152 Z" fill="#f43f5e" stroke="#ffe4e6" stroke-width="6"/>
  <circle cx="252" cy="212" r="32" fill="#fbbf24"/>
  <text x="252" y="412" fill="#f8fafc" font-family="sans-serif" font-size="28" font-weight="bold" text-anchor="middle">ARTWORK STUDIO</text>
</svg>`

export const SAMPLE_SUGGESTION: PromptSuggestion = {
  target_description: 'Toàn bộ patch vuông ở ngực áo có bông hoa hình trái tim bên trong, bao gồm viền vải thêu',
  scope: 'entire_patch',
  sam_prompt: 'square embroidered fabric patch',
  alternative_prompts: [
    'square embroidered badge',
    'square fabric applique',
    'embroidered denim heart patch',
  ],
  location_hint: 'chest area, left side',
  needs_clarification: false,
  clarification_question: '',
  reason: 'Người dùng yêu cầu lấy cả viền vải và patch bên ngoài (entire_patch).',
}

export const SAMPLE_HEALTH: HealthResponse = {
  status: 'ok',
  gpu: 'Tesla T4 (15.8 GB)',
  sam3_loaded: true,
  qwen_loaded: true,
  prompt_assistant_available: true,
  busy: false,
}

export function createMockCandidates(): CandidateAssets[] {
  const overlayUrl = createSvgDataUrl(SAMPLE_OVERLAY_SVG)
  const maskUrl = createSvgDataUrl(SAMPLE_MASK_SVG)
  const cutoutUrl = createSvgDataUrl(SAMPLE_CUTOUT_SVG)
  const cropUrl = createSvgDataUrl(SAMPLE_CROP_SVG)

  return [
    {
      meta: {
        id: 0,
        score: 0.942,
        bbox_xyxy_px: [360, 220, 840, 680],
        mask_area_px: 220800,
        files: {
          mask: 'candidate_00_mask.png',
          overlay: 'candidate_00_overlay.png',
          cutout: 'candidate_00_cutout.png',
          cutout_crop: 'candidate_00_cutout_crop.png',
        },
      },
      urls: {
        mask: maskUrl,
        overlay: overlayUrl,
        cutout: cutoutUrl,
        cutout_crop: cropUrl,
      },
      blobs: {
        mask: new Blob([SAMPLE_MASK_SVG], { type: 'image/svg+xml' }),
        overlay: new Blob([SAMPLE_OVERLAY_SVG], { type: 'image/svg+xml' }),
        cutout: new Blob([SAMPLE_CUTOUT_SVG], { type: 'image/svg+xml' }),
        cutout_crop: new Blob([SAMPLE_CROP_SVG], { type: 'image/svg+xml' }),
      },
    },
    {
      meta: {
        id: 1,
        score: 0.865,
        bbox_xyxy_px: [480, 310, 720, 560],
        mask_area_px: 75400,
        files: {
          mask: 'candidate_01_mask.png',
          overlay: 'candidate_01_overlay.png',
          cutout: 'candidate_01_cutout.png',
          cutout_crop: 'candidate_01_cutout_crop.png',
        },
      },
      urls: {
        mask: maskUrl,
        overlay: overlayUrl,
        cutout: cutoutUrl,
        cutout_crop: cropUrl,
      },
      blobs: {},
    },
    {
      meta: {
        id: 2,
        score: 0.741,
        bbox_xyxy_px: [440, 590, 760, 635],
        mask_area_px: 12800,
        files: {
          mask: 'candidate_02_mask.png',
          overlay: 'candidate_02_overlay.png',
          cutout: 'candidate_02_cutout.png',
        },
      },
      urls: {
        mask: maskUrl,
        overlay: overlayUrl,
        cutout: cutoutUrl,
      },
      blobs: {},
    },
  ]
}

export function createMockSegmentResult(candidates = createMockCandidates()): SegmentResult {
  return {
    metadata: {
      prompt: 'square embroidered fabric patch',
      mode: 'text_box',
      bbox_input: [0.5, 0.5, 0.4, 0.51],
      image_size: [SAMPLE_IMAGE_WIDTH, SAMPLE_IMAGE_HEIGHT],
      confidence_threshold: 0.35,
      crop_padding_px: 12,
      elapsed_ms: 1840,
      num_candidates: candidates.length,
      num_candidates_total: candidates.length,
      candidates: candidates.map((c) => c.meta),
    },
    candidates,
    zipBlob: new Blob(['mock-zip-content'], { type: 'application/zip' }),
    dispose: () => {},
  }
}

/**
 * Initialize mock store actions so all interactive features (upload, prompts, box, sam) work.
 */
export function initializeMockStore() {
  useAppStore.setState({
    connection: {
      baseUrl: 'https://demo-art-extract.trycloudflare.com',
      token: 'colab_secret_token_123',
      timeoutMs: 180000,
    },
    health: SAMPLE_HEALTH,
    healthStatus: 'success',

    setConnection: (patch) => {
      useAppStore.setState((s) => ({
        connection: { ...s.connection, ...patch },
      }))
    },

    checkHealth: async () => {
      useAppStore.setState({ healthStatus: 'loading', healthError: null })
      await new Promise((r) => setTimeout(r, 400))
      useAppStore.setState({
        health: SAMPLE_HEALTH,
        healthStatus: 'success',
      })
    },

    loadImage: async (file: File) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.src = url
      await new Promise((resolve) => {
        img.onload = () => resolve(true)
        img.onerror = () => resolve(false)
      })
      useAppStore.setState({
        image: {
          file,
          url,
          naturalWidth: img.naturalWidth || 800,
          naturalHeight: img.naturalHeight || 600,
        },
        box: null,
        result: null,
        selectedCandidateId: null,
      })
    },

    clearImage: () => {
      const current = useAppStore.getState().image
      if (current?.url && current.url.startsWith('blob:')) {
        URL.revokeObjectURL(current.url)
      }
      useAppStore.setState({
        image: null,
        box: null,
        result: null,
        selectedCandidateId: null,
      })
    },

    setMode: (mode: Mode) => {
      useAppStore.setState({ mode })
    },

    setBox: (box: BoxXYXY | null) => {
      useAppStore.setState({ box })
    },

    setPrompt: (prompt: string) => {
      useAppStore.setState({ prompt })
    },

    setUserRequest: (userRequest: string) => {
      useAppStore.setState({ userRequest })
    },

    setScopePreference: (scopePreference: ScopePreference) => {
      useAppStore.setState({ scopePreference })
    },

    setConfidenceThreshold: (confidenceThreshold: number) => {
      useAppStore.setState({ confidenceThreshold })
    },

    askAssistant: async () => {
      useAppStore.setState({ suggestStatus: 'loading', suggestError: null })
      await new Promise((r) => setTimeout(r, 700))
      useAppStore.setState({
        suggestion: SAMPLE_SUGGESTION,
        suggestStatus: 'success',
        prompt: SAMPLE_SUGGESTION.sam_prompt,
      })
    },

    usePrompt: (prompt: string) => {
      useAppStore.setState({ prompt })
    },

    runSegmentation: async () => {
      useAppStore.setState({
        segmentStatus: 'loading',
        segmentError: null,
        segmentStartedAt: Date.now(),
      })
      await new Promise((r) => setTimeout(r, 1200))
      const res = createMockSegmentResult()
      useAppStore.setState({
        result: res,
        segmentStatus: 'success',
        segmentStartedAt: null,
        selectedCandidateId: null, // rule: never auto-pick
      })
    },

    cancelSegmentation: () => {
      useAppStore.setState({
        segmentStatus: 'idle',
        segmentStartedAt: null,
      })
    },

    selectCandidate: (id: number | null) => {
      useAppStore.setState({ selectedCandidateId: id })
    },
  })
}

/**
 * Switch store to a specific preset state for visual review and testing.
 */
export function setPresetState(
  preset:
    | 'empty'
    | 'loaded'
    | 'assistant_ready'
    | 'segmenting'
    | 'results'
    | 'zero_candidates'
    | 'error',
) {
  const sampleUrl = createSvgDataUrl(SAMPLE_IMAGE_SVG)
  const mockFile = new File(['mock-img'], 'sample_jacket_patch.png', { type: 'image/png' })

  switch (preset) {
    case 'empty':
      useAppStore.setState({
        image: null,
        box: null,
        prompt: '',
        userRequest: '',
        suggestion: null,
        result: null,
        selectedCandidateId: null,
        segmentStatus: 'idle',
        suggestStatus: 'idle',
        healthError: null,
      })
      break

    case 'loaded':
      useAppStore.setState({
        image: {
          file: mockFile,
          url: sampleUrl,
          naturalWidth: SAMPLE_IMAGE_WIDTH,
          naturalHeight: SAMPLE_IMAGE_HEIGHT,
        },
        mode: 'text_box',
        box: { x1: 340, y1: 200, x2: 860, y2: 700 },
        prompt: 'square embroidered fabric patch',
        userRequest: 'Lấy toàn bộ patch vuông ở ngực áo, bao gồm viền vải.',
        suggestion: null,
        result: null,
        selectedCandidateId: null,
        segmentStatus: 'idle',
        suggestStatus: 'idle',
      })
      break

    case 'assistant_ready':
      useAppStore.setState({
        image: {
          file: mockFile,
          url: sampleUrl,
          naturalWidth: SAMPLE_IMAGE_WIDTH,
          naturalHeight: SAMPLE_IMAGE_HEIGHT,
        },
        mode: 'text_box',
        box: { x1: 340, y1: 200, x2: 860, y2: 700 },
        userRequest: 'Lấy toàn bộ patch vuông ở ngực áo có bông hoa hình trái tim bên trong, bao gồm viền vải.',
        suggestion: SAMPLE_SUGGESTION,
        prompt: SAMPLE_SUGGESTION.sam_prompt,
        suggestStatus: 'success',
        result: null,
        selectedCandidateId: null,
        segmentStatus: 'idle',
      })
      break

    case 'segmenting':
      useAppStore.setState({
        image: {
          file: mockFile,
          url: sampleUrl,
          naturalWidth: SAMPLE_IMAGE_WIDTH,
          naturalHeight: SAMPLE_IMAGE_HEIGHT,
        },
        mode: 'text_box',
        box: { x1: 340, y1: 200, x2: 860, y2: 700 },
        prompt: 'square embroidered fabric patch',
        segmentStatus: 'loading',
        segmentStartedAt: Date.now() - 3200,
        result: null,
        selectedCandidateId: null,
      })
      break

    case 'results': {
      const res = createMockSegmentResult()
      useAppStore.setState({
        image: {
          file: mockFile,
          url: sampleUrl,
          naturalWidth: SAMPLE_IMAGE_WIDTH,
          naturalHeight: SAMPLE_IMAGE_HEIGHT,
        },
        mode: 'text_box',
        box: { x1: 340, y1: 200, x2: 860, y2: 700 },
        prompt: 'square embroidered fabric patch',
        suggestion: SAMPLE_SUGGESTION,
        result: res,
        segmentStatus: 'success',
        selectedCandidateId: 0,
      })
      break
    }

    case 'zero_candidates': {
      const emptyRes = createMockSegmentResult([])
      useAppStore.setState({
        image: {
          file: mockFile,
          url: sampleUrl,
          naturalWidth: SAMPLE_IMAGE_WIDTH,
          naturalHeight: SAMPLE_IMAGE_HEIGHT,
        },
        mode: 'text',
        prompt: 'obscure unmatched object',
        result: emptyRes,
        segmentStatus: 'success',
        selectedCandidateId: null,
      })
      break
    }

    case 'error':
      useAppStore.setState({
        healthStatus: 'error',
        healthError: new ApiError('disconnected', 502, 'Cloudflare Tunnel 502 Bad Gateway'),
      })
      break
  }
}
