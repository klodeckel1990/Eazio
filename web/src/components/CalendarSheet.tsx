import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api/client'
import type { DiaryMonth, Streak } from '../api/types'
import { addMonths, monthGrid, monthLabel, monthOf, todayStr } from '../lib/dates'
import { IconChevronLeft, IconChevronRight, IconFlame, IconCheckCircle } from './icons'

// Monatsübersicht wie in Yazio: grüner Haken = getrackt & im Budget,
// rotes X = über dem Budget, leer = nichts getrackt. Tippen springt zum Tag
// (auch in die Zukunft — Vortracken).

interface Props {
  selected: string
  streak: Streak | null
  onPick: (date: string) => void
  onClose: () => void
}

export function CalendarSheet({ selected, streak, onPick, onClose }: Props) {
  const [month, setMonth] = useState(monthOf(selected))
  const [data, setData] = useState<DiaryMonth | null>(null)

  useEffect(() => {
    let alive = true
    setData(null)
    api.diary.month(month).then((d) => { if (alive) setData(d) }).catch(() => {})
    return () => { alive = false }
  }, [month])

  const today = todayStr()
  const kcalByDay = new Map((data?.days ?? []).map((d) => [d.date, d.kcal]))
  const { leading, days } = monthGrid(month)
  const greenDays = (data?.days ?? []).filter((d) => d.kcal > 0 && d.kcal <= (data?.kcalTarget ?? 0)).length

  const status = (date: string): 'green' | 'red' | 'none' => {
    const kcal = kcalByDay.get(date) ?? 0
    if (kcal <= 0) return 'none'
    return data && kcal > data.kcalTarget ? 'red' : 'green'
  }

  // Portal: innerhalb von .main (-webkit-overflow-scrolling) ist position:fixed
  // in WKWebView kaputt — der Overlay würde von Appbar/Tabbar überdeckt.
  return createPortal(
    <div className="cal-overlay" role="dialog" aria-modal="true" aria-label="Kalender">
      <div className="cal-sheet">
        <div className="cal-head">
          <button type="button" className="cal-link" onClick={() => { onPick(today); onClose() }}>Heute</button>
          <button type="button" className="cal-link" onClick={onClose}>Schließen</button>
        </div>

        <div className="cal-month-nav">
          <button type="button" className="cal-nav-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Voriger Monat">
            <IconChevronLeft />
          </button>
          <h2>{monthLabel(month)}</h2>
          <button type="button" className="cal-nav-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="Nächster Monat">
            <IconChevronRight />
          </button>
        </div>

        <div className="cal-grid" role="grid">
          {['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((w, i) => (
            <span key={`w${i}`} className="cal-weekday">{w}</span>
          ))}
          {Array.from({ length: leading }, (_, i) => <span key={`l${i}`} />)}
          {days.map((date) => {
            const st = status(date)
            const isToday = date === today
            const isSelected = date === selected
            return (
              <button
                key={date}
                type="button"
                className={`cal-day ${isSelected ? 'selected' : ''}`}
                onClick={() => { onPick(date); onClose() }}
              >
                <span className={`cal-num ${isToday ? 'today' : ''}`}>{Number(date.slice(8))}</span>
                <span className={`cal-dot ${st} ${isToday ? 'is-today' : ''}`}>
                  {st === 'green' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4 10-10" /></svg>}
                  {st === 'red' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m7 7 10 10M17 7 7 17" /></svg>}
                </span>
              </button>
            )
          })}
        </div>

        <div className="cal-stats">
          <div className="stat-tile">
            <span className="stat-ico flame"><IconFlame /></span>
            <span className="stat-text">
              <span className="stat-val">{streak?.currentStreak ?? 0} {streak?.currentStreak === 1 ? 'Tag' : 'Tage'}</span>
              <span className="stat-lbl">aktuelle Serie</span>
            </span>
          </div>
          <div className="stat-tile">
            <span className="stat-ico steps"><IconCheckCircle /></span>
            <span className="stat-text">
              <span className="stat-val">{greenDays} / {days.length}</span>
              <span className="stat-lbl">grüne Tage</span>
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
