// The single source of this tournament's identity, vocabulary, and display rules.
//
// Everything a component or util would otherwise hardcode inline lives here: the ESPN
// path, the storage prefix, the period vocabulary, the live-overlay window, the .ics
// identity, the deploy host. The pattern comes from the-nfl-schedule, which is the only
// sibling that had it; see that repo's src/config/league.js.
//
// Two rules this file is written to:
//
//   1. Every field below has a real consumer in src/. A field that only a config
//      reader ever touches is a shallow module pretending to be a seam, and the NFL
//      original grew seven of them (season, themeColor, gameNoun, periodNoun,
//      kickoffLabel, weekStartsMonday, standingsModel had no callers at all).
//      The exceptions are marked: `title`, `tagline` and `themeColor` are consumed by
//      test/chrome-identity.test.js, because index.html and the manifest are static
//      files no module can import, and a test is the only thing that can hold them to
//      this file.
//
//   2. Structure stays out. Seeding, regions, round names and the bracket shape live
//      in src/data/schedule.js and src/utils/bracket.js, where they are generated or
//      reconstructed. This file owns facts, not rules.
//
// The file is named `league.js` across the whole family, including the tournament
// viewers where "league" is not the right noun. The convention is worth more than the
// precision: a maintainer moving between repos finds the same file at the same path.
import { SEASON } from '../data/teams.js'

export const LEAGUE = {
  id: 'mmw',
  name: "Women's March Madness",
  // `title` + `tagline` are the two halves of index.html's <title>.
  title: "Women's March Madness",
  tagline: 'the NCAA tournament bracket in your timezone',
  season: SEASON,
  espnPath: 'basketball/womens-college-basketball',
  storageKey: 'mmw', // 'mmw:theme', 'mmw:followed', 'mmw:alerts', …
  // UI chrome only. Matches --bg in index.css, <meta name="theme-color">, and the
  // manifest's theme_color and background_color.
  themeColor: '#15171b',

  // ── Vocabulary ──────────────────────────────────────────────────────────────
  // The women's college game is four QUARTERS. The men's tournament is two halves,
  // which is the single most load-bearing difference between these two repos and the
  // one their shared code keeps getting wrong.
  periodNoun: 'quarter',
  regulationPeriods: 4,
  periodLabels: ['1ST', '2ND', '3RD', '4TH'],
  overtimeLabel: 'OT',
  homeAwaySep: 'vs',
  tipoffLabel: 'Tipoff',
  // "Close finish" threshold: one possession plus the free throw.
  closeMargin: 5,

  // ── Time ────────────────────────────────────────────────────────────────────
  locale: 'en-US',
  // The window in which a game with no live feed should still count as possibly in
  // progress. Getting this wrong leaves a finished game showing "live".
  gameLengthMs: 2.25 * 60 * 60 * 1000,

  // ── Calendar export ─────────────────────────────────────────────────────────
  ics: {
    durationIso: 'PT2H30M',
    prodId: '-//womens-march-madness//EN',
    domain: 'womens-march-madness',
    filenameBase: 'womens-march-madness',
  },

  // Netlify serves /calendar.ics; GitHub Pages cannot run the function.
  feedHost: 'https://womens-march-madness.netlify.app',
}

export { SEASON }
