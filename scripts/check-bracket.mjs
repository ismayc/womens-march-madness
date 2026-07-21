#!/usr/bin/env node
// Compares the committed bracket against ESPN's live feed and reports drift.
//
// Run it to answer one question: is src/data/schedule.js still correct? It never writes
// anything — the refresh workflow regenerates and opens a PR. Keeping detection separate
// from generation means a failing check is readable in the log rather than buried in a diff.
//
// Node built-ins only, so CI can run it without npm ci.
//
//   node scripts/check-bracket.mjs [--season 2026] [--start 20260315] [--end 20260408]

import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball'
const TOURNEY = /^NCAA Women's Basketball Championship/i

const args = process.argv.slice(2)
const argVal = (f) => {
  const i = args.indexOf(f)
  return i >= 0 ? args[i + 1] : undefined
}
const SEASON = Number(argVal('--season')) || 2026
const START = argVal('--start') || `${SEASON}0315`
const END = argVal('--end') || `${SEASON}0408`

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

function* eachDay(start, end) {
  const d = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), 12))
  for (let t = d(start); t <= d(end); t.setUTCDate(t.getUTCDate() + 1)) {
    const y = t.getUTCFullYear()
    const m = String(t.getUTCMonth() + 1).padStart(2, '0')
    const day = String(t.getUTCDate()).padStart(2, '0')
    yield `${y}${m}${day}`
  }
}

// Read the committed GAMES array without importing the ESM module (keeps this a plain
// data check): pull each event's id + winner side out of the generated file.
async function committed() {
  const src = await readFile(join(ROOT, 'src/data/schedule.js'), 'utf8')
  const rows = src.split('\n').filter((l) => l.trim().startsWith('{"id"'))
  return rows.map((l) => JSON.parse(l.trim().replace(/,$/, '')))
}

async function live() {
  const byId = new Map()
  for (const day of eachDay(START, END)) {
    const d = await getJson(`${SITE}/scoreboard?dates=${day}&groups=50&seasontype=3&limit=100`)
    for (const ev of d.events || []) {
      const c = ev.competitions?.[0]
      const headline = (c?.notes || []).map((n) => n.headline).find(Boolean) || ''
      if (!TOURNEY.test(headline)) continue
      const home = c.competitors.find((t) => t.homeAway === 'home')
      const away = c.competitors.find((t) => t.homeAway === 'away')
      const winner = home?.winner ? 'home' : away?.winner ? 'away' : undefined
      byId.set(ev.id, { id: ev.id, winner })
    }
  }
  return byId
}

async function main() {
  const [have, feed] = await Promise.all([committed(), live()])
  const haveIds = new Set(have.map((g) => g.id))

  const missing = [...feed.keys()].filter((id) => !haveIds.has(id))
  const extra = have.filter((g) => !feed.has(g.id)).map((g) => g.id)
  const winnerDiffs = have.filter((g) => feed.has(g.id) && feed.get(g.id).winner !== g.winner)

  const total = missing.length + extra.length + winnerDiffs.length
  console.log(`committed: ${have.length} games · live: ${feed.size} games`)
  if (missing.length) console.log(`  ${missing.length} in the feed but not committed`)
  if (extra.length) console.log(`  ${extra.length} committed but no longer in the feed`)
  if (winnerDiffs.length) console.log(`  ${winnerDiffs.length} with a changed winner`)

  if (total === 0) {
    console.log('✅ committed bracket matches the live feed.')
    return
  }
  console.log(`\n⚠️  ${total} difference(s) — run "npm run fetch:bracket" to refresh.`)
  process.exitCode = 1
}

main().catch((err) => {
  console.error(`check-bracket failed: ${err.message}`)
  process.exit(1)
})
