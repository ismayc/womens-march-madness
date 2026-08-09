# NEWS

A dated changelog for Women's March Madness. Each heading is a calendar
day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-08-09

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
