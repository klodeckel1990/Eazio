import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { RecipeDetail, RecipeIngredient, ShoppingListFormat } from '../api/types'
import { buildTrackerText } from '../lib/recipe'
import { buildShoppingText, bringDeeplink, copyText, SHOPPING_FORMAT_LABEL } from '../lib/shoppingList'
import { IconAlert, IconBowl, IconCart, IconCheck, IconChevronLeft, IconClock, IconCopy, IconHeart, IconHeartFilled, IconTrash } from '../components/icons'

const FACTORS = [
  { label: 'Ganzes', value: 1 },
  { label: '½', value: 0.5 },
  { label: '⅓', value: 1 / 3 },
  { label: '¼', value: 0.25 },
]
const DIFF_LABEL: Record<string, string> = { einfach: 'Einfach', mittel: 'Mittel', schwer: 'Schwer' }
const ingredientLine = (ing: RecipeIngredient): string =>
  [ing.quantity, ing.unit, ing.name].filter(Boolean).join(' ')
const round2 = (n: number) => Math.round(n * 100) / 100

export function RecipeDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [factor, setFactor] = useState(1)
  const [format, setFormat] = useState<ShoppingListFormat>('plain')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.recipes
      .get(id)
      .then(setRecipe)
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'Rezept nicht gefunden.' : 'Rezept konnte nicht geladen werden.'))
  }, [id])

  useEffect(() => {
    api.settings.get().then((s) => setFormat(s.shoppingListFormat)).catch(() => {})
  }, [])

  const copyShoppingList = async () => {
    if (!recipe) return
    if (format === 'bring') {
      const publicUrl = `${window.location.origin}/r/${recipe.id}?t=${encodeURIComponent(recipe.shareToken)}`
      window.location.href = bringDeeplink(publicUrl, recipe.servings)
      return
    }
    const ok = await copyText(buildShoppingText(recipe.title, recipe.ingredients))
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    }
  }

  const toggleFav = async () => {
    if (!recipe) return
    const next = !recipe.isFavorite
    setRecipe({ ...recipe, isFavorite: next })
    try {
      await api.recipes.setFavorite(recipe.id, next)
    } catch {
      /* keep optimistic state */
    }
  }

  const handleDelete = async () => {
    if (!recipe) return
    try {
      await api.recipes.remove(recipe.id)
      navigate('/recipes', { replace: true })
    } catch (e) {
      if (e instanceof ApiError) setError('Löschen fehlgeschlagen.')
      else throw e
    }
  }

  const track = () => {
    if (!recipe) return
    navigate('/', { state: { presetText: buildTrackerText(recipe.ingredients, factor) } })
  }

  return (
    <div className="page">
      <div className="detail-top">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/recipes')}>
          <IconChevronLeft /> Rezepte
        </button>
        {recipe && (
          <div className="row-actions">
            <button
              type="button"
              className={`btn btn-icon ${recipe.isFavorite ? 'btn-primary' : 'btn-ghost'}`}
              aria-pressed={recipe.isFavorite}
              aria-label="Favorit"
              onClick={() => { void toggleFav() }}
            >
              {recipe.isFavorite ? <IconHeartFilled /> : <IconHeart />}
            </button>
            <button type="button" className="btn btn-icon btn-danger" aria-label="Rezept löschen" onClick={() => { void handleDelete() }}>
              <IconTrash />
            </button>
          </div>
        )}
      </div>

      {error && <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>}

      {recipe === null && !error ? (
        <p className="loading-inline"><span className="spinner" /> Lade Rezept…</p>
      ) : recipe ? (
        <div className="stack">
          {recipe.hasImage && <img className="detail-hero" src={api.recipes.imageUrl(recipe.id)} alt="" />}
          <h1 className="detail-title">{recipe.title}</h1>
          <div className="detail-meta">
            {recipe.difficulty && <span className="diff-badge static">{DIFF_LABEL[recipe.difficulty] ?? recipe.difficulty}</span>}
            {recipe.totalMinutes != null && <span className="rc-time"><IconClock /> {recipe.totalMinutes} Min.</span>}
            {recipe.servings != null && <span className="muted">{recipe.servings} Portionen</span>}
          </div>

          <section>
            <span className="label">Zutaten</span>
            <ul className="recipe-list">
              {recipe.ingredients.map((ing, i) => (
                <li key={i}>{ingredientLine(ing)}</li>
              ))}
            </ul>
          </section>

          {recipe.steps.length > 0 && (
            <section>
              <span className="label">Kochschritte</span>
              <ol className="recipe-list steps">
                {recipe.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </section>
          )}

          <div className="card stack">
            <span className="label">Einkaufsliste</span>
            <button type="button" className="btn btn-soft btn-block" onClick={() => { void copyShoppingList() }}>
              {format === 'bring' ? (
                <><IconCart /> Zu Bring! hinzufügen</>
              ) : copied ? (
                <><IconCheck /> Kopiert!</>
              ) : (
                <><IconCopy /> Zutaten kopieren</>
              )}
            </button>
            {format === 'checklist' && (
              <span className="muted small">
                Apple Notes: einfügen → alles markieren → Checklisten-Button (⊙) tippen ergibt eine echte Checkliste.
              </span>
            )}
            <span className="muted small">
              Format: {SHOPPING_FORMAT_LABEL[format]} · <Link to="/accounts">in Einstellungen ändern</Link>
            </span>
          </div>

          <div className="card pad-lg stack">
            <span className="label">Wie viel möchtest du tracken?</span>
            <div className="seg" role="group" aria-label="Portionsanteil">
              {FACTORS.map((f) => (
                <button key={f.label} type="button" aria-pressed={Math.abs(factor - f.value) < 0.001} onClick={() => setFactor(f.value)}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="field">
              <label htmlFor="custom-factor">Eigener Faktor (×)</label>
              <input
                id="custom-factor"
                type="number"
                inputMode="decimal"
                step="0.25"
                min="0"
                value={round2(factor)}
                onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) setFactor(v) }}
                style={{ width: '8rem' }}
              />
            </div>
            {recipe.servings != null && (
              <span className="muted">
                ≈ {round2(recipe.servings * factor)} {Math.abs(recipe.servings * factor - 1) < 0.001 ? 'Portion' : 'Portionen'}
              </span>
            )}
            <button type="button" className="btn btn-primary btn-block" onClick={track}>
              <IconBowl /> In den Tracker übernehmen
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
