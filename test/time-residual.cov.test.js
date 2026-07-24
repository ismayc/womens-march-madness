import { describe, it, expect, vi, afterEach } from 'vitest'
import { timezoneOptions, formatZoneAbbr, countdown, liveState } from '../src/utils/time.js'

afterEach(() => vi.restoreAllMocks())

describe('timezoneOptions', () => {
  it('returns the known list as-is, but prepends an unknown current zone', () => {
    expect(timezoneOptions('UTC')).toContainEqual({ id: 'UTC', label: 'UTC' })
    const opts = timezoneOptions('Mars/Phobos_Base')
    expect(opts[0]).toEqual({ id: 'Mars/Phobos_Base', label: 'Phobos Base' })
    expect(opts.length).toBeGreaterThan(1)
  })
})

describe('formatZoneAbbr', () => {
  it('returns an empty string when no timeZoneName part is present', () => {
    // Force Intl to yield parts without a timeZoneName so the `?.value || ''` fallback runs.
    vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockReturnValue([
      { type: 'literal', value: 'x' },
    ])
    expect(formatZoneAbbr('2026-03-19T17:00:00.000Z', 'UTC')).toBe('')
  })
})

describe('countdown', () => {
  const now = new Date('2026-03-19T12:00:00.000Z').getTime()
  const inMinutes = (m) => new Date(now + m * 60000).toISOString()

  it('formats days, hours, and minutes, and returns null once elapsed', () => {
    expect(countdown(inMinutes(26 * 60), now)).toBe('1d 2h') // days branch
    expect(countdown(inMinutes(90), now)).toBe('1h 30m') // hours branch
    expect(countdown(inMinutes(30), now)).toBe('30m') // minutes-only branch
    expect(countdown(inMinutes(-5), now)).toBeNull() // already started
  })
})

describe('liveState', () => {
  // Pinned with an explicit `now` so both the 'likely-live' and 'past' arms are covered
  // deterministically — the committed tournament is entirely in the past, so with the real
  // wall-clock a scoreless game never lands inside the game window and that branch drifts.
  const TIP = '2026-03-19T17:00:00.000Z'
  const at = new Date(TIP).getTime()
  const GAME_MS = 2.25 * 60 * 60 * 1000

  it('voids postponed/canceled games and flags live/scored ones', () => {
    expect(liveState({ postponed: true }, at)).toBe('void')
    expect(liveState({ canceled: true }, at)).toBe('void')
    expect(liveState({ live: true, tip: TIP }, at)).toBe('live')
    expect(liveState({ score: [80, 70], tip: TIP }, at)).toBe('final')
  })

  it('is upcoming before tip, likely-live inside the window, and past once it closes', () => {
    expect(liveState({ tip: TIP }, at - 60_000)).toBe('upcoming')
    expect(liveState({ tip: TIP }, at + 60_000)).toBe('likely-live')
    expect(liveState({ tip: TIP }, at + GAME_MS + 1)).toBe('past')
  })
})
