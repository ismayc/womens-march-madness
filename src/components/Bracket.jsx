import { useMemo, useState } from 'react'
import { buildBracket } from '../utils/bracket.js'
import { TEAM_BY_ABBR, SEASON } from '../data/teams.js'
import TeamLogo from './TeamLogo.jsx'

// The tournament bracket: four regional sub-brackets (Round of 64 → Elite Eight) and a
// Final Four, shown one panel at a time via tabs so a 68-team field is never crammed onto
// one screen. No radial/circular layout — a full-68 wheel is unreadable; this is the clean
// column layout the family's world-cup knockout bracket uses.

/* v8 ignore next -- the `?.name` middle fallback is unreachable: every real team has a location, and an unknown abbr short-circuits at the `?.location` optional chain */
const teamName = (abbr) => TEAM_BY_ABBR[abbr]?.location || TEAM_BY_ABBR[abbr]?.name || abbr

function TeamLine({ t, onPick, hideScores }) {
  if (!t?.abbr) {
    return (
      <div className="mm-team mm-tbd">
        {t?.seed != null && <span className="mm-seed">{t.seed}</span>}
        <span className="mm-name">TBD</span>
      </div>
    )
  }
  return (
    <button
      type="button"
      className={`mm-team ${t.won ? 'won' : ''}`}
      onClick={() => onPick?.(t.abbr)}
      title={TEAM_BY_ABBR[t.abbr]?.displayName || t.abbr}
    >
      <span className="mm-seed">{t.seed}</span>
      <TeamLogo abbr={t.abbr} size={20} />
      <span className="mm-name">{teamName(t.abbr)}</span>
      {!hideScores && t.pts != null && <span className="mm-score">{t.pts}</span>}
    </button>
  )
}

function Match({ slot, onPick, hideScores }) {
  /* v8 ignore next -- defensive: Region and FinalFour only map over pre-filled slot arrays, so Match is never passed a null slot */
  if (!slot) return null
  return (
    <div className={`mm-match ${slot.live ? 'is-live' : ''} ${slot.projected ? 'is-proj' : ''}`}>
      {slot.projected ? (
        <>
          <div className="mm-team mm-tbd">
            <span className="mm-name">{slot.feeders?.[0] || 'TBD'}</span>
          </div>
          <div className="mm-team mm-tbd">
            <span className="mm-name">{slot.feeders?.[1] || 'TBD'}</span>
          </div>
        </>
      ) : (
        slot.teams.map((t, i) => (
          <TeamLine key={t.abbr || i} t={t} onPick={onPick} hideScores={hideScores} />
        ))
      )}
      {slot.live && <span className="mm-live">● Live</span>}
      {slot.ot > 0 && <span className="mm-ot">OT{slot.ot > 1 ? slot.ot : ''}</span>}
    </div>
  )
}

const REGION_COLS = [
  ['Round of 64', 'r64'],
  ['Round of 32', 'r32'],
  ['Sweet 16', 's16'],
  ['Elite Eight', 'e8'],
]

function Region({ region, onPick, hideScores }) {
  return (
    <div className="mm-region">
      {region.ff4.length > 0 && (
        <div className="mm-ff4">
          <span className="mm-ff4-label">First Four</span>
          <div className="mm-ff4-games">
            {region.ff4.map((s) => (
              <Match key={s.id} slot={s} onPick={onPick} hideScores={hideScores} />
            ))}
          </div>
        </div>
      )}
      <div className="mm-cols">
        {REGION_COLS.map(([label, key]) => (
          <div className="mm-col" key={key}>
            <h4 className="mm-col-h">{label}</h4>
            {region[key].map((s, i) => (
              // Key on position: slot ids can collide (two "Winner|Winner" projected
              // shells share an id), and position is stable within a fixed-length column.
              <Match key={i} slot={s} onPick={onPick} hideScores={hideScores} />
            ))}
          </div>
        ))}
      </div>
      {region.champion && (
        <p className="mm-region-champ">
          <TeamLogo abbr={region.champion} size={22} /> {teamName(region.champion)} wins the{' '}
          {region.name} Region
        </p>
      )}
    </div>
  )
}

function FinalFour({ bracket, onPick, hideScores }) {
  return (
    <div className="mm-ff">
      <div className="mm-ff-semis">
        {bracket.finalFour.map((s, i) => (
          <div className="mm-ff-semi" key={i}>
            <h4 className="mm-col-h">National Semifinal</h4>
            <Match slot={s} onPick={onPick} hideScores={hideScores} />
          </div>
        ))}
      </div>
      <div className="mm-ff-final">
        <h4 className="mm-col-h">National Championship</h4>
        <Match slot={bracket.championship} onPick={onPick} hideScores={hideScores} />
      </div>
    </div>
  )
}

export default function Bracket({ games, onPick, hideScores }) {
  const bracket = useMemo(() => buildBracket(games), [games])
  const [tab, setTab] = useState('FF')
  const region = bracket.regions.find((r) => r.name === tab)

  return (
    <section className="mm-bracket">
      {bracket.champion && (
        <div className="mm-champbar">
          <span className="mm-trophy" aria-hidden="true">
            🏆
          </span>
          <TeamLogo abbr={bracket.champion} size={28} />
          <span>
            <strong>{TEAM_BY_ABBR[bracket.champion]?.displayName || bracket.champion}</strong> —{' '}
            {SEASON} National Champions
          </span>
        </div>
      )}

      <div className="mm-tabs" role="tablist" aria-label="Bracket region">
        {bracket.regions.map((r) => (
          <button
            key={r.name}
            role="tab"
            aria-selected={tab === r.name}
            className={`mm-tab ${tab === r.name ? 'on' : ''}`}
            onClick={() => setTab(r.name)}
          >
            {r.name}
          </button>
        ))}
        <button
          role="tab"
          aria-selected={tab === 'FF'}
          className={`mm-tab mm-tab-ff ${tab === 'FF' ? 'on' : ''}`}
          onClick={() => setTab('FF')}
        >
          Final Four
        </button>
      </div>

      {tab === 'FF' ? (
        <FinalFour bracket={bracket} onPick={onPick} hideScores={hideScores} />
      ) : (
        <Region region={region} onPick={onPick} hideScores={hideScores} />
      )}
    </section>
  )
}
