import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import NextGame from '../src/components/NextGame.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

const TZ = 'America/New_York'

// Pinned inside the tournament window so every countdown assertion is exact — liveState
// and the 1s ticker both read the wall clock, and a real clock makes the seconds digit
// flake. The committed bracket is a finished tournament, so without this the banner
// would only ever have the "see you next March" branch to show.
const NOW = new Date('2026-03-19T16:00:00.000Z')

const game = (over) => ({
  id: 'g1',
  tip: '2026-03-19T18:00:00.000Z',
  round: 'R64',
  region: 'Regional 1',
  home: 'DUKE',
  away: 'UCLA',
  homeSeed: 1,
  awaySeed: 16,
  venue: 'Rocket Arena',
  city: 'Cleveland',
  ...over,
})

const draw = (games, followed = []) => {
  localStorage.setItem('mmw:followed', JSON.stringify(followed))
  return render(
    <FollowProvider>
      <NextGame games={games} tz={TZ} />
    </FollowProvider>
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  vi.setSystemTime(NOW)
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('NextGame', () => {
  it('counts down to the next game, naming the round and both seeds', () => {
    draw([game()])
    expect(screen.getByText('⏱ Next game')).toBeInTheDocument()
    expect(screen.getByText('Round of 64')).toBeInTheDocument()
    // 16:00 → 18:00 is exactly two hours: hours+minutes, no seconds this far out.
    expect(screen.getByLabelText('time until tip').textContent).toBe('2h0m')
    expect(screen.getByText('Duke')).toBeInTheDocument()
    expect(screen.getByText('16')).toBeInTheDocument()
    expect(screen.getByText(/Cleveland/)).toBeInTheDocument()
  })

  it('drops to days+hours beyond a day, and to minutes+seconds inside the last hour', () => {
    const { unmount } = draw([game({ tip: '2026-03-21T18:00:00.000Z' })])
    expect(screen.getByLabelText('time until tip').textContent).toBe('2d2h')
    unmount()

    draw([game({ tip: '2026-03-19T16:30:00.000Z' })])
    expect(screen.getByLabelText('time until tip').textContent).toBe('30m0s')
  })

  it('prefers a followed team’s next game over an earlier one', () => {
    draw(
      [
        game({ id: 'early', tip: '2026-03-19T17:00:00.000Z', home: 'SC', away: 'LSU' }),
        game({ id: 'mine', tip: '2026-03-19T23:00:00.000Z', home: 'DUKE', away: 'UCLA' }),
      ],
      ['DUKE']
    )
    expect(screen.getByText('⭐ Your next game')).toBeInTheDocument()
    expect(screen.getByText('Duke')).toBeInTheDocument()
    expect(screen.queryByText('LSU')).toBeNull()
  })

  it('stacks every game sharing the earliest tip when no team is followed', () => {
    draw([
      game({ id: 'a', home: 'DUKE', away: 'UCLA' }),
      game({ id: 'b', home: 'SC', away: 'LSU' }),
      game({ id: 'c', tip: '2026-03-19T23:00:00.000Z', home: 'TEX', away: 'ND' }),
    ])
    expect(screen.getByText('⏱ Next games')).toBeInTheDocument()
    expect(screen.getByText('2 at once')).toBeInTheDocument()
    // The later game is not in the stack, and one shared countdown covers both.
    expect(screen.queryByText('Texas')).toBeNull()
    expect(screen.getAllByLabelText('time until tip')).toHaveLength(1)
  })

  it('a live game takes over from an upcoming one', () => {
    draw([
      // Period 3 is a QUARTER here — the women's game plays four, where the men's plays
      // two halves. A period the men's badge would read as overtime is mid-game.
      game({ id: 'live', live: true, period: 3, statusLabel: '3rd 5:12' }),
      game({ id: 'later', tip: '2026-03-19T23:00:00.000Z', home: 'SC', away: 'LSU' }),
    ])
    expect(screen.getByText('🔴 Live now')).toBeInTheDocument()
    expect(screen.getByText('● 3RD')).toBeInTheDocument()
    expect(screen.queryByLabelText('time until tip')).toBeNull()
  })

  it('stacks several live games, with a period badge on each', () => {
    const { container } = draw([
      game({ id: 'l1', live: true, period: 1, statusLabel: '1st 8:00' }),
      game({ id: 'l2', live: true, period: 4, statusLabel: '4th 1:02', home: 'SC', away: 'LSU' }),
    ])
    expect(screen.getByText('2 games')).toBeInTheDocument()
    expect(container.querySelectorAll('.live-badge')).toHaveLength(2)
    // A live stack has no countdown — there is nothing left to count down to.
    expect(screen.queryByLabelText('time until tip')).toBeNull()
  })

  it('a followed team playing live wins outright over the other live games', () => {
    draw(
      [
        game({ id: 'l1', live: true, period: 1, home: 'SC', away: 'LSU' }),
        game({ id: 'mine', live: true, period: 2, home: 'DUKE', away: 'UCLA' }),
      ],
      ['UCLA']
    )
    expect(screen.getByText('🔴 Live now')).toBeInTheDocument()
    expect(screen.getByText('UCLA')).toBeInTheDocument()
    expect(screen.queryByText('LSU')).toBeNull()
  })

  it('names every round from the shared ROUNDS lookup, and passes an unknown one through', () => {
    const { unmount } = draw([game({ round: 'FF4' })])
    expect(screen.getByText('First Four')).toBeInTheDocument()
    unmount()

    const second = draw([game({ round: 'NC' })])
    expect(screen.getByText('National Championship')).toBeInTheDocument()
    second.unmount()

    // A round the feed invents later shows its raw code rather than vanishing.
    draw([game({ round: 'R128' })])
    expect(screen.getByText('R128')).toBeInTheDocument()
  })

  it('falls back to the raw abbreviation for a team not in the field, and omits a missing seed', () => {
    const { container } = draw([game({ home: 'ZZZ', away: 'YYY', homeSeed: undefined, awaySeed: undefined })])
    expect(screen.getByText('ZZZ')).toBeInTheDocument()
    expect(screen.getByText('YYY')).toBeInTheDocument()
    expect(container.querySelectorAll('.nm-seed')).toHaveLength(0)
  })

  it('scrolls to the game’s day, and does nothing when that day is not rendered', () => {
    const day = document.createElement('div')
    // ScheduleView tags each day section with this id; the tip is 2pm ET on the 19th.
    day.id = 'day-2026-03-19'
    document.body.appendChild(day)
    draw([game()])
    fireEvent.click(screen.getByText('Jump to it ↓'))
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    })

    Element.prototype.scrollIntoView.mockClear()
    day.remove()
    cleanup()
    draw([game()])
    fireEvent.click(screen.getByText('Jump to it ↓'))
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
  })

  it('jumps from a stacked row too', () => {
    const day = document.createElement('div')
    day.id = 'day-2026-03-19'
    document.body.appendChild(day)
    draw([
      game({ id: 'a', home: 'DUKE', away: 'UCLA' }),
      game({ id: 'b', home: 'SC', away: 'LSU' }),
    ])
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    day.remove()
  })

  it('ticks every second inside the last hour', async () => {
    draw([game({ tip: '2026-03-19T16:30:00.000Z' })])
    expect(screen.getByLabelText('time until tip').textContent).toBe('30m0s')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(screen.getByLabelText('time until tip').textContent).toBe('29m59s')
  })

  it('ticks only every half-minute when the next game is further out', async () => {
    draw([game()])
    expect(screen.getByLabelText('time until tip').textContent).toBe('2h0m')
    // One second of wall clock moves nothing: no seconds digit is on screen, so the
    // banner deliberately isn't re-rendering at 1 Hz.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(screen.getByLabelText('time until tip').textContent).toBe('2h0m')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(screen.getByLabelText('time until tip').textContent).toBe('1h59m')
  })

  // The staleness bug this component was written to avoid: `now` is read on every
  // render, not held in state, so a re-render triggered by anything else shows the
  // real remaining time instead of one pinned to mount.
  it('refreshes the countdown on a re-render caused by something other than its timer', () => {
    const { rerender } = draw([game()])
    expect(screen.getByLabelText('time until tip').textContent).toBe('2h0m')
    // Wall clock moves, the banner's own 30s interval has NOT fired, and an unrelated
    // prop change forces a render.
    vi.setSystemTime(new Date('2026-03-19T16:45:00.000Z'))
    rerender(
      <FollowProvider>
        <NextGame games={[game()]} tz="America/Chicago" />
      </FollowProvider>
    )
    expect(screen.getByLabelText('time until tip').textContent).toBe('1h15m')
  })

  it('says the bracket is complete when nothing is live or upcoming', () => {
    // Played, postponed, and already-tipped-but-not-ticking all fail to qualify.
    draw([
      game({ id: 'done', score: [90, 82] }),
      game({ id: 'off', postponed: true }),
      game({ id: 'stale', tip: '2026-03-19T15:30:00.000Z' }),
    ])
    expect(screen.getByText(/see you next March/)).toBeInTheDocument()
  })
})
