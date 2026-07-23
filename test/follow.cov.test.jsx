import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FollowProvider, useFollow } from '../src/context/follow.jsx'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function FollowProbe() {
  const { count, toggle, clear, isFollowed } = useFollow()
  return (
    <div>
      <span data-testid="count">{count}</span>
      <span data-testid="has">{String(isFollowed('MICH'))}</span>
      <button onClick={() => toggle('MICH')}>mich</button>
      <button onClick={clear}>clear</button>
    </div>
  )
}

// ── no-provider FALLBACK (line 54 → FALLBACK) ────────────────────────────────
describe('follow context — fallback with no provider', () => {
  it('exposes inert toggle/clear/isFollowed that never throw or change state', async () => {
    render(<FollowProbe />)
    expect(screen.getByTestId('count').textContent).toBe('0')
    expect(screen.getByTestId('has').textContent).toBe('false')

    await userEvent.click(screen.getByRole('button', { name: 'mich' }))
    await userEvent.click(screen.getByRole('button', { name: 'clear' }))
    // The fallback ignores writes, so nothing moved.
    expect(screen.getByTestId('count').textContent).toBe('0')
  })
})

// ── corrupt-read catch (lines 19-21) ────────────────────────────────────────
describe('follow context — restoring from localStorage', () => {
  it('starts empty when the saved value is corrupt (mmw:followed)', () => {
    // The provider's real key is mmw:followed — set exactly that so JSON.parse throws
    // and the catch returns a fresh empty Set.
    localStorage.setItem('mmw:followed', 'not json')
    render(
      <FollowProvider>
        <FollowProbe />
      </FollowProvider>
    )
    expect(screen.getByTestId('count').textContent).toBe('0')
  })
})

// ── write-failure catch (lines 27-29) ───────────────────────────────────────
describe('follow context — persistence failure', () => {
  it('swallows a localStorage write that throws (private mode)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota / private mode')
    })
    // The persist effect throws internally but is caught; render still succeeds.
    expect(() =>
      render(
        <FollowProvider>
          <FollowProbe />
        </FollowProvider>
      )
    ).not.toThrow()
    expect(screen.getByTestId('count').textContent).toBe('0')
  })
})
