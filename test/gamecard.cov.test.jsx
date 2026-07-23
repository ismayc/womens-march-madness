import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GameCard from '../src/components/GameCard.jsx'

const TZ = 'America/New_York'
const base = {
  id: '1',
  tip: '2026-07-19T17:00:00.000Z',
  home: 'MICH',
  away: 'CONN',
}

beforeEach(() => {
  localStorage.clear()
})

describe('GameCard — live badge', () => {
  it('shows the live period label rather than a running clock', () => {
    // A live game routes through livePeriod for the durable period label.
    render(<GameCard game={{ ...base, live: true, period: 2, statusLabel: '2nd 4:21' }} tz={TZ} />)
    const badge = document.querySelector('.live-badge')
    expect(badge).toBeTruthy()
    expect(badge.textContent).toContain('2ND')
    expect(badge).toHaveAttribute('title', expect.stringContaining('2nd 4:21'))
  })

  it('shows HALF at halftime', () => {
    render(<GameCard game={{ ...base, live: true, period: 2, statusLabel: 'Halftime' }} tz={TZ} />)
    expect(document.querySelector('.live-badge').textContent).toContain('HALF')
  })
})

describe('GameCard — canceled vs postponed', () => {
  it('labels a canceled game Canceled', () => {
    // The `canceled` arm of the void badge (render.test already covers Postponed).
    render(<GameCard game={{ ...base, canceled: true }} tz={TZ} />)
    expect(screen.getByText('Canceled')).toBeInTheDocument()
  })
})

describe('GameCard — keyboard and click activation', () => {
  it('opens on Enter', async () => {
    const onOpen = vi.fn()
    render(<GameCard game={base} tz={TZ} onOpen={onOpen} />)
    document.querySelector('.game').focus()
    await userEvent.keyboard('{Enter}')
    expect(onOpen).toHaveBeenCalledWith(base)
  })

  it('opens on Space', async () => {
    const onOpen = vi.fn()
    render(<GameCard game={base} tz={TZ} onOpen={onOpen} />)
    document.querySelector('.game').focus()
    await userEvent.keyboard(' ')
    expect(onOpen).toHaveBeenCalledWith(base)
  })

  it('ignores other keys', async () => {
    const onOpen = vi.fn()
    render(<GameCard game={base} tz={TZ} onOpen={onOpen} />)
    document.querySelector('.game').focus()
    await userEvent.keyboard('{Escape}')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('opens on click', async () => {
    const onOpen = vi.fn()
    render(<GameCard game={base} tz={TZ} onOpen={onOpen} />)
    await userEvent.click(document.querySelector('.game'))
    expect(onOpen).toHaveBeenCalledWith(base)
  })

  it('toggles follow via the star without opening the card', async () => {
    const onOpen = vi.fn()
    render(<GameCard game={base} tz={TZ} onOpen={onOpen} />)
    const star = document.querySelector('.star')
    await userEvent.click(star)
    // The star stops propagation, so following does not open the game.
    expect(onOpen).not.toHaveBeenCalled()
    // A keydown on the star is also swallowed (stopPropagation), not bubbled to the card.
    star.focus()
    await userEvent.keyboard('{Enter}')
    expect(onOpen).not.toHaveBeenCalled()
  })
})
