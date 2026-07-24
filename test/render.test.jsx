import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScheduleView from '../src/components/ScheduleView.jsx'
import GameCard from '../src/components/GameCard.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { GAMES } from '../src/data/schedule.js'
import { todayKey } from '../src/utils/time.js'

const TZ = 'America/New_York'

beforeEach(() => {
  // jsdom has no layout, so scrollIntoView is absent.
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
})

describe('GameCard', () => {
  const base = {
    id: '1',
    tip: '2026-07-19T17:00:00.000Z',
    home: 'MICH',
    away: 'CONN',
    score: [90, 82],
    venue: 'Lucas Oil Stadium',
    city: 'Indianapolis',
  }

  it('marks the winner and shows the final', () => {
    const { container } = render(<GameCard game={base} tz={TZ} />)
    expect(screen.getByText('Final')).toBeInTheDocument()
    // Michigan (home) win 90–82, so the Wolverines side is the winner.
    expect(container.querySelector('.side.winner .side-nick').textContent).toBe('Wolverines')
  })

  it('annotates overtime', () => {
    render(<GameCard game={{ ...base, ot: 2 }} tz={TZ} />)
    expect(screen.getByText('Final/2OT')).toBeInTheDocument()
  })

  it('hides scores in spoiler-free mode', () => {
    render(<GameCard game={base} tz={TZ} hideScores />)
    expect(screen.queryByText('90')).not.toBeInTheDocument()
  })

  it('renders tip time in the chosen timezone', () => {
    render(<GameCard game={{ ...base, score: undefined }} tz={TZ} />)
    expect(screen.getByText('1:00 PM')).toBeInTheDocument()
    // Same instant, three hours earlier out west.
    render(<GameCard game={{ ...base, score: undefined }} tz="America/Los_Angeles" />)
    expect(screen.getByText('10:00 AM')).toBeInTheDocument()
  })

  it('flags postponed games', () => {
    render(<GameCard game={{ ...base, score: undefined, postponed: true }} tz={TZ} />)
    expect(screen.getByText('Postponed')).toBeInTheDocument()
  })

  it('labels games on the viewer’s chosen services and skips ones that are not', () => {
    // Viewer has YouTube TV and ESPN+.
    localStorage.setItem('mmw:services', JSON.stringify(['espnplus', 'youtubetv']))
    const withServices = (game) => (
      <ServicesProvider>
        <GameCard game={game} tz={TZ} />
      </ServicesProvider>
    )

    // ESPN+ + ESPN simulcast is watchable both ways — labels in catalog order.
    const { container, rerender } = render(
      withServices({ ...base, broadcast: ['ESPN+', 'ESPN'] })
    )
    const watch = container.querySelector('.watch')
    expect(watch).toHaveAccessibleName('Watch on ESPN+, YouTube TV')
    expect([...watch.querySelectorAll('.watch-chip')].map((c) => c.textContent)).toEqual([
      'ESPN+',
      'YouTube TV',
    ])
    // "ESPN+" shows only as the badge, not repeated as a raw network; ESPN (the
    // bundle's underlying network) still shows in the meta line.
    expect(container.querySelector('.game-meta').textContent).toContain('ESPN')
    expect(screen.getAllByText('ESPN+')).toHaveLength(1)

    // A game only on a network the tournament doesn't use carries no badge.
    rerender(withServices({ ...base, broadcast: ['CBS'] }))
    expect(container.querySelector('.watch')).toBeNull()
  })

  it('shows no service badge until the viewer picks services', () => {
    // No provider / empty selection → the raw broadcast still renders, but no badge.
    const { container } = render(<GameCard game={{ ...base, broadcast: ['ESPN'] }} tz={TZ} />)
    expect(container.querySelector('.watch')).toBeNull()
  })
})

describe('ScheduleView', () => {
  it('groups games under day headings', () => {
    const { container } = render(<ScheduleView games={GAMES} tz={TZ} showPast />)
    expect(container.querySelectorAll('.day').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/game/).length).toBeGreaterThan(0)
  })

  it('shows an empty state when filters match nothing', () => {
    render(<ScheduleView games={[]} tz={TZ} />)
    expect(screen.getByText(/No games match/i)).toBeInTheDocument()
  })

  // Past days are dropped whole rather than by tip-off time, so a game earlier
  // today still counts as today.
  describe('recent window and full season', () => {
    // Synthetic games placed RELATIVE to the real "today" (not the committed schedule),
    // so the window math is deterministic whatever day the suite runs — no wall-clock
    // flake, and no dependence on where the committed tournament sits.
    const today = todayKey(TZ)
    const shift = (key, delta) => {
      const [y, m, d] = key.split('-').map(Number)
      return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
    }
    const g = (id, date, home, away, score) => ({
      id,
      tip: `${date}T16:00:00.000Z`, // noon ET — safely the same calendar day in TZ
      seasonType: 'regular',
      home,
      away,
      ...(score ? { score } : {}),
    })
    const dOld = shift(today, -14) // older than a week -> hidden by default
    const dRecent = shift(today, -3) // within the last week -> shown by default
    const dFuture = shift(today, 5)
    const games = [
      g('old', dOld, 'MICH', 'CONN', [80, 70]),
      g('recent', dRecent, 'DUKE', 'ALA', [88, 84]),
      g('today', today, 'IOWA', 'OSU', [70, 66]),
      g('future', dFuture, 'LSU', 'UK'),
    ]
    const keysOf = (c) =>
      [...c.querySelectorAll('.day')].map((d) => d.querySelector('.day-head span').textContent)

    it('defaults to the last week of results plus upcoming, hiding older days', () => {
      const { container } = render(<ScheduleView games={games} tz={TZ} />)
      // recent (−3), today, future (+5) show; the 14-days-ago game does not.
      expect(container.querySelectorAll('.day')).toHaveLength(3)
      expect(keysOf(container)).toContain('Today')
    })

    it('shows the whole tournament when Full season (showPast) is on', () => {
      const { container } = render(<ScheduleView games={games} tz={TZ} showPast />)
      expect(container.querySelectorAll('.day')).toHaveLength(4) // the old day is back
      expect(keysOf(container)).toContain('Today')
    })

    it('lands scrolled on the most recent past day (so yesterday is right there)', () => {
      const spy = Element.prototype.scrollIntoView
      render(<ScheduleView games={games} tz={TZ} />)
      expect(spy).toHaveBeenCalled()
    })

    it('anchors on today when nothing is in the past', () => {
      const spy = Element.prototype.scrollIntoView
      render(
        <ScheduleView games={[g('today', today, 'IOWA', 'OSU', [70, 66]), g('future', dFuture, 'LSU', 'UK')]} tz={TZ} />
      )
      expect(spy).toHaveBeenCalled()
    })

    it('does not scroll when no rendered day matches the anchor', () => {
      const spy = Element.prototype.scrollIntoView
      // Only a future day: anchor falls back to today, which has no rendered day.
      render(<ScheduleView games={[g('future', dFuture, 'LSU', 'UK')]} tz={TZ} />)
      expect(spy).not.toHaveBeenCalled()
    })

    it('shows an empty state when no games match', () => {
      const { container } = render(<ScheduleView games={[]} tz={TZ} />)
      expect(container.querySelector('.empty')).toBeTruthy()
    })
  })
})
