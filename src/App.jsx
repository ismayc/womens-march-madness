import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GAMES } from './data/schedule.js'
import { SEASON, TEAMS } from './data/teams.js'
import { detectTimezone, timezoneOptions, dayKey, todayKey } from './utils/time.js'
import { readState, writeState } from './utils/urlState.js'
import { applyLive, fetchLive, liveCount } from './services/espn.js'
import { watchableServices } from './utils/watch.js'
import { useFollow } from './context/follow.jsx'
import { useServices } from './context/services.jsx'
import ScheduleView from './components/ScheduleView.jsx'
import Bracket from './components/Bracket.jsx'
import GameDetail from './components/GameDetail.jsx'
import CalendarModal from './components/CalendarModal.jsx'
import Toasts from './components/Toasts.jsx'
import ServicesModal from './components/ServicesModal.jsx'
import { detectEvents, eventKey } from './services/alerts.js'
import TeamLogo from './components/TeamLogo.jsx'

const VIEWS = [
  { id: 'bracket', label: '🏀 Bracket' },
  { id: 'schedule', label: '📋 Schedule' },
]

const LIVE_REFRESH_MS = 30_000
const IDLE_REFRESH_MS = 120_000
const NS = 'mmw' // localStorage namespace — women's March Madness

export default function App() {
  // Read the shared link once, on mount.
  const detectedTz = useMemo(detectTimezone, [])
  const initial = useMemo(() => readState(), [])

  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')
  const [view, setView] = useState(initial.view)
  const [tz, setTz] = useState(initial.tz || detectedTz)
  const [hideScores, setHideScores] = useState(() => {
    if (initial.hideExplicit) return initial.hide
    try {
      return localStorage.getItem(`${NS}:spoilerFree`) === '1'
    } catch {
      return false
    }
  })
  const [team, setTeam] = useState(initial.team)
  const [onlyFollowed, setOnlyFollowed] = useState(initial.mine)
  // The committed snapshot is a completed 3-week tournament, so every game day is in the
  // past — default to showing them (unlike a months-long league season, there's nothing to
  // bury). A shared ?past= link still overrides.
  const [showPast, setShowPast] = useState(() => {
    if (initial.pastExplicit) return initial.past
    try {
      return localStorage.getItem(`${NS}:showPast`) !== '0'
    } catch {
      return true
    }
  })
  const [watchOnly, setWatchOnly] = useState(() => {
    try {
      return localStorage.getItem(`${NS}:watchOnly`) === '1'
    } catch {
      return false
    }
  })
  const [showServices, setShowServices] = useState(false)
  const [live, setLive] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  // A ?game= deep link opens straight onto that game's detail (see urlState.js).
  const [detail, setDetail] = useState(
    () => (initial.game && GAMES.find((g) => g.id === initial.game)) || null
  )
  const [alerts, setAlerts] = useState(() => {
    try {
      return localStorage.getItem(`${NS}:alerts`) === '1'
    } catch {
      return false
    }
  })
  const [toasts, setToasts] = useState([])
  const [showCalendar, setShowCalendar] = useState(false)
  const prevGames = useRef(null)

  const { count: followedCount, followed } = useFollow()
  const { services, count: serviceCount } = useServices()

  // Committed bracket + live overlay. Everything downstream is derived from this.
  const games = useMemo(() => applyLive(GAMES, live), [live])
  const nLive = useMemo(() => liveCount(games), [games])

  // Poll faster while games are in progress, and not at all once the tournament is over.
  const tournamentOver = useMemo(
    () => games.every((g) => g.score || g.postponed || g.canceled),
    [games]
  )

  const load = useCallback(async (signal) => {
    try {
      const next = await fetchLive({ signal })
      if (!signal?.aborted) {
        setLive(next)
        setUpdatedAt(new Date())
      }
    } catch {
      /* offline or feed hiccup — committed data still renders */
    }
  }, [])

  useEffect(() => {
    if (tournamentOver) return
    const ctrl = new AbortController()
    load(ctrl.signal)
    const id = setInterval(() => load(ctrl.signal), nLive ? LIVE_REFRESH_MS : IDLE_REFRESH_MS)
    return () => {
      ctrl.abort()
      clearInterval(id)
    }
  }, [load, nLive, tournamentOver])

  // Notable-moment detection, diffed against the previous poll. Runs regardless of whether
  // alerts are on, so toggling it on mid-game doesn't replay old moments as if new.
  useEffect(() => {
    const prev = prevGames.current
    prevGames.current = games
    if (!prev || !alerts) return

    const found = detectEvents(prev, games, {
      teams: onlyFollowed || followedCount ? followed : null,
    })
    if (!found.length) return

    setToasts((cur) => {
      const seen = new Set(cur.map((t) => t.key))
      const fresh = found.map((e) => ({ ...e, key: eventKey(e) })).filter((e) => !seen.has(e.key))
      return [...fresh, ...cur].slice(0, 4)
    })
  }, [games, alerts, followed, followedCount, onlyFollowed])

  useEffect(() => {
    if (!toasts.length) return
    const id = setTimeout(() => setToasts((cur) => cur.slice(0, -1)), 9000)
    return () => clearTimeout(id)
  }, [toasts])

  // Keep the URL in step with the view so any state is shareable.
  useEffect(() => {
    writeState({ view, tz, team, hide: hideScores, mine: onlyFollowed, past: showPast }, detectedTz)
  }, [view, tz, team, hideScores, onlyFollowed, showPast, detectedTz])

  useEffect(() => {
    try {
      localStorage.setItem(`${NS}:spoilerFree`, hideScores ? '1' : '0')
    } catch {
      /* private mode — the preference just won't persist */
    }
  }, [hideScores])

  useEffect(() => {
    try {
      localStorage.setItem(`${NS}:showPast`, showPast ? '1' : '0')
    } catch {
      /* private mode — the preference just won't persist */
    }
  }, [showPast])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(`${NS}:theme`, next)
    } catch {
      /* ignore */
    }
    setTheme(next)
  }

  // Filters apply to the schedule only; the bracket always reflects the whole field.
  const scheduleGames = useMemo(() => {
    return games.filter((g) => {
      if (team && g.home !== team && g.away !== team) return false
      if (onlyFollowed && followedCount && !followed.has(g.home) && !followed.has(g.away)) return false
      if (watchOnly && serviceCount && watchableServices(g.broadcast, services).length === 0)
        return false
      return true
    })
  }, [games, team, onlyFollowed, followed, followedCount, watchOnly, services, serviceCount])

  const pastDayCount = useMemo(() => {
    const today = todayKey(tz)
    const keys = new Set()
    for (const g of scheduleGames) {
      const key = dayKey(g.tip, tz)
      if (key < today) keys.add(key)
    }
    return keys.size
  }, [scheduleGames, tz])

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>
            Women's March Madness <span className="season">{SEASON}</span>
          </h1>
          <p className="tagline">
            The NCAA Division I women's tournament bracket, in your timezone
            {nLive > 0 && (
              <span className="live-now">
                {' '}
                · <span className="dot" />
                {nLive} live now
              </span>
            )}
          </p>
        </div>
        <div className="top-actions">
          <label className="field">
            <span className="sr-only">Timezone</span>
            <select value={tz} onChange={(e) => setTz(e.target.value)}>
              {timezoneOptions(tz).map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className={`ghost ${hideScores ? 'on' : ''}`}
            onClick={() => setHideScores((v) => !v)}
            title="Spoiler-free mode"
            aria-pressed={hideScores}
          >
            {hideScores ? '🙈' : '👁'}
          </button>
          <button
            className={`ghost ${alerts ? 'on' : ''}`}
            onClick={() => {
              const next = !alerts
              setAlerts(next)
              try {
                localStorage.setItem(`${NS}:alerts`, next ? '1' : '0')
              } catch {
                /* ignore */
              }
            }}
            title={alerts ? 'Live alerts on' : 'Live alerts off'}
            aria-pressed={alerts}
          >
            {alerts ? '🔔' : '🔕'}
          </button>
          <button className="ghost" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <nav className="views" aria-label="Views">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={`view-btn ${view === v.id ? 'on' : ''}`}
            onClick={() => setView(v.id)}
            aria-current={view === v.id ? 'page' : undefined}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {view === 'schedule' && (
        <div className="filters">
          <label className="field">
            <span className="sr-only">Team</span>
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">All teams</option>
              {TEAMS.map((t) => (
                <option key={t.abbr} value={t.abbr}>
                  {t.displayName}
                </option>
              ))}
            </select>
          </label>
          {followedCount > 0 && (
            <button
              className={`chip ${onlyFollowed ? 'on' : ''}`}
              onClick={() => setOnlyFollowed((v) => !v)}
              aria-pressed={onlyFollowed}
            >
              ★ My teams ({followedCount})
            </button>
          )}
          {serviceCount === 0 ? (
            <button
              className="chip"
              onClick={() => setShowServices(true)}
              title="Pick the streaming services and TV packages you have"
            >
              📺 Choose my services
            </button>
          ) : (
            <span className="chip-group">
              <button
                className={`chip ${watchOnly ? 'on' : ''}`}
                onClick={() => {
                  const next = !watchOnly
                  setWatchOnly(next)
                  try {
                    localStorage.setItem(`${NS}:watchOnly`, next ? '1' : '0')
                  } catch {
                    /* private mode — the filter just won't be remembered */
                  }
                }}
                aria-pressed={watchOnly}
                title="Only show games on my services"
              >
                📺 On my services ({serviceCount})
              </button>
              <button
                className="chip chip-icon"
                onClick={() => setShowServices(true)}
                aria-label="Edit my services"
                title="Edit my services"
              >
                ⚙
              </button>
            </span>
          )}
          {team && (
            <button className="chip" onClick={() => setTeam('')}>
              <TeamLogo abbr={team} size={18} /> Clear
            </button>
          )}
          {pastDayCount > 0 && (
            <button
              className={`chip ${showPast ? 'on' : ''}`}
              onClick={() => setShowPast((v) => !v)}
              aria-pressed={showPast}
              title={showPast ? 'Hide previous days' : 'Show previous days'}
            >
              <span aria-hidden="true">{showPast ? '▾' : '▸'}</span>{' '}
              {showPast ? 'Hide' : 'Show'} past days
              <span className="chip-count">{pastDayCount}</span>
            </button>
          )}
          <button
            className="chip"
            onClick={() => setShowCalendar(true)}
            title="Subscribe to or download a calendar of these games"
          >
            📅 Calendar
          </button>
        </div>
      )}

      <main>
        {view === 'bracket' && (
          <Bracket
            games={games}
            onPick={(t) => {
              setTeam(t)
              setView('schedule')
            }}
            hideScores={hideScores}
          />
        )}
        {view === 'schedule' && (
          <ScheduleView
            games={scheduleGames}
            tz={tz}
            hideScores={hideScores}
            showPast={showPast}
            onOpen={setDetail}
          />
        )}
      </main>

      <Toasts
        events={toasts}
        onOpen={(g) => setDetail(g)}
        onDismiss={(key) => setToasts((cur) => cur.filter((t) => t.key !== key))}
      />

      <GameDetail
        game={detail}
        games={games}
        tz={tz}
        hideScores={hideScores}
        onClose={() => setDetail(null)}
        onPickTeam={(t) => (setTeam(t), setView('schedule'))}
      />

      {showCalendar && (
        <CalendarModal
          games={games}
          filtered={scheduleGames}
          onClose={() => setShowCalendar(false)}
        />
      )}

      {showServices && <ServicesModal onClose={() => setShowServices(false)} />}

      <footer className="foot">
        <p className="disclaimer">
          An unofficial fan-made project. Not affiliated with, endorsed by, or sponsored by the
          NCAA. "March Madness" and team names and logos are trademarks of their respective
          owners. Bracket, results, and game data via{' '}
          <a
            href="https://www.espn.com/womens-college-basketball/"
            target="_blank"
            rel="noopener noreferrer"
          >
            ESPN
          </a>
          .
        </p>
        <div className="foot-row">
          <p className="credit">
            Created by{' '}
            <a href="https://chester.rbind.io" target="_blank" rel="noopener noreferrer">
              Chester Ismay
            </a>{' '}
            ·{' '}
            <a
              href="https://github.com/ismayc/womens-march-madness"
              target="_blank"
              rel="noopener noreferrer"
            >
              View source on GitHub
            </a>
          </p>
          {updatedAt && (
            <span className="dim">
              Updated{' '}
              {updatedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>
      </footer>
    </div>
  )
}
