// Player lookups over the committed player table. Pure — no fetching, no DOM.
// (The season/leaderboard aggregates the NBA template shipped with were dead weight
// in a single-elimination bracket app and were removed; only the per-team roster
// lookup GameDetail's top-scorer line needs remains.)

import { PLAYERS } from '../data/leaders.js'

export const playersByTeam = (abbr, players = PLAYERS) =>
  players.filter((p) => p.team === abbr).sort((a, b) => (b.avgPoints ?? 0) - (a.avgPoints ?? 0))
