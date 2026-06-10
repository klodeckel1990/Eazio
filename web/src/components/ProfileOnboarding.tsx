import { useEffect, useRef, useState, type ComponentType, type SVGProps } from 'react'
import { api } from '../api/client'
import type { ActivityLevel, Gender, GoalType, Goals, OnboardingPlan } from '../api/types'
import {
  IconArrowRight, IconCheckCircle, IconChevronLeft, IconClipboard, IconFigure,
  IconLeaf, IconScale, IconSparkle, IconTarget,
} from './icons'

// Profil-Onboarding als Fullscreen-Experience (Look & Feel nach dem
// Stitch-Entwurf): Schritt-Label + Fortschrittsbalken oben, großes
// line-art Icon mit Draw-In-Animation im hellgrünen Kreis, Optionszeilen
// mit Häkchen, am Ende die grüne Plan-Karte mit dem Tagesziel.
// Öffnet sich automatisch solange goals.onboardedAt fehlt; später erneut
// über das Event 'tellerwert:edit-profile' (Einstellungen).

type StepId = 'intro' | 'goal' | 'about' | 'target' | 'activity' | 'result'

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
  { value: 'lose', label: 'Gewicht verlieren', hint: 'Körperfett reduzieren', feedback: 'Starke Entscheidung. Wer sein Essen trackt, nimmt nachweislich leichter ab – Bewusstsein ist der halbe Weg.' },
  { value: 'maintain', label: 'Gewicht halten', hint: 'Fit und im Gleichgewicht bleiben', feedback: 'Sehr gut. Tracken hilft dir, dein Gleichgewicht zu verstehen und langfristig zu halten.' },
  { value: 'gain', label: 'Muskeln aufbauen', hint: 'Gezielt zunehmen', feedback: 'Auf geht’s. Mit genug Protein und einem leichten Überschuss baust du nachhaltig auf.' },
]

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Weiblich' },
  { value: 'male', label: 'Männlich' },
  { value: 'diverse', label: 'Divers' },
]

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Wenig aktiv', hint: 'Bürojob, kaum Bewegung' },
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

const STEP_ICONS: Record<StepId, ComponentType<SVGProps<SVGSVGElement>>> = {
  intro: IconLeaf,
  goal: IconTarget,
  about: IconClipboard,
  target: IconScale,
  activity: IconFigure,
  result: IconSparkle,
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

  const ORDER: StepId[] = ['intro', 'goal', 'about',
    ...(answers.goalType === 'maintain' ? [] : (['target'] as StepId[])),
    'activity', 'result']
  const idx = ORDER.indexOf(step)
  // numbered steps exclude intro & result ("Schritt 1 von 3/4")
  const numbered = ORDER.filter((s) => s !== 'intro' && s !== 'result')
  const stepNo = numbered.indexOf(step) + 1
  const progress = step === 'result' ? 100 : Math.round((Math.max(stepNo - 1, 0) / numbered.length) * 100 + (stepNo > 0 ? 100 / numbered.length / 2 : 0))

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
  const aboutValid =
    answers.gender !== null &&
    numValid(answers.birthYear, 1920, new Date().getFullYear() - 13) &&
    numValid(answers.heightCm, 120, 250) &&
    numValid(answers.weightKg, 30, 400)
  const targetValid = numValid(answers.weightGoalKg, 30, 400) && answers.paceKgWeek !== null
  const weightDiff = numValid(answers.weightKg, 30, 400) && numValid(answers.weightGoalKg, 30, 400)
    ? Math.round(Math.abs(num(answers.weightKg) - num(answers.weightGoalKg)) * 10) / 10
    : null

  const StageIcon = STEP_ICONS[step]
  const canNext =
    step === 'goal' ? answers.goalType !== null
    : step === 'about' ? aboutValid
    : step === 'target' ? targetValid
    : step === 'activity' ? answers.activityLevel !== null
    : true

  return (
    <div className="ob-screen" role="dialog" aria-modal="true" aria-label="Profil einrichten">
      <header className="ob-head">
        {idx > 0 && step !== 'result' ? (
          <button type="button" className="ob-back" onClick={back} aria-label="Zurück">
            <IconChevronLeft />
          </button>
        ) : <span className="ob-back-spacer" />}
        <span className="ob-brand"><IconLeaf /> Tellerwert</span>
        {step !== 'result' ? (
          <button type="button" className="ob-later" onClick={finishLater}>Später</button>
        ) : <span className="ob-back-spacer" />}
      </header>

      {step !== 'intro' && step !== 'result' && (
        <div className="ob-meta">
          <span>Schritt {stepNo} von {numbered.length}</span>
          <span>{progress} %</span>
        </div>
      )}
      <div className="ob-progress" aria-hidden="true"><span style={{ width: `${step === 'intro' ? 4 : progress}%` }} /></div>

      <div className="ob-body" key={step}>
        <div className={`ob-stage ${step === 'result' ? 'celebrate' : ''}`}>
          <StageIcon />
        </div>

        {step === 'intro' && (
          <>
            <h1 className="ob-title">Lass uns dein Profil einrichten</h1>
            <p className="ob-sub">
              Ein paar kurze Fragen – daraus berechnen wir dein persönliches Kalorienbudget,
              deine Makros und dein Wasserziel. Menschen, die ihr Essen tracken, erreichen
              ihre Ziele deutlich häufiger: Was man sieht, kann man steuern.
            </p>
          </>
        )}

        {step === 'goal' && (
          <>
            <h1 className="ob-title">Was ist dein Ziel?</h1>
            <div className="ob-options">
              {GOAL_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`ob-option ${answers.goalType === o.value ? 'selected' : ''}`}
                  onClick={() => {
                    setAnswers((a) => ({ ...a, goalType: o.value }))
                    setFeedback(o.feedback)
                    goTo('about', 1100)
                  }}
                >
                  <span className="ob-option-text">
                    <strong>{o.label}</strong>
                    <span>{o.hint}</span>
                  </span>
                  {answers.goalType === o.value && <IconCheckCircle className="ob-option-check" />}
                </button>
              ))}
            </div>
            {feedback && <p className="ob-feedback">{feedback}</p>}
          </>
        )}

        {step === 'about' && (
          <>
            <h1 className="ob-title">Erzähl uns von dir</h1>
            <p className="ob-sub">Damit stimmen wir dein Tagesziel individuell auf dich ab.</p>
            <div className="ob-form">
              <div className="field">
                <span className="label">Geschlecht</span>
                <div className="seg" role="group" aria-label="Geschlecht">
                  {GENDER_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={answers.gender === o.value}
                      onClick={() => setAnswers((a) => ({ ...a, gender: o.value }))}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ob-form-grid">
                <div className="field">
                  <label htmlFor="ob-year">Geburtsjahr</label>
                  <input
                    id="ob-year" type="number" inputMode="numeric"
                    min={1920} max={new Date().getFullYear() - 13} placeholder="1990"
                    value={answers.birthYear}
                    onChange={(e) => setAnswers((a) => ({ ...a, birthYear: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ob-height">Größe (cm)</label>
                  <input
                    id="ob-height" type="number" inputMode="decimal"
                    min={120} max={250} placeholder="178"
                    value={answers.heightCm}
                    onChange={(e) => setAnswers((a) => ({ ...a, heightCm: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ob-weight">Gewicht (kg)</label>
                  <input
                    id="ob-weight" type="number" inputMode="decimal"
                    min={30} max={400} step="0.1" placeholder="82,5"
                    value={answers.weightKg}
                    onChange={(e) => setAnswers((a) => ({ ...a, weightKg: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {step === 'target' && answers.goalType !== 'maintain' && (
          <>
            <h1 className="ob-title">Wunschgewicht &amp; Tempo</h1>
            <div className="ob-form">
              <div className="field">
                <label htmlFor="ob-goalweight">Wunschgewicht (kg)</label>
                <input
                  id="ob-goalweight" type="number" inputMode="decimal"
                  min={30} max={400} step="0.1" placeholder="75"
                  value={answers.weightGoalKg}
                  onChange={(e) => setAnswers((a) => ({ ...a, weightGoalKg: e.target.value }))}
                />
              </div>
              {weightDiff !== null && weightDiff > 0 && (
                <p className="ob-feedback">
                  {answers.goalType === 'lose'
                    ? `${weightDiff.toLocaleString('de-DE')} kg – absolut machbar, Schritt für Schritt.`
                    : `+${weightDiff.toLocaleString('de-DE')} kg Aufbau – mit Plan klappt das.`}
                </p>
              )}
              <div className="ob-options">
                {PACE_OPTIONS[answers.goalType as 'lose' | 'gain'].map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={`ob-option ${answers.paceKgWeek === o.value ? 'selected' : ''}`}
                    onClick={() => setAnswers((a) => ({ ...a, paceKgWeek: o.value }))}
                  >
                    <span className="ob-option-text">
                      <strong>{o.label}</strong>
                      <span>{o.hint}</span>
                    </span>
                    {answers.paceKgWeek === o.value && <IconCheckCircle className="ob-option-check" />}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 'activity' && (
          <>
            <h1 className="ob-title">Wie aktiv bist du?</h1>
            <div className="ob-options">
              {ACTIVITY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`ob-option ${answers.activityLevel === o.value ? 'selected' : ''}`}
                  onClick={() => setAnswers((a) => ({ ...a, activityLevel: o.value }))}
                >
                  <span className="ob-option-text">
                    <strong>{o.label}</strong>
                    <span>{o.hint}</span>
                  </span>
                  {answers.activityLevel === o.value && <IconCheckCircle className="ob-option-check" />}
                </button>
              ))}
            </div>
            {error && <p className="ob-error">{error}</p>}
          </>
        )}

        {step === 'result' && plan && (
          <>
            <h1 className="ob-title">Dein Plan ist bereit!</h1>
            <p className="ob-sub">
              Wir haben deinen persönlichen Tagesbedarf ermittelt. Dein Weg zu einer
              bewussteren Ernährung beginnt genau hier.
            </p>
            <div className="ob-plan-card">
              <span className="ob-plan-label">Dein Tagesziel</span>
              <span className="ob-plan-kcal">{plan.kcalTarget.toLocaleString('de-DE')} <em>kcal</em></span>
              <div className="ob-plan-chips">
                <span>Protein {plan.proteinG} g</span>
                <span>KH {plan.carbsG} g</span>
                <span>Fett {plan.fatG} g</span>
                <span>Wasser {(plan.waterMl / 1000).toLocaleString('de-DE')} l</span>
              </div>
            </div>
            <p className="ob-sub">
              {plan.etaWeeks
                ? `Bleibst du in deinem Tempo, erreichst du dein Wunschgewicht in etwa ${plan.etaWeeks} Wochen. `
                : ''}
              Dranbleiben zählt mehr als Perfektion – schon das Tracken selbst macht den
              Unterschied. Alle Werte kannst du jederzeit in den Einstellungen anpassen.
            </p>
          </>
        )}
      </div>

      <footer className="ob-foot">
        {step === 'intro' && (
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => next()}>
            Los geht&rsquo;s
          </button>
        )}
        {step === 'result' && (
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={close}>
            Loslegen und ersten Eintrag tracken
          </button>
        )}
        {step !== 'intro' && step !== 'result' && (
          <button
            type="button"
            className="ob-next"
            aria-label={step === 'activity' ? 'Plan berechnen' : 'Weiter'}
            disabled={!canNext || saving}
            onClick={() => (step === 'activity' ? submit() : next())}
          >
            {step === 'activity'
              ? (saving ? <span className="spinner" /> : <>Plan berechnen <IconArrowRight /></>)
              : <IconArrowRight />}
          </button>
        )}
      </footer>
    </div>
  )
}
