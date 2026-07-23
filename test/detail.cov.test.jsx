import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Drive the summary fetch per-test so we can exercise the attendance/officials rows,
// the injury report, and the abort path the network-stubbed suite never reaches.
vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: vi.fn() }))
// The committed player table is empty (single-elim bracket ships no leaderboard), so the
// tale-of-the-tape "leading scorer" row is otherwise unreachable. Mock the roster lookup
// to hand back a top scorer for every team, lighting up that TaleRow branch.
vi.mock('../src/utils/stats.js', () => ({
  playersByTeam: (abbr) => [{ short: `${abbr} Star`, avgPoints: 18.5 }],
}))

import { fetchGameSummary } from '../src/services/summary.js'
import GameDetail from '../src/components/GameDetail.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'
// A real played game from the committed bracket (the first with a score, venue, and broadcast).
const played = GAMES.find((g) => g.score && g.venue && g.broadcast)

const open = (game, props = {}) =>
  render(<GameDetail game={game} games={GAMES} tz={TZ} onClose={() => {}} {...props} />)

beforeEach(() => {
  localStorage.clear()
  fetchGameSummary.mockReset()
  fetchGameSummary.mockResolvedValue(null)
})

afterEach(() => {
  cleanup()
})

describe('GameDetail coverage', () => {
  it('closes when the backdrop itself is pressed, but not an inner element', () => {
    const onClose = vi.fn()
    open(played, { onClose })
    fireEvent.mouseDown(document.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalledTimes(1)
    // A mousedown that starts on an inner element does NOT close.
    fireEvent.mouseDown(document.querySelector('.modal'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('opens the home team’s schedule from the actions row', async () => {
    const onPickTeam = vi.fn()
    const onClose = vi.fn()
    open(played, { onPickTeam, onClose })
    const btns = screen.getAllByRole('button', { name: /schedule$/ })
    await userEvent.click(btns[1]) // the home side
    expect(onPickTeam).toHaveBeenCalledWith(played.home)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows attendance and officials once the summary loads', async () => {
    fetchGameSummary.mockResolvedValue({
      box: null,
      teamStats: null,
      injuries: [],
      info: { attendance: 18211, officials: ['Ref One', 'Ref Two'] },
      winprob: null,
    })
    open(played)
    expect(await screen.findByText('Attendance')).toBeInTheDocument()
    expect(screen.getByText('18,211')).toBeInTheDocument()
    expect(screen.getByText('Officials')).toBeInTheDocument()
    expect(screen.getByText('Ref One · Ref Two')).toBeInTheDocument()
  })

  it('renders watch chips for a game on the viewer’s services', () => {
    // The game airs on an ESPN cable network, which ESPN+ streams; select ESPN+ so the
    // badge lights up.
    localStorage.setItem('mmw:services', JSON.stringify(['espnplus']))
    render(
      <ServicesProvider>
        <GameDetail game={played} games={GAMES} tz={TZ} onClose={() => {}} />
      </ServicesProvider>
    )
    const watch = document.querySelector('.md-facts .watch')
    expect(watch).toBeInTheDocument()
    expect(watch).toHaveAccessibleName('Watch on ESPN+')
  })

  it('renders a venue with a city but no state, omitting the trailing comma', () => {
    const game = {
      id: 'v1',
      seasonType: 'regular',
      tip: '2026-03-05T00:00:00.000Z',
      home: 'DUKE',
      away: 'ALA',
      score: [80, 70],
      venue: 'Neutral Arena',
      city: 'Someplace',
      note: 'Sweet 16',
      line: { home: [40, 40], away: [35, 35] },
    }
    open(game)
    const dd = [...document.querySelectorAll('.md-facts dd')].find((n) =>
      n.textContent.includes('Neutral Arena')
    )
    expect(dd.textContent).toBe('Neutral Arena, Someplace')
    // The note row renders in the facts list.
    expect(screen.getByText('Sweet 16')).toBeInTheDocument()
  })

  it('renders a venue with neither a city nor a state', () => {
    const game = {
      id: 'v2',
      seasonType: 'regular',
      tip: '2026-03-05T00:00:00.000Z',
      home: 'DUKE',
      away: 'ALA',
      score: [80, 70],
      venue: 'Bare Arena',
      line: { home: [40, 40], away: [35, 35] },
    }
    open(game)
    const dd = [...document.querySelectorAll('.md-facts dd')].find((n) =>
      n.textContent.includes('Bare Arena')
    )
    expect(dd.textContent).toBe('Bare Arena')
  })

  it('shows a live status label in the header, falling back to "Live"', () => {
    const live = {
      id: 'live1',
      seasonType: 'regular',
      tip: '2026-03-06T00:00:00.000Z',
      home: 'DUKE',
      away: 'ALA',
      live: true,
      score: [55, 50],
      statusLabel: '2nd 3:12',
      line: { home: [30, 25], away: [26, 24] },
    }
    open(live)
    expect(document.querySelector('.md-state').textContent).toBe('2nd 3:12')

    // A live game with no status label falls back to a plain "Live".
    cleanup()
    open({ ...live, id: 'live2', statusLabel: undefined })
    expect(document.querySelector('.md-state').textContent).toBe('Live')
  })

  it('renders the season series and marks the better tale-of-the-tape side', async () => {
    // Two prior regular-type meetings between DUKE and ALA, one each way, plus a lopsided
    // record so a side is bolded. seasonType 'regular' is what makes them count.
    const games = [
      { id: 'a', seasonType: 'regular', tip: '2026-01-01T00:00:00.000Z', home: 'DUKE', away: 'ALA', score: [100, 90], line: { home: [], away: [] } },
      { id: 'b', seasonType: 'regular', tip: '2026-02-01T00:00:00.000Z', home: 'ALA', away: 'DUKE', score: [70, 88], line: { home: [], away: [] } },
      { id: 'c', seasonType: 'regular', tip: '2026-02-10T00:00:00.000Z', home: 'DUKE', away: 'ALA', score: [95, 60], line: { home: [], away: [] } },
    ]
    const game = games[0]
    render(<GameDetail game={game} games={games} tz={TZ} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Matchup' }))
    expect(screen.getByText(/Season series/)).toBeInTheDocument()
    // The mocked roster lookup surfaces the "Leading scorer" TaleRow.
    expect(screen.getByText('Leading scorer')).toBeInTheDocument()
    // A lopsided record means at least one side is bolded.
    expect(document.querySelector('.tale-val.better')).toBeInTheDocument()

    // Under spoiler-free mode the series scores are masked.
    cleanup()
    render(<GameDetail game={game} games={games} tz={TZ} hideScores onClose={() => {}} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Matchup' }))
    expect(document.querySelector('.drill-score').textContent).toBe('—')
  })

  it('leaves the tale of the tape unmarked when the teams are dead even', async () => {
    // DUKE and ALA post identical records (each beats a third team the same way), so no
    // row is bolded on record / ppg / allowed.
    const games = [
      { id: 'm1', seasonType: 'regular', tip: '2026-01-01T00:00:00.000Z', home: 'DUKE', away: 'FLA', score: [80, 70], line: { home: [], away: [] } },
      { id: 'n1', seasonType: 'regular', tip: '2026-01-01T00:00:00.000Z', home: 'ALA', away: 'FUR', score: [80, 70], line: { home: [], away: [] } },
    ]
    const game = { id: 'even1', seasonType: 'regular', tip: '2027-01-01T00:00:00.000Z', home: 'ALA', away: 'DUKE' }
    render(<GameDetail game={game} games={games} tz={TZ} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Matchup' }))
    expect(document.querySelectorAll('.tale-val.better').length).toBe(0)
  })

  it('surfaces the injury report on the matchup tab', async () => {
    fetchGameSummary.mockResolvedValue({
      box: null,
      teamStats: null,
      injuries: [{ abbr: 'ALA', players: [{ name: 'Injured One', pos: 'F', status: 'Out', detail: 'Knee' }] }],
      info: null,
      winprob: null,
    })
    const game = {
      id: 'inj1',
      seasonType: 'regular',
      tip: '2026-03-08T00:00:00.000Z',
      home: 'DUKE',
      away: 'ALA',
      score: [80, 70],
      line: { home: [40, 40], away: [35, 35] },
    }
    open(game)
    await userEvent.click(screen.getByRole('tab', { name: 'Matchup' }))
    expect(await screen.findByRole('heading', { name: 'Injury report' })).toBeInTheDocument()
    expect(screen.getByText('Injured One')).toBeInTheDocument()
  })

  it('opens an upcoming game on the matchup tab with no scoring tab', async () => {
    const upcoming = {
      id: 'up1',
      seasonType: 'regular',
      tip: '2027-03-01T00:00:00.000Z',
      home: 'DUKE',
      away: 'ALA',
    }
    open(upcoming)
    // No score → the header shows the tip time, and there is no Scoring tab.
    expect(document.querySelector('.md-time')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Scoring' })).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Matchup' })).toHaveAttribute('aria-selected', 'true')
    )
    // The lineups placeholder shows on the box tab before any summary posts.
    await userEvent.click(screen.getByRole('tab', { name: 'Box score' }))
    expect(await screen.findByText('Starting lineups')).toBeInTheDocument()
  })

  it('falls back to the first tab when the active one disappears', async () => {
    const upcoming = {
      id: 'up2',
      seasonType: 'regular',
      tip: '2027-03-02T00:00:00.000Z',
      home: 'DUKE',
      away: 'ALA',
    }
    const { rerender } = render(
      <GameDetail game={played} games={GAMES} tz={TZ} onClose={() => {}} />
    )
    // Move to the Scoring tab, which only exists for a played game…
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    // …then swap in an upcoming game whose TABS have no Scoring: the render before the
    // effect resets `tab` falls back to the first tab (the `TABS.some(...) ? tab : ...`
    // false arm).
    rerender(<GameDetail game={upcoming} games={GAMES} tz={TZ} onClose={() => {}} />)
    expect(screen.queryByRole('tab', { name: 'Scoring' })).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Matchup' })).toHaveAttribute('aria-selected', 'true')
    )
  })

  it('labels multi-overtime periods (OT1/OT2) and suffixes the header /2OT', async () => {
    const twoOT = {
      id: 'ot2',
      seasonType: 'regular',
      tip: '2026-03-09T00:00:00.000Z',
      home: 'DUKE',
      away: 'ALA',
      score: [78, 75],
      ot: 2,
      // Women's is four quarters, so two OT periods make a six-column line.
      line: { home: [25, 25, 10, 8, 6, 4], away: [24, 24, 10, 7, 5, 5] },
    }
    open(twoOT)
    // Header suffixes the multi-OT count.
    expect(document.querySelector('.md-state').textContent).toBe('Final/2OT')
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    const heads = [...document.querySelectorAll('.linescore thead th')].map((n) => n.textContent)
    expect(heads).toContain('OT1')
    expect(heads).toContain('OT2')
    // At least one per-period winner is bolded.
    expect(document.querySelector('.linescore td.q-won')).toBeInTheDocument()
  })

  it('renders an en-dash for a missing period cell', async () => {
    const withGap = {
      id: 'gap1',
      seasonType: 'regular',
      tip: '2026-03-09T00:00:00.000Z',
      home: 'DUKE',
      away: 'ALA',
      score: [70, 65],
      line: { home: [20, 25, 15, 10], away: [18, null, 20, 12] }, // null → '–' cell
    }
    open(withGap)
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    const cells = [...document.querySelectorAll('.linescore tbody td')].map((n) => n.textContent)
    expect(cells).toContain('–')
  })

  it('renders no line-score table when the periods are empty', async () => {
    const empty = {
      id: 'empty1',
      seasonType: 'regular',
      tip: '2026-03-09T00:00:00.000Z',
      home: 'DUKE',
      away: 'ALA',
      score: [70, 65],
      line: { home: [], away: [] },
    }
    open(empty)
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    expect(document.querySelector('.linescore')).toBeNull()
  })

  it('hides game leaders with no stars or none on either roster', async () => {
    const base = {
      id: 'ns1',
      seasonType: 'regular',
      tip: '2026-03-09T00:00:00.000Z',
      home: 'DUKE',
      away: 'ALA',
      score: [80, 70],
      line: { home: [40, 40], away: [35, 35] },
    }
    open(base)
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    expect(screen.queryByText('Game leaders')).toBeNull()

    // Stars that belong to neither team also collapse the section.
    cleanup()
    open({ ...base, id: 'ns2', stars: [{ cat: 'points', v: '30', who: 'Nobody', team: 'ZZZ' }] })
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    expect(screen.queryByText('Game leaders')).toBeNull()
  })

  it('shows game leaders with a known label and an uncategorised one verbatim', async () => {
    const game = {
      id: 'gl1',
      seasonType: 'regular',
      tip: '2026-03-09T00:00:00.000Z',
      home: 'DUKE',
      away: 'ALA',
      score: [80, 70],
      line: { home: [40, 40], away: [35, 35] },
      stars: [
        { cat: 'points', v: '30', who: 'A. Player', team: 'ALA' },
        { cat: 'steals', v: '5', who: 'B. Player', team: 'DUKE' }, // not in CAT_LABEL → verbatim
      ],
    }
    open(game)
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    expect(screen.getByText('Game leaders')).toBeInTheDocument()
    expect(screen.getByText('PTS')).toBeInTheDocument()
    expect(screen.getByText('steals')).toBeInTheDocument()
  })

  it('bolds the away side of the tale of the tape when it holds the better record', async () => {
    // ALA (away) wins its game, DUKE (home) loses its game → away is "better" on record,
    // ppg, and allowed, lighting up the betterLeft === true arm of TaleRow.
    const games = [
      { id: 't1', seasonType: 'regular', tip: '2026-01-01T00:00:00.000Z', home: 'ALA', away: 'FLA', score: [80, 70], line: { home: [], away: [] } },
      { id: 't2', seasonType: 'regular', tip: '2026-01-01T00:00:00.000Z', home: 'FUR', away: 'DUKE', score: [80, 70], line: { home: [], away: [] } },
    ]
    const game = { id: 'tt1', seasonType: 'regular', tip: '2027-01-01T00:00:00.000Z', home: 'DUKE', away: 'ALA' }
    render(<GameDetail game={game} games={games} tz={TZ} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Matchup' }))
    // The away column carries the bolded value on the record row.
    const recordRow = [...document.querySelectorAll('.tale-row')].find((r) =>
      r.textContent.includes('Record')
    )
    expect(recordRow.querySelector('.tale-val.better')).toBe(recordRow.querySelector('.tale-val'))
  })

  it('ignores a summary that resolves after the modal has closed', async () => {
    let resolve
    fetchGameSummary.mockReturnValue(new Promise((r) => { resolve = r }))
    const { unmount } = render(
      <GameDetail game={played} games={GAMES} tz={TZ} onClose={() => {}} />
    )
    unmount() // aborts the in-flight request
    // Resolving now hits the aborted guard and must not throw.
    resolve({ box: null, teamStats: null, injuries: [], info: { attendance: 1, officials: [] }, winprob: null })
    await Promise.resolve()
    expect(document.querySelector('.modal')).toBeNull()
  })
})
