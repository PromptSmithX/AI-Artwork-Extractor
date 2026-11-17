import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_TIMEOUT_MS,
  isLikelyNonEnglish,
  loadConnectionConfig,
  saveConnectionConfig,
} from './storage'

describe('storage and config', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns default config when storage is empty', () => {
    const config = loadConnectionConfig()
    expect(config).toEqual({
      baseUrl: '',
      token: '',
      timeoutMs: DEFAULT_TIMEOUT_MS,
    })
  })

  it('saves and loads connection config correctly', () => {
    saveConnectionConfig({
      baseUrl: 'https://example.trycloudflare.com',
      token: 'secret-token-123',
      timeoutMs: 60_000,
    })

    const loaded = loadConnectionConfig()
    expect(loaded).toEqual({
      baseUrl: 'https://example.trycloudflare.com',
      token: 'secret-token-123',
      timeoutMs: 60_000,
    })
  })

  it('falls back to default timeout if stored value is invalid', () => {
    localStorage.setItem('aae.timeoutMs', 'not-a-number')
    const loaded = loadConnectionConfig()
    expect(loaded.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
  })

  it('gracefully handles localStorage throwing (e.g. private browsing)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError')
    })

    expect(() =>
      saveConnectionConfig({
        baseUrl: 'https://test.com',
        token: 'token',
        timeoutMs: 10_000,
      }),
    ).not.toThrow()

    const config = loadConnectionConfig()
    expect(config).toEqual({
      baseUrl: '',
      token: '',
      timeoutMs: DEFAULT_TIMEOUT_MS,
    })
  })

  describe('isLikelyNonEnglish', () => {
    it('returns false for pure ASCII strings', () => {
      expect(isLikelyNonEnglish('square embroidered fabric patch')).toBe(false)
      expect(isLikelyNonEnglish('flower 123! @#$-_')).toBe(false)
      expect(isLikelyNonEnglish('')).toBe(false)
    })

    it('returns true for strings containing characters > U+007F', () => {
      expect(isLikelyNonEnglish('hình thêu con rồng')).toBe(true)
      expect(isLikelyNonEnglish('áo khoác')).toBe(true)
      expect(isLikelyNonEnglish('café')).toBe(true)
      expect(isLikelyNonEnglish('patch 🌸')).toBe(true)
    })
  })
})
