import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../api/client'
import type { StatsDay, StatsResult } from '../api/types'
import { round } from '../lib/nutrition'
import { IconAlert, IconDrop, IconFlame } from '../components/icons'

type Range = 7 | 14 | 30

const RANGES: { value: Range; label: string }[] = [
  { value: 7, label: '7 Tage' },
  { value: 14, label: '14 Tage' },
  { value: 30, label: '30 Tage' },
]

const fmtDay = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('de-DE', opts)

// ---- kcal chart (hand-built SVG, no library) --------------------------------

const W = 360
const H = 168
const TOP = 18 // room for the goal label
const BOTTOM = 22 // room for weekday labels

function KcalChart({
  days,
  target,
  selected,
  onSelect,
}: {
  days: StatsDay[]
  target: number
  selected: number
  onSelect: (i: number) => void
}) {
  const n = days.length
  const gap = n > 14 ? 3 : 6
  const barW = (W - gap * (n - 1)) / n
  const maxY = Math.max(target, ...days.map((d) => d.kcal)) * 1.12
  const y = (v: number) => TOP + (H - TOP - BOTTOM) * (1 - v / maxY)
  const goalY = y(target)
  const labelEvery = n <= 7 ? 1 : n <= 14 ? 2 : 5

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Kalorien pro Tag">
      {/* goal line */}
      <line x1={0} x2={W} y1={goalY} y2={goalY} className="chart-goal" />
      <text x={W - 2} y={goalY - 5} textAnchor="end" className="chart-goal-label">
        Ziel {target}
      </text>

      {days.map((d, i) => {
        const x = i * (barW + gap)
        const filled = d.kcal > 0
        const barH = filled ? Math.max(4, H - BOTTOM - y(d.kcal)) : 4
        const over = filled && d.kcal > target
        const cls = !filled ? 'empty' : over ? 'over' : 'ok'
        return (
          <g key={d.date} onClick={() => onSelect(i)} style={{ cursor: 'pointer' }}>
            {/* generous tap target */}
            <rect x={x} y={TOP} width={barW} height={H - TOP - BOTTOM} fill="transparent" />
            <rect
              className={`chart-bar ${cls}${i === selected ? ' selected' : ''}`}
              x={x}
              y={H - BOTTOM - barH}
              width={barW}
              height={barH}
              rx={Math.min(5, barW / 2.5)}
              style={{ animationDelay: `${i * (0.35 / n)}s` }}
            >
              <title>{`${fmtDay(d.date, { weekday: 'short', day: '2-digit', month: '2-digit' })}: ${Math.round(d.kcal)} kcal`}</title>
            </rect>
            {i % labelEvery === 0 && (
              <text x={x + barW / 2} y={H - 7} textAnchor="middle" className="chart-x">
                {n <= 7 ? fmtDay(d.date, { weekday: 'short' }).replace('.', '') : fmtDay(d.date, { day: 'numeric' })}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function WaterChart({ days, target }: { days: StatsDay[]; target: number }) {
  const n = days.length
  const h = 64
  const gap = n > 14 ? 3 : 6
  const barW = (W - gap * (n - 1)) / n
  const maxY = Math.max(target, ...days.map((d) => d.waterMl)) * 1.15 || 1
  return (
    <svg className="chart chart-water" viewBox={`0 0 ${W} ${h}`} role="img" aria-label="Wasser pro Tag">
      <line x1={0} x2={W} y1={h - (h - 4) * (target / maxY)} y2={h - (h - 4) * (target / maxY)} className="chart-goal" />
      {days.map((d, i) => {
        const barH = d.waterMl > 0 ? Math.max(3, (h - 4) * (d.waterMl / maxY)) : 3
        return (
          <rect
            key={d.date}
            className={`chart-bar water${d.waterMl === 0 ? ' empty' : ''}`}
            x={i * (barW + gap)}
            y={h - barH}
            width={barW}
            height={barH}
            rx={Math.min(4, barW / 3)}
            style={{ animationDelay: `${0.15 + i * (0.3 / n)}s` }}
          >
            <title>{`${fmtDay(d.date, { weekday: 'short' })}: ${d.waterMl} ml`}</title>
          </rect>
        )
      })}
    </svg>
  )
}

// ---- page -------------------------------------------------------------------

export function StatsPage() {
  const [range, setRange] = useState<Range>(7)
  const [stats, setStats] = useState<StatsResult | null>(null)
  const [selected, setSelected] = useState(-1)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api.stats.get(range)
      .then((s) => {
        if (!alive) return
        setStats(s)
        setSelected(s.days.length - 1)
      })
      .catch((e) => { if (e instanceof ApiError) setError(e.message); else throw e })
    return () => { alive = false }
  }, [range])

  const sel = stats && selected >= 0 ? stats.days[selected] : undefined

  // share of energy per macro (protein/carbs 4 kcal/g, fat 9 kcal/g)
  const energyShare = useMemo(() => {
    if (!stats) return null
    const p = stats.avg.protein * 4
    const c = stats.avg.carbs * 4
    const f = stats.avg.fat * 9
    const sum = p + c + f
    if (sum <= 0) return null
    return { p: (p / sum) * 100, c: (c / sum) * 100, f: (f / sum) * 100 }
  }, [stats])

  return (
    <div className="page stats-page">
      <header className="page-head">
        <h1>Verlauf</h1>
        <span className="sub">Dein Essverhalten im Blick.</span>
      </header>

      {error && (
        <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>
      )}

      <div className="seg stats-seg" role="group" aria-label="Zeitraum">
        {RANGES.map((r) => (
          <button key={r.value} type="button" aria-pressed={range === r.value} onClick={() => setRange(r.value)}>
            {r.label}
          </button>
        ))}
      </div>

      {!stats ? (
        <p className="loading-inline"><span className="spinner" /> Lade Auswertung…</p>
      ) : stats.daysLogged === 0 ? (
        <div className="empty">
          <span className="emoji">📊</span>
          <h3>Noch nichts zu sehen</h3>
          <p>Tracke ein paar Tage, dann zeigt sich hier dein Verlauf.</p>
        </div>
      ) : (
        <>
          <div className="card stats-hero">
            <div className="stats-hero-main">
              <span className="stats-hero-n">{stats.avg.kcal.toLocaleString('de-DE')}</span>
              <span className="stats-hero-l">Ø kcal pro Tag</span>
              <span className="stats-hero-sub">
                getrackt an {stats.daysLogged} von {stats.days.length} Tagen
              </span>
            </div>
            {stats.streak.currentStreak > 1 && (
              <div className="streak-chip" title={`Längste Serie: ${stats.streak.longestStreak} Tage`}>
                <IconFlame />
                <span className="n">{stats.streak.currentStreak}</span>
                <span className="l">Tage<br />in Folge</span>
              </div>
            )}
          </div>

          <div className="card stats-card">
            <div className="stats-card-head">
              <h2>Kalorien</h2>
              {sel && (
                <span className="stats-sel">
                  {fmtDay(sel.date, { weekday: 'short', day: '2-digit', month: '2-digit' })} ·{' '}
                  <strong>{Math.round(sel.kcal).toLocaleString('de-DE')} kcal</strong>
                </span>
              )}
            </div>
            <KcalChart days={stats.days} target={stats.goals.kcalTarget} selected={selected} onSelect={setSelected} />
            {sel && sel.entryCount > 0 && (
              <div className="macros stats-sel-macros">
                <span className="macro carb"><span className="v">{round(sel.carbs)}</span><span className="u">g KH</span></span>
                <span className="macro prot"><span className="v">{round(sel.protein)}</span><span className="u">g Protein</span></span>
                <span className="macro fat"><span className="v">{round(sel.fat)}</span><span className="u">g Fett</span></span>
              </div>
            )}
          </div>

          {energyShare && (
            <div className="card stats-card">
              <div className="stats-card-head">
                <h2>Energieverteilung</h2>
                <span className="stats-sel">Ø pro getracktem Tag</span>
              </div>
              <div className="energy-bar" role="img" aria-label="Energieanteile der Makros">
                <span className="seg-prot" style={{ width: `${energyShare.p}%` }} />
                <span className="seg-carb" style={{ width: `${energyShare.c}%` }} />
                <span className="seg-fat" style={{ width: `${energyShare.f}%` }} />
              </div>
              <ul className="energy-legend">
                <li>
                  <span className="dot prot" />Protein
                  <strong>{round(stats.avg.protein)} g</strong>
                  <em>{Math.round(energyShare.p)} %</em>
                  {stats.goals.proteinG != null && (
                    <span className={stats.avg.protein >= stats.goals.proteinG ? 'goal-hit' : 'goal-miss'}>
                      Ziel {stats.goals.proteinG} g
                    </span>
                  )}
                </li>
                <li><span className="dot carb" />Kohlenhydrate<strong>{round(stats.avg.carbs)} g</strong><em>{Math.round(energyShare.c)} %</em></li>
                <li><span className="dot fat" />Fett<strong>{round(stats.avg.fat)} g</strong><em>{Math.round(energyShare.f)} %</em></li>
              </ul>
            </div>
          )}

          <div className="card stats-card">
            <div className="stats-card-head">
              <h2><IconDrop /> Wasser</h2>
              <span className="stats-sel">
                Ø <strong>{stats.avg.waterMl.toLocaleString('de-DE')} ml</strong> / Ziel {stats.goals.waterMl.toLocaleString('de-DE')} ml
              </span>
            </div>
            <WaterChart days={stats.days} target={stats.goals.waterMl} />
          </div>
        </>
      )}
    </div>
  )
}
