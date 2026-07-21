import { describe, it, expect } from 'vitest'
import { readState, toSearch, isValidZone, DEFAULTS } from '../src/utils/urlState.js'

describe('readState', () => {
  it('falls back to defaults on an empty query', () => {
    expect(readState('')).toEqual({
      view: 'bracket',
      tz: null,
      team: '',
      game: '',
      hide: false,
      hideExplicit: false,
      mine: false,
      past: false,
      pastExplicit: false,
    })
  })

  it('reads every supported key', () => {
    expect(readState('?view=schedule&tz=America/Chicago&team=MICH&game=401857072&hide=1&mine=1&past=1')).toEqual({
      view: 'schedule',
      tz: 'America/Chicago',
      team: 'MICH',
      game: '401857072',
      hide: true,
      hideExplicit: true,
      mine: true,
      past: true,
      pastExplicit: true,
    })
  })

  it('ignores an unknown view rather than rendering a blank page', () => {
    // Stale links from the old app (?view=standings / stats / playoffs / radial / week)
    // are no longer valid views and must land on the default rather than a blank page.
    expect(readState('?view=nope').view).toBe(DEFAULTS.view)
    expect(readState('?view=standings').view).toBe(DEFAULTS.view)
    expect(readState('?view=stats').view).toBe(DEFAULTS.view)
  })

  it('rejects a bogus timezone so a bad link cannot crash formatting', () => {
    expect(readState('?tz=Mars/Olympus').tz).toBeNull()
  })

  it('accepts any real IANA zone, not just the ones in the picker', () => {
    expect(readState('?tz=Pacific/Auckland').tz).toBe('Pacific/Auckland')
  })
})

describe('isValidZone', () => {
  it('accepts real zones and rejects junk', () => {
    expect(isValidZone('Europe/London')).toBe(true)
    expect(isValidZone('UTC')).toBe(true)
    expect(isValidZone('Not/AZone')).toBe(false)
    expect(isValidZone(null)).toBe(false)
  })
})

describe('toSearch', () => {
  const detected = 'America/New_York'

  it('writes nothing when everything is default', () => {
    // The default view is now the bracket, so it is the one omitted from the URL.
    expect(toSearch({ view: 'bracket', tz: detected, team: '', hide: false }, detected)).toBe('')
  })

  it('omits the timezone when it matches the viewer’s own zone', () => {
    // Keeps a link shared between two people in the same zone clean.
    expect(toSearch({ view: 'schedule', tz: detected }, detected)).toBe('?view=schedule')
  })

  it('pins the timezone when it differs', () => {
    expect(toSearch({ view: 'bracket', tz: 'Europe/London' }, detected)).toBe('?tz=Europe%2FLondon')
  })

  it('round-trips through readState', () => {
    const state = {
      view: 'schedule',
      tz: 'Europe/London',
      team: 'MICH',
      hide: true,
      mine: true,
      past: true,
    }
    // readState also reports whether hide/past were explicit; toSearch wrote them, so both are.
    expect(readState(toSearch(state, detected))).toEqual({
      ...state,
      game: '',
      hideExplicit: true,
      pastExplicit: true,
    })
  })
})
