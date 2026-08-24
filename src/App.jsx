import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'

const WORK_SHIFTS = {
  fez: {
    matin: { label: 'Matin', hours: '08h-16h', color: '#BA7517', bg: '#FAEEDA', fg: '#633806' },
    soir: { label: 'Soir', hours: '16h-00h', color: '#534AB7', bg: '#EEEDFE', fg: '#3C3489' },
  },
  fz2: {
    journee: { label: 'Journée', hours: '08h-19h', color: '#0F6E56', bg: '#E1F5EE', fg: '#085041' },
  },
}
const ABSENCE_SHIFTS = {
  repos: { label: 'Repos', hours: '', color: '#888780', bg: '#F1EFE8', fg: '#444441' },
  recup: { label: 'Récup.', hours: '', color: '#185FA5', bg: '#E6F1FB', fg: '#0C447C' },
  conge: { label: 'Congé', hours: '', color: '#A32D2D', bg: '#FCEBEB', fg: '#791F1F' },
}
const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function getMonday(d) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}
function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function fmtDate(d) {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}
function toISODate(d) {
  return d.toISOString().slice(0, 10)
}
function allShiftsFor(agencyId) {
  return { ...WORK_SHIFTS[agencyId], ...ABSENCE_SHIFTS }
}

function Avatar({ name, size = 28 }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: '#e6f1fb', color: '#0c447c',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 500, flexShrink: 0,
    }}>{initials}</div>
  )
}

export default function App() {
  const [agencies, setAgencies] = useState([])
  const [agency, setAgency] = useState('fez')
  const [role, setRole] = useState('chef')
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))
  const [agents, setAgents] = useState([])
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState('')

  const readonly = role === 'agent'
  const shiftDefs = allShiftsFor(agency)
  const workKeys = Object.keys(WORK_SHIFTS[agency] || {})
  const absenceKeys = Object.keys(ABSENCE_SHIFTS)

  useEffect(() => {
    supabase.from('agencies').select('*').then(({ data }) => {
      if (data) setAgencies(data)
    })
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: agentData } = await supabase
      .from('agents').select('*').eq('agency_id', agency).order('created_at')
    setAgents(agentData || [])

    const { data: shiftData } = await supabase
      .from('shifts').select('*').eq('agency_id', agency).eq('week_start', toISODate(weekStart))
    setShifts(shiftData || [])
    setLoading(false)
  }, [agency, weekStart])

  useEffect(() => { loadData() }, [loadData])

  // Mises à jour en temps réel : si un autre chef d'agence modifie le planning, ça se met à jour ici aussi
  useEffect(() => {
    const channel = supabase
      .channel('shifts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, () => {
        loadData()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadData])

  const cellShifts = (agentId, dayIndex) =>
    shifts.filter((s) => s.agent_id === agentId && s.day_index === dayIndex)

  const addShift = async (agentId, dayIndex, shiftType) => {
    if (!shiftType) return
    setSaveStatus('Enregistrement…')
    const { error } = await supabase.from('shifts').insert({
      agency_id: agency, agent_id: agentId, week_start: toISODate(weekStart),
      day_index: dayIndex, shift_type: shiftType,
    })
    setSaveStatus(error ? 'Échec' : 'Enregistré')
    setTimeout(() => setSaveStatus(''), 1500)
    loadData()
  }

  const removeShift = async (shiftId) => {
    setSaveStatus('Enregistrement…')
    await supabase.from('shifts').delete().eq('id', shiftId)
    setSaveStatus('Enregistré')
    setTimeout(() => setSaveStatus(''), 1500)
    loadData()
  }

  const addAgent = async () => {
    const name = window.prompt("Nom du nouvel agent :")
    if (name && name.trim()) {
      await supabase.from('agents').insert({ agency_id: agency, name: name.trim() })
      loadData()
    }
  }

  const removeAgent = async (agentId, name) => {
    if (!window.confirm(`Retirer ${name} de la liste des agents ?`)) return
    await supabase.from('agents').delete().eq('id', agentId)
    loadData()
  }

  const agencyName = agencies.find((a) => a.id === agency)?.name || ''

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{
        width: 220, flexShrink: 0, background: '#1a1a18', color: '#e8e7e0',
        display: 'flex', flexDirection: 'column', padding: '20px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, padding: '0 6px' }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: '#d85a30',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 500, fontSize: 14, color: '#fff',
          }}>A</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#fff' }}>Avis Fès</div>
        </div>

        <div style={{ fontSize: 11, color: '#8a8980', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 8px', marginBottom: 6 }}>
          Agence
        </div>
        <select
          value={agency}
          onChange={(e) => setAgency(e.target.value)}
          style={{
            width: '100%', marginBottom: 20, background: '#2a2a26', color: '#fff',
            border: '0.5px solid #3d3d38', borderRadius: 8, padding: '8px 10px', fontSize: 13,
          }}
        >
          {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <div style={{ fontSize: 11, color: '#8a8980', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 8px', marginBottom: 6 }}>
          Mode
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{
            width: '100%', background: '#2a2a26', color: '#fff',
            border: '0.5px solid #3d3d38', borderRadius: 8, padding: '8px 10px', fontSize: 13,
          }}
        >
          <option value="chef">Chef d'agence (modifier)</option>
          <option value="agent">Agent (consultation)</option>
        </select>

        <div style={{ marginTop: 'auto', fontSize: 11, color: '#6f6e65', padding: '0 8px' }}>{saveStatus || '\u00A0'}</div>
      </div>

      <div style={{ flex: 1, minWidth: 0, background: '#f5f4f0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px', borderBottom: '0.5px solid #e2e0d8', flexWrap: 'wrap', gap: 12, background: '#fff',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{agencyName}</div>
            <div style={{ fontSize: 13, color: '#6b6a60' }}>
              Semaine du {fmtDate(weekStart)} au {fmtDate(addDays(weekStart, 6))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setWeekStart(addDays(weekStart, -7))}>&larr; Préc.</button>
            <button onClick={() => setWeekStart(getMonday(new Date()))}>Aujourd'hui</button>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))}>Suiv. &rarr;</button>
          </div>
        </div>

        {readonly && (
          <div style={{
            margin: '16px 24px 0', background: '#e6f1fb', color: '#0c447c',
            border: '0.5px solid #85b7eb', padding: '8px 14px', borderRadius: 8, fontSize: 13,
          }}>
            Mode consultation. Vous visualisez le planning sans pouvoir le modifier.
          </div>
        )}

        <div style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6b6a60', marginBottom: 16, flexWrap: 'wrap' }}>
            {Object.entries(shiftDefs).map(([k, s]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} />
                {s.label}{s.hours ? ` (${s.hours})` : ''}
              </span>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#6b6a60' }}>Chargement…</div>
          ) : agents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#6b6a60' }}>Aucun agent pour cette agence.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%', background: '#fff', borderRadius: 12, overflow: 'hidden',
                border: '0.5px solid #e2e0d8', fontSize: 13,
              }}>
                <thead>
                  <tr>
                    <th style={{ border: '0.5px solid #e2e0d8', padding: 10, background: '#eeece4', fontSize: 12, color: '#6b6a60', textAlign: 'left', minWidth: 150 }}>Agent</th>
                    {DAYS_SHORT.map((d, i) => (
                      <th key={d} style={{ border: '0.5px solid #e2e0d8', padding: 10, background: '#eeece4', fontSize: 12, color: '#6b6a60', textAlign: 'center', minWidth: 100 }}>
                        {d}<br />{fmtDate(addDays(weekStart, i))}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => (
                    <tr key={agent.id}>
                      <td style={{ border: '0.5px solid #e2e0d8', padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={agent.name} />
                          <span style={{ fontWeight: 500 }}>{agent.name}</span>
                          {!readonly && (
                            <span onClick={() => removeAgent(agent.id, agent.name)} style={{ cursor: 'pointer', color: '#a32d2d', fontSize: 11, marginLeft: 2 }}>✕</span>
                          )}
                        </div>
                      </td>
                      {DAYS_SHORT.map((_, d) => {
                        const cell = cellShifts(agent.id, d)
                        return (
                          <td key={d} style={{ border: '0.5px solid #e2e0d8', padding: 6, verticalAlign: 'top' }}>
                            {cell.map((s) => {
                              const def = shiftDefs[s.shift_type]
                              if (!def) return null
                              return (
                                <div key={s.id} style={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4,
                                  fontSize: 12, padding: '5px 7px', borderRadius: 6, marginBottom: 4,
                                  background: def.bg, color: def.fg,
                                }}>
                                  <span>{def.label}</span>
                                  {!readonly && (
                                    <span onClick={() => removeShift(s.id)} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 11 }}>✕</span>
                                  )}
                                </div>
                              )
                            })}
                            {cell.length === 0 && readonly && (
                              <div style={{ textAlign: 'center', color: '#9b9a8f', fontSize: 12, padding: '8px 0' }}>—</div>
                            )}
                            {!readonly && (
                              <select value="" onChange={(e) => addShift(agent.id, d, e.target.value)} style={{ width: '100%', fontSize: 11, padding: 4 }}>
                                <option value="">+ shift</option>
                                <optgroup label="Travail">
                                  {workKeys.map((k) => <option key={k} value={k}>{shiftDefs[k].label}</option>)}
                                </optgroup>
                                <optgroup label="Absence">
                                  {absenceKeys.map((k) => <option key={k} value={k}>{shiftDefs[k].label}</option>)}
                                </optgroup>
                              </select>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!readonly && (
            <div style={{ marginTop: 14 }}>
              <button onClick={addAgent}>+ Ajouter un agent</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
