import { describe, it, expect, vi, afterEach } from 'vitest'
import { detectTimezone } from '../src/utils/time.js'

describe('detectTimezone', () => {
  afterEach(() => vi.restoreAllMocks())

  it('detects the platform zone when available', () => {
    expect(typeof detectTimezone()).toBe('string')
  })

  it('falls back to Eastern when the platform reports no zone (line 8 || fallback)', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: undefined }),
    }))
    expect(detectTimezone()).toBe('America/New_York')
  })

  it('falls back to Eastern when zone detection throws (lines 9-11 catch)', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl')
    })
    expect(detectTimezone()).toBe('America/New_York')
  })
})
