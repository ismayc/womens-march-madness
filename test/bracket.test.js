import { describe, it, expect } from 'vitest'
import { buildBracket, REGIONS, ROUNDS } from '../src/utils/bracket.js'
import { GAMES, SEED_ORDER } from '../src/data/schedule.js'

// The committed 2026 bracket is a finished single-elimination tournament (UCLA
// champion). Per the family playbook (§7), the real postseason data is the fixture: it
// catches reconstruction bugs a synthetic bracket would reproduce from the same
// assumptions the code makes. Every fact asserted below is a known-true result.
const b = buildBracket(GAMES)

describe('buildBracket — the finished 2026 tournament', () => {
  it('is not projected and crowns UCLA the national champion', () => {
    expect(b.projected).toBe(false)
    expect(b.champion).toBe('UCLA')
  })

  it('resolves all four region champions', () => {
    const champs = Object.fromEntries(b.regions.map((r) => [r.name, r.champion]))
    expect(champs).toEqual({
      'Regional 1': 'CONN',
      'Regional 2': 'UCLA',
      'Regional 3': 'TEX',
      'Regional 4': 'SC',
    })
  })

  it('names the four regions in the canonical order', () => {
    expect(b.regions.map((r) => r.name)).toEqual(REGIONS)
    expect(REGIONS).toEqual(['Regional 1', 'Regional 2', 'Regional 3', 'Regional 4'])
  })

  it('pairs the Final Four semifinals (CONN v SC) and (TEX v UCLA)', () => {
    const pairs = b.finalFour.map((s) => s.teams.map((t) => t.abbr).sort())
    expect(pairs).toContainEqual(['CONN', 'SC'])
    expect(pairs).toContainEqual(['TEX', 'UCLA'])
    // South Carolina and UCLA win their semifinals to reach the final.
    const winners = b.finalFour.map((s) => s.winner).sort()
    expect(winners).toEqual(['SC', 'UCLA'])
  })

  it('runs the championship as UCLA vs SC, won by UCLA', () => {
    expect(b.championship.teams.map((t) => t.abbr).sort()).toEqual(['SC', 'UCLA'])
    expect(b.championship.winner).toBe('UCLA')
  })

  it('fills every region with 15 resolved slots and none projected', () => {
    for (const r of b.regions) {
      const slots = [...r.r64, ...r.r32, ...r.s16, ...r.e8]
      expect(slots).toHaveLength(8 + 4 + 2 + 1)
      expect(slots.every((s) => s.projected)).toBe(false)
      expect(slots.every((s) => s.complete)).toBe(true)
    }
  })

  it('seeds each Round-of-64 matchup so the two seeds sum to 17', () => {
    for (const r of b.regions) {
      for (const slot of r.r64) {
        const seeds = slot.teams.map((t) => t.seed)
        expect(seeds).toHaveLength(2)
        expect(seeds[0] + seeds[1]).toBe(17)
      }
    }
  })

  it('lays out the Round of 64 in the fixed seed order (each pair summing to 17)', () => {
    // The first region's R64 slots follow SEED_ORDER: 1·16 / 8·9 / 5·12 / …
    const first = b.regions[0].r64
    first.forEach((slot, i) => {
      const seeds = slot.teams.map((t) => t.seed).sort((x, y) => x - y)
      const expected = [SEED_ORDER[2 * i], SEED_ORDER[2 * i + 1]].sort((x, y) => x - y)
      expect(seeds).toEqual(expected)
    })
  })

  it('records a winner and a loser for every completed slot', () => {
    for (const r of b.regions) {
      for (const slot of [...r.r64, ...r.r32, ...r.s16, ...r.e8]) {
        expect(slot.winner).toBeTruthy()
        expect(slot.loser).toBeTruthy()
        expect(slot.winner).not.toBe(slot.loser)
        expect(slot.teams.map((t) => t.abbr)).toContain(slot.winner)
      }
    }
  })

  it('advances each region champion out of its Elite Eight game', () => {
    for (const r of b.regions) {
      expect(r.e8).toHaveLength(1)
      expect(r.e8[0].winner).toBe(r.champion)
    }
  })

  it('exports the round label map', () => {
    expect(ROUNDS.R64).toBe('Round of 64')
    expect(ROUNDS.E8).toBe('Elite Eight')
    expect(ROUNDS.NC).toBe('National Championship')
  })
})

describe('buildBracket — projection partway through', () => {
  // A first-weekend snapshot: only the First Four and Round of 64 have been played, so
  // the later rounds and the Final Four are still unresolved shells.
  const early = GAMES.filter((g) => ['FF4', 'R64'].includes(g.round))
  const p = buildBracket(early)

  it('marks the bracket projected with no champion', () => {
    expect(p.projected).toBe(true)
    expect(p.champion).toBeNull()
  })

  it('still resolves the Round-of-64 seed pairings from the committed field', () => {
    for (const r of p.regions) {
      expect(r.r64).toHaveLength(8)
      for (const slot of r.r64) {
        const seeds = slot.teams.map((t) => t.seed)
        expect(seeds[0] + seeds[1]).toBe(17)
      }
    }
  })

  it('leaves later rounds as projected shells', () => {
    for (const r of p.regions) {
      expect(r.e8[0].projected).toBe(true)
      expect(r.champion).toBeNull()
    }
  })

  it('labels the unresolved Final Four semifinals by their feeding regions', () => {
    expect(p.finalFour).toHaveLength(2)
    for (const s of p.finalFour) {
      expect(s.projected).toBe(true)
      expect(s.feeders.every((f) => /champion/.test(f))).toBe(true)
    }
  })
})
