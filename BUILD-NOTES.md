# the-womens-march-madness — build notes

An NCAA Division I Women's Basketball Tournament ("March Madness") bracket viewer, scaffolded
from `the-nba-schedule` (closest: basketball, quarter/half line scores, US locale) with
`world-cup-viewer`'s single-elimination knockout bracket grafted in. Started 2026-07-21. This
is the family's first **pure single-elimination tournament** shape — no season table, one
bracket.

## Data convention

The committed data is the **completed 2026 tournament** (`fetch:bracket --season 2026`) —
Michigan over UConn — so the app is fully populated, testable, and demoable year-round. During
March the live overlay reactivates and fills the bracket as games finish. To re-point at 2027:

```bash
node scripts/fetch-bracket.mjs --season 2027   # once the field is set on Selection Sunday
```

## The tournament, as data

- **Single build source: the scoreboard, walked day-by-day.** Unlike a league (one
  team-schedule call per team), a 68-team bracket is fetched by walking `seasontype=3` across
  the tournament window and keeping only NCAA-championship games.
- **Two feed traps, both handled** (PLAYBOOK §2): the `seasontype=3` window also carries the
  **NIT** and the **College Basketball Crown** — filtered out by requiring the notes headline
  to start with `"NCAA Women's Basketball Championship"`; and the fetch **asserts the 67-game
  total** (4 First Four + 32 + 16 + 8 + 4 + 2 + 1) before writing, so a silently-capped
  scoreboard fails the build rather than shipping half a bracket.
- Each game carries `round` (FF4/R64/R32/S16/E8/FF/NC), `region` (Regional 1/2/3/4, or
  null for Final Four + Championship), `homeSeed`/`awaySeed` (from `curatedRank.current`), and
  `winner`. Seeds + region + round are the only structured signal — parsed from the headline.
- **Two sport-specific deviations from the men's twin** (the women's tournament differs here):
  (1) the four regions are named **"Regional 1"…"Regional 4"** (two host sites, each carrying
  two regionals), not West/East/South/Midwest — so `REGION_RE` and the emitted `REGIONS` differ;
  (2) women's basketball is **four quarters**, not two halves, so overtime is `period > 4`
  (fixed in `fetch-bracket.mjs`, `services/espn.js`, and the `livePeriod`/`LineScore` labels).

## Done

- **Repo scaffolded** from `the-nba-schedule`; identity fully substituted (NBA→MM: storage
  keys `mmw:*`, ESPN path `basketball/womens-college-basketball`, `.ics` domain, calendar host,
  canonical/OG URLs, footer, `package.json` name/scripts, theme accent to tournament purple).
- **Real 2026 data generated**: `src/data/{teams,schedule}.js` — 68 teams, 67 games, 68 logos
  mirrored. `leaders.js` intentionally empty (no honest season leaderboard for a tournament).
- **`scripts/fetch-bracket.mjs`** (new) + **`check-bracket.mjs`** (drift check) + `verify-live`
  path swapped. `refresh-data.yml` cron scoped to **March/April only**.
- **Bracket reconstruction** (`src/utils/bracket.js`, new): four regional sub-brackets
  (Round of 64 slotted by the fixed seed order, later rounds located by winner lineage) →
  Final Four (pairing read off the real games) → Championship. DOM-free, unit-tested against
  the real 2026 data (champion UCLA, 0 projected slots, every R64 seed pair sums to 17).
- **`Bracket.jsx`** (new): tabbed region panels + Final Four, CSS-alignment columns (no SVG
  connectors, no radial — a 68-team wheel is unreadable), champion bar, First Four strip.
  Views trimmed to **Bracket** (default) + **Schedule**; Standings/Week/Radial/Stats removed.
- **Icons + og-image**: custom orange hoop+net mark on flat purple `#2d0d4a` (per ICONS.md,
  verified). App builds clean; verified in-browser (bracket + schedule render correct real
  data, zero horizontal overflow).

## Still owed / caveats

1. **Offseason data caveat.** The committed 2026 tournament is complete, so the live-overlay
   tests assert the idle (tournament-over) path. Revisit if a mid-tournament snapshot is
   committed; `fetch:bracket --season 2027` during March regenerates to an in-progress bracket.
2. **`?teams=` deep-link** from the hub relies on the schedule team filter — verified present.
3. **Streaming-services filter** was retargeted from the men's CBS/Turner catalog to the
   women's **ESPN/Disney family** — the tournament airs on ABC + ESPN/ESPN2/ESPNU/ESPNEWS, so
   `utils/watch.js` now models ESPN+ (the cable-family streamer, not ABC) plus the live-TV
   bundles. Carriage mappings are national defaults and deliberately approximate.
