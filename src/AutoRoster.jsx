import { useState } from 'react'
import { supabase } from './supabaseClient'

function toISODate(d) {
  return d.toISOString().slice(0, 10)
}
function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export default function AutoRoster({ agency, weekStart, onClose, onApplied }) {
  const [step, setStep] = useState('confirm')
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')

  const buildAndPreview = async () => {
    setError('')
    setStep('generating')

    const { data: people } = await supabase.from('agents').select('*').eq('agency_id', agency)
    if (!people || people.length === 0) {
      setError('Aucun agent trouvé pour cette agence.')
      setStep('confirm')
      return
    }

    const { data: mappings } = await supabase.from('agent_id_mapping').select('*')
    const coIds = (mappings || []).filter((m) => people.some((p) => p.id === m.agent_id)).map((m) => m.co_agent_id)
    const { data: perf } = coIds.length > 0
      ? await supabase.from('performance_imports').select('*').in('co_agent_id', coIds)
      : { data: [] }

    const latestScoreFor = (agentId) => {
      const mapping = (mappings || []).find((m) => m.agent_id === agentId)
      if (!mapping) return null
      const records = (perf || []).filter((p) => p.co_agent_id === mapping.co_agent_id)
      if (records.length === 0) return null
      const latest = records.sort((a, b) => new Date(b.imported_at) - new Date(a.imported_at))[0]
      return latest.score
    }

    const agentsOnly = people.filter((p) => !p.is_assistant)
    const ranked = agentsOnly
      .map((p) => ({ ...p, score: latestScoreFor(p.id) }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

    // Récupérer les réservations prévues pour cette agence, sur les 7 jours de la semaine affichée
    const weekDates = Array.from({ length: 7 }, (_, i) => toISODate(addDays(weekStart, i)))
    const { data: reservations } = await supabase
      .from('reservation_imports').select('*').eq('agency_id', agency).in('date', weekDates)

    const hasReservationData = (reservations || []).length > 0
    const loadByDay = weekDates.map((date) =>
      (reservations || []).filter((r) => r.date === date).reduce((sum, r) => sum + (r.reservation_count || 0), 0)
    )
    // Classement des jours du plus chargé au moins chargé (utilisé seulement si on a des données)
    const dayOrder = loadByDay
      .map((load, idx) => ({ idx, load }))
      .sort((a, b) => b.load - a.load)
      .map((d) => d.idx)

    const assignments = []
    const isFEZ = agency === 'fez'

    if (isFEZ && ranked.length >= 3) {
      for (let day = 0; day < 7; day++) {
        ranked.forEach((agent, idx) => {
          const slot = (idx + day) % 3
          if (slot === 0) {
            assignments.push({ agentId: agent.id, dayIndex: day, shiftData: { shift_type: 'travail', start_time: '08:00', end_time: '16:00' } })
          } else if (slot === 1) {
            assignments.push({ agentId: agent.id, dayIndex: day, shiftData: { shift_type: 'travail', start_time: '16:00', end_time: '00:00' } })
          } else {
            assignments.push({ agentId: agent.id, dayIndex: day, shiftData: { shift_type: 'repos' } })
          }
        })
      }
    } else {
      // Sans données de réservation : un jour de repos fixe par agent, en rotation simple.
      // Avec des données de réservation : le meilleur agent se voit attribuer le jour de repos
      // le MOINS chargé (pour qu'il soit présent sur les jours qui comptent le plus).
      ranked.forEach((agent, idx) => {
        const restDay = hasReservationData
          ? dayOrder[6 - (idx % 7)] // jour le moins chargé en dernier de la liste triée
          : idx % 7
        for (let day = 0; day < 7; day++) {
          if (day === restDay) {
            assignments.push({ agentId: agent.id, dayIndex: day, shiftData: { shift_type: 'repos' } })
          } else {
            assignments.push({ agentId: agent.id, dayIndex: day, shiftData: { shift_type: 'travail', start_time: '08:00', end_time: '19:00' } })
          }
        }
      })
    }

    setPreview({ ranked, assignments, assistants: people.filter((p) => p.is_assistant), hasReservationData, loadByDay })
    setStep('preview')
  }

  const applyRoster = async () => {
    setStep('generating')
    const wk = toISODate(weekStart)
    await supabase.from('shifts').delete().eq('agency_id', agency).eq('week_start', wk)

    const rows = preview.assignments.map((a) => ({
      agency_id: agency,
      agent_id: a.agentId,
      week_start: wk,
      day_index: a.dayIndex,
      ...a.shiftData,
    }))

    const { error: insertError } = await supabase.from('shifts').insert(rows)
    if (insertError) {
      setError('Erreur lors de l\'application : ' + insertError.message)
      setStep('preview')
      return
    }
    setStep('done')
    onApplied()
  }

  const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 560, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Générer le planning automatiquement</div>
          <button onClick={onClose} style={{ fontSize: 12, padding: '6px 10px' }}>Fermer</button>
        </div>

        {error && <div style={{ color: '#c15c5c', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {step === 'confirm' && (
          <div>
            <div style={{ background: '#fcebeb', border: '1px solid #f0c4c4', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#791f1f' }}>
              ⚠️ Cette action va <strong>effacer tous les shifts existants</strong> de cette agence pour la semaine affichée, et les remplacer par une proposition automatique.
            </div>
            <p style={{ fontSize: 13, color: '#6b6a60', marginBottom: 16 }}>
              Les agents sont classés par score de performance. Si des réservations ont été importées pour cette semaine,
              les meilleurs agents sont positionnés en priorité sur les jours les plus chargés. Sans données de réservation,
              la répartition se fait en rotation simple.
            </p>
            <button onClick={buildAndPreview} style={{ fontSize: 13, padding: '8px 14px', background: '#d81f26', color: '#fff', border: 'none' }}>
              Voir la proposition
            </button>
          </div>
        )}

        {step === 'generating' && (
          <div style={{ textAlign: 'center', padding: 30, color: '#9b9a8f' }}>Calcul en cours…</div>
        )}

        {step === 'preview' && preview && (
          <div>
            {preview.hasReservationData ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Charge de réservation prévue :</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {DAYS_SHORT.map((d, i) => (
                    <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11 }}>
                      <div style={{ color: '#9b9a8f' }}>{d}</div>
                      <div style={{ fontWeight: 500 }}>{preview.loadByDay[i]}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: '#c88a3e', marginBottom: 16 }}>
                ⚠️ Aucune donnée de réservation trouvée pour cette semaine — répartition en rotation simple, sans priorisation par charge.
              </p>
            )}
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Classement utilisé (par score de performance) :</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #ebe9e2', color: '#9b9a8f', fontSize: 12 }}>Agent</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid #ebe9e2', color: '#9b9a8f', fontSize: 12 }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {preview.ranked.map((a) => (
                  <tr key={a.id}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f5f4f0' }}>{a.name}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f5f4f0', textAlign: 'center' }}>
                      {a.score !== null ? `${a.score}%` : <span style={{ color: '#c9c6ba' }}>Aucune donnée</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.assistants.length > 0 && (
              <p style={{ fontSize: 12, color: '#9b9a8f', marginBottom: 16 }}>
                Les {preview.assistants.length} assistant(s) ne sont pas inclus dans cette génération automatique.
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={applyRoster} style={{ fontSize: 13, padding: '8px 14px', background: '#d81f26', color: '#fff', border: 'none' }}>
                Appliquer ce planning
              </button>
              <button onClick={() => setStep('confirm')} style={{ fontSize: 13, padding: '8px 14px' }}>Annuler</button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 14, color: '#5f8f5f', marginBottom: 12 }}>✓ Planning appliqué avec succès.</div>
            <button onClick={onClose} style={{ fontSize: 13, padding: '8px 14px' }}>Fermer</button>
          </div>
        )}
      </div>
    </div>
  )
}
