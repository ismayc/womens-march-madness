// NCAA tournament bracket — single elimination, four regions, one Final Four.
//
// The committed snapshot already carries each game's `region`, `round`, and the two
// `homeSeed`/`awaySeed` values, so the bracket is RECONSTRUCTED rather than guessed:
//
//   • Each region's Round of 64 has eight games, slotted top-to-bottom by the fixed
//     seed order 1·16 / 8·9 / 5·12 / 4·13 / 6·11 / 3·14 / 7·10 / 2·15 (each pair sums 17).
//   • Every later round is located by lineage: a Round-of-32 game is the child of the two
//     Round-of-64 slots whose winners it contains. This is exact for a completed bracket
//     and degrades to a projected "Winner of …" shell when a game hasn't been played.
//   • The Final Four's two national semifinals pair regional champions; the actual pairing
//     is read off the real games (regions derived from each finalist's own region).
//
// Kept DOM-free so the whole reconstruction can be unit-tested against the real 2026
// bracket (see test/bracket.test.js) — the family lesson that real postseason data catches
// bugs a synthetic fixture reproduces from your own assumptions (PLAYBOOK §7).

import { REGIONS, ROUNDS, SEED_ORDER } from '../data/schedule.js'

export { REGIONS, ROUNDS }

const seedPairKey = (a, b) => [a, b].sort((x, y) => x - y).join('-')

// seed-pair → slot index (0…7) within a region's Round of 64.
const R64_SLOT = new Map()
for (let i = 0; i < 8; i++) R64_SLOT.set(seedPairKey(SEED_ORDER[2 * i], SEED_ORDER[2 * i + 1]), i)

const winnerAbbr = (g) => (g.winner === 'home' ? g.home : g.winner === 'away' ? g.away : null)

// A resolved matchup from a real game. Teams are ordered higher-seed first for display.
function slotFromGame(g, feeders) {
  const winner = winnerAbbr(g)
  const teams = [
    { abbr: g.home, seed: g.homeSeed, pts: g.score?.[0], won: winner === g.home },
    { abbr: g.away, seed: g.awaySeed, pts: g.score?.[1], won: winner === g.away },
  ].sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99) || a.abbr.localeCompare(b.abbr))
  return {
    id: g.id,
    round: g.round,
    region: g.region,
    teams,
    score: g.score,
    ot: g.ot,
    tip: g.tip,
    winner,
    /* v8 ignore next -- `?? null` is unreachable: a resolved game always has a distinct non-winner team, so find() never returns undefined */
    loser: winner ? teams.find((t) => t.abbr !== winner)?.abbr ?? null : null,
    live: !!g.live,
    complete: !!g.score,
    projected: false,
    feeders,
    game: g,
  }
}

// An unplayed matchup: whatever labels feed it, no teams yet.
const projectedSlot = (round, region, seeds, feeders) => ({
  id: `${round}:${region ?? 'FF'}:${(seeds || []).join('|') || feeders?.join('|')}`,
  round,
  region,
  teams: (seeds || []).map((seed) => ({ abbr: null, seed })),
  score: undefined,
  winner: null,
  loser: null,
  live: false,
  complete: false,
  projected: true,
  feeders,
})

const slotLabel = (slot) => {
  /* v8 ignore next -- defensive: linkRound always passes real prev slots (arrays are pre-filled), so slotLabel is never called with a nullish slot */
  if (!slot) return 'TBD'
  if (slot.winner) return slot.winner
  const seeds = slot.teams.map((t) => t.seed).filter(Boolean)
  return seeds.length === 2 ? `Winner ${seeds[0]}/${seeds[1]}` : 'Winner'
}

// Does game `g` join the winners `wA` and `wB` (either may be unknown)?
function joins(g, wA, wB) {
  const t = [g.home, g.away]
  if (wA && wB) return t.includes(wA) && t.includes(wB)
  if (wA) return t.includes(wA)
  if (wB) return t.includes(wB)
  return false
}

// Slot the games of one round into `count` positions, each fed by two slots of `prev`.
function linkRound(games, prev, count, round, region) {
  const slots = new Array(count).fill(null)
  const used = new Set()

  for (let i = 0; i < count; i++) {
    const a = prev[2 * i]
    const b = prev[2 * i + 1]
    const g = games.find((g) => !used.has(g.id) && joins(g, a?.winner, b?.winner))
    slots[i] = g
      ? (used.add(g.id), slotFromGame(g, [slotLabel(a), slotLabel(b)]))
      : projectedSlot(round, region, null, [slotLabel(a), slotLabel(b)])
  }

  // Games whose parent winners aren't known yet (a live/early round) fill empty slots in order.
  const leftover = games.filter((g) => !used.has(g.id))
  let li = 0
  for (let i = 0; i < count && li < leftover.length; i++) {
    if (slots[i].projected) {
      const a = prev[2 * i]
      const b = prev[2 * i + 1]
      slots[i] = slotFromGame(leftover[li++], [slotLabel(a), slotLabel(b)])
    }
  }
  return slots
}

function buildRegion(name, games) {
  const inRegion = games.filter((g) => g.region === name)
  const byRound = (r) => inRegion.filter((g) => g.round === r)

  const ff4Games = byRound('FF4')
  const seedFromFirstFour = new Set(ff4Games.flatMap((g) => [g.homeSeed, g.awaySeed]))
  const ff4 = ff4Games.map((g) => slotFromGame(g, ['play-in', 'play-in']))

  // Round of 64 — eight slots, keyed by seed pair.
  const r64 = new Array(8).fill(null)
  for (const g of byRound('R64')) {
    const slot = R64_SLOT.get(seedPairKey(g.homeSeed, g.awaySeed))
    if (slot != null) r64[slot] = slotFromGame(g)
  }
  for (let i = 0; i < 8; i++) {
    const seeds = [SEED_ORDER[2 * i], SEED_ORDER[2 * i + 1]]
    if (!r64[i]) r64[i] = projectedSlot('R64', name, seeds)
    // Mark the seed line that arrived via a First Four play-in.
    r64[i].feeders = r64[i].teams.map((t) =>
      t.seed != null && seedFromFirstFour.has(t.seed) ? 'First Four' : null
    )
  }

  const r32 = linkRound(byRound('R32'), r64, 4, 'R32', name)
  const s16 = linkRound(byRound('S16'), r32, 2, 'S16', name)
  const e8 = linkRound(byRound('E8'), s16, 1, 'E8', name)

  return { name, ff4, r64, r32, s16, e8, champion: e8[0]?.winner ?? null }
}

export function buildBracket(games) {
  const regions = REGIONS.map((name) => buildRegion(name, games))
  const regionOf = {}
  for (const r of regions) if (r.champion) regionOf[r.champion] = r.name

  // National semifinals — pair regional champions. Read the real pairing off the games;
  // fall back to the standard top-half / bottom-half split before they're played.
  const ffGames = games.filter((g) => g.round === 'FF')
  const semiPairs = [
    [REGIONS[0], REGIONS[1]],
    [REGIONS[2], REGIONS[3]],
  ]
  const finalFour = ffGames.length
    ? ffGames
        .map((g) => {
          const regs = [g.home, g.away].map((a) => regionOf[a]).filter(Boolean)
          return slotFromGame(g, regs.map((r) => `${r} champion`))
        })
        .sort((a, b) => a.tip.localeCompare(b.tip))
    : semiPairs.map(([ra, rb]) =>
        projectedSlot('FF', null, null, [`${ra} champion`, `${rb} champion`])
      )

  const ncGame = games.find((g) => g.round === 'NC')
  const championship = ncGame
    ? slotFromGame(ncGame, ['National semifinal winner', 'National semifinal winner'])
    : projectedSlot('NC', null, null, [
        'National semifinal winner',
        'National semifinal winner',
      ])

  return {
    regions,
    finalFour,
    championship,
    champion: championship.winner ?? null,
    projected: !ncGame,
  }
}
