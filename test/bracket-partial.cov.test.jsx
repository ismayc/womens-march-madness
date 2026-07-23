import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { buildBracket } from '../src/utils/bracket.js'
import Bracket from '../src/components/Bracket.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

// A deliberately UNFINISHED tournament: the committed fixture is a completed bracket, so
// its every slot is resolved — the projected-shell, single-known-feeder, no-winner, and
// leftover-fill paths in bracket.js only run on a partial field. This fixture drives them.
//
// South is played to a champion, but with TWO still-LIVE Round-of-64 games (a score, no
// winner yet) placed so their Round-of-32 parents each see exactly one known feeder — one
// where the *first* feeder is known (joins()'s `if (wA)` branch) and one where only the
// *second* is (the `if (wB)` branch). East has a Round-of-32 game but NO Round-of-64, so
// it can't be lineage-matched and must fall through to the leftover fill; Midwest and West
// are empty, so every slot there is a projected "Winner of…" shell. No Final Four / title
// games, so those project too.
const game = (o) => ({ score: undefined, ...o })

// South seeds by slot: 1·16 / 8·9 / 5·12 / 4·13 / 6·11 / 3·14 / 7·10 / 2·15.
const SOUTH_R64 = [
  // slot0 still LIVE (no winner) — its R32 parent's first feeder is thus unknown.
  game({ id: 's64-0', round: 'R64', region: 'Regional 1', home: 'A1', away: 'A16', homeSeed: 1, awaySeed: 16, score: [80, 60], live: true }),
  game({ id: 's64-1', round: 'R64', region: 'Regional 1', home: 'A8', away: 'A9', homeSeed: 8, awaySeed: 9, score: [70, 60], winner: 'home' }),
  game({ id: 's64-2', round: 'R64', region: 'Regional 1', home: 'A5', away: 'A12', homeSeed: 5, awaySeed: 12, score: [70, 68], winner: 'home' }),
  // slot3 still LIVE (no winner) — its R32 parent's second feeder is thus unknown.
  game({ id: 's64-3', round: 'R64', region: 'Regional 1', home: 'A4', away: 'A13', homeSeed: 4, awaySeed: 13, score: [77, 50], live: true }),
  game({ id: 's64-4', round: 'R64', region: 'Regional 1', home: 'A6', away: 'A11', homeSeed: 6, awaySeed: 11, score: [70, 66], winner: 'home' }),
  game({ id: 's64-5', round: 'R64', region: 'Regional 1', home: 'A3', away: 'A14', homeSeed: 3, awaySeed: 14, score: [88, 60], winner: 'home' }),
  game({ id: 's64-6', round: 'R64', region: 'Regional 1', home: 'A7', away: 'A10', homeSeed: 7, awaySeed: 10, score: [72, 70], winner: 'home' }),
  game({ id: 's64-7', round: 'R64', region: 'Regional 1', home: 'A2', away: 'A15', homeSeed: 2, awaySeed: 15, score: [90, 55], winner: 'home' }),
]
const SOUTH_R32 = [
  // (slot0 live, slot1 A8): only the SECOND feeder is known -> joins()'s `if (wB)` branch.
  game({ id: 's32-0', round: 'R32', region: 'Regional 1', home: 'A8', away: 'A1', homeSeed: 8, awaySeed: 1, score: [75, 70], winner: 'home' }),
  // (slot2 A5, slot3 live): only the FIRST feeder is known -> joins()'s `if (wA)` branch.
  game({ id: 's32-1', round: 'R32', region: 'Regional 1', home: 'A5', away: 'A4', homeSeed: 5, awaySeed: 4, score: [80, 78], winner: 'home' }),
  game({ id: 's32-2', round: 'R32', region: 'Regional 1', home: 'A6', away: 'A3', homeSeed: 6, awaySeed: 3, score: [82, 79], winner: 'home' }),
  game({ id: 's32-3', round: 'R32', region: 'Regional 1', home: 'A7', away: 'A2', homeSeed: 7, awaySeed: 2, score: [85, 80], winner: 'home' }),
]
const SOUTH_S16 = [
  game({ id: 's16-0', round: 'S16', region: 'Regional 1', home: 'A8', away: 'A5', homeSeed: 8, awaySeed: 5, score: [70, 68], winner: 'home' }),
  game({ id: 's16-1', round: 'S16', region: 'Regional 1', home: 'A6', away: 'A7', homeSeed: 6, awaySeed: 7, score: [75, 74], winner: 'home' }),
]
const SOUTH_E8 = game({ id: 's8-0', round: 'E8', region: 'Regional 1', home: 'A8', away: 'A6', homeSeed: 8, awaySeed: 6, score: [72, 70], winner: 'home' })

// East: an orphan R32 game with NO seeds and no parent R64 -> leftover fill + the
// `seed ?? 99` sort fallback in slotFromGame.
const EAST_ORPHAN = game({ id: 'e32-0', round: 'R32', region: 'Regional 2', home: 'E1', away: 'E2', score: [60, 50], winner: 'home' })

const FIXTURE = [...SOUTH_R64, ...SOUTH_R32, ...SOUTH_S16, SOUTH_E8, EAST_ORPHAN]

describe('buildBracket — a partial tournament', () => {
  const b = buildBracket(FIXTURE)
  const south = b.regions.find((r) => r.name === 'Regional 1')

  it('crowns South (A8) while the other regions stay projected', () => {
    expect(south.champion).toBe('A8')
    for (const name of ['Regional 2', 'Regional 3', 'Regional 4']) {
      expect(b.regions.find((r) => r.name === name).champion).toBeNull()
    }
    // Whole-bracket champion is null until the title game is played.
    expect(b.champion).toBeNull()
  })

  it('keeps still-live Round-of-64 games as resolved-but-winnerless slots', () => {
    const live = south.r64.filter((s) => s.live)
    expect(live.length).toBe(2)
    for (const s of live) {
      expect(s.winner).toBeNull()
      expect(s.loser).toBeNull()
      expect(s.complete).toBe(true) // has a score
    }
  })

  it('projects the Final Four and title game before they are played', () => {
    expect(b.finalFour.every((s) => s.projected)).toBe(true)
    expect(b.championship.projected).toBe(true)
  })

  it('lineage-fills an orphaned East game that has no parent Round-of-64', () => {
    const east = b.regions.find((r) => r.name === 'Regional 2')
    expect(east.r32.some((s) => s.winner === 'E1')).toBe(true)
  })
})

describe('Bracket component — partial field render', () => {
  beforeEach(() => localStorage.clear())
  const view = (games = FIXTURE) =>
    render(
      <FollowProvider>
        <Bracket games={games} />
      </FollowProvider>
    )

  it('shows the national champion banner with the unknown-team abbreviation fallback', () => {
    // A completed title game whose winner is not a real team: the champ banner falls back
    // to the raw abbreviation (a TEAM_BY_ABBR miss).
    const withTitle = [
      ...FIXTURE,
      game({ id: 'nc', round: 'NC', home: 'A8', away: 'ZED', homeSeed: 8, awaySeed: 6, score: [80, 70], winner: 'home' }),
    ]
    view(withTitle)
    const champbar = document.querySelector('.mm-champbar')
    expect(champbar).toBeTruthy()
    expect(champbar.textContent).toMatch(/A8/)
    expect(champbar.textContent).toMatch(/National Champions/)
  })

  it('renders completed, live, and projected matches across region tabs', () => {
    view()
    // South: has both completed slots and live slots.
    fireEvent.click(screen.getByRole('tab', { name: 'Regional 1' }))
    expect(document.querySelector('.mm-match.is-live')).toBeTruthy()
    expect(document.querySelector('.mm-match:not(.is-live):not(.is-proj)')).toBeTruthy()
    // East: all projected shells.
    fireEvent.click(screen.getByRole('tab', { name: 'Regional 2' }))
    expect(document.querySelector('.mm-match.is-proj')).toBeTruthy()
    // Back to the Final Four tab (its own onClick handler).
    fireEvent.click(screen.getByRole('tab', { name: 'Final Four' }))
    expect(screen.getByText('National Championship')).toBeInTheDocument()
  })
})
