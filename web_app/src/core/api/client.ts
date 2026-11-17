/**
 * HTTP client for the Colab API (implements ApiClient with fetch).
 */
import { parseSegmentZip } from '../zip/parseResult'
import { ApiError } from './errors'
import type {
  ConnectionConfig,
  HealthResponse,
  PromptSuggestion,
  SegmentRequest,
  SegmentResult,
  SuggestRequest,
} from '../types'

export interface ApiClient {
  health(signal?: AbortSignal): Promise<HealthResponse>
  suggestPrompt(req: SuggestRequest, signal?: AbortSignal): Promise<PromptSuggestion>
  segment(req: SegmentRequest, signal?: AbortSignal): Promise<SegmentResult>
}

type EndpointKind = 'health' | 'assistant' | 'segment'

function isCloudflareHtml(status: number, contentType: string, bodyText: string): boolean {
  if (status !== 502 && status !== 530 && status !== 524) {
    return false
  }
  const ct = contentType.toLowerCase()
  if (ct.includes('text/html')) {
    return true
  }
  const prefix = bodyText.slice(0, 500).toLowerCase()
  return (
    prefix.includes('<!doctype html') ||
    prefix.includes('<html') ||
    prefix.includes('cloudflare')
  )
}

function extractDetail(bodyText: string): string {
  try {
    const data = JSON.parse(bodyText)
    if (data && typeof data === 'object' && 'detail' in data) {
      return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
    }
  } catch {
    // Not JSON, return raw text
  }
  return bodyText
}

function handleStatusError(
  status: number,
  bodyText: string,
  contentType: string,
  endpoint: EndpointKind,
): never {
  if (isCloudflareHtml(status, contentType, bodyText)) {
    throw new ApiError(
      'disconnected',
      status,
      `Cloudflare tunnel error (${status}): Colab tunnel may be down or expired.`,
    )
  }

  const detail = extractDetail(bodyText)

  if (status === 401) {
    throw new ApiError('auth', 401, detail || 'Unauthorized: invalid or missing API token.')
  }
  if (status === 409) {
    throw new ApiError('busy', 409, detail || 'Server is busy with another inference.')
  }
  if (status === 413) {
    throw new ApiError('too_large', 413, detail || 'Payload too large (exceeds max upload limit).')
  }
  if (status === 415) {
    throw new ApiError('unsupported_media', 415, detail || 'Unsupported media type.')
  }
  if (status === 422) {
    throw new ApiError('validation', 422, detail || 'Validation error.')
  }
  if (status === 502) {
    if (endpoint === 'assistant') {
      throw new ApiError(
        'assistant_bad_output',
        502,
        detail || 'Assistant returned unparseable output after retry.',
      )
    }
    throw new ApiError('server', 502, detail || 'Bad Gateway.')
  }
  if (status === 503) {
    if (endpoint === 'assistant') {
      throw new ApiError(
        'assistant_unavailable',
        503,
        detail || 'Prompt assistant or model is currently unavailable.',
      )
    }
    if (endpoint === 'segment') {
      throw new ApiError(
        'sam_unavailable',
        503,
        detail || 'SAM 3 model is not loaded or unavailable on Colab server.',
      )
    }
    throw new ApiError('server', 503, detail || 'Service Unavailable.')
  }

  throw new ApiError('server', status, detail || `Server error (${status}).`)
}

export function createApiClient(config: ConnectionConfig): ApiClient {
  const baseUrl = (config.baseUrl || '').trim().replace(/\/+$/, '')
  const token = (config.token || '').trim()
  const timeoutMs = config.timeoutMs

  async function executeFetch<T>(
    endpoint: EndpointKind,
    url: string,
    options: RequestInit,
    callerSignal?: AbortSignal,
    parseResponse?: (res: Response) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let didTimeout = false

    if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
      timer = setTimeout(() => {
        didTimeout = true
        controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError'))
      }, timeoutMs)
    }

    const onCallerAbort = () => {
      controller.abort(callerSignal?.reason ?? new DOMException('The operation was aborted', 'AbortError'))
    }

    if (callerSignal) {
      if (callerSignal.aborted) {
        if (timer !== undefined) clearTimeout(timer)
        throw callerSignal.reason ?? new DOMException('The operation was aborted', 'AbortError')
      }
      callerSignal.addEventListener('abort', onCallerAbort, { once: true })
    }

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      })

      if (!res.ok) {
        const bodyText = await res.text()
        const contentType = res.headers.get('content-type') || ''
        handleStatusError(res.status, bodyText, contentType, endpoint)
      }

      if (parseResponse) {
        return await parseResponse(res)
      }
      return (await res.json()) as T
    } catch (err: unknown) {
      if (callerSignal?.aborted) {
        // User cancel -> rethrow AbortError so UI can ignore it
        if (callerSignal.reason) {
          throw callerSignal.reason
        }
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err
        }
        throw new DOMException('The operation was aborted', 'AbortError')
      }

      if (didTimeout) {
        throw new ApiError('disconnected', null, `Request timed out after ${timeoutMs}ms`)
      }

      if (err instanceof ApiError) {
        throw err
      }

      // Network error or fetch TypeError
      const msg = err instanceof Error ? err.message : String(err)
      throw new ApiError('disconnected', null, `Failed to connect to ${url}: ${msg}`)
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
      if (callerSignal) {
        callerSignal.removeEventListener('abort', onCallerAbort)
      }
    }
  }

  return {
    async health(signal?: AbortSignal): Promise<HealthResponse> {
      const url = `${baseUrl}/health`
      return executeFetch<HealthResponse>('health', url, { method: 'GET' }, signal)
    },

    async suggestPrompt(req: SuggestRequest, signal?: AbortSignal): Promise<PromptSuggestion> {
      const url = `${baseUrl}/api/v1/assistant/prompt`
      const formData = new FormData()
      formData.append('image', req.image, req.filename)
      formData.append('user_request', req.userRequest)
      formData.append('scope_preference', req.scopePreference || 'auto')

      const headers: Record<string, string> = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      return executeFetch<PromptSuggestion>(
        'assistant',
        url,
        {
          method: 'POST',
          headers,
          body: formData,
        },
        signal,
      )
    },

    async segment(req: SegmentRequest, signal?: AbortSignal): Promise<SegmentResult> {
      const url = `${baseUrl}/api/v1/segment`
      const formData = new FormData()
      formData.append('image', req.image, req.filename)
      formData.append('mode', req.mode)

      if (req.prompt !== undefined && req.prompt !== null && req.prompt !== '') {
        formData.append('prompt', req.prompt)
      }
      if (req.bbox !== undefined && req.bbox !== null) {
        formData.append('bbox', JSON.stringify(req.bbox))
      }
      if (req.confidenceThreshold !== undefined && req.confidenceThreshold !== null) {
        formData.append('confidence_threshold', String(req.confidenceThreshold))
      }

      const headers: Record<string, string> = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      return executeFetch<SegmentResult>(
        'segment',
        url,
        {
          method: 'POST',
          headers,
          body: formData,
        },
        signal,
        async (res: Response) => {
          const blob = await res.blob()
          return parseSegmentZip(blob)
        },
      )
    },
  }
}
