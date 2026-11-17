// @vitest-environment node
/**
 * End-to-end integration test against server_reference.run_local_fake.
 * Skipped unless AAE_INTEGRATION=1 is set in the environment.
 */
import { describe, expect, it } from 'vitest'
import { ApiError } from './errors'
import { createApiClient } from './client'

const isIntegrationEnabled = process.env.AAE_INTEGRATION === '1'

// 1x1 PNG image
const SAMPLE_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
])

describe.skipIf(!isIntegrationEnabled)('integration test with fake server', () => {
  const baseUrl = 'http://127.0.0.1:8765'
  const token = 'integration-test-token-123456'

  it('performs health check, segmentation, ZIP parsing, and auth error check', async () => {
    const client = createApiClient({
      baseUrl,
      token,
      timeoutMs: 15_000,
    })

    // 1. Health check
    const health = await client.health()
    expect(health.status).toBe('ok')

    // 2. Run segmentation (mode: text_box)
    const imageBlob = new Blob([SAMPLE_PNG], { type: 'image/png' })
    const segResult = await client.segment({
      image: imageBlob,
      filename: 'sample.png',
      mode: 'text_box',
      prompt: 'patch',
      bbox: [0.5, 0.5, 0.4, 0.4],
      confidenceThreshold: 0.35,
    })

    expect(segResult.metadata).toBeDefined()
    expect(segResult.metadata.candidates.length).toBeGreaterThan(0)
    expect(segResult.candidates.length).toBeGreaterThan(0)

    const firstCand = segResult.candidates[0]
    expect(firstCand.blobs.mask).toBeDefined()
    expect(firstCand.urls.mask).toBeDefined()

    // Dispose URLs
    segResult.dispose()

    // 3. Wrong token check -> auth error (401)
    const badClient = createApiClient({
      baseUrl,
      token: 'wrong-token-999',
      timeoutMs: 15_000,
    })

    await expect(
      badClient.segment({
        image: imageBlob,
        filename: 'sample.png',
        mode: 'text',
        prompt: 'test',
      }),
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof ApiError &&
        err.kind === 'auth' &&
        err.status === 401
      )
    })
  })
})
