import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

// Seules ces 3 colonnes du fichier Avis sont utilisées, le reste est ignoré :
//   Checkout date, Checkout time, Check Out Station
// Seul le départ (Checkout) génère de la charge pour la station concernée.

// Correspondance entre le nom de station tel qu'il apparaît dans le fichier Avis,
// et l'identifiant d'agence utilisé dans l'application.
const STATION_MAP = {
  'FES APT': 'fez',
  'FES DT  MA': 'fz2',
  'FES DT MA': 'fz2', // variante avec un seul espace, au cas où
}

// Règle de découpage en shift, spécifique à chaque station.
// FEZ a deux shifts (Matin / Soir) séparés à 16h00.
// FZ2 n'a qu'un seul shift (Journée), peu importe l'heure du Checkout.
function shiftForCheckout(agencyId, timeStr) {
  if (agencyId === 'fez') {
    const hour = parseInt((timeStr || '00:00:00').split(':')[0], 10)
    return hour < 16 ? 'Matin' : 'Soir'
  }
  return 'Journée'
}

function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: null })
        resolve(rows)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsBinaryString(file)
  })
}

function toISODate(dateValue) {
  if (!dateValue) return null
  if (dateValue instanceof Date) {
    const y = dateValue.getFullYear()
    const m = String(dateValue.getMonth() + 1).padStart(2, '0')
    const d = String(dateValue.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const d = new Date(dateValue)
  if (!isNaN(d)) return d.toISOString().slice(0, 10)
  return null
}

export default function ReservationImport({ agency, onClose }) {
  const [step, setStep] = useState('upload') // upload | preview | done
  const [summary, setSummary] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [skippedCount, setSkippedCount] = useState(0)

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setError('')
    try {
      const raw = await parseExcelFile(file)
      if (raw.length === 0) {
        setError('Le fichier semble vide.')
        return
      }

      let skipped = 0
      const counts = {} // clé "date|shift" -> nombre de réservations, uniquement pour l'agence choisie

      raw.forEach((r) => {
        const stationRaw = (r['Check Out Station'] || '').toString().trim()
        const agencyId = STATION_MAP[stationRaw]
        if (agencyId !== agency) return // on ne garde que les réservations de la station sélectionnée

        const date = toISODate(r['Checkout date'])
        const time = r['Checkout time']
        if (!date) { skipped++; return }

        const shift = shiftForCheckout(agencyId, time)
        const key = `${date}|${shift}`
        counts[key] = (counts[key] || 0) + 1
      })

      const result = Object.entries(counts)
        .map(([key, count]) => {
          const [date, shift] = key.split('|')
          return { date, shift, count }
        })
        .sort((a, b) => a.date.localeCompare(b.date) || a.shift.localeCompare(b.shift))

      if (result.length === 0) {
        setError('Aucune réservation trouvée pour cette agence dans le fichier. Vérifiez que le fichier correspond bien à la bonne station.')
        return
      }

      setSkippedCount(skipped)
      setSummary(result)
      setStep('preview')
    } catch (err) {
      console.error(err)
      setError('Erreur lors de la lecture du fichier.')
    }
  }

  const save = async () => {
    setSaving(true)
    const toInsert = summary.map((r) => ({
      agency_id: agency,
      date: r.date,
      time_slot: r.shift,
      reservation_count: r.count,
    }))
    const { error: insertError } = await supabase
      .from('reservation_imports').upsert(toInsert, { onConflict: 'agency_id,date,time_slot' })
    setSaving(false)
    if (insertError) {
      setError('Erreur lors de l\'enregistrement : ' + insertError.message)
    } else {
      setStep('done')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 560, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Importer les réservations prévues</div>
          <button onClick={onClose} style={{ fontSize: 12, padding: '6px 10px' }}>Fermer</button>
        </div>

        {error && <div style={{ color: '#c15c5c', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {step === 'upload' && (
          <div>
            <p style={{ fontSize: 13, color: '#6b6a60', marginBottom: 12 }}>
              Importez l'export de réservations du système Avis. Seules les colonnes <strong>Checkout date</strong>,{' '}
              <strong>Checkout time</strong> et <strong>Check Out Station</strong> sont utilisées ; le reste du fichier
              est ignoré. Seules les réservations de l'agence actuellement sélectionnée sont prises en compte.
            </p>
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ fontSize: 13 }} />
          </div>
        )}

        {step === 'preview' && (
          <div>
            <p style={{ fontSize: 13, color: '#6b6a60', marginBottom: 12 }}>
              {summary.length} ligne(s) de charge calculée(s) (par jour et par shift).
              {skippedCount > 0 && ` ${skippedCount} ligne(s) ignorée(s) car sans date exploitable.`}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #ebe9e2', color: '#9b9a8f', fontSize: 12 }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #ebe9e2', color: '#9b9a8f', fontSize: 12 }}>Shift</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid #ebe9e2', color: '#9b9a8f', fontSize: 12 }}>Réservations</th>
                </tr>
              </thead>
              <tbody>
                {summary.slice(0, 25).map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f5f4f0' }}>{r.date}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f5f4f0' }}>{r.shift}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f5f4f0', textAlign: 'center' }}>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {summary.length > 25 && <p style={{ fontSize: 12, color: '#9b9a8f' }}>… et {summary.length - 25} autre(s) ligne(s).</p>}
            <button onClick={save} disabled={saving} style={{ fontSize: 13, padding: '8px 14px', background: '#d81f26', color: '#fff', border: 'none' }}>
              {saving ? 'Enregistrement…' : 'Enregistrer ces réservations'}
            </button>
          </div>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 14, color: '#5f8f5f', marginBottom: 12 }}>✓ Réservations enregistrées.</div>
            <button onClick={onClose} style={{ fontSize: 13, padding: '8px 14px' }}>Fermer</button>
          </div>
        )}
      </div>
    </div>
  )
}
