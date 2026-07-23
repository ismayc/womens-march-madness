import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'

vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))

// One not-yet-played game so tournamentOver is false and the poll effect actually runs
// (the real committed tournament is complete and would short-circuit).
vi.mock('../src/data/schedule.js', async (importActual) => ({
  ...(await importActual()),
  GAMES: [
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
    {
      id: '900101',
      tip: '2026-03-20T22:40:00.000Z',
      round: 'R32',
      region: 'East',
      home: 'DUKE',
      away: 'TEX',
      homeSeed: 2,
      awaySeed: 7,
      venue: 'UD Arena',
      city: 'Dayton',
      state: 'OH',
      neutral: true,
      broadcast: ['truTV'],
    },
  ],
}))

// Keep the real overlay math but make the fetch itself reject, so App's load() try/catch
// is exercised — the committed schedule must still render.
vi.mock('../src/services/espn.js', async (importActual) => {
  const actual = await importActual()
  return { ...actual, fetchLive: vi.fn().mockRejectedValue(new Error('feed down')) }
})

import App from '../src/App.jsx'
import { fetchLive } from '../src/services/espn.js'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/?view=schedule&past=1')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a rejecting live feed', () => {
  it('swallows the error and still renders the committed schedule', async () => {
    render(
      <FollowProvider>
        <ServicesProvider>
          <App />
        </ServicesProvider>
      </FollowProvider>
    )
    await act(async () => {})
    await waitFor(() => expect(fetchLive).toHaveBeenCalled())
    // load()'s catch swallowed the rejection; committed cards are still on screen and
    // no updated-at stamp was written.
    expect(document.querySelectorAll('.game').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/Updated/)
  })
})
