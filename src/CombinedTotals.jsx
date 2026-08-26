import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

function hoursBetween(start, end, agencyId) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  const isStandardFZ2Shift = agencyId === 'fz2' && start === '08:00' && end === '19:00'
  if (isStandardFZ2Shift) mins -= 120
  return mins / 60
}
function fmtHours(h) {
  const rounded = Math.round(h * 10) / 10
  return rounded % 1 === 0 ? `${rounded}h` : `${rounded.toFixed(1)}h`
}
function toISODate(d) {
  return d.toISOString().slice(0, 10)
}

export default function CombinedTotals({ weekStart, onClose }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const wk = toISODate(weekStart)

      const { data: links } = await supabase.from('agent_agencies').select('*')
      const { data: agents } = await supabase.from('agents').select('*')
      const { data: agencies } = await supabase.from('agencies').select('*')
      const { data: shifts } = await supabase.from('shifts').select('*').eq('week_start', wk)

      // Ne garder que les agents présents sur au moins 2 agences
      const agentAgencyCount = {}
      ;(links || []).forEach((l) => {
        agentAgencyCount[l.agent_id] = (agentAgencyCount[l.agent_id] || 0) + 1
      })
      const multiAgencyIds = Object.keys(agentAgencyCount).filter((id) => agentAgencyCount[id] > 1)

      const result = multiAgencyIds.map((agentId) => {
        const agent = (agents || []).find((a) => a.id === agentId)
        const agentLinks = (links || []).filter((l) => l.agent_id === agentId)
        const perAgency = agentLinks.map((l) => {
          const ag = (agencies || []).find((a) => a.id === l.agency_id)
          const agentShifts = (shifts || []).filter((s) => s.agent_id === agentId && s.agency_id === l.agency_id && s.shift_type === 'travail')
          const hours = agentShifts.reduce((sum, s) => sum + hoursBetween(s.start_time, s.end_time, s.agency_id), 0)
          return { agencyName: ag?.name || l.agency_id, hours }
        })
        const totalHours = perAgency.reduce((sum, p) => sum + p.hours, 0)
        return { name: agent?.name || 'Inconnu', perAgency, totalHours }
      })

      setRows(result)
      setLoading(false)
    })()
  }, [weekStart])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 480, maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Total combiné (agents sur plusieurs stations)</div>
          <button onClick={onClose} style={{ fontSize: 12, padding: '6px 10px' }}>Fermer</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#9b9a8f' }}>Calcul en cours…</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#9b9a8f', fontSize: 13 }}>
            Aucun agent n'est actuellement rattaché à plusieurs stations.
          </div>
        ) : (
          rows.map((r, i) => (
            <div key={i} style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #ebe9e2' }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{r.name}</div>
              {r.perAgency.map((p, j) => (
                <div key={j} style={{ fontSize: 12, color: '#6b6a60', display: 'flex', justifyContent: 'space-between', maxWidth: 260 }}>
                  <span>{p.agencyName}</span>
                  <span>{fmtHours(p.hours)}</span>
                </div>
              ))}
              <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>Total : {fmtHours(r.totalHours)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
