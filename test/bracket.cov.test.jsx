import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Bracket from '../src/components/Bracket.jsx'

// Synthetic South-region data engineered to exercise the rarely-hit rendering paths that
// the completed committed bracket (fully resolved, every abbr present) never reaches:
//
//  • A resolved (non-projected) slot that carries a team with NO abbr — the `TeamLine`
//    "TBD" fallback — rendered once WITH a seed and once WITHOUT, to cover both arms of
//    the seed line. Only possible via malformed data, so it lives here, not in the fixture.
//  • Live + overtime decorations on a resolved slot (● Live, OT2, and the single-OT "OT").
//  • Projected Round-of-64 slots whose feeder labels are absent → the "TBD" fallback.
//
// Seeds are chosen so the slot's team-sort short-circuits on the seed compare and never
// calls localeCompare on the null abbr.
const games = [
  // R64: maps to the 1/16 slot (seedPairKey → "1-16"). Home has no abbr but seed 16,
  // so it renders a TBD line WITH a seed. Live + double-OT decorate the match.
  {
    id: 's-r64-0',
    region: 'Regional 1',
    round: 'R64',
    home: null,
    homeSeed: 16,
    away: 'DUKE',
    awaySeed: 1,
    live: true,
    ot: 2,
  },
  // R32: no lineage match (no R64 winners yet), so it fills a slot via the leftover pass
  // and renders resolved. Its null-abbr side has NO seed → the seed line's false arm.
  // Single OT → the plain "OT" label.
  {
    id: 's-r32-0',
    region: 'Regional 1',
    round: 'R32',
    home: null,
    away: 'UNC',
    awaySeed: 2,
    ot: 1,
  },
]

beforeEach(() => localStorage.clear())

describe('Bracket — projected feeders and TBD team lines', () => {
  const openSouth = async () => {
    const utils = render(<Bracket games={games} />)
    await userEvent.click(utils.getByRole('tab', { name: 'Regional 1' }))
    return utils
  }

  it('renders a resolved TBD team line with its seed', async () => {
    const { container } = await openSouth()
    const seeded = [...container.querySelectorAll('.mm-team.mm-tbd')].find(
      (n) => n.querySelector('.mm-seed')?.textContent === '16'
    )
    expect(seeded).toBeTruthy()
    expect(seeded.querySelector('.mm-name').textContent).toBe('TBD')
  })

  it('renders a resolved TBD team line with no seed', async () => {
    const { container } = await openSouth()
    // The R32 leftover slot's null side has no seed → a TBD line with no .mm-seed span.
    const seedless = [...container.querySelectorAll('.mm-team.mm-tbd')].find(
      (n) => !n.querySelector('.mm-seed') && n.querySelector('.mm-name')?.textContent === 'TBD'
    )
    expect(seedless).toBeTruthy()
  })

  it('decorates a live overtime match with a Live badge and OT2', async () => {
    const { container } = await openSouth()
    const liveMatch = container.querySelector('.mm-match.is-live')
    expect(liveMatch).toBeTruthy()
    expect(liveMatch.querySelector('.mm-live').textContent).toContain('Live')
    expect(liveMatch.querySelector('.mm-ot').textContent).toBe('OT2')
  })

  it('labels a single-overtime match plainly OT', async () => {
    const { container } = await openSouth()
    const otLabels = [...container.querySelectorAll('.mm-ot')].map((n) => n.textContent)
    expect(otLabels).toContain('OT')
  })

  it('shows TBD for projected Round-of-64 slots with no feeder labels', async () => {
    const { container } = await openSouth()
    const projected = container.querySelectorAll('.mm-match.is-proj')
    expect(projected.length).toBeGreaterThan(0)
    // Every projected R64 slot here has null feeders → both names read "TBD".
    const names = [...projected].flatMap((m) =>
      [...m.querySelectorAll('.mm-name')].map((n) => n.textContent)
    )
    expect(names).toContain('TBD')
  })
})
