import { useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { IconLeaf, IconBowl, IconWand, IconCart, IconSettings, IconClose } from './icons'

interface Step {
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  body: ReactNode
}

const STEPS: Step[] = [
  {
    Icon: IconLeaf,
    title: 'Willkommen bei Tellerwert',
    body: 'Dein entspanntes Ernährungstagebuch: Mahlzeiten in Sekunden tracken, Rezepte importieren und Einkaufslisten erstellen. Eine kurze Tour gefällig?',
  },
  {
    Icon: IconBowl,
    title: 'Schnell tracken',
    body: 'Tippe oder füge deine Zutaten als Text ein – z. B. „100 g Haferflocken, 1 Banane". Tellerwert erkennt Mengen und Einheiten (auch EL/TL), ignoriert Gewürze ohne kcal und matcht alles automatisch. Dann mit einem Tipp loggen.',
  },
  {
    Icon: IconWand,
    title: 'Rezepte importieren',
    body: 'Importiere Rezepte aus Instagram, Blogs oder per eingefügtem Text – die KI zieht Zutaten und Kochschritte heraus. Gespeicherte Rezepte findest du als Karten im Tab „Rezepte", mit Favoriten und Suche.',
  },
  {
    Icon: IconCart,
    title: 'Kochen & Einkaufen',
    body: 'Öffne ein Rezept, wähle wie viel du tracken willst (Ganzes, ½, ¼ …) und übernimm es in den Tracker. Oder kopiere die Zutaten als Einkaufsliste – als Klartext, für Apple Notes oder direkt in die Bring!-App.',
  },
  {
    Icon: IconSettings,
    title: 'Alles bereit',
    body: 'Du kannst sofort lostracken. Optional: Verknüpfe dein Yazio-Konto, um deine bisherige Historie zu importieren oder Einträge weiter nach Yazio zu spiegeln. In den Einstellungen findest du außerdem das Einkaufslisten-Format und das Teilen vom iPhone.',
  },
]

export function OnboardingWizard() {
  const navigate = useNavigate()
  const [show, setShow] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    let alive = true
    // the feature tour waits until the profile wizard is done — never both at once
    const check = () => {
      Promise.all([api.settings.get(), api.goals.get()])
        .then(([s, g]) => { if (alive && !s.onboardingDone && g.onboardedAt) setShow(true) })
        .catch(() => {})
    }
    check()
    window.addEventListener('tellerwert:onboarded', check)
    return () => {
      alive = false
      window.removeEventListener('tellerwert:onboarded', check)
    }
  }, [])

  const finish = () => {
    setShow(false)
    api.settings.update({ onboardingDone: true }).catch(() => {})
  }
  const goAccounts = () => {
    finish()
    navigate('/accounts')
  }

  if (!show) return null
  const isLast = step === STEPS.length - 1
  const current = STEPS[step]!
  const { Icon } = current

  return (
    <div className="wiz-overlay" role="dialog" aria-modal="true" aria-label="Einführung">
      <div className="wiz-card">
        <button className="wiz-skip" type="button" onClick={finish} aria-label="Tour überspringen">
          <IconClose />
        </button>
        <div className="wiz-icon"><Icon /></div>
        <h2 className="wiz-title">{current.title}</h2>
        <p className="wiz-body">{current.body}</p>

        {isLast && (
          <button type="button" className="btn btn-soft btn-block" onClick={goAccounts}>
            <IconSettings /> Yazio verknüpfen (optional)
          </button>
        )}

        <div className="wiz-dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={i === step ? 'on' : ''} />
          ))}
        </div>

        <div className="wiz-nav">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>Zurück</button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={finish}>Überspringen</button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => (isLast ? finish() : setStep(step + 1))}
          >
            {isLast ? "Los geht's" : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  )
}
