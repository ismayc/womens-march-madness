#!/usr/bin/env node
// Regenerates src/data/teams.js + src/data/schedule.js for the NCAA Division I
// Women's Basketball Tournament ("March Madness") from ESPN's public scoreboard, and
// mirrors each team's logo into public/logos/ so the app ships zero external image
// requests (offline + PWA friendly).
//
// Node built-ins only — no `npm ci` needed, so CI can run this on a bare checkout.
//
// Unlike a league season (one team-schedule call per team), a 68-team single-elimination
// bracket is fetched by WALKING THE SCOREBOARD across the tournament window and keeping
// only the NCAA-championship games. The same `seasontype=3` (postseason) window also
// carries the NIT and the College Basketball Crown / WBIT — a PLAYBOOK §2 trap ("non-league
// games hide in the league feed") — so every game is filtered by its notes headline.
//
//   node scripts/fetch-bracket.mjs [--season 2026] [--start 20260315] [--end 20260408] [--no-logos]

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── League config (the ONLY block that differs men ↔ women) ─────────────────────────
const ESPN_PATH = 'basketball/womens-college-basketball'
const SITE = `https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH}`
// Only games whose notes headline starts with this belong to the bracket. The men's
// build swaps "Women's" → "Men's"; everything else (round names, structure) is identical.
const TOURNEY = /^NCAA Women's Basketball Championship/i
const GENDER_LABEL = "Women's"
// A completed 68-team bracket is always 67 games (4 First Four + 32 + 16 + 8 + 4 + 2 + 1).
const EXPECTED_GAMES = 67

// ── CLI ─────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const argVal = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}
const SEASON = Number(argVal('--season')) || new Date().getFullYear()
const WITH_LOGOS = !args.includes('--no-logos')
// The tournament runs mid-March → early April. A generous default window is walked
// day-by-day and filtered; the day granularity keeps each request well under the
// scoreboard's silent ~50-event cap (PLAYBOOK §2 trap 2).
const START = argVal('--start') || `${SEASON}0315`
const END = argVal('--end') || `${SEASON}0408`

// ── Round + region parsing (headline is the only structured source) ─────────────────
// Order matters only in that each pattern is distinct; a game has exactly one round.
const ROUND_PATTERNS = [
  [/First Four/i, 'FF4'],
  [/1st Round/i, 'R64'],
  [/2nd Round/i, 'R32'],
  [/Sweet 16/i, 'S16'],
  [/Elite 8/i, 'E8'],
  [/Final Four/i, 'FF'],
  [/National Championship/i, 'NC'],
]
// The women's tournament names its four regions "Regional 1"…"Regional 4" (two host
// sites, each carrying two regionals) rather than the men's West/East/South/Midwest.
const REGION_RE = /\bRegional\s+([1-4])\b/i

function parseBracket(headline) {
  const round = ROUND_PATTERNS.find(([re]) => re.test(headline))?.[1]
  const n = headline.match(REGION_RE)?.[1]
  const region = n ? `Regional ${n}` : null // null for Final Four + Championship
  return { round, region }
}

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (i === tries - 1) throw new Error(`${url}\n  ${err.message}`)
      await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
  }
}

// schedule feed uses media.shortName; scoreboard uses names[]. Accept both (per PLAYBOOK).
function broadcastNames(c) {
  const names = (c.broadcasts || []).flatMap((b) => b.names || (b.media ? [b.media.shortName] : []))
  return [...new Set(names.filter(Boolean))]
}

// Every day in [START, END] as YYYYMMDD, walked at UTC noon so no DST shift crosses a day.
function* eachDay(start, end) {
  const d = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), 12))
  for (let t = d(start); t <= d(end); t.setUTCDate(t.getUTCDate() + 1)) {
    const y = t.getUTCFullYear()
    const m = String(t.getUTCMonth() + 1).padStart(2, '0')
    const day = String(t.getUTCDate()).padStart(2, '0')
    yield `${y}${m}${day}`
  }
}

const teamsById = new Map() // id → raw ESPN team (dedup across all games)

function normalizeEvent(ev) {
  const c = ev.competitions?.[0]
  if (!c) return null

  const headline = (c.notes || []).map((n) => n.headline).find(Boolean) || ''
  if (!TOURNEY.test(headline)) return null // drops NIT / Crown / WBIT
  const { round, region } = parseBracket(headline)
  if (!round) return null // a championship game with an unexpected headline shape — skip loudly upstream

  const home = c.competitors.find((t) => t.homeAway === 'home')
  const away = c.competitors.find((t) => t.homeAway === 'away')
  if (!home || !away) return null

  for (const t of [home, away]) teamsById.set(t.team.id, t.team)

  const seed = (t) => Number(t.curatedRank?.current) || null
  const st = c.status?.type || {}
  const completed = st.completed
  const score = completed
    ? [Number(home.score?.value ?? home.score), Number(away.score?.value ?? away.score)]
    : undefined
  // Women's college regulation is four quarters (period 4); anything beyond is overtime.
  const otPeriods = c.status?.period > 4 ? c.status.period - 4 : undefined
  // Winner is authoritative from the feed; fall back to score for older payloads.
  const winner = home.winner ? 'home' : away.winner ? 'away' : completed
    ? score[0] > score[1] ? 'home' : 'away'
    : undefined

  const venue = c.venue || {}
  const broadcast = broadcastNames(c)

  return {
    id: ev.id,
    tip: new Date(ev.date).toISOString(),
    round,
    region,
    home: home.team.abbreviation,
    away: away.team.abbreviation,
    homeSeed: seed(home),
    awaySeed: seed(away),
    venue: venue.fullName || null,
    city: venue.address?.city || null,
    state: venue.address?.state || null,
    neutral: true, // every tournament game is at a neutral site
    broadcast: broadcast.length ? broadcast : undefined,
    score,
    ot: otPeriods,
    winner,
  }
}

const LEADER_CATS = ['points', 'rebounds', 'assists']

// Line scores (halves) and per-game leaders live on the scoreboard event we already have,
// so — unlike the NBA builder — there is no second enrichment pass.
function enrich(game, c) {
  const home = c.competitors.find((t) => t.homeAway === 'home')
  const away = c.competitors.find((t) => t.homeAway === 'away')
  const line = (t) => (t.linescores || []).map((l) => Number(l.value))
  const hl = line(home)
  const al = line(away)
  if (hl.length || al.length) game.line = { home: hl, away: al }

  const stars = c.competitors
    .flatMap((t) =>
      (t.leaders || [])
        .filter((l) => LEADER_CATS.includes(l.name))
        .map((l) => {
          const top = l.leaders?.[0]
          if (!top) return null
          return {
            cat: l.name,
            v: top.displayValue,
            who: top.athlete?.shortName || top.athlete?.displayName,
            team: t.team.abbreviation,
          }
        })
    )
    .filter(Boolean)
  if (stars.length) game.stars = stars
}

async function fetchBracket() {
  const byId = new Map()
  for (const day of eachDay(START, END)) {
    const d = await getJson(`${SITE}/scoreboard?dates=${day}&groups=50&seasontype=3&limit=100`)
    for (const ev of d.events || []) {
      const game = normalizeEvent(ev)
      if (!game) continue
      enrich(game, ev.competitions[0])
      byId.set(game.id, game)
    }
  }
  return [...byId.values()].sort((a, b) => a.tip.localeCompare(b.tip) || a.id.localeCompare(b.id))
}

function teamRecords() {
  return [...teamsById.values()]
    .map((t) => ({
      id: t.id,
      abbr: t.abbreviation,
      slug: t.abbreviation.toLowerCase(),
      name: t.name || t.shortDisplayName, // "Wildcats"
      location: t.location, // "Arizona"
      displayName: t.displayName, // "Arizona Wildcats"
      color: t.color ? `#${t.color}` : null,
      altColor: t.alternateColor ? `#${t.alternateColor}` : null,
      logo: (t.logos || []).find((l) => l.rel?.includes('default'))?.href || t.logo || null,
      logoDark: (t.logos || []).find((l) => l.rel?.includes('dark'))?.href || null,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

const LOGO_PX = 160
const resized = (url) =>
  `https://a.espncdn.com/combiner/i?img=${encodeURIComponent(new URL(url).pathname)}&w=${LOGO_PX}&h=${LOGO_PX}`

async function mirrorLogos(teams) {
  await mkdir(join(ROOT, 'public/logos'), { recursive: true })
  let n = 0
  let bytes = 0
  await Promise.all(
    teams.flatMap((t) =>
      [
        [t.logo, `${t.slug}.png`],
        [t.logoDark, `${t.slug}-dark.png`],
      ].map(async ([url, file]) => {
        if (!url) return
        try {
          const res = await fetch(resized(url))
          if (!res.ok) return // a missing college logo is not fatal
          const buf = Buffer.from(await res.arrayBuffer())
          await writeFile(join(ROOT, 'public/logos', file), buf)
          n++
          bytes += buf.length
        } catch {
          /* skip a single bad logo rather than fail the whole build */
        }
      })
    )
  )
  return { n, kb: Math.round(bytes / 1024) }
}

const banner = (src) =>
  `// GENERATED by scripts/fetch-bracket.mjs — do not edit by hand.\n` +
  `// Source: ${src}\n\n`

async function main() {
  console.log(`Fetching ${SEASON} NCAA ${GENDER_LABEL} tournament (${START}–${END})…`)
  const games = await fetchBracket()

  const byRound = games.reduce((a, g) => ({ ...a, [g.round]: (a[g.round] || 0) + 1 }), {})
  console.log(`  ${games.length} games`, byRound)

  // A short read is indistinguishable from a quiet feed — assert the known total so a
  // silently-capped scoreboard fails the build rather than shipping half a bracket.
  if (games.length !== EXPECTED_GAMES) {
    const complete = games.every((g) => g.score)
    if (complete) {
      throw new Error(
        `Expected ${EXPECTED_GAMES} games for a completed bracket, got ${games.length}. ` +
          `Round breakdown: ${JSON.stringify(byRound)}`
      )
    }
    console.warn(
      `::notice:: ${games.length}/${EXPECTED_GAMES} games — tournament appears in progress, writing partial bracket.`
    )
  }

  const teams = teamRecords()
  console.log(`  ${teams.length} teams in the field`)

  const teamData = teams.map(({ logo, logoDark, ...t }) => t)
  await writeFile(
    join(ROOT, 'src/data/teams.js'),
    banner(`${SITE}/scoreboard (tournament field)`) +
      `export const SEASON = ${SEASON}\n\n` +
      `export const SEASON_LABEL = '${SEASON}'\n\n` +
      `export const TEAMS = ${JSON.stringify(teamData, null, 2)}\n\n` +
      `export const TEAM_BY_ABBR = Object.fromEntries(TEAMS.map((t) => [t.abbr, t]))\n\n` +
      `export const ALL_ABBRS = TEAMS.map((t) => t.abbr)\n`
  )

  await writeFile(
    join(ROOT, 'src/data/schedule.js'),
    banner(`${SITE}/scoreboard?dates=${START}-${END}&seasontype=3`) +
      `export const GAMES = [\n` +
      games.map((g) => `  ${JSON.stringify(g)},`).join('\n') +
      `\n]\n\n` +
      `// The four regions and the single-elimination rounds, in bracket order.\n` +
      `export const REGIONS = ['Regional 1', 'Regional 2', 'Regional 3', 'Regional 4']\n\n` +
      `export const ROUNDS = { FF4: 'First Four', R64: 'Round of 64', R32: 'Round of 32', S16: 'Sweet 16', E8: 'Elite Eight', FF: 'Final Four', NC: 'National Championship' }\n\n` +
      `// The seed pairings of a 16-team region's opening round, top-to-bottom of the bracket.\n` +
      `export const SEED_ORDER = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15]\n`
  )

  if (WITH_LOGOS) {
    console.log('Mirroring logos…')
    const { n, kb } = await mirrorLogos(teams)
    console.log(`  ${n} files, ${kb} KB → public/logos/`)
  }

  console.log('Done.')
}

main().catch((err) => {
  console.error(`\nfetch-bracket failed:\n${err.message}`)
  process.exit(1)
})
