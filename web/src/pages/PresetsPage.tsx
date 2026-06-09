import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { Preset } from '../api/types'
import { IconBookmark, IconTrash, IconAlert } from '../components/icons'

export function PresetsPage() {
  const [presets, setPresets] = useState<Preset[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const loadPresets = () => {
    api.presets.list()
      .then(setPresets)
      .catch(err => {
        if (err instanceof ApiError) {
          setError(err.message)
        } else {
          throw err
        }
      })
  }

  useEffect(() => {
    loadPresets()
  }, [])

  const handleLoad = async (id: string) => {
    try {
      const p = await api.presets.get(id)
      const presetText = p.items.map(i => i.rawText).join('\n')
      void navigate('/', { state: { presetText } })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        throw err
      }
    }
  }

  const handleRemove = async (id: string) => {
    try {
      await api.presets.remove(id)
      loadPresets()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        throw err
      }
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Presets</h1>
        <span className="sub">Gespeicherte Zutatenlisten – mit einem Tipp in den Tracker.</span>
      </header>

      {error && (
        <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>
      )}

      {presets === null ? (
        <p className="loading-inline"><span className="spinner" /> Lade Presets…</p>
      ) : presets.length === 0 ? (
        <div className="empty">
          <span className="emoji"><IconBookmark /></span>
          <h3>Noch keine Presets</h3>
          <p>Speichere im Tracker eine Zutatenliste als Preset – sie erscheint dann hier.</p>
        </div>
      ) : (
        <ul className="list">
          {presets.map(preset => (
            <li key={preset.id}>
              <div className="row-card">
                <span className="row-icon alt"><IconBookmark /></span>
                <div className="row-main">
                  <div className="row-title"><span className="text">{preset.name}</span></div>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => { void handleLoad(preset.id) }}
                  >
                    Im Tracker laden
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-danger"
                    onClick={() => { void handleRemove(preset.id) }}
                    aria-label={`${preset.name} löschen`}
                    title="Löschen"
                  >
                    <IconTrash />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
