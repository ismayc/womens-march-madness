import { describe, it, expect } from 'vitest'
import { computeStandings, countsForStandings } from '../src/utils/standings.js'
import { TEAMS } from '../src/data/teams.js'

// Real abbreviations from the committed field, so the records land in the table.
const [A, B, C] = TEAMS.map((t) => t.abbr)

const g = (id, home, away, hs, as, extra = {}) => ({
  id,
  seasonType: 'regular',
  tip: `2026-03-${id}T23:00:00.000Z`,
  home,
  away,
  score: [hs, as],
  ...extra,
})

describe('countsForStandings', () => {
  it('counts only completed regular-season games', () => {
    expect(countsForStandings(g('01', A, B, 80, 70))).toBe(true)
    // seasonType other than regular (a tournament game) does not count
    expect(countsForStandings(g('02', A, B, 80, 70, { seasonType: 'postseason' }))).toBe(false)
    // no final score yet
    expect(countsForStandings({ ...g('03', A, B, 80, 70), score: null })).toBe(false)
    // postponed / canceled shells
    expect(countsForStandings(g('04', A, B, 80, 70, { postponed: true }))).toBe(false)
    expect(countsForStandings(g('05', A, B, 80, 70, { canceled: true }))).toBe(false)
  })
})

describe('computeStandings', () => {
  it('tallies wins, losses, home/road splits, scoring, and win/loss streaks', () => {
    const games = [
      g('01', A, B, 80, 70), // A home win, B road loss
      g('02', B, A, 60, 90), // A road win, B home loss  -> A on a 2-game W streak
      g('03', A, C, 55, 77), // A home loss              -> A streak resets to a loss
    ]
    const table = computeStandings(games)

    // A: 2-1, one home win + one road win + one home loss
    expect(table[A].w).toBe(2)
    expect(table[A].l).toBe(1)
    expect(table[A].home).toEqual({ w: 1, l: 1 })
    expect(table[A].road).toEqual({ w: 1, l: 0 })
    expect(table[A].gp).toBe(3)
    expect(table[A].pct).toBeCloseTo(2 / 3, 5)
    // last-10 in order, and a current 1-game LOSS streak (negative)
    expect(table[A].last10).toEqual([true, true, false])
    expect(table[A].streak).toBe(-1)
    // scoring: for = 80+90+55 = 225 over 3 -> 75 ppg; against = 70+60+77 = 207 -> 69
    expect(table[A].ppg).toBeCloseTo(75, 5)
    expect(table[A].oppPpg).toBeCloseTo(69, 5)
    expect(table[A].netPpg).toBeCloseTo(6, 5)

    // B: 0-2, on a 2-game LOSS streak
    expect(table[B].w).toBe(0)
    expect(table[B].l).toBe(2)
    expect(table[B].streak).toBe(-2)

    // C: single win -> positive streak
    expect(table[C].w).toBe(1)
    expect(table[C].streak).toBe(1)

    // A team that played nothing: zeroed, pct guarded against divide-by-zero
    const idle = TEAMS[3].abbr
    expect(table[idle].gp).toBe(0)
    expect(table[idle].pct).toBe(0)
    expect(table[idle].streak).toBe(0)
    expect(table[idle].last10).toEqual([])
  })

  it('skips a game whose team is not in the field (unknown abbreviation)', () => {
    const table = computeStandings([g('01', A, 'ZZZ', 80, 70)])
    // A still records its home win; the unknown side is simply dropped (no crash)
    expect(table[A].w).toBe(1)
    expect(table.ZZZ).toBeUndefined()
  })
})
