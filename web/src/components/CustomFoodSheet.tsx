// "Eigenes Produkt anlegen": Bottom-Sheet, das bei unbekanntem Barcode (oder
// manuell) ein Custom Food erstellt. Die Nährwerttabelle lässt sich
// fotografieren — der Server liest sie per Vision-Modell aus und befüllt die
// Felder vor; alles bleibt editierbar. Portal wie CalendarSheet (WKWebView
// kennt kein position:fixed innerhalb von .main).

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError } from '../api/client'
import type { CustomFoodInput, FoodSummary } from '../api/types'
import { toJpegBase64 } from '../lib/image'
import { IconAlert, IconCamera, IconCheck, IconClose } from './icons'

interface Props {
  barcode: string | null
  onCreated: (food: FoodSummary) => void
  onClose: () => void
}

/** "4,5" → 4.5; leere/kaputte Eingaben → null */
const num = (s: string): number | null => {
  if (!s.trim()) return null
  const v = Number.parseFloat(s.replace(',', '.'))
  return Number.isFinite(v) && v >= 0 ? v : null
}

const NUTRIENTS: { key: keyof typeof EMPTY_VALUES; label: string }[] = [
  { key: 'kcal', label: 'kcal *' },
  { key: 'fat', label: 'Fett (g)' },
  { key: 'saturatedFat', label: 'davon gesättigt (g)' },
  { key: 'carbs', label: 'Kohlenhydrate (g)' },
  { key: 'sugar', label: 'davon Zucker (g)' },
  { key: 'protein', label: 'Eiweiß (g)' },
  { key: 'fiber', label: 'Ballaststoffe (g)' },
  { key: 'salt', label: 'Salz (g)' },
]

const EMPTY_VALUES = {
  kcal: '', fat: '', saturatedFat: '', carbs: '', sugar: '', protein: '', fiber: '', salt: '',
}

export function CustomFoodSheet({ barcode, onCreated, onClose }: Props) {
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [values, setValues] = useState({ ...EMPTY_VALUES })
  const [servingG, setServingG] = useState('')
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const handlePhoto = async (file: File) => {
    setError(null)
    setScanning(true)
    try {
      const image = await toJpegBase64(file)
      const res = await api.foods.labelScan(image, 'image/jpeg')
      setValues((prev) => ({
        kcal: res.kcal !== null ? String(res.kcal) : prev.kcal,
        fat: res.fat !== null ? String(res.fat) : prev.fat,
        saturatedFat: res.saturatedFat !== null ? String(res.saturatedFat) : prev.saturatedFat,
        carbs: res.carbs !== null ? String(res.carbs) : prev.carbs,
        sugar: res.sugar !== null ? String(res.sugar) : prev.sugar,
        protein: res.protein !== null ? String(res.protein) : prev.protein,
        fiber: res.fiber !== null ? String(res.fiber) : prev.fiber,
        salt: res.salt !== null ? String(res.salt) : prev.salt,
      }))
      if (res.servingG !== null) setServingG(String(res.servingG))
      if (res.name && !name.trim()) setName(res.name)
      if (res.brand && !brand.trim()) setBrand(res.brand)
      if (res.kcal === null) {
        setError('Auf dem Foto war keine Nährwerttabelle lesbar — bitte näher heranzoomen oder die Werte eintippen.')
      }
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.status === 503
          ? 'Foto-Auslesen gerade nicht verfügbar — Werte bitte eintippen.'
          : e.message)
      } else {
        setError('Foto konnte nicht verarbeitet werden.')
      }
    } finally {
      setScanning(false)
    }
  }

  const kcal = num(values.kcal)
  const canSave = name.trim().length > 0 && kcal !== null && !saving

  const handleSave = async () => {
    if (!canSave) return
    setError(null)
    setSaving(true)
    try {
      const serving = num(servingG)
      const body: CustomFoodInput = {
        name: name.trim(),
        brand: brand.trim() || null,
        barcode,
        kcal: kcal!,
        fat: num(values.fat),
        saturatedFat: num(values.saturatedFat),
        carbs: num(values.carbs),
        sugar: num(values.sugar),
        protein: num(values.protein),
        fiber: num(values.fiber),
        salt: num(values.salt),
        ...(serving ? { servings: [{ label: 'Portion', grams: serving }] } : {}),
      }
      onCreated(await api.foods.create(body))
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else throw e
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="cal-overlay" onClick={onClose} role="presentation">
      <div className="add-sheet cf-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Eigenes Produkt anlegen">
        <div className="add-sheet-head">
          <h3>Eigenes Produkt anlegen</h3>
          <button type="button" className="btn btn-icon btn-ghost btn-sm" onClick={onClose} aria-label="Schließen">
            <IconClose />
          </button>
        </div>
        {barcode && <p className="cf-barcode">Barcode {barcode} — beim nächsten Scan wird dein Produkt direkt gefunden.</p>}

        {error && (
          <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>
        )}

        <button
          type="button"
          className="btn btn-soft btn-lg"
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
        >
          <IconCamera />
          {scanning ? 'Nährwerte werden gelesen…' : 'Nährwerttabelle fotografieren'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = '' // gleiche Datei erneut wählbar
            if (file) void handlePhoto(file)
          }}
        />

        <div className="field">
          <label htmlFor="cf-name">Name *</label>
          <input id="cf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Protein-Müsli" />
        </div>
        <div className="field">
          <label htmlFor="cf-brand">Marke</label>
          <input id="cf-brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="optional" />
        </div>

        <span className="cf-section">Nährwerte pro 100 g / 100 ml</span>
        <div className="cf-grid">
          {NUTRIENTS.map((n) => (
            <div className="field" key={n.key}>
              <label htmlFor={`cf-${n.key}`}>{n.label}</label>
              <input
                id={`cf-${n.key}`}
                inputMode="decimal"
                value={values[n.key]}
                onChange={(e) => setValues((prev) => ({ ...prev, [n.key]: e.target.value }))}
                placeholder="–"
              />
            </div>
          ))}
        </div>

        <div className="field">
          <label htmlFor="cf-serving">Portionsgröße (g, optional)</label>
          <input
            id="cf-serving"
            inputMode="decimal"
            value={servingG}
            onChange={(e) => setServingG(e.target.value)}
            placeholder="z. B. 40"
          />
        </div>

        <button type="button" className="btn btn-primary btn-lg" onClick={() => { void handleSave() }} disabled={!canSave}>
          <IconCheck />
          {saving ? 'Anlegen…' : 'Anlegen und zur Liste'}
        </button>
      </div>
    </div>,
    document.body,
  )
}
