import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { PlayerBox, TeamStatsSection, InjuryReport, WinProbSection } from '../src/components/GameSummary.jsx'
import { fetchGameSummary } from '../src/services/summary.js'

const game = { away: 'ALA', home: 'DUKE' }
const ready = (data) => ({ status: 'ready', data })

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ── GameSummary.jsx private-renderer branches ──────────────────────────────
describe('GameSummary coverage', () => {
  it('renders a box score with DNP, blank and null cells, and a partial totals row', () => {
    const side = {
      abbr: 'AA', // matches neither ALA nor DUKE → exercises the index fallback
      name: 'Alpha',
      columns: [
        { key: 'minutes', label: 'MIN' },
        { key: 'points', label: 'PTS' },
        { key: 'rebounds', label: 'REB' },
        { key: 'assists', label: 'AST' },
      ],
      starters: [
        { id: 's1', name: 'Star One', pos: 'G', dnp: false, stats: { minutes: '30', points: '20', rebounds: null, assists: '' } },
        // id null → the row key falls back to the player name.
        { id: null, name: 'No Id', pos: 'F', dnp: false, stats: { minutes: '25', points: '10', rebounds: '5', assists: '3' } },
      ],
      bench: [
        // dnp true → the minutes cell reads 'DNP', other cells blank.
        { id: 'b1', name: 'Bench One', pos: null, dnp: true, stats: {} },
      ],
      totals: { minutes: '', points: '82', rebounds: null, assists: '' },
    }
    // Only one side present → the home BoxTable receives undefined and renders nothing.
    const box = { sides: [side], hasStats: true }
    const { container } = render(<PlayerBox summary={ready({ box })} game={game} hideScores={false} />)

    expect(screen.getByText('Box score')).toBeInTheDocument()
    expect(screen.getByText('DNP')).toBeInTheDocument() // the DNP player's minutes cell
    const dash = [...container.querySelectorAll('td')].filter((td) => td.textContent === '–')
    expect(dash.length).toBeGreaterThan(0) // null/'' stats render an en-dash
    // Exactly one team's table renders (home side was undefined → BoxTable null).
    expect(container.querySelectorAll('.box-team').length).toBe(1)
    // A null total renders blank; the tfoot still exists.
    expect(container.querySelector('tfoot')).toBeInTheDocument()
    expect(container.querySelector('.bx-benchstart')).toBeInTheDocument()
  })

  it('renders both matched sides and a box without a totals row', () => {
    const mk = (abbr) => ({
      abbr,
      name: abbr,
      columns: [{ key: 'points', label: 'PTS' }],
      starters: [{ id: `${abbr}1`, name: `${abbr} Starter`, pos: 'G', dnp: false, stats: { points: '20' } }],
      bench: [],
      totals: null, // no totals → no tfoot
    })
    const box = { sides: [mk('ALA'), mk('DUKE')], hasStats: true }
    const { container } = render(<PlayerBox summary={ready({ box })} game={game} hideScores={false} />)
    // Both sides matched by abbr → two box tables, and neither has a tfoot.
    expect(container.querySelectorAll('.box-team').length).toBe(2)
    expect(container.querySelector('tfoot')).toBeNull()
  })

  it('renders starting lineups with a missing jersey and no position, dropping an absent side', () => {
    const side = {
      abbr: 'ALA',
      name: 'Alabama',
      columns: [],
      starters: [
        { id: null, name: 'No Jersey', jersey: null, pos: null }, // id null → key falls back to name
        { id: 'p2', name: 'Has Both', jersey: '5', pos: 'G' },
      ],
      bench: [{ id: 'p3', name: 'Reserve', jersey: '12', pos: 'F' }],
    }
    // hasStats false → the not-yet-posted lineup view rather than a box score.
    const box = { sides: [side], hasStats: false }
    const { container } = render(<PlayerBox summary={ready({ box })} game={game} hideScores={false} />)

    expect(screen.getByText('Starting lineups')).toBeInTheDocument()
    // Missing jersey → en-dash placeholder.
    expect(within(container.querySelector('.lu-list')).getByText('–')).toBeInTheDocument()
    // Only one lineup side rendered (the home side was undefined → LineupSide null).
    expect(container.querySelectorAll('.lu-side').length).toBe(1)
    expect(screen.getByText(/Bench \(1\)/)).toBeInTheDocument()
  })

  it('renders lineups (not a box) when hideScores masks a stats-bearing box', () => {
    const side = {
      abbr: 'ALA',
      name: 'Alabama',
      columns: [],
      starters: [{ id: 'p1', name: 'Has Both', jersey: '5', pos: 'G' }],
      bench: [],
    }
    const box = { sides: [side], hasStats: true }
    render(<PlayerBox summary={ready({ box })} game={game} hideScores />)
    // hasStats but hideScores → lineups, not a box score.
    expect(screen.getByText('Starting lineups')).toBeInTheDocument()
  })

  it('collapses team stats under hideScores and when empty', () => {
    const teamStats = [{ label: 'FG%', away: '50', home: '52', better: 'home' }]
    const { container: c1 } = render(<TeamStatsSection summary={ready({ teamStats })} game={game} hideScores />)
    expect(c1.querySelector('.team-stats')).toBeNull()
    const { container: c2 } = render(<TeamStatsSection summary={ready({ teamStats: [] })} game={game} hideScores={false} />)
    expect(c2.querySelector('.team-stats')).toBeNull()
  })

  it('shows an en-dash for a missing team-stat value on either side', () => {
    const teamStats = [
      { label: 'FG%', away: null, home: '52', better: 'home' },
      { label: 'REB', away: '35', home: null, better: 'away' },
    ]
    const { container } = render(<TeamStatsSection summary={ready({ teamStats })} game={game} hideScores={false} />)
    const vals = [...container.querySelectorAll('.ts-val')].map((n) => n.textContent)
    expect(vals).toContain('–') // the null side renders '–'
    expect(container.querySelectorAll('.ts-val.better').length).toBe(2)
  })

  it('renders nothing when there are no injuries', () => {
    const { container } = render(<InjuryReport summary={ready({ injuries: [] })} game={game} />)
    expect(container.querySelector('.injuries')).toBeNull()
  })

  it('orders injury sides away-first and tolerates a missing status and detail', () => {
    const injuries = [
      { abbr: 'DUKE', players: [{ name: 'Home Hurt', pos: 'F', status: 'Out', detail: 'Knee' }] },
      { abbr: 'ALA', players: [{ name: 'Away Hurt', pos: null, status: null, detail: null }] },
      { abbr: 'ZZZ', players: [{ name: 'Neutral', pos: 'G', status: 'Day-To-Day', detail: 'Ankle' }] },
    ]
    const { container } = render(<InjuryReport summary={ready({ injuries })} game={game} />)
    const heads = [...container.querySelectorAll('.inj-side strong')].map((n) => n.textContent)
    // Away (ALA) sorts ahead of home (DUKE), and the unknown side trails.
    expect(heads).toEqual(['ALA', 'DUKE', 'ZZZ'])
    // The away player has no status text and no " · detail" suffix.
    const awayStatus = container.querySelector('.inj-side .inj-status')
    expect(awayStatus.textContent).toBe('')
    // The home player carries a status and detail.
    expect(screen.getByText('Out · Knee')).toBeInTheDocument()
  })

  it('collapses win probability under hideScores and with too few points', () => {
    const { container: c1 } = render(<WinProbSection summary={ready({ winprob: [0.5, 0.6] })} game={game} hideScores />)
    expect(c1.querySelector('.winprob')).toBeNull()
    const { container: c2 } = render(<WinProbSection summary={ready({ winprob: [0.5] })} game={game} hideScores={false} />)
    expect(c2.querySelector('.winprob')).toBeNull()
  })

  it('credits the away team when it is favored at the final probability point', () => {
    const winprob = [0.6, 0.4, 0.3] // ends below 50% home → away (ALA) favored at 70%
    render(<WinProbSection summary={ready({ winprob })} game={game} hideScores={false} />)
    expect(screen.getByText('Now 70% ALA')).toBeInTheDocument()
  })

  it('credits the home team and reads "Ended" once the game is final', () => {
    const winprob = [0.4, 0.55, 0.8] // ends above 50% → home (DUKE) favored at 80%
    const finalGame = { ...game, score: [90, 80] } // score present, not live → final
    render(<WinProbSection summary={ready({ winprob })} game={finalGame} hideScores={false} />)
    expect(screen.getByText('Ended 80% DUKE')).toBeInTheDocument()
  })
})

// ── summary.js parser fallback branches ────────────────────────────────────
describe('fetchGameSummary parsing edge cases', () => {
  const stub = (payload) => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => payload }))
  }

  // A payload that exercises the null/fallback path of nearly every parser.
  const edge = () => ({
    boxscore: {
      players: [
        {
          team: { shortDisplayName: 'Blue Devils' }, // no abbreviation, no displayName
          statistics: [
            {
              keys: ['minutes', 'points'],
              names: ['MIN'], // labels absent → names used; names[1] missing → key label
              athletes: [
                { starter: true }, // no athlete, no stats
                { starter: false, didNotPlay: true, athlete: { shortName: 'B. Bench', id: '9' }, stats: ['20'] },
              ],
              totals: ['15'], // only one column present → second totals cell defaults to ''
            },
          ],
        },
        {}, // no team, no statistics at all
      ],
      teams: [
        { homeAway: 'away', statistics: [
          { name: 'assists', displayValue: '25' },
          { name: 'totalTurnovers', displayValue: '20' },
        ] },
        { homeAway: 'home', statistics: [
          { name: 'assists', displayValue: '20' },
          { name: 'totalTurnovers', displayValue: '15' },
        ] },
      ],
    },
    injuries: [
      { injuries: [{}] }, // no team, an injury with no athlete/status/detail
      { team: { abbreviation: 'X' } }, // no injuries → filtered out
      {
        team: { abbreviation: 'Y' },
        injuries: [
          { athlete: { shortName: 'S. Only', position: { abbreviation: 'G' } }, status: 'Out', details: { type: 'Sprain' } },
          { athlete: { displayName: 'D. Player' }, details: {} },
        ],
      },
    ],
    gameInfo: { attendance: 18000, officials: [{ fullName: 'Ref One' }] }, // official via fullName
    winprobability: [{ homeWinPercentage: 0.5 }, { homeWinPercentage: null }, { homeWinPercentage: 0.6 }],
  })

  it('parses a box score full of missing fields without throwing', async () => {
    stub(edge())
    const { box } = await fetchGameSummary('g1')
    const side = box.sides.find((s) => s.name === 'Blue Devils')
    expect(side.abbr).toBeNull()
    // names shorter than keys → the second column falls back to its key as the label.
    expect(side.columns).toEqual([{ key: 'minutes', label: 'MIN' }, { key: 'points', label: 'points' }])
    expect(side.starters[0]).toMatchObject({ id: null, name: 'Unknown', jersey: null, pos: null })
    expect(side.starters[0].stats).toEqual({ minutes: null, points: null })
    expect(side.bench[0]).toMatchObject({ name: 'B. Bench', dnp: true })
    expect(side.bench[0].stats).toEqual({ minutes: '20', points: null })
    expect(side.totals).toEqual({ minutes: '15', points: '' })
    // The teamless/statless side collapses to empties.
    const empty = box.sides.find((s) => s.name === null)
    expect(empty).toMatchObject({ abbr: null, columns: [], totals: null })
    expect(box.hasStats).toBe(false)
  })

  it('marks the better side both ways, including a lower-better stat the away side leads', async () => {
    stub(edge())
    const { teamStats } = await fetchGameSummary('g1')
    const byLabel = Object.fromEntries(teamStats.map((r) => [r.label, r]))
    expect(byLabel['AST'].better).toBe('away') // 25 > 20 → higher wins
    expect(byLabel['TO'].better).toBe('home') // away 20 > home 15, fewer is better → home
  })

  it('parses injuries with missing team/athlete/detail fields', async () => {
    stub(edge())
    const { injuries } = await fetchGameSummary('g1')
    // The empty-injuries block is filtered; two blocks remain.
    expect(injuries.map((b) => b.abbr)).toEqual([null, 'Y'])
    expect(injuries[0].players[0]).toEqual({ name: 'Unknown', pos: null, status: null, detail: null })
    const y = injuries[1].players
    // detail comes from type.description first, else details.type.
    expect(y[0]).toEqual({ name: 'S. Only', pos: 'G', status: 'Out', detail: 'Sprain' })
    expect(y[1]).toEqual({ name: 'D. Player', pos: null, status: null, detail: null })
  })

  it('reads an official by fullName and filters a partial win-prob series', async () => {
    stub(edge())
    const { info, winprob } = await fetchGameSummary('g1')
    expect(info.officials).toEqual(['Ref One'])
    expect(winprob).toEqual([0.5, 0.6]) // the null datapoint is dropped
  })

  it('drops an official entry that resolves to neither name', async () => {
    // officials with neither displayName nor fullName → filtered out by Boolean.
    stub({ gameInfo: { attendance: 100, officials: [{}, { displayName: 'Kept' }] } })
    const { info } = await fetchGameSummary('g1')
    expect(info.officials).toEqual(['Kept'])
  })

  it('returns no team-stat rows when the teams carry no statistics', async () => {
    stub({
      boxscore: {
        players: [
          {
            team: { abbreviation: 'A' },
            statistics: [{ keys: ['points'], labels: ['PTS'], athletes: [{ starter: true, athlete: { id: '1', displayName: 'P' }, stats: ['10'] }] }],
          },
        ],
        teams: [{ homeAway: 'away' }, { homeAway: 'home' }],
      },
    })
    const { teamStats } = await fetchGameSummary('g1')
    expect(teamStats).toBeNull()
  })
})
