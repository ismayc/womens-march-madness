import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchLive } from '../src/services/espn.js'
import { detectEvents } from '../src/services/alerts.js'
import { buildIcs } from '../src/utils/ics.js'
import { writeState } from '../src/utils/urlState.js'
import { broadcastNotBadged } from '../src/utils/watch.js'
import { GAMES } from '../src/data/schedule.js'

// ── espn.js remaining branches (lines 20-21, 62) ────────────────────────────
describe('espn normalizer edge cases', () => {
  const NOW = new Date('2026-03-20T12:00:00Z')
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  const board = (events) => ({ ok: true, json: async () => ({ events }) })
  const one = async (ev) => {
    fetch.mockResolvedValue(board([ev]))
    return (await fetchLive({ now: NOW })).get(ev.id)
  }

  it('falls back to an empty status object when the event carries no status (line 20 || {})', async () => {
    // No competition.status at all — the `|| {}` guard keeps the normalizer from throwing.
    const g = await one({
      id: 'nostatus',
      competitions: [
        {
          competitors: [
            { homeAway: 'home', score: { value: 70 } },
            { homeAway: 'away', score: { value: 61 } },
          ],
        },
      ],
    })
    expect(g).toMatchObject({ id: 'nostatus', live: false, final: false })
    expect(g.statusLabel).toBeNull()
    // No state 'in' and not completed → the score is withheld even though both are finite.
    expect(g.score).toBeUndefined()
  })

  it('treats a null score value as no score (line 21 v == null)', async () => {
    const g = await one({
      id: 'nullscore',
      competitions: [
        {
          status: { period: 2, type: { state: 'in' } },
          competitors: [
            { homeAway: 'home', score: null },
            { homeAway: 'away', score: { value: 3 } },
          ],
        },
      ],
    })
    expect(g.live).toBe(true)
    // hs is null → not finite → no [h,a] pair surfaced.
    expect(g.score).toBeUndefined()
  })

  it('tolerates a fulfilled response with no events array (line 62 || [])', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    const live = await fetchLive({ now: NOW })
    expect(live.size).toBe(0)
  })
})

// ── alerts.js remaining branches (lines 19, 25, 28) ─────────────────────────
describe('alerts detection edge cases', () => {
  const g = (over = {}) => ({ id: 'g1', home: 'MICH', away: 'CONN', seasonType: 'regular', ...over })

  it('handles a scoreless previous snapshot when a game turns into a nailbiter (lines 19, 25)', () => {
    // `was` is live and late but carries no score yet, so leaderOf/marginOf(was) return
    // null rather than throwing — and the close-and-late transition still fires once.
    const before = [g({ live: true, period: 4 })] // no score
    const after = [g({ live: true, period: 4, score: [102, 100] })]
    const evts = detectEvents(before, after)
    expect(evts.map((e) => e.kind)).toEqual(['nailbiter'])
    expect(evts[0].margin).toBe(2)
  })

  it('treats a missing period as pre-regulation, so nothing fires (line 28 ?? 0)', () => {
    // Same leader, still live, but period is absent → (period ?? 0) keeps isLate false.
    const before = [g({ live: true, period: 1, score: [50, 48] })]
    const after = [g({ live: true, score: [50, 48] })] // no period
    expect(detectEvents(before, after)).toEqual([])
  })

  it('skips a game that went not-live without a final score (line 65 continue)', () => {
    // was.live but now not live and carrying no score → not a final, not a tipoff; the
    // `if (!g.live) continue` short-circuits before any lead/nailbiter check.
    const before = [g({ live: true, period: 3, score: [50, 48] })]
    const after = [g({ live: false, period: 3 })] // dropped live, no score
    expect(detectEvents(before, after)).toEqual([])
  })
})

// ── ics.js remaining branches (line 58 round/region fallbacks) ──────────────
describe('ics description round/region fallbacks', () => {
  const NOW = '2026-03-20T12:00:00.000Z'
  const played = GAMES.find((x) => x.score && x.venue)

  it('falls back to the raw round code and omits the region when both are unusual', () => {
    // round 'ZZZ' is not in ROUNDS → `ROUNDS[game.round] || game.round` uses the raw code;
    // region undefined → the `game.region ? ... : null` arm resolves to null.
    const ics = buildIcs([{ ...played, id: 'oddround', round: 'ZZZ', region: undefined }], { now: NOW })
    expect(ics).toContain('ZZZ')
    expect(ics).not.toContain('ZZZ Region')
  })

  it('drops the round line entirely when a game has no round (line 57 : null)', () => {
    const ics = buildIcs([{ ...played, id: 'noround', round: undefined, region: undefined }], { now: NOW })
    expect(ics).toContain('BEGIN:VEVENT')
  })
})

// ── urlState.js remaining branch (line 76 SSR guard) ────────────────────────
describe('writeState SSR guard', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does nothing when there is no window (line 76)', () => {
    vi.stubGlobal('window', undefined)
    expect(() => writeState({ view: 'schedule' }, 'America/New_York')).not.toThrow()
  })
})

// ── watch.js remaining branch (line 48 watched || []) ───────────────────────
describe('broadcastNotBadged with no watched list', () => {
  it('treats an absent watched list as empty (line 48)', () => {
    expect(broadcastNotBadged(['CBS'], undefined)).toEqual(['CBS'])
    expect(broadcastNotBadged(['CBS', 'TBS'], null)).toEqual(['CBS', 'TBS'])
  })
})
