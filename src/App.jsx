import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'

const ABSENCE_SHIFTS = {
  repos: { label: 'Repos', color: '#888780', bg: '#F1EFE8', fg: '#444441' },
  recup: { label: 'Récup.', color: '#185FA5', bg: '#E6F1FB', fg: '#0C447C' },
  conge: { label: 'Congé', color: '#A32D2D', bg: '#FCEBEB', fg: '#791F1F' },
}
const TRAVAIL_COLOR = '#26251f'
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
function isValidTime(t) {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(t)
}
function hoursBetween(start, end) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  return mins / 60
}
function fmtHours(h) {
  const rounded = Math.round(h * 10) / 10
  return `${rounded % 1 === 0 ? rounded : rounded.toFixed(1)}h`
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

function LoginForm({ onLogin, error, loading }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onLogin(email, password) }}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 8px' }}
    >
      <div style={{ fontSize: 11, color: '#8a8980', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: -2 }}>
        Connexion
      </div>
      <input
        type="email" placeholder="Email" value={email} required
        onChange={(e) => setEmail(e.target.value)}
        style={{ background: '#2a2a26', color: '#fff', border: '0.5px solid #3d3d38', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
      />
      <input
        type="password" placeholder="Mot de passe" value={password} required
        onChange={(e) => setPassword(e.target.value)}
        style={{ background: '#2a2a26', color: '#fff', border: '0.5px solid #3d3d38', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
      />
      {error && <div style={{ fontSize: 11, color: '#e0847d' }}>{error}</div>}
      <button type="submit" disabled={loading} style={{ background: '#d85a30', color: '#fff', border: 'none' }}>
        {loading ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  )
}

function StaffTable({ title, staff, shifts, weekStart, readonly, onAddShift, onRemoveShift, onAddStaff, onRemoveStaff }) {
  const cellShifts = (staffId, dayIndex) =>
    shifts.filter((s) => s.agent_id === staffId && s.day_index === dayIndex)

  const totalHours = (staffId) =>
    shifts
      .filter((s) => s.agent_id === staffId && s.shift_type === 'travail' && s.start_time && s.end_time)
      .reduce((sum, s) => sum + hoursBetween(s.start_time, s.end_time), 0)

  const handleSelect = (staffId, dayIndex, value) => {
    if (!value) return
    if (value === 'travail') {
      const start = window.prompt('Heure de début (ex: 08:00) :', '08:00')
      if (!start) return
      if (!isValidTime(start)) { window.alert('Heure de début invalide (format HH:MM).'); return }
      const end = window.prompt('Heure de fin (ex: 16:00) :', '16:00')
      if (!end) return
      if (!isValidTime(end)) { window.alert('Heure de fin invalide (format HH:MM).'); return }
      onAddShift(staffId, dayIndex, 'travail', start, end)
    } else {
      onAddShift(staffId, dayIndex, value)
    }
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>{title}</div>

      {staff.length === 0 ? (
        <div style={{ color: '#9b9a8f', fontSize: 13, padding: '8px 0' }}>Aucun membre pour l'instant.</div>
      ) : (
        <table style={{
          width: '100%', background: '#fff', borderRadius: 12,
          border: '0.5px solid #e2e0d8', fontSize: 13,
        }}>
          <thead>
            <tr>
              <th style={{ border: '0.5px solid #e2e0d8', padding: 10, background: '#eeece4', fontSize: 12, color: '#6b6a60', textAlign: 'left', minWidth: 150 }}>Nom</th>
              {DAYS_SHORT.map((d, i) => (
                <th key={d} style={{ border: '0.5px solid #e2e0d8', padding: 10, background: '#eeece4', fontSize: 12, color: '#6b6a60', textAlign: 'center', minWidth: 100 }}>
                  {d}<br />{fmtDate(addDays(weekStart, i))}
                </th>
              ))}
              <th style={{ border: '0.5px solid #e2e0d8', padding: 10, background: '#eeece4', fontSize: 12, color: '#6b6a60', textAlign: 'center', minWidth: 60 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((person) => (
              <tr key={person.id}>
                <td style={{ border: '0.5px solid #e2e0d8', padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar name={person.name} />
                    <span style={{ fontWeight: 500 }}>{person.name}</span>
                    {!readonly && (
                      <span onClick={() => onRemoveStaff(person.id, person.name)} style={{ cursor: 'pointer', color: '#a32d2d', fontSize: 11, marginLeft: 2 }}>✕</span>
                    )}
                  </div>
                </td>
                {DAYS_SHORT.map((_, d) => {
                  const cell = cellShifts(person.id, d)
                  return (
                    <td key={d} style={{ border: '0.5px solid #e2e0d8', padding: 6, verticalAlign: 'top' }}>
                      {cell.map((s) => {
                        const isTravail = s.shift_type === 'travail'
                        const def = isTravail ? null : ABSENCE_SHIFTS[s.shift_type]
                        if (!isTravail && !def) return null
                        const label = isTravail ? `${s.start_time}-${s.end_time}` : def.label
                        return (
                          <div key={s.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4,
                            fontSize: 12, padding: '5px 7px', borderRadius: 6, marginBottom: 4,
                            background: isTravail ? '#fff' : def.bg,
                            color: isTravail ? TRAVAIL_COLOR : def.fg,
                            border: isTravail ? '0.5px solid #d8d6cc' : 'none',
                          }}>
                            <span>{label}</span>
                            {!readonly && (
                              <span onClick={() => onRemoveShift(s.id)} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 11 }}>✕</span>
                            )}
                          </div>
                        )
                      })}
                      {cell.length === 0 && readonly && (
                        <div style={{ textAlign: 'center', color: '#9b9a8f', fontSize: 12, padding: '8px 0' }}>—</div>
                      )}
                      {!readonly && (
                        <select value="" onChange={(e) => handleSelect(person.id, d, e.target.value)} style={{ width: '100%', fontSize: 11, padding: 4 }}>
                          <option value="">+ shift</option>
                          <option value="travail">+ Horaire de travail</option>
                          <optgroup label="Absence">
                            {Object.entries(ABSENCE_SHIFTS).map(([k, def2]) => <option key={k} value={k}>{def2.label}</option>)}
                          </optgroup>
                        </select>
                      )}
                    </td>
                  )
                })}
                <td style={{ border: '0.5px solid #e2e0d8', padding: '8px 12px', textAlign: 'center', fontWeight: 500 }}>
                  {fmtHours(totalHours(person.id))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!readonly && (
        <div style={{ marginTop: 10 }}>
          <button onClick={onAddStaff}>+ Ajouter</button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [agencies, setAgencies] = useState([])
  const [agency, setAgency] = useState('fez')
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))
  const [agents, setAgents] = useState([])
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState('')
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  const readonly = !session

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

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

  const handleLogin = async (email, password) => {
    setAuthLoading(true)
    setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError('Identifiants incorrects.')
    setAuthLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const addShift = async (agentId, dayIndex, shiftType, startTime = null, endTime = null) => {
    setSaveStatus('Enregistrement…')
    const { error } = await supabase.from('shifts').insert({
      agency_id: agency, agent_id: agentId, week_start: toISODate(weekStart),
      day_index: dayIndex, shift_type: shiftType, start_time: startTime, end_time: endTime,
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

  const addStaff = async (category) => {
    const name = window.prompt(category === 'assistant' ? "Nom du nouvel assistant :" : "Nom du nouvel agent :")
    if (name && name.trim()) {
      await supabase.from('agents').insert({ agency_id: agency, name: name.trim(), category })
      loadData()
    }
  }

  const removeStaff = async (staffId, name) => {
    if (!window.confirm(`Retirer ${name} de la liste ?`)) return
    await supabase.from('agents').delete().eq('id', staffId)
    loadData()
  }

  const agencyName = agencies.find((a) => a.id === agency)?.name || ''
  const agentsList = agents.filter((a) => a.category !== 'assistant')
  const assistantsList = agents.filter((a) => a.category === 'assistant')

  const navButtonStyle = { width: 34, height: 34, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{
        width: 220, flexShrink: 0, background: '#1a1a18', color: '#e8e7e0',
        display: 'flex', flexDirection: 'column', padding: '20px 14px',
      }}>
        <div style={{
          background: '#d81f2a', borderRadius: 10, padding: '14px 0', textAlign: 'center', marginBottom: 24,
        }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '0.02em', fontStyle: 'italic' }}>AVIS</span>
        </div>

        <div style={{ fontSize: 11, color: '#8a8980', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 8px', marginBottom: 6 }}>
          Agence
        </div>
        <select
          value={agency}
          onChange={(e) => setAgency(e.target.value)}
          style={{
            width: '100%', background: '#2a2a26', color: '#fff',
            border: '0.5px solid #3d3d38', borderRadius: 8, padding: '8px 10px', fontSize: 13,
          }}
        >
          {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <div style={{ marginTop: 'auto' }}>
          {session ? (
            <>
              <div style={{ fontSize: 12, color: '#b5b3a8', padding: '0 8px', marginBottom: 8, wordBreak: 'break-all' }}>
                {session.user.email}
              </div>
              <button onClick={handleLogout} style={{ width: '100%' }}>Se déconnecter</button>
            </>
          ) : (
            <LoginForm onLogin={handleLogin} error={authError} loading={authLoading} />
          )}
          <div style={{ fontSize: 11, color: '#6f6e65', padding: '8px 8px 0' }}>{saveStatus || ' '}</div>
        </div>
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
            <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={navButtonStyle} aria-label="Semaine précédente">&larr;</button>
            <button onClick={() => setWeekStart(getMonday(new Date()))}>Aujourd'hui</button>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={navButtonStyle} aria-label="Semaine suivante">&rarr;</button>
          </div>
        </div>

        {readonly && (
          <div style={{
            margin: '16px 24px 0', background: '#e6f1fb', color: '#0c447c',
            border: '0.5px solid #85b7eb', padding: '8px 14px', borderRadius: 8, fontSize: 13,
          }}>
            Mode consultation. Connectez-vous pour modifier le planning.
          </div>
        )}

        <div style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6b6a60', marginBottom: 20, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: '#fff', border: '0.5px solid #c9c6ba', display: 'inline-block' }} />
              Travail
            </span>
            {Object.entries(ABSENCE_SHIFTS).map(([k, s]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} />
                {s.label}
              </span>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#6b6a60' }}>Chargement…</div>
          ) : (
            <>
              <StaffTable
                title="Agents" staff={agentsList} shifts={shifts} weekStart={weekStart} readonly={readonly}
                onAddShift={addShift} onRemoveShift={removeShift}
                onAddStaff={() => addStaff('agent')} onRemoveStaff={removeStaff}
              />
              <StaffTable
                title="Assistants" staff={assistantsList} shifts={shifts} weekStart={weekStart} readonly={readonly}
                onAddShift={addShift} onRemoveShift={removeShift}
                onAddStaff={() => addStaff('assistant')} onRemoveStaff={removeStaff}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
