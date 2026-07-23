import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))

// The real committed tournament is finished, so `tournamentOver` is true and the poll
// effect short-circuits — none of the live/alerts wiring would ever run. Swap in a tiny
// schedule of not-yet-played games so tournamentOver is false and the app polls.
vi.mock('../src/data/schedule.js', async (importActual) => ({
  ...(await importActual()),
  GAMES: [
    // A finished game so applyLive/liveCount see a mix.
    {
      id: '900001',
      tip: '2026-03-19T22:40:00.000Z',
      round: 'R64',
      region: 'East',
      home: 'MICH',
      away: 'NCSU',
      homeSeed: 1,
      awaySeed: 8,
      venue: 'Little Caesars Arena',
      city: 'Detroit',
      state: 'MI',
      neutral: true,
      broadcast: ['CBS'],
      score: [80, 71],
      winner: 'home',
    },
    // Upcoming games (no score) — these keep tournamentOver false and can be flipped live.
    ...['DUKE:TEX', 'UMBC:HOW', 'MICH:UMBC', 'DUKE:HOW', 'NCSU:TEX'].map((m, i) => {
      const [home, away] = m.split(':')
      return {
        id: `90010${i + 1}`,
        tip: `2026-03-2${i}T22:40:00.000Z`,
        round: 'R32',
        region: 'East',
        home,
        away,
        homeSeed: 2,
        awaySeed: 7,
        venue: 'UD Arena',
        city: 'Dayton',
        state: 'OH',
        neutral: true,
        broadcast: ['truTV'],
      }
    }),
  ],
}));

// Keep applyLive/liveCount real; drive fetchLive by hand so each poll returns exactly one
// controlled overlay Map (one call per poll — no 3-day fan-out to reason about).
vi.mock('../src/services/espn.js', async (importActual) => {
  const actual = await importActual()
  return { ...actual, fetchLive: vi.fn() }
})

import App from '../src/App.jsx'
import { fetchLive } from '../src/services/espn.js'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

// A normalized live-overlay entry (the shape fetchLive resolves to, keyed by id).
const liveEntry = (id, { home = 60, away = 58, period = 1 } = {}) => ({
  id,
  live: true,
  statusLabel: `${period === 1 ? '1st' : '2nd'} 4:21`,
  period,
  clock: '4:21',
  score: [home, away],
})
const liveMap = (entries) => new Map(entries.map((e) => [e.id, e]))

const mount = () =>
  render(
    <FollowProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </FollowProvider>
  )

// A poll's chain (fetchLive -> setLive -> re-render -> the effect re-run that repolls at
// the new cadence) spans several microtask hops. Advancing the fake clock a few rounds
// lets it settle deterministically.
const settle = async (rounds = 6) => {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
  }
}

const useFake = () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-20T22:35:00.000Z'))
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  // Force the schedule view so the tiny mock schedule renders without the bracket
  // reconstruction (which expects a full field). ?past=1 reveals the March games.
  window.history.replaceState(null, '', '/?view=schedule&past=1')
  fetchLive.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('live overlay from a poll', () => {
  it('surfaces the live-now count and updated-at stamp and polls at the live cadence', async () => {
    useFake()
    fetchLive.mockResolvedValue(liveMap([liveEntry('900101')]))
    mount()
    await settle()

    // The overlay flips a committed upcoming game to in-progress.
    expect(screen.getByText(/1 live now/)).toBeInTheDocument()
    // A successful poll records an updated-at stamp in the footer.
    expect(screen.getByText(/Updated/)).toBeInTheDocument()

    // nLive > 0 -> the 30s live-cadence interval. Advancing 30s fires another poll.
    const before = fetchLive.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(fetchLive.mock.calls.length).toBeGreaterThan(before)
  })

  it('stays on the idle cadence when nothing is live', async () => {
    useFake()
    fetchLive.mockResolvedValue(new Map()) // nothing in progress
    mount()
    await settle()
    const afterMount = fetchLive.mock.calls.length
    expect(afterMount).toBeGreaterThan(0)
    expect(screen.queryByText(/live now/)).not.toBeInTheDocument()

    // No poll at 30s — the idle interval is two minutes.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(fetchLive.mock.calls.length).toBe(afterMount)

    // The next poll lands once the full 120s idle interval elapses.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000)
    })
    expect(fetchLive.mock.calls.length).toBeGreaterThan(afterMount)
  })
})

describe('live alerts fire toasts', () => {
  it('raises a tipoff toast when a game goes live and opens the game from it', async () => {
    // Real timers so userEvent's pointer interactions resolve normally.
    localStorage.setItem('mmw:alerts', '1')
    fetchLive.mockResolvedValue(liveMap([liveEntry('900101')]))
    mount()

    // The overlay flips a committed (not-live) game to live -> a tipoff moment.
    const toast = await screen.findByRole('status')
    expect(within(toast).getByText(/Tip/i)).toBeInTheDocument()

    // Clicking the toast body opens that game's detail (Toasts onOpen -> setDetail).
    await userEvent.click(within(toast).getByRole('button', { name: /Tip/i }))
    expect(screen.getByRole('dialog', { name: 'Game detail' })).toBeInTheDocument()
  })

  it('filters toasts to a followed team when one is followed', async () => {
    // DUKE (an upcoming game's home) is followed -> the alerts effect passes the followed
    // set as the team filter (the truthy side of that branch).
    localStorage.setItem('mmw:alerts', '1')
    localStorage.setItem('mmw:followed', JSON.stringify(['DUKE']))
    fetchLive.mockResolvedValue(liveMap([liveEntry('900101')])) // 900101 is DUKE:TEX
    mount()
    const toast = await screen.findByRole('status')
    expect(within(toast).getByText(/Tip/i)).toBeInTheDocument()
  })

  it('lets a toast be dismissed', async () => {
    localStorage.setItem('mmw:alerts', '1')
    fetchLive.mockResolvedValue(liveMap([liveEntry('900101')]))
    mount()
    const toast = await screen.findByRole('status')
    await userEvent.click(within(toast).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('caps the toast stack at four even when many games tip at once', async () => {
    useFake()
    localStorage.setItem('mmw:alerts', '1')
    // Five upcoming games all go live in one poll -> five tipoff moments -> slice(0, 4).
    fetchLive.mockResolvedValue(
      liveMap([
        liveEntry('900101'),
        liveEntry('900102'),
        liveEntry('900103'),
        liveEntry('900104'),
        liveEntry('900105'),
      ])
    )
    mount()
    await settle()
    // The container is a single role=status region; count the individual toast rows.
    expect(document.querySelectorAll('.toast').length).toBe(4)
  })

  it('does not re-toast a moment it already showed (dedupe)', async () => {
    useFake()
    localStorage.setItem('mmw:alerts', '1')
    // poll 1: 900101 live (tipoff, toast added). poll 2: overlay empty -> the game is no
    // longer live (nLive flips, triggering an immediate repoll). poll 3: live again ->
    // the same tipoff key, but it's already in the toast list, so it's filtered out.
    fetchLive
      .mockResolvedValueOnce(liveMap([liveEntry('900101')]))
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(liveMap([liveEntry('900101')]))
      .mockResolvedValue(new Map())
    mount()
    await settle(10)
    // Exactly one tipoff toast survived — the re-fire was deduped by its stable key.
    const toasts = document.querySelectorAll('.toast')
    expect(toasts.length).toBe(1)
    expect(within(toasts[0]).getByText(/Tip/i)).toBeInTheDocument()
  })

  it('retires a toast on its own after a few seconds', async () => {
    useFake()
    localStorage.setItem('mmw:alerts', '1')
    fetchLive.mockResolvedValue(liveMap([liveEntry('900101')]))
    mount()
    await settle()
    expect(screen.queryByRole('status')).toBeInTheDocument()
    // The 9s auto-retire timeout fires on the faked clock.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
