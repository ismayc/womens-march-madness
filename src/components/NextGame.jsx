import { useEffect, useMemo, useState } from 'react'
import { dayKey, formatTime, formatZoneAbbr, liveState } from '../utils/time.js'
import { ROUNDS } from '../data/schedule.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { useFollow } from '../context/follow.jsx'
import TeamLogo from './TeamLogo.jsx'
import { livePeriod } from './GameCard.jsx'

const HOUR_MS = 60 * 60 * 1000
// How often the banner refreshes, and the granularity the selection memo is keyed on:
// `now` is read fresh on every render, but the scan for live/next games only re-runs
// when this bucket flips, so a re-render caused by something else (a filter click)
// doesn't re-scan the field.
const TICK_MS = 30000

function parts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  }
}

// Two units are enough at any distance, and a seconds ticker only earns its place
// inside the final hour — the bracket sits idle for eleven months a year, so most of
// the time the next game is days out and a per-second countdown is noise the eye
// can't use.
function Countdown({ ms }) {
  const t = parts(ms)
  const boxes =
    t.d > 0
      ? [[t.d, 'd'], [t.h, 'h']]
      : t.h > 0
        ? [[t.h, 'h'], [t.m, 'm']]
        : [[t.m, 'm'], [t.s, 's']]
  return (
    <span className="nm-countdown" aria-label="time until tip">
      {boxes.map(([v, u]) => (
        <b key={u}>
          {v}
          <small>{u}</small>
        </b>
      ))}
    </span>
  )
}

// The school, not the full "Duke Blue Devils" — the banner is read at a glance, and
// the round label next to it already says what's at stake.
function Side({ abbr, seed }) {
  const team = TEAM_BY_ABBR[abbr]
  return (
    <>
      {seed ? <span className="nm-seed">{seed}</span> : null}
      <TeamLogo abbr={abbr} size={26} />
      <span className="nm-name">{team?.location || abbr}</span>
    </>
  )
}

export default function NextGame({ games, tz }) {
  const { isFollowed, count } = useFollow()
  const [, setTick] = useState(0)

  // Read on every render rather than held in state. A banner pinned to a `now` from
  // mount keeps counting down to a tip that has already passed until its own timer
  // happens to fire — so a filter click would show a stale countdown for up to
  // half a minute.
  const now = Date.now()
  const bucket = Math.floor(now / TICK_MS)

  const { mode, list, followed } = useMemo(() => {
    const involvesFollowed = (g) => isFollowed(g.home) || isFollowed(g.away)
    // A followed team playing live wins outright; otherwise stack every live game (the
    // opening Thursday runs four at once). No live → the next upcoming game, preferring
    // a followed team's.
    const liveGames = games.filter((g) => liveState(g, now) === 'live')
    if (liveGames.length) {
      const followedLive = liveGames.filter(involvesFollowed)
      return {
        mode: 'live',
        list: followedLive.length ? followedLive : liveGames,
        followed: followedLive.length > 0,
      }
    }
    // 'upcoming' excludes finals, voided games and anything already tipped but not yet
    // ticking — a game in progress without a feed is not "next up".
    const upcoming = games
      .filter((g) => liveState(g, now) === 'upcoming')
      .sort((a, b) => new Date(a.tip) - new Date(b.tip))
    if (!upcoming.length) return { mode: 'next', list: [], followed: false }
    const followedNext = count > 0 ? upcoming.find(involvesFollowed) : null
    if (followedNext) return { mode: 'next', list: [followedNext], followed: true }
    // No favorite driving the pick, so stack everything sharing the earliest tip.
    const firstTip = new Date(upcoming[0].tip).getTime()
    return {
      mode: 'next',
      list: upcoming.filter((g) => new Date(g.tip).getTime() === firstTip),
      followed: false,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` is intentionally read
  // through `bucket`, which is what bounds how often this recomputes.
  }, [games, bucket, isFollowed, count])

  // Re-render once a second only while a seconds digit is actually on screen. Outside
  // the final hour a half-minute is plenty, which keeps the banner — mounted on every
  // schedule render — from putting the whole app into a 1 Hz render loop.
  const nextTip = mode === 'next' && list.length ? new Date(list[0].tip).getTime() : null
  const period = nextTip !== null && nextTip - now < HOUR_MS ? 1000 : TICK_MS

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), period)
    return () => clearInterval(id)
  }, [period])

  // ScheduleView tags each day section with id="day-<key>", so the jump works even
  // when the day is scrolled far off screen.
  const jumpTo = (g) => {
    const el = document.getElementById(`day-${dayKey(g.tip, tz)}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!list.length) {
    return <div className="nextgame done">🏀 The bracket is complete — see you next March!</div>
  }

  // Several games at once → compact rows under one header (shared countdown when upcoming).
  if (list.length > 1) {
    const live = mode === 'live'
    return (
      <div className={`nextgame nextgame-stack${live ? ' is-live' : ''}`}>
        <div className="nm-label">
          {live ? '🔴 Live now' : '⏱ Next games'}
          <span className="nm-stage">{live ? `${list.length} games` : `${list.length} at once`}</span>
        </div>
        {list.map((g) => (
          <button key={g.id} className="nm-live-row" onClick={() => jumpTo(g)}>
            <Side abbr={g.away} seed={g.awaySeed} />
            <span className="nm-v">vs</span>
            <Side abbr={g.home} seed={g.homeSeed} />
            {live && <span className="live-badge">● {livePeriod(g)}</span>}
            <span className="nm-when">{g.city}</span>
          </button>
        ))}
        {!live && (
          <div className="nm-bottom nm-stack-bottom">
            <Countdown ms={new Date(list[0].tip).getTime() - now} />
            <span className="nm-when">
              {formatTime(list[0].tip, tz)} {formatZoneAbbr(list[0].tip, tz)}
            </span>
          </div>
        )}
      </div>
    )
  }

  const game = list[0]
  const live = mode === 'live'
  // Every tournament game belongs to a named round, and ROUNDS is the same lookup the
  // bracket and the calendar export use — a round added to the feed later can't
  // silently fall through to no label.
  const round = ROUNDS[game.round] || game.round

  return (
    <div className={`nextgame${live ? ' is-live' : ''}`}>
      <div className="nm-label">
        {live ? '🔴 Live now' : followed ? '⭐ Your next game' : '⏱ Next game'}
        <span className="nm-stage">{round}</span>
      </div>

      <div className="nm-teams">
        <Side abbr={game.away} seed={game.awaySeed} />
        <span className="nm-v">vs</span>
        <Side abbr={game.home} seed={game.homeSeed} />
      </div>

      <div className="nm-bottom">
        {live ? (
          <span className="nm-countdown live">● {livePeriod(game)}</span>
        ) : (
          <Countdown ms={new Date(game.tip).getTime() - now} />
        )}
        <span className="nm-when">
          {formatTime(game.tip, tz)} {formatZoneAbbr(game.tip, tz)} · {game.city}
        </span>
        <button className="nm-jump" onClick={() => jumpTo(game)}>
          Jump to it ↓
        </button>
      </div>
    </div>
  )
}
