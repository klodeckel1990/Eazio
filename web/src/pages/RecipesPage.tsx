import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { RecipeSummary } from '../api/types'
import { IconBook, IconClock, IconHeart, IconHeartFilled, IconWand } from '../components/icons'

const DIFF_LABEL: Record<string, string> = { einfach: 'EINFACH', mittel: 'MITTEL', schwer: 'SCHWER' }

export function RecipesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null)
  const [query, setQuery] = useState('')
  const [favOnly, setFavOnly] = useState(false)

  useEffect(() => {
    // A shared/shortcut link lands on /recipes?import=… → forward to the Import tab.
    const imp = searchParams.get('import')
    const impText = searchParams.get('import_text')
    if (imp) {
      navigate(`/import?import=${encodeURIComponent(imp)}`, { replace: true })
      return
    }
    if (impText) {
      navigate(`/import?import_text=${encodeURIComponent(impText)}`, { replace: true })
      return
    }
    api.recipes.list().then(setRecipes).catch(() => setRecipes([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleFav = async (r: RecipeSummary) => {
    const next = !r.isFavorite
    setRecipes((list) => (list ? list.map((x) => (x.id === r.id ? { ...x, isFavorite: next } : x)) : list))
    try {
      await api.recipes.setFavorite(r.id, next)
    } catch {
      /* keep optimistic state */
    }
  }

  const q = query.trim().toLowerCase()
  const visible = (recipes ?? [])
    .filter((r) => !favOnly || r.isFavorite)
    .filter((r) => r.title.toLowerCase().includes(q))

  const open = (id: string) => navigate(`/recipes/${id}`)

  return (
    <div className="page">
      <header className="page-head">
        <h1>Gespeicherte Rezepte</h1>
        <span className="sub">Deine kuratierte Sammlung köstlicher Momente.</span>
      </header>

      {recipes && recipes.length > 0 && (
        <div className="rec-toolbar">
          <input
            className="search"
            type="search"
            placeholder="Rezepte suchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className={`btn btn-icon ${favOnly ? 'btn-primary' : 'btn-ghost'}`}
            aria-pressed={favOnly}
            aria-label="Nur Favoriten"
            title="Nur Favoriten"
            onClick={() => setFavOnly((v) => !v)}
          >
            {favOnly ? <IconHeartFilled /> : <IconHeart />}
          </button>
        </div>
      )}

      {recipes === null ? (
        <p className="loading-inline"><span className="spinner" /> Lade Rezepte…</p>
      ) : recipes.length === 0 ? (
        <div className="empty">
          <span className="emoji"><IconBook /></span>
          <h3>Noch keine Rezepte</h3>
          <p>Importiere dein erstes Rezept aus einem Link oder per eingefügtem Text.</p>
          <Link to="/import" className="btn btn-primary" style={{ marginTop: '0.4rem' }}><IconWand /> Rezept importieren</Link>
        </div>
      ) : visible.length === 0 ? (
        <p className="muted">Keine Treffer.</p>
      ) : (
        <div className="recipe-grid">
          {visible.map((r) => (
            <div
              key={r.id}
              className="recipe-card"
              role="button"
              tabIndex={0}
              onClick={() => open(r.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') open(r.id) }}
            >
              <div className="thumb">
                {r.hasImage ? (
                  <img src={api.recipes.imageUrl(r.id)} alt="" loading="lazy" />
                ) : (
                  <span className="thumb-ph"><IconBook /></span>
                )}
                {r.difficulty && <span className="diff-badge">{DIFF_LABEL[r.difficulty] ?? r.difficulty.toUpperCase()}</span>}
                <button
                  type="button"
                  className="fav-btn"
                  aria-pressed={r.isFavorite}
                  aria-label={r.isFavorite ? 'Favorit entfernen' : 'Zu Favoriten'}
                  onClick={(e) => { e.stopPropagation(); void toggleFav(r) }}
                >
                  {r.isFavorite ? <IconHeartFilled /> : <IconHeart />}
                </button>
              </div>
              <div className="rc-body">
                <span className="rc-title">{r.title}</span>
                {r.totalMinutes != null && (
                  <span className="rc-time"><IconClock /> {r.totalMinutes} Min.</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
