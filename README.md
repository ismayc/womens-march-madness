# Women's March Madness

[![CI](https://github.com/ismayc/womens-march-madness/actions/workflows/ci.yml/badge.svg)](https://github.com/ismayc/womens-march-madness/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/endpoint?url=https://ismayc.github.io/womens-march-madness/coverage.json)](https://github.com/ismayc/womens-march-madness/actions/workflows/ci.yml)

An unofficial, timezone-aware viewer for the **NCAA Division I Women's Basketball
Tournament** — the full 68-team bracket, every game in your timezone, live scores, and the
road to the Final Four.

🔗 **Live:** [ismayc.github.io/womens-march-madness](https://ismayc.github.io/womens-march-madness/) ·
[womens-march-madness.netlify.app](https://womens-march-madness.netlify.app)

Part of a [family of sports viewers](https://github.com/ismayc/sports-viewer-meta) that all
share one architecture: a committed snapshot renders instantly with zero network requests, and
a live overlay from the same feed merges over the top.

---

## What it shows

- **The bracket** — four regional sub-brackets (Regional 1 · 2 · 3 · 4), each seeded
  1–16, plus the First Four play-ins, converging on the Final Four and the National
  Championship. One panel at a time (a full 68-team wheel is unreadable), with a champion
  banner once the title is decided.
- **The schedule** — every tournament game bucketed by *your* calendar day, with line scores,
  broadcasts, and the game's leading scorers.
- **Follow your teams**, spoiler-free mode, live-moment alerts, and a subscribable calendar.

The committed data is the **completed 2026 tournament** — Michigan over UConn — so the app has
a real bracket to show year-round. During March, the live overlay reactivates and the same
merge fills the bracket as games finish.

## How it works

**The bracket is committed, not fetched.** `scripts/fetch-bracket.mjs` walks ESPN's public
scoreboard across the tournament window, keeps only the NCAA-championship games (the same
`seasontype=3` feed also carries the NIT and the College Basketball Crown — every game is
filtered by its notes headline), and writes `src/data/schedule.js` + `src/data/teams.js`. It
asserts the known 67-game total before writing, so a silently-capped feed fails the build
rather than shipping half a bracket.

Everything else — the four regions, the Final Four pairing, the champion — is **derived** from
those 67 games by `src/utils/bracket.js`, reconstructing the tree from each game's `region`,
`round`, and seeds. A bad refresh therefore fails a test rather than quietly rendering a wrong
bracket. All feeds are keyless and CORS-open — no backend, no API key, no `.env`.

## Commands

```bash
npm run dev              # local dev server
npm run build            # production build to dist/
npm test                 # run the suite (bracket reconstruction is tested against real 2026 data)
npm run fetch:bracket    # regenerate the committed bracket from ESPN
npm run check:bracket    # report drift between committed data and the live feed
```

`base: './'` in `vite.config.js`, so one `dist/` serves both the GitHub Pages subpath
(`/womens-march-madness/`) and the Netlify root with no separate build.

## Not affiliated

An unofficial fan-made project. Not affiliated with, endorsed by, or sponsored by the NCAA.
"March Madness", team names, and logos are trademarks of their respective owners. Bracket,
results, and game data via [ESPN](https://www.espn.com/womens-college-basketball/). Created by
[Chester Ismay](https://chester.rbind.io).
