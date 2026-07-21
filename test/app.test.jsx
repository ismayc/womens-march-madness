import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// The game detail fetches the ESPN summary on open. These wiring tests don't exercise
// the summary sections (they have their own suite), so stub the service to keep the
// fetch call count deterministic and the tests off the network.
vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))
import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { GAMES } from '../src/data/schedule.js'
import { ServicesProvider } from '../src/context/services.jsx'

// App is the wiring layer — polling, filters, URL state, and which view is on screen.
// These are integration tests over that wiring, not over the views themselves.

// The mount-time poll resolves on a later microtask, so its setState lands outside
// act() and React warns. Flushing here keeps the update inside act and the output
// free of warnings that would otherwise mask real ones.
const mount = async () => {
  const utils = render(
    <FollowProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </FollowProvider>
  )
  await act(async () => {})
  return utils
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  // The live overlay fires on mount; keep it inert so tests exercise committed data.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const search = () => new URLSearchParams(window.location.search)
const scheduleAt = (query = '') => window.history.replaceState(null, '', `/?view=schedule${query}`)

describe('App', () => {
  it('renders the shell and opens on the bracket', async () => {
    await mount()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Women's March Madness/)
    expect(screen.getByRole('button', { name: /Bracket/ })).toHaveAttribute('aria-current', 'page')
  })

  it('offers exactly the bracket and schedule views', async () => {
    await mount()
    const nav = screen.getByRole('navigation', { name: 'Views' })
    const buttons = within(nav).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['🏀 Bracket', '📋 Schedule'])
  })

  it('switches views and records it in the URL', async () => {
    await mount()
    await userEvent.click(screen.getByRole('button', { name: /Schedule/ }))
    await waitFor(() => expect(search().get('view')).toBe('schedule'))
  })

  it('keeps the default view out of the URL', async () => {
    await mount()
    await userEvent.click(screen.getByRole('button', { name: /Schedule/ }))
    await waitFor(() => expect(search().get('view')).toBe('schedule'))
    await userEvent.click(screen.getByRole('button', { name: /Bracket/ }))
    await waitFor(() => expect(search().get('view')).toBeNull())
  })

  it('restores the schedule view from a shared link', async () => {
    scheduleAt('&hide=1')
    await mount()
    expect(screen.getByRole('button', { name: /Schedule/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTitle('Spoiler-free mode')).toHaveAttribute('aria-pressed', 'true')
  })

  it('restores the team filter from a shared link', async () => {
    // The filter row only exists on the schedule view.
    scheduleAt('&team=MICH')
    await mount()
    expect(screen.getByDisplayValue('Michigan Wolverines')).toBeInTheDocument()
  })

  it('filters the schedule by team', async () => {
    // Start filtered to Michigan (a small slate) and clear it to the full field, so the
    // interaction runs against a small DOM. Michigan reaches the final, so it plays six games.
    scheduleAt('&team=MICH')
    await mount()
    const filtered = document.querySelectorAll('.game').length
    expect(filtered).toBeGreaterThan(0)
    await userEvent.selectOptions(screen.getByLabelText('Team'), '')
    await waitFor(() => expect(search().get('team')).toBeNull())
    const full = document.querySelectorAll('.game').length
    expect(full).toBeGreaterThan(filtered)
  })

  describe('my services', () => {
    it('opens the picker from the filter bar and remembers picks', async () => {
      scheduleAt()
      await mount()
      // With nothing chosen, the chip invites you to choose.
      await userEvent.click(screen.getByRole('button', { name: /Choose my services/ }))
      const dialog = screen.getByRole('dialog', { name: 'My services' })
      await userEvent.click(within(dialog).getByLabelText(/ESPN\+/))
      expect(JSON.parse(localStorage.getItem('mmw:services'))).toContain('espnplus')
      // Closing reveals the filter toggle with the count.
      await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
      expect(screen.getByRole('button', { name: /On my services \(1\)/ })).toBeInTheDocument()
    })

    it('narrows the schedule to watchable games and remembers the choice', async () => {
      // ESPN+ carries the ESPN cable games; two of Michigan's four games are on ABC, which
      // ESPN+ doesn't carry — so the toggle drops those and keeps the ESPN/ESPN2 ones.
      localStorage.setItem('mmw:services', JSON.stringify(['espnplus']))
      scheduleAt('&team=MICH')
      await mount()
      const before = document.querySelectorAll('.game').length
      const btn = screen.getByRole('button', { name: /On my services/ })
      expect(btn).toHaveAttribute('aria-pressed', 'false')

      await userEvent.click(btn)
      expect(btn).toHaveAttribute('aria-pressed', 'true')
      expect(localStorage.getItem('mmw:watchOnly')).toBe('1')

      const after = document.querySelectorAll('.game').length
      expect(after).toBeGreaterThan(0)
      expect(after).toBeLessThan(before)
      // Every remaining card carries a watchable-service badge.
      for (const card of document.querySelectorAll('.game')) {
        expect(within(card).getAllByText(/ESPN\+/).length).toBeGreaterThan(0)
      }
    })

    it('restores the filter from localStorage on load', async () => {
      localStorage.setItem('mmw:services', JSON.stringify(['espnplus']))
      localStorage.setItem('mmw:watchOnly', '1')
      scheduleAt()
      await mount()
      expect(screen.getByRole('button', { name: /On my services/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    })
  })

  describe('past days', () => {
    // The whole tournament is in the past (March 2026), so past days are shown by default.
    it('shows them by default and hides them on click', async () => {
      scheduleAt()
      await mount()
      const before = document.querySelectorAll('.day').length
      expect(before).toBeGreaterThan(0)
      const btn = screen.getByRole('button', { name: /past days/ })
      expect(btn).toHaveAttribute('aria-pressed', 'true')

      await userEvent.click(btn)
      await waitFor(() => expect(search().get('past')).toBeNull())
      expect(document.querySelectorAll('.day').length).toBeLessThan(before)
    })

    it('reports how many past days there are', async () => {
      scheduleAt()
      await mount()
      const btn = screen.getByRole('button', { name: /past days/ })
      const count = Number(within(btn).getByText(/^\d+$/).textContent)
      expect(count).toBeGreaterThan(0)
    })

    it('remembers the choice per-device in localStorage', async () => {
      scheduleAt()
      await mount()
      await userEvent.click(screen.getByRole('button', { name: /past days/ }))
      await waitFor(() => expect(localStorage.getItem('mmw:showPast')).toBe('0'))
    })

    it('restores a hidden preference from localStorage when the link says nothing', async () => {
      localStorage.setItem('mmw:showPast', '0')
      scheduleAt()
      await mount()
      expect(screen.getByRole('button', { name: /past days/ })).toHaveAttribute(
        'aria-pressed',
        'false'
      )
    })

    it('lets an explicit ?past= in a shared link override the saved preference', async () => {
      localStorage.setItem('mmw:showPast', '0')
      scheduleAt('&past=1')
      await mount()
      expect(screen.getByRole('button', { name: /past days/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    })
  })

  describe('spoiler-free mode', () => {
    it('toggles and persists to the URL', async () => {
      await mount()
      const btn = screen.getByTitle('Spoiler-free mode')
      await userEvent.click(btn)
      await waitFor(() => expect(search().get('hide')).toBe('1'))
      expect(btn).toHaveAttribute('aria-pressed', 'true')
    })

    it('also remembers the choice per-device in localStorage', async () => {
      await mount()
      await userEvent.click(screen.getByTitle('Spoiler-free mode'))
      await waitFor(() => expect(localStorage.getItem('mmw:spoilerFree')).toBe('1'))
    })

    it('restores from localStorage when the link says nothing', async () => {
      localStorage.setItem('mmw:spoilerFree', '1')
      await mount()
      expect(screen.getByTitle('Spoiler-free mode')).toHaveAttribute('aria-pressed', 'true')
    })

    it('lets an explicit ?hide= in a shared link override the saved preference', async () => {
      localStorage.setItem('mmw:spoilerFree', '1')
      window.history.replaceState(null, '', '/?hide=0')
      await mount()
      expect(screen.getByTitle('Spoiler-free mode')).toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('theme', () => {
    it('flips the document attribute and persists it', async () => {
      await mount()
      const before = document.documentElement.dataset.theme
      await userEvent.click(screen.getByTitle('Toggle theme'))
      const after = document.documentElement.dataset.theme
      expect(after).not.toBe(before)
      expect(localStorage.getItem('mmw:theme')).toBe(after)
    })
  })

  describe('live alerts', () => {
    it('are off by default and persist when enabled', async () => {
      await mount()
      const btn = screen.getByTitle('Live alerts off')
      expect(btn).toHaveAttribute('aria-pressed', 'false')
      await userEvent.click(btn)
      expect(localStorage.getItem('mmw:alerts')).toBe('1')
    })
  })

  describe('the live overlay', () => {
    // The committed data is a finished tournament, so the app deliberately never polls: the
    // overlay only exists to merge in-progress scores, and there are none.
    it('stays idle once the tournament is complete', async () => {
      await mount()
      await act(async () => {})
      expect(fetch).not.toHaveBeenCalled()
    })

    it('still renders the committed tournament without any live feed', async () => {
      scheduleAt()
      await mount()
      await act(async () => {})
      expect(document.querySelectorAll('.game').length).toBeGreaterThan(0)
    })
  })

  describe('the bracket', () => {
    it('crowns the national champion on the default view', async () => {
      const { container } = await mount()
      const bar = container.querySelector('.mm-champbar')
      expect(bar).toBeTruthy()
      expect(bar).toHaveTextContent(/National Champions/)
      expect(bar).toHaveTextContent(/UCLA Bruins/)
    })
  })

  describe('game detail', () => {
    it('opens when a game is clicked', async () => {
      scheduleAt()
      await mount()
      await userEvent.click(document.querySelector('.game'))
      expect(screen.getByRole('dialog', { name: 'Game detail' })).toBeInTheDocument()
    })
  })
})

describe('game deep link', () => {
  it('opens straight onto the linked game detail, then drops the one-shot param', async () => {
    window.history.replaceState(null, '', `/?game=${GAMES[0].id}`)
    await mount()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // The param is read-only: the first URL write returns to plain filter state.
    expect(new URLSearchParams(window.location.search).get('game')).toBeNull()
  })

  it('ignores a deep link to a game not in the committed season', async () => {
    window.history.replaceState(null, '', '/?game=000000')
    await mount()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
