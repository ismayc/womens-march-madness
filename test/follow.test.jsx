import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GameCard from '../src/components/GameCard.jsx'
import { FollowProvider, useFollow } from '../src/context/follow.jsx'

const TZ = 'America/New_York'
// Michigan hosting UConn — two real teams from the committed 2026 field.
const game = {
  id: '1',
  tip: '2026-07-20T23:00:00.000Z',
  home: 'MICH',
  away: 'CONN',
}

const wrap = (ui) => render(<FollowProvider>{ui}</FollowProvider>)

beforeEach(() => {
  localStorage.clear()
})

describe('following from a game card', () => {
  it('offers a star for each team', () => {
    wrap(<GameCard game={game} tz={TZ} />)
    expect(screen.getByLabelText('Follow Michigan Wolverines')).toBeInTheDocument()
    expect(screen.getByLabelText('Follow UConn Huskies')).toBeInTheDocument()
  })

  it('toggles on click and reflects it in the label', async () => {
    wrap(<GameCard game={game} tz={TZ} />)
    await userEvent.click(screen.getByLabelText('Follow Michigan Wolverines'))
    const btn = screen.getByLabelText('Unfollow Michigan Wolverines')
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(btn).toHaveTextContent('★')
  })

  // The whole card is a button that opens the game detail. Following a team from it
  // must not also open that modal.
  it('does not trigger the card while starring', async () => {
    const onOpen = vi.fn()
    wrap(<GameCard game={game} tz={TZ} onOpen={onOpen} />)
    await userEvent.click(screen.getByLabelText('Follow Michigan Wolverines'))
    expect(onOpen).not.toHaveBeenCalled()

    // …but the card itself still opens normally.
    await userEvent.click(screen.getByText('Wolverines'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('highlights the followed side', async () => {
    const { container } = wrap(<GameCard game={game} tz={TZ} />)
    expect(container.querySelector('.side.followed')).toBeNull()
    await userEvent.click(screen.getByLabelText('Follow Michigan Wolverines'))
    expect(container.querySelector('.side.followed')).toBeTruthy()
  })

  it('persists across a remount', async () => {
    const { unmount } = wrap(<GameCard game={game} tz={TZ} />)
    await userEvent.click(screen.getByLabelText('Follow Michigan Wolverines'))
    unmount()

    wrap(<GameCard game={game} tz={TZ} />)
    expect(screen.getByLabelText('Unfollow Michigan Wolverines')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})

describe('following is shared through the context', () => {
  // A star set anywhere must show everywhere — the context is the single source.
  function Harness() {
    const { toggle } = useFollow()
    return (
      <>
        <button onClick={() => toggle('MICH')}>seed</button>
        <GameCard game={game} tz={TZ} />
      </>
    )
  }

  it('propagates a star set elsewhere to the game card', async () => {
    const { container } = wrap(<Harness />)
    expect(container.querySelectorAll('.followed')).toHaveLength(0)

    await userEvent.click(screen.getByText('seed'))

    expect(container.querySelector('.side.followed')).toBeTruthy()
  })
})

describe('the follow store', () => {
  function Probe() {
    const { followed, count, toggle, clear, isFollowed } = useFollow()
    return (
      <div>
        <span data-testid="count">{count}</span>
        <span data-testid="list">{[...followed].sort().join(',')}</span>
        <span data-testid="has-mich">{String(isFollowed('MICH'))}</span>
        <button onClick={() => toggle('MICH')}>mich</button>
        <button onClick={() => toggle('CONN')}>conn</button>
        <button onClick={clear}>clear</button>
      </div>
    )
  }

  it('adds, removes, counts, and clears', async () => {
    wrap(<Probe />)
    const count = () => screen.getByTestId('count').textContent

    await userEvent.click(screen.getByText('mich'))
    await userEvent.click(screen.getByText('conn'))
    expect(count()).toBe('2')
    expect(screen.getByTestId('list').textContent).toBe('CONN,MICH')

    await userEvent.click(screen.getByText('mich')) // toggles back off
    expect(count()).toBe('1')
    expect(screen.getByTestId('has-mich').textContent).toBe('false')

    await userEvent.click(screen.getByText('clear'))
    expect(count()).toBe('0')
  })

  it('survives corrupt localStorage rather than crashing', () => {
    localStorage.setItem('mmw:followed', 'not json')
    wrap(<Probe />)
    expect(screen.getByTestId('count').textContent).toBe('0')
  })

  it('renders standalone without a provider', () => {
    // The inert fallback keeps components usable in isolation and in tests.
    render(<GameCard game={game} tz={TZ} />)
    expect(screen.getByLabelText('Follow Michigan Wolverines')).toBeInTheDocument()
  })
})
