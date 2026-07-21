// Standings, seeding, and playoff-race math — all pure functions over the merged
// game list, so they can be unit-tested with synthetic arrays and no DOM.

import { TEAMS, TEAM_BY_ABBR } from '../data/teams.js'

export const CONFERENCES = { E: 'Eastern Conference', W: 'Western Conference' }

// The NBA playoff field is CONFERENCE-BASED: the top 8 in each conference qualify —
// seeds 1–6 outright, seeds 7–8 via a play-in among 7–10 — and each conference plays
// its own fixed 1v8/4v5/2v7/3v6 bracket to a conference champion; the two champions
// meet in the Finals. Seeding is therefore PER CONFERENCE, not league-wide. This is the
// defining structural difference from the WNBA sibling this app was templated from.
export const PLAYOFF_SPOTS = 8 // per conference
export const PLAYIN_SEEDS = [7, 8, 9, 10] // per conference; 7–8 host, 9–10 visit

// Conference and division are not in ESPN's team feed, so they live here — the
// authoritative 30-team split (matches the standings endpoint's grouping).
export const CONFERENCE_BY_ABBR = {
  ATL: 'E', BKN: 'E', BOS: 'E', CHA: 'E', CHI: 'E', CLE: 'E', DET: 'E', IND: 'E',
  MIA: 'E', MIL: 'E', NY: 'E', ORL: 'E', PHI: 'E', TOR: 'E', WSH: 'E',
  DAL: 'W', DEN: 'W', GS: 'W', HOU: 'W', LAC: 'W', LAL: 'W', MEM: 'W', MIN: 'W',
  NO: 'W', OKC: 'W', PHX: 'W', POR: 'W', SA: 'W', SAC: 'W', UTAH: 'W',
}

export const DIVISIONS = {
  Atlantic: 'Atlantic', Central: 'Central', Southeast: 'Southeast',
  Northwest: 'Northwest', Pacific: 'Pacific', Southwest: 'Southwest',
}

// Division membership drives two NBA tiebreakers (division-leader status, division
// record), so it has to be modelled even though the app groups the standings display
// by conference rather than division.
export const DIVISION_BY_ABBR = {
  // Eastern
  BOS: 'Atlantic', BKN: 'Atlantic', NY: 'Atlantic', PHI: 'Atlantic', TOR: 'Atlantic',
  CHI: 'Central', CLE: 'Central', DET: 'Central', IND: 'Central', MIL: 'Central',
  ATL: 'Southeast', CHA: 'Southeast', MIA: 'Southeast', ORL: 'Southeast', WSH: 'Southeast',
  // Western
  DEN: 'Northwest', MIN: 'Northwest', OKC: 'Northwest', POR: 'Northwest', UTAH: 'Northwest',
  GS: 'Pacific', LAC: 'Pacific', LAL: 'Pacific', PHX: 'Pacific', SAC: 'Pacific',
  DAL: 'Southwest', HOU: 'Southwest', MEM: 'Southwest', NO: 'Southwest', SA: 'Southwest',
}

// A game only counts toward the standings if it is a completed regular-season game.
// The NBA Cup championship and postponed shells are explicitly excluded — this is what
// makes derived records match the official ones exactly.
export const countsForStandings = (g) =>
  g.seasonType === 'regular' && !!g.score && !g.postponed && !g.canceled

const blankRecord = (abbr) => ({
  abbr,
  team: TEAM_BY_ABBR[abbr],
  w: 0,
  l: 0,
  pf: 0,
  pa: 0,
  home: { w: 0, l: 0 },
  road: { w: 0, l: 0 },
  conf: { w: 0, l: 0 },
  div: { w: 0, l: 0 },
  last10: [],
  streak: 0,
  results: [],
})

export function computeStandings(games) {
  const table = Object.fromEntries(TEAMS.map((t) => [t.abbr, blankRecord(t.abbr)]))

  const played = games.filter(countsForStandings).sort((a, b) => a.tip.localeCompare(b.tip))

  for (const g of played) {
    const [hs, as] = g.score
    const homeWon = hs > as
    const rows = [
      [table[g.home], homeWon, hs, as, 'home', g.away],
      [table[g.away], !homeWon, as, hs, 'road', g.home],
    ]
    for (const [row, won, pf, pa, side, opp] of rows) {
      if (!row) continue
      row[won ? 'w' : 'l']++
      row.pf += pf
      row.pa += pa
      row[side][won ? 'w' : 'l']++
      if (CONFERENCE_BY_ABBR[opp] === CONFERENCE_BY_ABBR[row.abbr]) row.conf[won ? 'w' : 'l']++
      if (DIVISION_BY_ABBR[opp] === DIVISION_BY_ABBR[row.abbr]) row.div[won ? 'w' : 'l']++
      row.results.push({ id: g.id, won, opp, side, pf, pa, tip: g.tip })
    }
  }

  for (const row of Object.values(table)) {
    row.gp = row.w + row.l
    row.pct = row.gp ? row.w / row.gp : 0
    row.diff = row.pf - row.pa
    row.ppg = row.gp ? row.pf / row.gp : 0
    row.oppPpg = row.gp ? row.pa / row.gp : 0
    row.netPpg = row.ppg - row.oppPpg
    row.last10 = row.results.slice(-10).map((r) => r.won)
    // Positive = win streak, negative = loss streak.
    row.streak = row.results.reduceRight((acc, r, i, arr) => {
      if (acc !== null) return acc
      const dir = r.won
      let n = 0
      for (let j = arr.length - 1; j >= 0 && arr[j].won === dir; j--) n++
      return dir ? n : -n
    }, null) ?? 0
  }

  return table
}

// Head-to-head win% between two teams, or null when they haven't met.
export function headToHead(games, a, b) {
  let aw = 0
  let bw = 0
  for (const g of games) {
    if (!countsForStandings(g)) continue
    const pair = [g.home, g.away]
    if (!pair.includes(a) || !pair.includes(b)) continue
    const winner = g.score[0] > g.score[1] ? g.home : g.away
    if (winner === a) aw++
    else bw++
  }
  if (!aw && !bw) return null
  return { aw, bw, pct: aw / (aw + bw) }
}

const pctOf = (rec) => (rec.w + rec.l ? rec.w / (rec.w + rec.l) : 0)

// Division leaders (the best record in each division) — a set of abbreviations. Computed
// with the reduced comparator below to avoid the circularity of using "is a division
// leader" while deciding who the division leaders are.
export function divisionLeaders(table, games) {
  const byDiv = {}
  for (const row of Object.values(table)) {
    ;(byDiv[DIVISION_BY_ABBR[row.abbr]] ??= []).push(row)
  }
  const leaders = new Set()
  for (const rows of Object.values(byDiv)) {
    rows.sort((a, b) => rankReduced(a, b, games))
    if (rows[0]) leaders.add(rows[0].abbr)
  }
  return leaders
}

// The tiebreaker chain WITHOUT the division-leader step, used only to pick division
// leaders (which that step would otherwise depend on).
function rankReduced(a, b, games) {
  if (b.pct !== a.pct) return b.pct - a.pct
  const h2h = headToHead(games, a.abbr, b.abbr)
  if (h2h && h2h.aw !== h2h.bw) return h2h.bw - h2h.aw
  if (pctOf(b.conf) !== pctOf(a.conf)) return pctOf(b.conf) - pctOf(a.conf)
  if (b.diff !== a.diff) return b.diff - a.diff
  return a.abbr < b.abbr ? -1 : 1
}

// The NBA two-team seeding tiebreaker, in official order:
//   1. winning percentage
//   2. head-to-head
//   3. division leader beats a non-leader
//   4. division record (only when both are in the same division)
//   5. conference record
//   6. record vs playoff teams (own then other conference) — see note
//   7. point differential
//
// Steps 6 are circular to compute (they depend on who makes the playoffs, which depends
// on seeding) and are steps the league itself rarely reaches; we fall through them to
// point differential — the deterministic tail — rather than model a fixed-point. This
// is documented, not silently dropped (cf. the NFL sibling's common-games note). A final
// alphabetical tiebreak guarantees seeding is never order-dependent.
export function compareTeams(a, b, games, table, divLeaders) {
  const leaders = divLeaders ?? divisionLeaders(table ?? computeStandings(games), games)

  if (b.pct !== a.pct) return b.pct - a.pct

  const h2h = headToHead(games, a.abbr, b.abbr)
  if (h2h && h2h.aw !== h2h.bw) return h2h.bw - h2h.aw

  const al = leaders.has(a.abbr)
  const bl = leaders.has(b.abbr)
  if (al !== bl) return al ? -1 : 1

  if (DIVISION_BY_ABBR[a.abbr] === DIVISION_BY_ABBR[b.abbr] && pctOf(b.div) !== pctOf(a.div)) {
    return pctOf(b.div) - pctOf(a.div)
  }

  if (pctOf(b.conf) !== pctOf(a.conf)) return pctOf(b.conf) - pctOf(a.conf)

  if (b.diff !== a.diff) return b.diff - a.diff

  return a.abbr < b.abbr ? -1 : 1
}

// Games behind the leader: the standard (leadΔwins + leadΔlosses) / 2.
export const gamesBehind = (leader, row) =>
  ((leader.w - row.w) + (row.l - leader.l)) / 2

// Seed every team within its own conference (1..15). inPlayoffs = top 8; playIn =
// seeds 7–10 (the play-in field). This is the NBA's real seeding — there is no
// meaningful league-wide seed, so there is no league-wide `seedings` export.
export function conferenceStandings(games) {
  const table = computeStandings(games)
  const divLeaders = divisionLeaders(table, games)

  const byConf = { E: [], W: [] }
  for (const row of Object.values(table)) byConf[CONFERENCE_BY_ABBR[row.abbr]]?.push(row)

  for (const conf of Object.keys(byConf)) {
    byConf[conf].sort((a, b) => compareTeams(a, b, games, table, divLeaders))
    const leader = byConf[conf][0]
    byConf[conf] = byConf[conf].map((row, i) => ({
      ...row,
      seed: i + 1,
      confRank: i + 1,
      confGb: leader ? gamesBehind(leader, row) : 0,
      gb: leader ? gamesBehind(leader, row) : 0,
      inPlayoffs: i < PLAYOFF_SPOTS,
      playIn: i + 1 >= 7 && i + 1 <= 10,
      isDivLeader: divLeaders.has(row.abbr),
    }))
  }

  return byConf
}

// ── Playoff race ─────────────────────────────────────────────────────────────
// Total regular-season games each team plays, from the schedule itself rather than a
// hard-coded 82 — makeup games and cancellations move this number.
export function scheduledGames(games) {
  const total = {}
  for (const g of games) {
    if (g.seasonType !== 'regular' || g.postponed || g.canceled) continue
    total[g.home] = (total[g.home] || 0) + 1
    total[g.away] = (total[g.away] || 0) + 1
  }
  return total
}

// Magic number to clinch a spot ahead of a chaser: the wins-plus-chaser-losses needed
// to make catching up arithmetically impossible. Null once already clinched.
export function magicNumber(row, chaser, totals) {
  const chaserRemaining = (totals[chaser.abbr] ?? 0) - chaser.gp
  const n = chaserRemaining - (row.w - chaser.w) + 1
  return n <= 0 ? null : n
}

// Clinch/eliminate math, computed PER CONFERENCE (a team races its own conference, not
// the league). The elimination boundary is the PLAY-IN field — the top 10, not the top 8
// — because seeds 9 and 10 also play in and are not "out". Returns a flat list of every
// team with its conference seed and race status.
const PLAYIN_CUT_SEED = PLAYIN_SEEDS[PLAYIN_SEEDS.length - 1] // 10

export function playoffRace(games) {
  const byConf = conferenceStandings(games)
  const totals = scheduledGames(games)
  const out = []

  for (const conf of ['E', 'W']) {
    const rows = byConf[conf]
    const cut = rows[PLAYIN_CUT_SEED - 1] // 10th seed — last team in the play-in field
    const firstOut = rows[PLAYIN_CUT_SEED] // 11th seed — first team out

    for (const row of rows) {
      const remaining = (totals[row.abbr] ?? 0) - row.gp
      // Clinched a play-in berth when even losing out still leaves the 11th-place team short.
      const clinched = firstOut
        ? row.w > firstOut.w + ((totals[firstOut.abbr] ?? 0) - firstOut.gp)
        : false
      // Eliminated when winning out still cannot reach the current 10th seed.
      const eliminated = cut ? row.w + remaining < cut.w : false
      out.push({
        ...row,
        conf,
        remaining,
        clinched,
        eliminated,
        gbCut: cut ? gamesBehind(cut, row) : 0,
        magic: row.seed <= PLAYIN_CUT_SEED && firstOut && !clinched ? magicNumber(row, firstOut, totals) : null,
      })
    }
  }

  return out
}
