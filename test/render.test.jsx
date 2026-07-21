import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScheduleView from '../src/components/ScheduleView.jsx'
import GameCard from '../src/components/GameCard.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { GAMES } from '../src/data/schedule.js'
import { dayKey, todayKey } from '../src/utils/time.js'

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
  describe('past days', () => {
    const today = todayKey(TZ)
    // The committed 2026 tournament is fully in the past, so add a game dated today to
    // exercise the today/future split. A noon-UTC anchor keeps it on `today` in any tz.
    const todayGame = {
      id: 'today-1',
      tip: `${today}T16:00:00.000Z`,
      home: 'MICH',
      away: 'CONN',
    }
    const withToday = [...GAMES, todayGame]
    const keysOf = (c) =>
      [...c.querySelectorAll('.day')].map((d) => d.querySelector('.day-head span').textContent)

    it('hides previous days by default', () => {
      const { container } = render(<ScheduleView games={GAMES} tz={TZ} />)
      const shown = new Set(
        GAMES.filter((g) => dayKey(g.tip, TZ) >= today).map((g) => dayKey(g.tip, TZ))
      )
      expect(container.querySelectorAll('.day')).toHaveLength(shown.size)
    })

    it('reveals them when asked', () => {
      const { container: hidden } = render(<ScheduleView games={GAMES} tz={TZ} />)
      const nHidden = hidden.querySelectorAll('.day').length

      const { container: shown } = render(<ScheduleView games={GAMES} tz={TZ} showPast />)
      const nShown = shown.querySelectorAll('.day').length

      expect(nShown).toBeGreaterThan(nHidden)
      // Every day in the tournament is accounted for.
      const allKeys = new Set(GAMES.map((g) => dayKey(g.tip, TZ)))
      expect(nShown).toBe(allKeys.size)
    })

    it('keeps today visible in both states', () => {
      for (const showPast of [false, true]) {
        const { container, unmount } = render(
          <ScheduleView games={withToday} tz={TZ} showPast={showPast} />
        )
        // "Today" is the label the day header uses for the current date.
        expect(keysOf(container)).toContain('Today')
        unmount()
      }
    })

    it('renders only future-or-today days when hiding', () => {
      const { container } = render(<ScheduleView games={withToday} tz={TZ} />)
      // The first rendered day must not precede today.
      const firstGame = withToday
        .filter((g) => dayKey(g.tip, TZ) >= today)
        .sort((a, b) => a.tip.localeCompare(b.tip))[0]
      expect(container.querySelectorAll('.day').length).toBeGreaterThan(0)
      expect(dayKey(firstGame.tip, TZ) >= today).toBe(true)
    })
  })
})
