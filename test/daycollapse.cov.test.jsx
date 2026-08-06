import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup, within } from '@testing-library/react'
import ScheduleView from '../src/components/ScheduleView.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

const TZ = 'UTC'

// Two days, both already played, anchored relative to the real clock so the fixture
// never goes stale as the calendar moves past the tournament (the refresh must not
// freeze this).
const daysAgo = (n, h = 18) => {
  const d = new Date(Date.now() - n * 86400000)
  d.setUTCHours(h, 0, 0, 0)
  return d.toISOString()
}

const GAMES = [
  {
    id: 'a1',
    tip: daysAgo(2),
    round: 'R64',
    region: 'Regional 1',
    home: 'DUKE',
    away: 'UCLA',
    homeSeed: 1,
    awaySeed: 16,
    score: [90, 82],
    venue: 'V',
    city: 'C',
  },
  {
    id: 'a2',
    tip: daysAgo(2, 20),
    round: 'R64',
    region: 'Regional 2',
    home: 'SC',
    away: 'LSU',
    homeSeed: 2,
    awaySeed: 15,
    score: [77, 70],
    venue: 'V',
    city: 'C',
  },
  {
    id: 'b1',
    tip: daysAgo(1),
    round: 'R32',
    region: 'Regional 1',
    home: 'TEX',
    away: 'ND',
    homeSeed: 3,
    awaySeed: 14,
    score: [88, 85],
    venue: 'V',
    city: 'C',
  },
]

const draw = (props = {}) =>
  render(
    <FollowProvider>
      <ServicesProvider>
        <ScheduleView games={GAMES} tz={TZ} onOpen={() => {}} {...props} />
      </ServicesProvider>
    </FollowProvider>
  )

const days = () => [...document.querySelectorAll('.day')]

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
})

afterEach(() => cleanup())

describe('per-day folding', () => {
  it('folds a single day away and leaves its neighbours alone', () => {
    draw()
    const [first, second] = days()
    expect(first.querySelector('.day-games')).not.toBeNull()

    fireEvent.click(within(first).getByRole('button', { name: /^Hide games on/ }))

    expect(first.querySelector('.day-games')).toBeNull()
    expect(within(first).getByRole('button', { name: /^Show games on/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(first.querySelector('.day-caret').textContent).toBe('▸')
    // The other day is untouched — folding is per day, not a global collapse.
    expect(second.querySelector('.day-games')).not.toBeNull()
  })

  it('unfolds again on a second click', () => {
    draw()
    const first = days()[0]
    const fold = () => within(first).getByRole('button', { name: /games on/ })
    fireEvent.click(fold())
    expect(first.querySelector('.day-games')).toBeNull()
    fireEvent.click(fold())
    expect(first.querySelector('.day-games')).not.toBeNull()
    expect(first.querySelector('.day-caret').textContent).toBe('▾')
  })

  it('tags each day with the id the banner jumps to', () => {
    draw()
    const key = daysAgo(1).slice(0, 10)
    expect(document.getElementById(`day-${key}`)).not.toBeNull()
  })
})

describe('per-day spoiler override', () => {
  const scoresOn = (day) => day.querySelectorAll('.side-score').length > 0

  it('reveals one day while spoiler-free mode stays on everywhere else', () => {
    draw({ hideScores: true })
    const [first, second] = days()
    expect(scoresOn(first)).toBe(false)
    expect(scoresOn(second)).toBe(false)

    fireEvent.click(within(first).getByTitle('Show scores for this day'))

    expect(scoresOn(first)).toBe(true)
    // The override is per day — the rest of the bracket is still spoiler-free.
    expect(scoresOn(second)).toBe(false)
  })

  it('hides one day while scores are otherwise showing', () => {
    draw({ hideScores: false })
    const [first, second] = days()
    expect(scoresOn(first)).toBe(true)

    fireEvent.click(within(first).getByTitle('Hide scores for this day'))

    expect(scoresOn(first)).toBe(false)
    expect(scoresOn(second)).toBe(true)
  })

  it('toggles back to the global default', () => {
    draw({ hideScores: true })
    const first = days()[0]
    fireEvent.click(within(first).getByTitle('Show scores for this day'))
    expect(scoresOn(first)).toBe(true)
    fireEvent.click(within(first).getByTitle('Hide scores for this day'))
    expect(scoresOn(first)).toBe(false)
  })

  it('marks the eye pressed exactly when that day is hidden', () => {
    draw({ hideScores: true })
    const first = days()[0]
    expect(within(first).getByRole('button', { name: '🙈' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    fireEvent.click(within(first).getByTitle('Show scores for this day'))
    expect(within(first).getByRole('button', { name: '👁' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })
})

describe('folding with the full-season cutoff dropped', () => {
  it('works there too', () => {
    draw({ showPast: true })
    const open = days()
    expect(open.length).toBeGreaterThan(0)
    const first = open[0]
    fireEvent.click(within(first).getByRole('button', { name: /^Hide games on/ }))
    expect(first.querySelector('.day-games')).toBeNull()
  })
})
