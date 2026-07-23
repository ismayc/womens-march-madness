import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The game detail fetches the ESPN summary on open; keep it off the network.
vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))

import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { GAMES } from '../src/data/schedule.js'

// Coverage for App.jsx wiring that the main app.test.jsx doesn't exercise: the
// localStorage init/write catch arms, the calendar/services modals, the followed and
// clear-team chips, the bracket onPick, the game-detail onPickTeam, and the timezone
// select. Poll/live/alerts wiring lives in app-live.cov.test.jsx and app-loadcatch.

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

const search = () => new URLSearchParams(window.location.search)
const scheduleAt = (query = '') => window.history.replaceState(null, '', `/?view=schedule${query}`)

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  // The committed tournament is finished, so the app never polls; keep fetch inert anyway.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) })
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('localStorage unavailable (private mode)', () => {
  it('falls back to defaults when every init read throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    scheduleAt()
    await mount()
    // spoilerFree, watchOnly, alerts all catch and default off; showPast catches to true.
    expect(screen.getByTitle('Spoiler-free mode')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTitle('Live alerts off')).toHaveAttribute('aria-pressed', 'false')
  })

  it('swallows write failures across every persisted toggle', async () => {
    // Services present so the "On my services" toggle (a localStorage write) is on screen.
    localStorage.setItem('mmw:services', JSON.stringify(['espnplus']))
    scheduleAt()
    await mount()
    // Now make every write throw. Mount already ran the spoiler/showPast persist effects
    // once with a working store; the toggles below exercise their catch arms.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })

    // Spoiler-free write catch (both directions).
    const spoiler = screen.getByTitle('Spoiler-free mode')
    await userEvent.click(spoiler)
    await userEvent.click(spoiler)

    // showPast write catch (both directions).
    const past = screen.getByRole('button', { name: /past days/ })
    await userEvent.click(past)
    await userEvent.click(past)

    // Theme write catch, both ternary directions (dark->light->dark).
    const themeBtn = screen.getByTitle('Toggle theme')
    await userEvent.click(themeBtn)
    await userEvent.click(themeBtn)

    // Alerts write catch, both '1' and '0' branches.
    await userEvent.click(screen.getByTitle('Live alerts off'))
    await userEvent.click(screen.getByTitle('Live alerts on'))

    // Watch-only write catch, both branches.
    const watchBtn = screen.getByRole('button', { name: /On my services/ })
    await userEvent.click(watchBtn)
    await userEvent.click(watchBtn)

    // Nothing escaped; the shell is still standing.
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})

describe('timezone select', () => {
  it('changes the timezone and records it in the URL', async () => {
    window.history.replaceState(null, '', '/?tz=America/New_York')
    await mount()
    await userEvent.selectOptions(screen.getByLabelText('Timezone'), 'America/Los_Angeles')
    await waitFor(() => expect(search().get('tz')).toBe('America/Los_Angeles'))
  })
})

describe('followed team filter', () => {
  it('shows the My teams chip and narrows the schedule when toggled', async () => {
    // Michigan reaches the final, so it always has games on the slate.
    localStorage.setItem('mmw:followed', JSON.stringify(['MICH']))
    scheduleAt()
    await mount()
    const before = document.querySelectorAll('.game').length
    const chip = screen.getByRole('button', { name: /My teams \(1\)/ })
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    const after = document.querySelectorAll('.game').length
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThan(before)
  })
})

describe('clearing the team via the Clear chip', () => {
  it('drops the team back to all teams', async () => {
    scheduleAt('&team=MICH')
    await mount()
    expect(screen.getByDisplayValue('Michigan Wolverines')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Clear/ }))
    await waitFor(() => expect(search().get('team')).toBeNull())
    expect(screen.getByDisplayValue('All teams')).toBeInTheDocument()
  })
})

describe('the services picker from an existing selection', () => {
  it('opens the editor from the gear button', async () => {
    localStorage.setItem('mmw:services', JSON.stringify(['espnplus']))
    scheduleAt()
    await mount()
    await userEvent.click(screen.getByRole('button', { name: 'Edit my services' }))
    expect(screen.getByRole('dialog', { name: 'My services' })).toBeInTheDocument()
  })
})

describe('the calendar modal', () => {
  it('opens from the filter bar and closes again', async () => {
    scheduleAt()
    await mount()
    await userEvent.click(screen.getByRole('button', { name: /📅 Calendar/ }))
    const dialog = screen.getByRole('dialog', { name: 'Calendar' })
    expect(dialog).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Calendar' })).not.toBeInTheDocument()
  })
})

describe('the bracket onPick', () => {
  it('jumps to a team schedule when a bracket team is clicked', async () => {
    await mount()
    // The default bracket view; click any named team line.
    const teamBtn = document.querySelector('.mm-team.won') || document.querySelector('button.mm-team')
    expect(teamBtn).toBeTruthy()
    await userEvent.click(teamBtn)
    // onPick pins the team and switches to the schedule view.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /📋 Schedule/ })).toHaveAttribute(
        'aria-current',
        'page'
      )
    )
    await waitFor(() => expect(search().get('team')).toBeTruthy())
  })
})

describe('game detail onPickTeam', () => {
  it('jumps to a team schedule from the detail, closing it', async () => {
    window.history.replaceState(null, '', `/?game=${GAMES[0].id}`)
    await mount()
    const dialog = screen.getByRole('dialog', { name: 'Game detail' })
    const schedBtn = within(dialog).getAllByRole('button', { name: /schedule/ })[0]
    await userEvent.click(schedBtn)
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Game detail' })).not.toBeInTheDocument()
    )
    await waitFor(() => expect(search().get('team')).toBeTruthy())
  })

  it('closes the detail on the Close button', async () => {
    window.history.replaceState(null, '', `/?game=${GAMES[0].id}`)
    await mount()
    const dialog = screen.getByRole('dialog', { name: 'Game detail' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Game detail' })).not.toBeInTheDocument()
  })
})
