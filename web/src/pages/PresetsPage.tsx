import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { Preset } from '../api/types'

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
    <div className="container">
      <h2>Presets</h2>

      {error && <p className="error">{error}</p>}

      {presets === null ? (
        <p>Lade Presets…</p>
      ) : presets.length === 0 ? (
        <p className="muted">Noch keine Presets.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {presets.map(preset => (
            <li key={preset.id} style={{ marginBottom: '0.75rem' }}>
              <strong>{preset.name}</strong>
              <button
                type="button"
                onClick={() => { void handleLoad(preset.id) }}
                style={{ marginLeft: '0.75rem' }}
              >
                Im Tracker laden
              </button>
              <button
                type="button"
                onClick={() => { void handleRemove(preset.id) }}
                style={{ marginLeft: '0.5rem' }}
              >
                Löschen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
