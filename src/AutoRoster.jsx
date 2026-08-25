import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

function getMonday(d) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}
function toISODate(d) {
  return d.toISOString().slice(0, 10)
}

export default function AutoRoster({ agency, weekStart, onClose, onApplied }) {
  const [step, setStep] = useState('confirm') // confirm | generating | done
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

    // Récupérer les derniers scores de performance connus pour ces agents
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

    const assignments = [] // { agentId, dayIndex, shiftData }
    const isFEZ = agency === 'fez'

    if (isFEZ && ranked.length >= 3) {
      // Rotation Matin / Soir / Repos sur les agents, décalée chaque jour
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
      // FZ2 ou moins de 3 agents : horaire fixe 08h-19h, avec un jour de repos en rotation
      for (let day = 0; day < 7; day++) {
        ranked.forEach((agent, idx) => {
          const restDay = idx % 7
          if (day === restDay) {
            assignments.push({ agentId: agent.id, dayIndex: day, shiftData: { shift_type: 'repos' } })
          } else {
            assignments.push({ agentId: agent.id, dayIndex: day, shiftData: { shift_type: 'travail', start_time: '08:00', end_time: '19:00' } })
          }
        })
      }
    }

    setPreview({ ranked, assignments, assistants: people.filter((p) => p.is_assistant) })
    setStep('preview')
  }

  const applyRoster = async () => {
    setStep('generating')
    const wk = toISODate(weekStart)

    // Supprimer les shifts existants de la semaine pour cette agence avant d'appliquer la proposition
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
              ⚠️ Cette action va <strong>effacer tous les shifts existants</strong> de cette agence pour la semaine affichée, et les remplacer par une proposition automatique basée sur les derniers scores de performance importés.
            </div>
            <p style={{ fontSize: 13, color: '#6b6a60', marginBottom: 16 }}>
              Version simplifiée : les agents sont classés par score de performance, puis répartis en rotation
              (Matin / Soir / Repos pour un aéroport avec 3+ agents, ou horaire fixe + 1 jour de repos par semaine sinon).
              Les règles spécifiques par agent (jours de repos fixes, etc.) ne sont pas encore prises en compte —
              vous pourrez ajuster manuellement après génération.
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
                Les {preview.assistants.length} assistant(s) ne sont pas inclus dans cette génération automatique — à planifier manuellement.
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
