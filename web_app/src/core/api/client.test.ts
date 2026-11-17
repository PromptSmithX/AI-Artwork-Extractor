import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './errors'
import { createApiClient } from './client'
import * as zipParser from '../zip/parseResult'
import type { SegmentResult } from '../types'

describe('createApiClient', () => {
  const origFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = origFetch
  })

  it('normalizes base URL and trims trailing slashes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', gpu: null, sam3_loaded: true, qwen_loaded: false, prompt_assistant_available: true, busy: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    globalThis.fetch = fetchMock

    const client = createApiClient({
      baseUrl: '  https://my-colab.trycloudflare.com///  ',
      token: 'test-token',
      timeoutMs: 5000,
    })

    await client.health()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://my-colab.trycloudflare.com/health')
    expect(init.method).toBe('GET')
    expect(init.headers).toBeUndefined()
  })

  it('health() sends no Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', gpu: 'T4', sam3_loaded: true, qwen_loaded: true, prompt_assistant_available: true, busy: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    globalThis.fetch = fetchMock

    const client = createApiClient({ baseUrl: 'http://localhost:8000', token: 'secret', timeoutMs: 5000 })
    const res = await client.health()

    expect(res.status).toBe('ok')
    expect(res.gpu).toBe('T4')
    const init = fetchMock.mock.calls[0][1]
    expect(init.headers).toBeUndefined()
  })

  it('suggestPrompt() sends Bearer token and correct FormData', async () => {
    const suggestionData = {
      target_description: 'fabric patch',
      scope: 'entire_patch',
      sam_prompt: 'square embroidered fabric patch',
      alternative_prompts: ['patch'],
      location_hint: 'center',
      needs_clarification: false,
      clarification_question: '',
      reason: 'detected patch',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(suggestionData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    globalThis.fetch = fetchMock

    const client = createApiClient({ baseUrl: 'http://localhost:8000', token: 'secret-123', timeoutMs: 5000 })
    const dummyBlob = new Blob(['image-content'], { type: 'image/png' })

    const res = await client.suggestPrompt({
      image: dummyBlob,
      filename: 'sample.png',
      userRequest: 'lấy hình con rồng',
      scopePreference: 'entire_patch',
    })

    expect(res.sam_prompt).toBe('square embroidered fabric patch')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8000/api/v1/assistant/prompt')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: 'Bearer secret-123' })

    const formData = init.body as FormData
    expect(formData.get('image')).toBeInstanceOf(Blob)
    expect(formData.get('user_request')).toBe('lấy hình con rồng')
    expect(formData.get('scope_preference')).toBe('entire_patch')
  })

  it('segment() sends Bearer token, correct FormData, and calls parseSegmentZip', async () => {
    const mockResult: SegmentResult = {
      metadata: {
        prompt: 'dragon',
        mode: 'text_box',
        bbox_input: [0.5, 0.5, 0.2, 0.2],
        image_size: [100, 100],
        confidence_threshold: 0.4,
        crop_padding_px: 12,
        elapsed_ms: 100,
        num_candidates: 1,
        candidates: [],
      },
      candidates: [],
      zipBlob: new Blob(['fake-zip']),
      dispose: vi.fn(),
    }
    vi.spyOn(zipParser, 'parseSegmentZip').mockResolvedValue(mockResult)

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(['fake-zip'], { type: 'application/zip' }), {
        status: 200,
        headers: { 'content-type': 'application/zip' },
      }),
    )
    globalThis.fetch = fetchMock

    const client = createApiClient({ baseUrl: 'http://localhost:8000', token: 'secret-123', timeoutMs: 5000 })
    const dummyBlob = new Blob(['img'], { type: 'image/jpeg' })

    const res = await client.segment({
      image: dummyBlob,
      filename: 'test.jpg',
      mode: 'text_box',
      prompt: 'dragon',
      bbox: [0.5, 0.5, 0.2, 0.2],
      confidenceThreshold: 0.4,
      exportProfile: 'lean',
    })

    expect(res).toBe(mockResult)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8000/api/v1/segment')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: 'Bearer secret-123' })

    const formData = init.body as FormData
    expect(formData.get('image')).toBeInstanceOf(Blob)
    expect(formData.get('mode')).toBe('text_box')
    expect(formData.get('prompt')).toBe('dragon')
    expect(formData.get('bbox')).toBe(JSON.stringify([0.5, 0.5, 0.2, 0.2]))
    expect(formData.get('confidence_threshold')).toBe('0.4')
    expect(formData.get('export_profile')).toBe('lean')
  })

  describe('status code and error mappings', () => {
    const setupResponse = (status: number, body: string, headers: Record<string, string> = {}) => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(body, {
          status,
          headers: { 'content-type': 'application/json', ...headers },
        }),
      )
    }

    it('maps 401 to auth', async () => {
      setupResponse(401, JSON.stringify({ detail: 'Invalid token' }))
      const client = createApiClient({ baseUrl: 'http://localhost:8000', token: 'bad', timeoutMs: 5000 })

      await expect(client.suggestPrompt({ image: new Blob(), filename: 'a.png', userRequest: 'hi', scopePreference: 'auto' })).rejects.toSatisfy(
        (err: ApiError) => err.kind === 'auth' && err.status === 401 && err.detail === 'Invalid token',
      )
    })

    it('maps 409 to busy', async () => {
      setupResponse(409, JSON.stringify({ detail: 'busy' }))
      const client = createApiClient({ baseUrl: 'http://localhost:8000', token: 'token', timeoutMs: 5000 })

      await expect(client.segment({ image: new Blob(), filename: 'a.png', mode: 'text', prompt: 'cat' })).rejects.toSatisfy(
        (err: ApiError) => err.kind === 'busy' && err.status === 409,
      )
    })

    it('maps 413 to too_large', async () => {
      setupResponse(413, JSON.stringify({ detail: 'Upload > 20MB' }))
      const client = createApiClient({ baseUrl: 'http://localhost:8000', token: 'token', timeoutMs: 5000 })

      await expect(client.segment({ image: new Blob(), filename: 'a.png', mode: 'text', prompt: 'cat' })).rejects.toSatisfy(
        (err: ApiError) => err.kind === 'too_large' && err.status === 413,
      )
    })

    it('maps 415 to unsupported_media', async () => {
      setupResponse(415, JSON.stringify({ detail: 'Not an image' }))
      const client = createApiClient({ baseUrl: 'http://localhost:8000', token: 'token', timeoutMs: 5000 })

      await expect(client.segment({ image: new Blob(), filename: 'a.txt', mode: 'text', prompt: 'cat' })).rejects.toSatisfy(
        (err: ApiError) => err.kind === 'unsupported_media' && err.status === 415,
      )
    })

    it('maps 422 to validation', async () => {
      setupResponse(422, JSON.stringify({ detail: 'Missing prompt' }))
      const client = createApiClient({ baseUrl: 'http://localhost:8000', token: 'token', timeoutMs: 5000 })

      await expect(client.segment({ image: new Blob(), filename: 'a.png', mode: 'text' })).rejects.toSatisfy(
        (err: ApiError) => err.kind === 'validation' && err.status === 422,
      )
    })

    it('maps 502 on assistant to assistant_bad_output', async () => {
      setupResponse(502, JSON.stringify({ detail: 'JSON parse error from Qwen' }))
      const client = createApiClient({ baseUrl: 'http://localhost:8000', token: 'token', timeoutMs: 5000 })

      await expect(client.suggestPrompt({ image: new Blob(), filename: 'a.png', userRequest: 'hi', scopePreference: 'auto' })).rejects.toSatisfy(
        (err: ApiError) => err.kind === 'assistant_bad_output' && err.status === 502,
      )
    })

    it('maps 503 on assistant to assistant_unavailable', async () => {
      setupResponse(503, JSON.stringify({ detail: 'Assistant model not loaded' }))
      const client = createApiClient({ baseUrl: 'http://localhost:8000', token: 'token', timeoutMs: 5000 })

      await expect(client.suggestPrompt({ image: new Blob(), filename: 'a.png', userRequest: 'hi', scopePreference: 'auto' })).rejects.toSatisfy(
        (err: ApiError) => err.kind === 'assistant_unavailable' && err.status === 503,
      )
    })

    it('maps 503 on segment to sam_unavailable', async () => {
      setupResponse(503, JSON.stringify({ detail: 'SAM 3 not loaded' }))
      const client = createApiClient({ baseUrl: 'http://localhost:8000', token: 'token', timeoutMs: 5000 })

      await expect(client.segment({ image: new Blob(), filename: 'a.png', mode: 'text', prompt: 'cat' })).rejects.toSatisfy(
        (err: ApiError) => err.kind === 'sam_unavailable' && err.status === 503,
      )
    })

    it('maps 500 to server', async () => {
      setupResponse(500, JSON.stringify({ detail: 'Internal crash' }))
      const client = createApiClient({ baseUrl: 'http://localhost:8000', token: 'token', timeoutMs: 5000 })

      await expect(client.segment({ image: new Blob(), filename: 'a.png', mode: 'text', prompt: 'cat' })).rejects.toSatisfy(
        (err: ApiError) => err.kind === 'server' && err.status === 500 && err.detail === 'Internal crash',
      )
    })

    it('maps Cloudflare 502/530/524 HTML error pages to disconnected', async () => {
      setupResponse(
        502,
        '<!DOCTYPE html><html><head><title>Cloudflare 502 Bad Gateway</title></head><body>Bad Gateway</body></html>',
        { 'content-type': 'text/html; charset=UTF-8' },
      )
      const client = createApiClient({ baseUrl: 'http://localhost:8000', token: 'token', timeoutMs: 5000 })

      await expect(client.health()).rejects.toSatisfy(
        (err: ApiError) => err.kind === 'disconnected' && err.status === 502,
      )

      setupResponse(530, 'Error 530: cloudflare origin down', { 'content-type': 'text/plain' })
      await expect(client.health()).rejects.toSatisfy(
        (err: ApiError) => err.kind === 'disconnected' && err.status === 530,
      )

      setupResponse(524, '<HTML><body>cloudflare timeout</body></HTML>', { 'content-type': 'text/html' })
      await expect(client.health()).rejects.toSatisfy(
        (err: ApiError) => err.kind === 'disconnected' && err.status === 524,
      )
    })
  })

  describe('network, timeout, and cancellation', () => {
    it('maps network TypeError to disconnected', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
      const client = createApiClient({ baseUrl: 'http://localhost:8000', token: 'token', timeoutMs: 5000 })

      await expect(client.health()).rejects.toSatisfy(
        (err: ApiError) => err.kind === 'disconnected' && err.status === null,
      )
    })

    it('maps timeout to disconnected', async () => {
      globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
        return new Promise((_, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('Request timed out', 'TimeoutError'))
            })
          }
        })
      })

      const client = createApiClient({ baseUrl: 'http://localhost:8000', token: 'token', timeoutMs: 50 })

      await expect(client.health()).rejects.toSatisfy(
        (err: ApiError) => err.kind === 'disconnected' && err.detail.includes('timed out'),
      )
    })

    it('rethrows AbortError on user cancellation so UI can ignore it', async () => {
      const abortCtrl = new AbortController()

      globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
        return new Promise((_, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted', 'AbortError'))
            })
          }
        })
      })

      const client = createApiClient({ baseUrl: 'http://localhost:8000', token: 'token', timeoutMs: 5000 })

      const promise = client.health(abortCtrl.signal)
      abortCtrl.abort()

      await expect(promise).rejects.toSatisfy((err: unknown) => {
        return (err as Error)?.name === 'AbortError'
      })
    })

    it('immediately rejects if caller signal is already aborted', async () => {
      const abortCtrl = new AbortController()
      abortCtrl.abort()

      const client = createApiClient({ baseUrl: 'http://localhost:8000', token: 'token', timeoutMs: 5000 })

      await expect(client.health(abortCtrl.signal)).rejects.toSatisfy((err: unknown) => {
        return (err as Error)?.name === 'AbortError'
      })
    })
  })
})
