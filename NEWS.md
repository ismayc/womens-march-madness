# NEWS

A dated changelog for Women's March Madness. Each heading is a calendar
day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-08-16

- **The data scripts now fetch from `site.web.api.espn.com`.** ESPN's edge started
  refusing `site.api.espn.com` for requests coming from datacenter IPs — which is
  every unattended run — while answering normally from a home connection. This
  viewer's tournament is between editions, so nothing was broken today, but the
  next rebuild would have failed with `HTTP 403`. Its sibling `site.web.api` serves
  the identical routes with identical payloads and no block.
- Nothing about the app changed — same committed data, same tests.

## 2026-08-14

- **A PR branch can no longer cancel main's CI or deploy.** The whole CI
  workflow (pull-request runs included) and the refresh workflow shared one
  static `pages` concurrency group; GitHub keeps one running + one pending run
  per group and each new arrival cancels the previous pending one, so a busy PR
  branch could kill main's queued runs — this bit the NBA viewer during its
  2026-08-13 rollover PR. CI now groups per ref, the refresh has its own group,
  and only the Pages deploy keeps a shared job-level `pages` lock (ported from
  nba-schedule).

- **The refresh now defaults to the committed season, not the calendar.** The
  fetch script derived its default season from today's date; the NBA viewer
  showed (2026-08-13) that the morning after a rollover this re-fetches the
  ARCHIVED season over the freshly committed one — growth, so the shrink guard
  waves it through, and only the coverage gate stops the site reverting a whole
  season. The default is now `SEASON` from `src/data/teams.js`: the bot
  refreshes whatever season the site is committed to, and only a rollover moves
  that target.

## 2026-08-10

- **The refresh gate is now CI's own gate.** The twice-daily refresh ran plain
  `npm test` before committing, but a bot push triggers no CI — so refreshed
  data could break the 100% coverage invariant invisibly until the next human
  push (exactly what happened with the WNBA race engine this morning). The
  refresh workflow now runs the same coverage command CI runs.
- **The ESPN fetch layer is now vendored, not copy-pasted.** The hardened
  transport (5 retries with exponential backoff + jitter, retry only on
  5xx/429/network errors, a 6-request concurrency cap) previously lived as an
  inline copy in each data script; it now lives in `scripts/lib/fetch.mjs`,
  vendored byte-for-byte from the canonical copy in `sports-viewer-meta`
  (which diffs every repo's copy via `check-fetch-sync`). No behavior change
  to the refresh pipeline.
- **Logo mirroring now retries too.** The crest/logo downloads previously used a
  bare `fetch` with no retry — a lone transient ESPN 500 could skip a logo (or
  fail the run). They now go through the same `fetchRetry` policy as the data
  fetches, with the concurrency cap applied.

## 2026-08-09

- **Live overlay: Eastern-day window + final winners.** The three-day scoreboard
  window was computed in UTC, but ESPN buckets `dates=` by the US-Eastern day —
  every US evening the window slid forward and dropped yesterday's finals. And
  the overlay never derived `winner`, so a game finishing between data
  refreshes could not advance the bracket during the tournament. Finals now
  carry a derived winner (live leads never do), and the window converts each
  offset to its Eastern day.
- **Records in the game detail are no longer 0-0.** `countsForStandings` gated
  on a `seasonType` field the bracket generator never writes, so every record,
  scoring average, and last-10 in the tale of the tape was silently zero —
  test fixtures injected the phantom field, which kept the suite green. The
  gate now counts any completed game (live scores stay provisional), fixtures
  match the generator's real output, and a committed-data test locks it. The
  scaffold's season-series section is removed outright: every bracket matchup
  is played exactly once, so there is never a prior meeting to list.

## 2026-08-08

- **Condensed view strip.** Once the tab nav scrolls out of view, a slim fixed
  strip pins to the top showing the current view; tapping it drops down the
  full tab set, so switching views never means scrolling back to the top.
  The bracket's sticky column headers offset beneath it, and jump/landing scrolls reserve for its height.
  Rolled out family-wide.
- **Changelog started.** Earlier history lives in the git log.
