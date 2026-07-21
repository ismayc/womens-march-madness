import { describe, it, expect } from 'vitest'
import {
  watchableServices,
  broadcastNotBadged,
  SERVICE_CATALOG,
  SERVICE_BY_KEY,
} from '../src/utils/watch.js'

const labels = (b, keys) => watchableServices(b, keys).map((s) => s.label)

describe('watchableServices', () => {
  it('matches a live-TV bundle via the national networks it carries', () => {
    expect(labels(['ABC'], ['youtubetv'])).toEqual(['YouTube TV'])
    expect(labels(['ESPNU'], ['youtubetv'])).toEqual(['YouTube TV'])
  })

  it('matches the streaming exclusive by name', () => {
    // ESPN+ streams the ESPN cable games (but not the ABC broadcast games).
    expect(labels(['ESPN2'], ['espnplus'])).toEqual(['ESPN+'])
    expect(labels(['ESPN+', 'ESPN'], ['espnplus'])).toEqual(['ESPN+'])
  })

  it('only reports services the viewer has selected', () => {
    // The game is ABC-only, but the viewer only has ESPN+ (which doesn't carry ABC).
    expect(labels(['ABC'], ['espnplus'])).toEqual([])
    // Selecting YouTube TV surfaces it.
    expect(labels(['ABC'], ['espnplus', 'youtubetv'])).toEqual(['YouTube TV'])
  })

  it('lists every selected service that carries the game, in catalog order', () => {
    // An ESPN game, viewer has both a bundle and the ESPN streamer.
    expect(labels(['ESPN'], ['youtubetv', 'espnplus'])).toEqual([
      'ESPN+',
      'YouTube TV',
    ])
  })

  it('lists ALL of a viewer’s many services that carry the game — never capped', () => {
    // An ESPN game and a viewer with many services: every one that carries ESPN is
    // returned, not a truncated subset, in catalog order.
    expect(labels(['ESPN'], ['youtubetv', 'hulu', 'sling', 'cable', 'espnplus'])).toEqual([
      'ESPN+',
      'YouTube TV',
      'Hulu + Live TV',
      'Sling TV',
      'Cable / Satellite',
    ])
  })

  it('bundle carriage differs — Sling carries the core ESPN nets but not ABC', () => {
    expect(labels(['ABC'], ['sling'])).toEqual([])
    expect(labels(['ESPN2'], ['sling'])).toEqual(['Sling TV'])
  })

  it('ignores a network the tournament does not use', () => {
    expect(labels(['CBS'], ['cable', 'youtubetv'])).toEqual([])
  })

  it('returns [] with no selection or no broadcast', () => {
    expect(watchableServices(['ESPN'], [])).toEqual([])
    expect(watchableServices(['ESPN'], undefined)).toEqual([])
    expect(watchableServices(undefined, ['youtubetv'])).toEqual([])
    expect(watchableServices([], ['youtubetv'])).toEqual([])
  })

  it('exposes a catalog keyed for lookup', () => {
    expect(SERVICE_CATALOG.length).toBeGreaterThanOrEqual(5)
    expect(SERVICE_BY_KEY.youtubetv.label).toBe('YouTube TV')
    expect(SERVICE_BY_KEY.espnplus.kind).toBe('stream')
    expect(SERVICE_BY_KEY.youtubetv.kind).toBe('bundle')
  })
})

describe('broadcastNotBadged', () => {
  const svc = (label) => ({ label })

  it('drops a network already shown as a badge but keeps the rest', () => {
    expect(broadcastNotBadged(['NBC', 'Peacock'], [svc('Peacock')])).toEqual(['NBC'])
    expect(broadcastNotBadged(['Prime Video'], [svc('Prime Video')])).toEqual([])
  })

  it('leaves a bundle badge’s underlying network in place (YouTube TV ≠ ESPN)', () => {
    expect(broadcastNotBadged(['ESPN'], [svc('YouTube TV')])).toEqual(['ESPN'])
  })

  it('returns the whole list when nothing is badged', () => {
    expect(broadcastNotBadged(['ESPN', 'ABC'], [])).toEqual(['ESPN', 'ABC'])
    expect(broadcastNotBadged(undefined, [])).toEqual([])
  })
})
