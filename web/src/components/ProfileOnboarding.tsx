import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { ActivityLevel, Gender, GoalType, Goals, OnboardingPlan } from '../api/types'

// Profil-Assistent nach der Registrierung: kleiner Fragebogen (Ziel,
// Geschlecht, Alter, Größe, Gewicht, Tempo, Aktivität) mit motivierendem
// Feedback, am Ende ein berechneter Tagesplan (kcal/Makros/Wasser).
// Öffnet sich automatisch solange goals.onboardedAt fehlt; später erneut
// über das Event 'tellerwert:edit-profile' (Einstellungen).

type StepId =
  | 'intro' | 'goal' | 'gender' | 'birthYear' | 'height' | 'weight'
  | 'weightGoal' | 'pace' | 'activity' | 'result'

interface Answers {
  goalType: GoalType | null
  gender: Gender | null
  birthYear: string
  heightCm: string
  weightKg: string
  weightGoalKg: string
  paceKgWeek: number | null
  activityLevel: ActivityLevel | null
}

const GOAL_OPTIONS: { value: GoalType; label: string; hint: string; feedback: string }[] = [
  { value: 'lose', label: 'Abnehmen', hint: 'Körperfett reduzieren', feedback: 'Starke Entscheidung! Wer sein Essen trackt, nimmt nachweislich leichter ab – Bewusstsein ist der halbe Weg. 💪' },
  { value: 'maintain', label: 'Gewicht halten', hint: 'Fit und im Gleichgewicht bleiben', feedback: 'Sehr gut! Tracken hilft dir, dein Gleichgewicht zu verstehen und langfristig zu halten. 🌱' },
  { value: 'gain', label: 'Muskeln aufbauen', hint: 'Gezielt zunehmen', feedback: 'Los geht’s! Mit genug Protein und einem leichten Überschuss baust du nachhaltig auf. 🏋️' },
]

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Weiblich' },
  { value: 'male', label: 'Männlich' },
  { value: 'diverse', label: 'Divers' },
]

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Sitzend', hint: 'Büro, wenig Bewegung' },
  { value: 'light', label: 'Leicht aktiv', hint: 'Spaziergänge, 1–2× Sport pro Woche' },
  { value: 'moderate', label: 'Mäßig aktiv', hint: 'Viel auf den Beinen oder 3–4× Sport' },
  { value: 'active', label: 'Aktiv', hint: 'Körperliche Arbeit oder 5–6× Sport' },
  { value: 'very_active', label: 'Sehr aktiv', hint: 'Harte Arbeit plus tägliches Training' },
]

const PACE_OPTIONS: Record<'lose' | 'gain', { value: number; label: string; hint: string }[]> = {
  lose: [
    { value: 0.25, label: 'Entspannt', hint: '≈ 0,25 kg pro Woche' },
    { value: 0.5, label: 'Ausgewogen', hint: '≈ 0,5 kg pro Woche – empfohlen' },
    { value: 0.75, label: 'Ambitioniert', hint: '≈ 0,75 kg pro Woche' },
  ],
  gain: [
    { value: 0.1, label: 'Lean Bulk', hint: '≈ 0,1 kg pro Woche – kaum Fettaufbau' },
    { value: 0.25, label: 'Ausgewogen', hint: '≈ 0,25 kg pro Woche – empfohlen' },
    { value: 0.4, label: 'Zügig', hint: '≈ 0,4 kg pro Woche' },
  ],
}

const num = (s: string): number => parseFloat(s.replace(',', '.'))

export function ProfileOnboarding() {
  const [show, setShow] = useState(false)
  const [step, setStep] = useState<StepId>('intro')
  const [answers, setAnswers] = useState<Answers>({
    goalType: null, gender: null, birthYear: '', heightCm: '', weightKg: '',
    weightGoalKg: '', paceKgWeek: null, activityLevel: null,
  })
  const [feedback, setFeedback] = useState<string | null>(null)
  const [plan, setPlan] = useState<OnboardingPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let alive = true
    api.goals.get()
      .then((g) => { if (alive && !g.onboardedAt) setShow(true) })
      .catch(() => {})
    const onEdit = (e: Event) => {
      const goals = (e as CustomEvent<Goals | undefined>).detail
      if (goals) {
        setAnswers({
          goalType: goals.goalType,
          gender: goals.gender,
          birthYear: goals.birthYear ? String(goals.birthYear) : '',
          heightCm: goals.heightCm ? String(goals.heightCm) : '',
          weightKg: goals.weightKg ? String(goals.weightKg) : '',
          weightGoalKg: goals.weightGoalKg ? String(goals.weightGoalKg) : '',
          paceKgWeek: goals.paceKgWeek,
          activityLevel: goals.activityLevel,
        })
      }
      setPlan(null)
      setStep('intro')
      setShow(true)
    }
    window.addEventListener('tellerwert:edit-profile', onEdit)
    return () => {
      alive = false
      window.removeEventListener('tellerwert:edit-profile', onEdit)
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
    }
  }, [])

  const ORDER: StepId[] = ['intro', 'goal', 'gender', 'birthYear', 'height', 'weight',
    ...(answers.goalType === 'maintain' ? [] : (['weightGoal', 'pace'] as StepId[])),
    'activity', 'result']
  const idx = ORDER.indexOf(step)
  const progress = Math.round((idx / (ORDER.length - 1)) * 100)

  const goTo = (next: StepId, delay = 0) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    if (delay > 0) {
      advanceTimer.current = setTimeout(() => { setFeedback(null); setStep(next) }, delay)
    } else {
      setFeedback(null)
      setStep(next)
    }
  }
  const next = (delay = 0) => goTo(ORDER[Math.min(idx + 1, ORDER.length - 1)]!, delay)
  const back = () => { setFeedback(null); setStep(ORDER[Math.max(idx - 1, 0)]!) }

  const finishLater = () => {
    setShow(false)
    api.goals.skipOnboarding()
      .then(() => window.dispatchEvent(new Event('tellerwert:onboarded')))
      .catch(() => {})
  }

  const submit = () => {
    setSaving(true)
    setError(null)
    api.goals
      .onboarding({
        gender: answers.gender!,
        birthYear: Math.round(num(answers.birthYear)),
        heightCm: num(answers.heightCm),
        weightKg: num(answers.weightKg),
        activityLevel: answers.activityLevel!,
        goalType: answers.goalType!,
        weightGoalKg: answers.goalType === 'maintain' || !answers.weightGoalKg ? null : num(answers.weightGoalKg),
        paceKgWeek: answers.goalType === 'maintain' ? null : answers.paceKgWeek,
      })
      .then(({ plan: p }) => { setPlan(p); setStep('result') })
      .catch(() => setError('Das hat nicht geklappt – bitte prüfe deine Angaben.'))
      .finally(() => setSaving(false))
  }

  const close = () => {
    setShow(false)
    window.dispatchEvent(new Event('tellerwert:onboarded'))
  }

  if (!show) return null

  const numValid = (s: string, min: number, max: number) => {
    const v = num(s)
    return Number.isFinite(v) && v >= min && v <= max
  }
  const weightDiff = numValid(answers.weightKg, 30, 400) && numValid(answers.weightGoalKg, 30, 400)
    ? Math.abs(num(answers.weightKg) - num(answers.weightGoalKg))
    : null

  return (
    <div className="wiz-overlay" role="dialog" aria-modal="true" aria-label="Profil einrichten">
      <div className="wiz-card ob-card">
        {step !== 'result' && (
          <button className="wiz-skip" type="button" onClick={finishLater}>Später</button>
        )}
        <div className="ob-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>

        {step === 'intro' && (
          <>
            <h2 className="wiz-title">Lass uns dein Profil einrichten</h2>
            <p className="wiz-body">
              Ein paar kurze Fragen – daraus berechnen wir dein persönliches Kalorienbudget,
              deine Makros und dein Wasserziel. Menschen, die ihr Essen tracken, erreichen
              ihre Ziele deutlich häufiger: Was man sieht, kann man steuern.
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={() => next()}>
              Los geht&rsquo;s
            </button>
          </>
        )}

        {step === 'goal' && (
          <>
            <h2 className="wiz-title">Was ist dein Ziel?</h2>
            <div className="ob-options">
              {GOAL_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`ob-option ${answers.goalType === o.value ? 'selected' : ''}`}
                  onClick={() => {
                    setAnswers((a) => ({ ...a, goalType: o.value }))
                    setFeedback(o.feedback)
                    goTo('gender', 900)
                  }}
                >
                  <strong>{o.label}</strong>
                  <span>{o.hint}</span>
                </button>
              ))}
            </div>
            {feedback && <p className="ob-feedback">{feedback}</p>}
          </>
        )}

        {step === 'gender' && (
          <>
            <h2 className="wiz-title">Dein Geschlecht?</h2>
            <p className="wiz-body">Der Grundumsatz unterscheidet sich – so rechnen wir genauer.</p>
            <div className="ob-options">
              {GENDER_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`ob-option ${answers.gender === o.value ? 'selected' : ''}`}
                  onClick={() => { setAnswers((a) => ({ ...a, gender: o.value })); next(250) }}
                >
                  <strong>{o.label}</strong>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'birthYear' && (
          <>
            <h2 className="wiz-title">Dein Geburtsjahr?</h2>
            <div className="ob-input-row">
              <input
                type="number" inputMode="numeric" autoFocus
                min={1920} max={new Date().getFullYear() - 13}
                placeholder="z. B. 1990"
                value={answers.birthYear}
                onChange={(e) => setAnswers((a) => ({ ...a, birthYear: e.target.value }))}
              />
            </div>
            <div className="wiz-nav">
              <button type="button" className="btn btn-ghost" onClick={back}>Zurück</button>
              <button
                type="button" className="btn btn-primary"
                disabled={!numValid(answers.birthYear, 1920, new Date().getFullYear() - 13)}
                onClick={() => next()}
              >Weiter</button>
            </div>
          </>
        )}

        {step === 'height' && (
          <>
            <h2 className="wiz-title">Wie groß bist du?</h2>
            <div className="ob-input-row">
              <input
                type="number" inputMode="decimal" autoFocus
                min={120} max={250} placeholder="z. B. 178"
                value={answers.heightCm}
                onChange={(e) => setAnswers((a) => ({ ...a, heightCm: e.target.value }))}
              />
              <span className="ob-unit">cm</span>
            </div>
            <div className="wiz-nav">
              <button type="button" className="btn btn-ghost" onClick={back}>Zurück</button>
              <button
                type="button" className="btn btn-primary"
                disabled={!numValid(answers.heightCm, 120, 250)}
                onClick={() => next()}
              >Weiter</button>
            </div>
          </>
        )}

        {step === 'weight' && (
          <>
            <h2 className="wiz-title">Dein aktuelles Gewicht?</h2>
            <p className="wiz-body">Ehrlich bleiben – die Zahl sieht nur dein Plan. 😉</p>
            <div className="ob-input-row">
              <input
                type="number" inputMode="decimal" autoFocus
                min={30} max={400} step="0.1" placeholder="z. B. 82,5"
                value={answers.weightKg}
                onChange={(e) => setAnswers((a) => ({ ...a, weightKg: e.target.value }))}
              />
              <span className="ob-unit">kg</span>
            </div>
            <div className="wiz-nav">
              <button type="button" className="btn btn-ghost" onClick={back}>Zurück</button>
              <button
                type="button" className="btn btn-primary"
                disabled={!numValid(answers.weightKg, 30, 400)}
                onClick={() => next()}
              >Weiter</button>
            </div>
          </>
        )}

        {step === 'weightGoal' && (
          <>
            <h2 className="wiz-title">Dein Wunschgewicht?</h2>
            <div className="ob-input-row">
              <input
                type="number" inputMode="decimal" autoFocus
                min={30} max={400} step="0.1" placeholder="z. B. 75"
                value={answers.weightGoalKg}
                onChange={(e) => setAnswers((a) => ({ ...a, weightGoalKg: e.target.value }))}
              />
              <span className="ob-unit">kg</span>
            </div>
            {weightDiff !== null && weightDiff > 0 && (
              <p className="ob-feedback">
                {answers.goalType === 'lose'
                  ? `${weightDiff.toLocaleString('de-DE')} kg – absolut machbar. Schritt für Schritt. 🎯`
                  : `+${weightDiff.toLocaleString('de-DE')} kg Aufbau – mit Plan klappt das. 🎯`}
              </p>
            )}
            <div className="wiz-nav">
              <button type="button" className="btn btn-ghost" onClick={back}>Zurück</button>
              <button
                type="button" className="btn btn-primary"
                disabled={!numValid(answers.weightGoalKg, 30, 400)}
                onClick={() => next()}
              >Weiter</button>
            </div>
          </>
        )}

        {step === 'pace' && answers.goalType !== 'maintain' && (
          <>
            <h2 className="wiz-title">In welchem Tempo?</h2>
            <p className="wiz-body">
              {answers.goalType === 'lose'
                ? 'Langsamer ist oft nachhaltiger – du kannst das jederzeit ändern.'
                : 'Muskelaufbau braucht Geduld – ein kleiner Überschuss reicht.'}
            </p>
            <div className="ob-options">
              {PACE_OPTIONS[answers.goalType as 'lose' | 'gain'].map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`ob-option ${answers.paceKgWeek === o.value ? 'selected' : ''}`}
                  onClick={() => { setAnswers((a) => ({ ...a, paceKgWeek: o.value })); next(250) }}
                >
                  <strong>{o.label}</strong>
                  <span>{o.hint}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'activity' && (
          <>
            <h2 className="wiz-title">Wie aktiv bist du im Alltag?</h2>
            <div className="ob-options">
              {ACTIVITY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`ob-option ${answers.activityLevel === o.value ? 'selected' : ''}`}
                  onClick={() => setAnswers((a) => ({ ...a, activityLevel: o.value }))}
                >
                  <strong>{o.label}</strong>
                  <span>{o.hint}</span>
                </button>
              ))}
            </div>
            {error && <p className="ob-error">{error}</p>}
            <div className="wiz-nav">
              <button type="button" className="btn btn-ghost" onClick={back}>Zurück</button>
              <button
                type="button" className="btn btn-primary"
                disabled={!answers.activityLevel || saving}
                onClick={submit}
              >{saving ? 'Berechne …' : 'Plan berechnen'}</button>
            </div>
          </>
        )}

        {step === 'result' && plan && (
          <>
            <h2 className="wiz-title">Dein persönlicher Plan 🎉</h2>
            <div className="ob-plan-kcal">
              <strong>{plan.kcalTarget.toLocaleString('de-DE')}</strong>
              <span>kcal pro Tag</span>
            </div>
            <div className="ob-plan-macros">
              <div><strong>{plan.proteinG} g</strong><span>Protein</span></div>
              <div><strong>{plan.carbsG} g</strong><span>Kohlenhydrate</span></div>
              <div><strong>{plan.fatG} g</strong><span>Fett</span></div>
              <div><strong>{(plan.waterMl / 1000).toLocaleString('de-DE')} l</strong><span>Wasser</span></div>
            </div>
            <p className="wiz-body">
              {plan.etaWeeks
                ? `Bleibst du in deinem Tempo, erreichst du dein Wunschgewicht in etwa ${plan.etaWeeks} Wochen. `
                : ''}
              Dranbleiben zählt mehr als Perfektion: Schon das Tracken selbst macht den Unterschied.
              Du kannst alle Werte jederzeit in den Einstellungen anpassen.
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={close}>
              Auf geht&rsquo;s – ersten Eintrag tracken
            </button>
          </>
        )}
      </div>
    </div>
  )
}
