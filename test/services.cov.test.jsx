import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ServicesProvider, useServices } from '../src/context/services.jsx'

// `espnplus` is a real key in this repo's SERVICE_CATALOG; `bogus`/`gonesvc` are not.
beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function ServicesProbe() {
  const { services, has, toggle, clear, count } = useServices()
  return (
    <div>
      <span data-testid="count">{count}</span>
      <span data-testid="list">{services.join(',')}</span>
      <span data-testid="has">{String(has('espnplus'))}</span>
      <button onClick={() => toggle('espnplus')}>espnplus</button>
      <button onClick={() => toggle('bogus')}>bogus</button>
      <button onClick={clear}>clear</button>
    </div>
  )
}

// ── provider actions: add / invalid-key guard / remove / clear / has / count ─
describe('services context — provider actions', () => {
  it('adds, ignores invalid keys, removes, and clears', async () => {
    render(
      <ServicesProvider>
        <ServicesProbe />
      </ServicesProvider>
    )
    const count = () => screen.getByTestId('count').textContent

    await userEvent.click(screen.getByRole('button', { name: 'espnplus' })) // add
    expect(count()).toBe('1')
    expect(screen.getByTestId('has').textContent).toBe('true')
    expect(screen.getByTestId('list').textContent).toBe('espnplus')

    await userEvent.click(screen.getByRole('button', { name: 'bogus' })) // not in catalog → no-op
    expect(count()).toBe('1')

    await userEvent.click(screen.getByRole('button', { name: 'espnplus' })) // remove
    expect(count()).toBe('0')

    await userEvent.click(screen.getByRole('button', { name: 'espnplus' })) // add again
    await userEvent.click(screen.getByRole('button', { name: 'clear' })) // clear all
    expect(count()).toBe('0')
  })
})

// ── no-provider FALLBACK (line 59 → FALLBACK) ────────────────────────────────
describe('services context — fallback with no provider', () => {
  it('exposes inert has/toggle/clear that never throw or change state', async () => {
    render(<ServicesProbe />)
    expect(screen.getByTestId('count').textContent).toBe('0')
    expect(screen.getByTestId('has').textContent).toBe('false')

    await userEvent.click(screen.getByRole('button', { name: 'espnplus' }))
    await userEvent.click(screen.getByRole('button', { name: 'clear' }))
    expect(screen.getByTestId('count').textContent).toBe('0')
  })
})

// ── restoring from localStorage: corrupt / non-array / catalog drift ──────────
describe('services context — restoring from localStorage', () => {
  it('starts empty when the saved value is corrupt (lines 27-29)', () => {
    localStorage.setItem('mmw:services', 'not json')
    render(
      <ServicesProvider>
        <ServicesProbe />
      </ServicesProvider>
    )
    expect(screen.getByTestId('count').textContent).toBe('0')
  })

  it('starts empty when the saved value is valid JSON but not an array (line 26 : [])', () => {
    localStorage.setItem('mmw:services', JSON.stringify({ espnplus: true }))
    render(
      <ServicesProvider>
        <ServicesProbe />
      </ServicesProvider>
    )
    expect(screen.getByTestId('count').textContent).toBe('0')
  })

  it('drops saved keys the catalog no longer defines', () => {
    localStorage.setItem('mmw:services', JSON.stringify(['espnplus', 'gonesvc']))
    render(
      <ServicesProvider>
        <ServicesProbe />
      </ServicesProvider>
    )
    expect(screen.getByTestId('list').textContent).toBe('espnplus')
    expect(screen.getByTestId('count').textContent).toBe('1')
  })
})

// ── write-failure catch (lines 35-37) ───────────────────────────────────────
describe('services context — persistence failure', () => {
  it('swallows a localStorage write that throws (private mode)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota / private mode')
    })
    expect(() =>
      render(
        <ServicesProvider>
          <ServicesProbe />
        </ServicesProvider>
      )
    ).not.toThrow()
    expect(screen.getByTestId('count').textContent).toBe('0')
  })
})
