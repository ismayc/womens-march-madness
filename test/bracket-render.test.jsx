import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Bracket from '../src/components/Bracket.jsx'
import { GAMES } from '../src/data/schedule.js'

// The committed schedule holds the finished 2026 tournament (UCLA champion), so the
// completed bracket renders straight from GAMES.

describe('Bracket with a completed tournament', () => {
  it('mounts and announces the national champion in the champion bar', () => {
    const { container } = render(<Bracket games={GAMES} />)
    const bar = container.querySelector('.mm-champbar')
    expect(bar).toBeTruthy()
    expect(within(bar).getByText(/UCLA Bruins/)).toBeInTheDocument()
    expect(within(bar).getByText(/National Champions/)).toBeInTheDocument()
  })

  it('opens on the Final Four, showing the championship matchup', () => {
    render(<Bracket games={GAMES} />)
    expect(screen.getByRole('heading', { name: 'National Championship' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'National Semifinal' })).toHaveLength(2)
  })

  it('offers a tab per region plus the Final Four', () => {
    render(<Bracket games={GAMES} />)
    for (const name of ['Regional 1', 'Regional 2', 'Regional 3', 'Regional 4', 'Final Four']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    }
  })

  it('switches to a region tab and shows its Round of 64', async () => {
    const { container } = render(<Bracket games={GAMES} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Regional 2' }))
    expect(screen.getByRole('tab', { name: 'Regional 2' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Round of 64' })).toBeInTheDocument()
    // UCLA wins Regional 2.
    expect(container.querySelector('.mm-region-champ')).toHaveTextContent(/Regional 2 Region/)
  })

  it('routes a team click to the picker callback', async () => {
    const onPick = vi.fn()
    const { container } = render(<Bracket games={GAMES} onPick={onPick} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Regional 1' }))
    await userEvent.click(container.querySelector('.mm-team'))
    expect(onPick).toHaveBeenCalled()
    expect(typeof onPick.mock.calls[0][0]).toBe('string')
  })

  it('hides scores in spoiler-free mode', async () => {
    const { container } = render(<Bracket games={GAMES} hideScores />)
    await userEvent.click(screen.getByRole('tab', { name: 'Regional 3' }))
    expect(container.querySelector('.mm-score')).toBeNull()
  })
})

describe('Bracket partway through the tournament', () => {
  // Only the First Four and Round of 64 have been played — later rounds are projected.
  const early = GAMES.filter((g) => ['FF4', 'R64'].includes(g.round))

  it('shows no champion bar while the title is undecided', () => {
    const { container } = render(<Bracket games={early} />)
    expect(container.querySelector('.mm-champbar')).toBeNull()
  })

  it('labels unresolved Final Four semifinals by their feeders', () => {
    const { container } = render(<Bracket games={early} />)
    // Projected slots render their feeder labels ("Regional 1 champion", etc.) rather than teams.
    expect(container.querySelector('.mm-match.is-proj')).toBeTruthy()
    expect(screen.getByText(/Regional 1 champion/)).toBeInTheDocument()
  })
})
