import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

// Structure standard attendue (à ajuster une fois le vrai fichier disponible) :
// une ligne par jour (et optionnellement par créneau), avec une colonne "Date" et
// une colonne "Reservations" indiquant le volume prévu.
// Colonnes reconnues (insensible à la casse, plusieurs variantes acceptées) :
//   Date | date
//   Creneau | Time Slot | Horaire  (optionnel)
//   Reservations | Nombre de reservations | Volume

function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary' })
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

function findValue(row, candidates) {
  const keys = Object.keys(row)
  for (const candidate of candidates) {
    const match = keys.find((k) => k.toLowerCase().trim() === candidate.toLowerCase())
    if (match) return row[match]
  }
  return null
}

function excelDateToISO(value) {
  if (!value) return null
  if (typeof value === 'string') {
    // Essaie de parser une date texte (ex: "2026-08-24" ou "24/08/2026")
    const d = new Date(value)
    if (!isNaN(d)) return d.toISOString().slice(0, 10)
    return null
  }
  if (typeof value === 'number') {
    // Date sérielle Excel
    const date = XLSX.SSF.parse_date_code(value)
    if (!date) return null
    const mm = String(date.m).padStart(2, '0')
    const dd = String(date.d).padStart(2, '0')
    return `${date.y}-${mm}-${dd}`
  }
  return null
}

export default function ReservationImport({ agency, onClose }) {
  const [step, setStep] = useState('upload') // upload | preview | done
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

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
      const normalized = raw.map((r) => {
        const dateValue = findValue(r, ['date'])
        const slot = findValue(r, ['creneau', 'time slot', 'horaire', 'créneau'])
        const count = findValue(r, ['reservations', 'nombre de reservations', 'volume', 'réservations'])
        return {
          date: excelDateToISO(dateValue),
          time_slot: slot || null,
          reservation_count: Number(count) || 0,
        }
      }).filter((r) => r.date)

      if (normalized.length === 0) {
        setError('Aucune ligne valide trouvée. Vérifiez que le fichier contient bien une colonne "Date" et une colonne "Reservations".')
        return
      }

      setRows(normalized)
      setStep('preview')
    } catch (err) {
      console.error(err)
      setError('Erreur lors de la lecture du fichier.')
    }
  }

  const save = async () => {
    setSaving(true)
    const toInsert = rows.map((r) => ({ ...r, agency_id: agency }))
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
              Format attendu : une ligne par jour (ou par créneau), avec au minimum une colonne <strong>Date</strong> et
              une colonne <strong>Reservations</strong> (nombre prévu). Une colonne optionnelle <strong>Créneau</strong> permet
              de préciser une tranche horaire (ex: "08:00-10:00").
            </p>
            <p style={{ fontSize: 12, color: '#c88a3e', marginBottom: 12 }}>
              ⚠️ Structure provisoire : à ajuster une fois le vrai fichier d'export disponible.
            </p>
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ fontSize: 13 }} />
          </div>
        )}

        {step === 'preview' && (
          <div>
            <p style={{ fontSize: 13, color: '#6b6a60', marginBottom: 12 }}>{rows.length} ligne(s) trouvée(s).</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #ebe9e2', color: '#9b9a8f', fontSize: 12 }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #ebe9e2', color: '#9b9a8f', fontSize: 12 }}>Créneau</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid #ebe9e2', color: '#9b9a8f', fontSize: 12 }}>Réservations</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f5f4f0' }}>{r.date}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f5f4f0' }}>{r.time_slot || '—'}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f5f4f0', textAlign: 'center' }}>{r.reservation_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 20 && <p style={{ fontSize: 12, color: '#9b9a8f' }}>… et {rows.length - 20} autre(s) ligne(s).</p>}
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
