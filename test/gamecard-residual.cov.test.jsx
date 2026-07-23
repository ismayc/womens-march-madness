import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import GameCard from '../src/components/GameCard.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

const TZ = 'America/New_York'
const wrap = (ui) =>
  render(
    <ServicesProvider>
      <FollowProvider>{ui}</FollowProvider>
    </ServicesProvider>
  )

beforeEach(() => localStorage.clear())

describe('GameCard — residual branches', () => {
  it('a followed side and an unknown team both fall back to the abbreviation', () => {
    // ZZZ is not a real team AND is followed: covers the `on ? 'Unfollow'` arm and the
    // `team?.displayName || abbr` fallback together; MICH covers the known-team arm.
    localStorage.setItem('mmw:followed', JSON.stringify(['ZZZ']))
    wrap(
      <GameCard
        game={{ id: '1', tip: '2026-03-19T17:00:00.000Z', home: 'MICH', away: 'ZZZ', score: [70, 60], winner: 'home' }}
        tz={TZ}
      />
    )
    expect(screen.getByTitle('Unfollow ZZZ')).toBeInTheDocument()
    expect(screen.getByTitle(/^Follow /)).toBeInTheDocument() // the known, unfollowed side
  })

  it('a venue without a city, a live game without a status label, and a note', () => {
    wrap(
      <GameCard
        game={{
          id: '2',
          tip: '2026-03-19T17:00:00.000Z',
          home: 'MICH',
          away: 'CONN',
          live: true, // no statusLabel -> the live badge title falls back to 'Live'
          venue: 'The Palestra', // no city -> the `game.city ? … : game.venue` false arm
          note: 'First Four',
        }}
        tz={TZ}
      />
    )
    expect(screen.getByText('The Palestra')).toBeInTheDocument()
    expect(screen.getByText('First Four')).toBeInTheDocument()
    expect(screen.getByTitle(/^Live — as of/)).toBeInTheDocument()
  })
})
