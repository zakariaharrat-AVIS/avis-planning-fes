import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import Login from './Login'

const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const ABSENCE_TYPES = {
  repos: { label: 'Repos', color: '#9b9a8f' },
  recup: { label: 'Récup.', color: '#5b8fc7' },
  conge: { label: 'Congé', color: '#c15c5c' },
}

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
function fmtDateWithYear(d) {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function toISODate(d) {
  return d.toISOString().slice(0, 10)
}
function hoursBetween(start, end) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  return mins / 60
}
function fmtHours(h) {
  const rounded = Math.round(h * 10) / 10
  return rounded % 1 === 0 ? `${rounded}h` : `${rounded.toFixed(1)}h`
}

function Avatar({ name, size = 26 }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: '#f1f0ea', color: '#5f5e5a',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 500, flexShrink: 0,
    }}>{initials}</div>
  )
}

function ShiftPicker({ onSelect, onClose }) {
  const [mode, setMode] = useState(null)
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('16:00')

  if (mode === 'travail') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: '#fff', border: '1px solid #e2e0d8', borderRadius: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={{ fontSize: 12, padding: 4, width: 90 }} />
          <span style={{ fontSize: 12, color: '#6b6a60' }}>à</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={{ fontSize: 12, padding: 4, width: 90 }} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => { onSelect({ shift_type: 'travail', start_time: start, end_time: end }); onClose() }} style={{ fontSize: 12, padding: '4px 8px' }}>Valider</button>
          <button onClick={onClose} style={{ fontSize: 12, padding: '4px 8px' }}>Annuler</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, background: '#fff', border: '1px solid #e2e0d8', borderRadius: 8, padding: 4, minWidth: 130 }}>
      <button onClick={() => setMode('travail')} style={{ fontSize: 12, textAlign: 'left', padding: '5px 8px', border: 'none', background: 'transparent', cursor: 'pointer' }}>+ Horaire de travail</button>
      {Object.entries(ABSENCE_TYPES).map(([k, v]) => (
        <button key={k} onClick={() => { onSelect({ shift_type: k }); onClose() }} style={{ fontSize: 12, textAlign: 'left', padding: '5px 8px', border: 'none', background: 'transparent', cursor: 'pointer' }}>
          {v.label}
        </button>
      ))}
      <button onClick={onClose} style={{ fontSize: 11, textAlign: 'left', padding: '5px 8px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#9b9a8f' }}>Fermer</button>
    </div>
  )
}

function PeopleTable({ title, people, shifts, weekStart, canEdit, pickerOpen, setPickerOpen, onAddShift, onRemoveShift, onRemovePerson, onAddPerson }) {
  const cellShifts = (personId, dayIndex) => shifts.filter((s) => s.agent_id === personId && s.day_index === dayIndex)

  const totalHours = (personId) => {
    return shifts
      .filter((s) => s.agent_id === personId && s.shift_type === 'travail')
      .reduce((sum, s) => sum + hoursBetween(s.start_time, s.end_time), 0)
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 10, color: '#3d3d38' }}>{title}</div>
      {people.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#9b9a8f', fontSize: 13, background: '#fff', border: '1px solid #ebe9e2', borderRadius: 10 }}>
          Aucune personne dans cette liste.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', background: '#fff', borderRadius: 10, overflow: 'hidden', border: '1px solid #ebe9e2', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ebe9e2', padding: 10, background: '#fafaf7', fontSize: 12, color: '#9b9a8f', textAlign: 'left', minWidth: 150, fontWeight: 500 }}>Nom</th>
                {DAYS_SHORT.map((d, i) => (
                  <th key={d} style={{ border: '1px solid #ebe9e2', padding: 10, background: '#fafaf7', fontSize: 12, color: '#9b9a8f', textAlign: 'center', minWidth: 105, fontWeight: 500 }}>
                    {d}<br />{fmtDate(addDays(weekStart, i))}
                  </th>
                ))}
                <th style={{ border: '1px solid #ebe9e2', padding: 10, background: '#fafaf7', fontSize: 12, color: '#9b9a8f', textAlign: 'center', minWidth: 70, fontWeight: 500 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id}>
                  <td style={{ border: '1px solid #ebe9e2', padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar name={person.name} />
                      <span style={{ fontWeight: 500 }}>{person.name}</span>
                      {canEdit && <span onClick={() => onRemovePerson(person.id, person.name)} style={{ cursor: 'pointer', color: '#c15c5c', fontSize: 11 }}>✕</span>}
                    </div>
                  </td>
                  {DAYS_SHORT.map((_, d) => {
                    const cell = cellShifts(person.id, d)
                    const pickerKey = `${person.id}-${d}`
                    return (
                      <td key={d} style={{ border: '1px solid #ebe9e2', padding: 6, verticalAlign: 'top', position: 'relative' }}>
                        {cell.map((s) => {
                          const isAbsence = ABSENCE_TYPES[s.shift_type]
                          const label = isAbsence ? isAbsence.label : `${s.start_time?.slice(0,5) || ''}-${s.end_time?.slice(0,5) || ''}`
                          const color = isAbsence ? isAbsence.color : '#3d3d38'
                          return (
                            <div key={s.id} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4,
                              fontSize: 12, padding: '5px 7px', borderRadius: 6, marginBottom: 4,
                              background: '#f5f4f0', color,
                            }}>
                              <span>{label}</span>
                              {canEdit && <span onClick={() => onRemoveShift(s.id)} style={{ cursor: 'pointer', opacity: 0.5, fontSize: 11 }}>✕</span>}
                            </div>
                          )
                        })}
                        {cell.length === 0 && !canEdit && (
                          <div style={{ textAlign: 'center', color: '#c9c6ba', fontSize: 12, padding: '8px 0' }}>—</div>
                        )}
                        {canEdit && (
                          <div>
                            <button onClick={() => setPickerOpen(pickerOpen === pickerKey ? null : pickerKey)} style={{ width: '100%', fontSize: 11, padding: 4 }}>+ shift</button>
                            {pickerOpen === pickerKey && (
                              <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0 }}>
                                <ShiftPicker
                                  onSelect={(data) => onAddShift(person.id, d, data)}
                                  onClose={() => setPickerOpen(null)}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td style={{ border: '1px solid #ebe9e2', padding: 8, textAlign: 'center', fontWeight: 500, color: '#3d3d38', background: '#fafaf7' }}>
                    {fmtHours(totalHours(person.id))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && (
        <div style={{ marginTop: 10 }}>
          <button onClick={onAddPerson}>+ Ajouter</button>
        </div>
      )}
    </div>
  )
}

function ScheduleApp({ user, profile, onLogout }) {
  const [agencies, setAgencies] = useState([])
  const [agency, setAgency] = useState(null)
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))
  const [people, setPeople] = useState([])
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState('')
  const [pickerOpen, setPickerOpen] = useState(null)

  const canEdit = profile?.role === 'chef'

  useEffect(() => {
    supabase.from('agencies').select('*').then(({ data }) => {
      if (data) {
        setAgencies(data)
        const defaultAgency = profile?.role === 'lecture' ? profile.agency_id : data[0]?.id
        setAgency(defaultAgency || data[0]?.id)
      }
    })
  }, [profile])

  const loadData = useCallback(async () => {
    if (!agency) return
    setLoading(true)
    const { data: peopleData } = await supabase
      .from('agents').select('*').eq('agency_id', agency).order('created_at')
    setPeople(peopleData || [])
    const { data: shiftData } = await supabase
      .from('shifts').select('*').eq('agency_id', agency).eq('week_start', toISODate(weekStart))
    setShifts(shiftData || [])
    setLoading(false)
  }, [agency, weekStart])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const channel = supabase
      .channel('shifts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, loadData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadData])

  const addShift = async (personId, dayIndex, shiftData) => {
    setSaveStatus('Enregistrement…')
    const { error } = await supabase.from('shifts').insert({
      agency_id: agency, agent_id: personId, week_start: toISODate(weekStart),
      day_index: dayIndex, ...shiftData,
    })
    setSaveStatus(error ? 'Échec' : 'Enregistré')
    setTimeout(() => setSaveStatus(''), 1200)
    loadData()
  }
  const removeShift = async (shiftId) => {
    await supabase.from('shifts').delete().eq('id', shiftId)
    loadData()
  }
  const addPerson = async (isAssistant) => {
    const name = window.prompt(isAssistant ? "Nom du nouvel assistant :" : 'Nom du nouvel agent :')
    if (name && name.trim()) {
      await supabase.from('agents').insert({ agency_id: agency, name: name.trim(), is_assistant: isAssistant })
      loadData()
    }
  }
  const removePerson = async (personId, name) => {
    if (!window.confirm(`Retirer ${name} ?`)) return
    await supabase.from('agents').delete().eq('id', personId)
    loadData()
  }

  const agencyName = agencies.find((a) => a.id === agency)?.name || ''
  const agentsList = people.filter((p) => !p.is_assistant)
  const assistantsList = people.filter((p) => p.is_assistant)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: '-apple-system, sans-serif' }}>
      <div style={{
        width: 200, flexShrink: 0, background: '#fff', borderRight: '1px solid #ebe9e2',
        display: 'flex', flexDirection: 'column', padding: '20px 16px',
      }}>
        <img src="/avis-logo.jpg" alt="Avis" style={{ width: '100%', borderRadius: 6, marginBottom: 20 }} />

        {canEdit && (
          <>
            <div style={{ fontSize: 11, color: '#9b9a8f', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 }}>Agence</div>
            <select value={agency || ''} onChange={(e) => setAgency(e.target.value)} style={{ width: '100%', marginBottom: 20, padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #e2e0d8' }}>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </>
        )}

        <div style={{ marginTop: 'auto', fontSize: 11, color: '#c9c6ba' }}>{saveStatus || '\u00A0'}</div>
        <div style={{ fontSize: 12, color: '#6b6a60', marginBottom: 8 }}>{user.email}</div>
        <button onClick={onLogout} style={{ fontSize: 12, padding: '6px 10px' }}>Se déconnecter</button>
      </div>

      <div style={{ flex: 1, minWidth: 0, background: '#fafaf7' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px', borderBottom: '1px solid #ebe9e2', flexWrap: 'wrap', gap: 12, background: '#fff',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{agencyName}</div>
            <div style={{ fontSize: 13, color: '#9b9a8f' }}>
              Semaine du {fmtDateWithYear(weekStart)} au {fmtDateWithYear(addDays(weekStart, 6))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setWeekStart(addDays(weekStart, -7))}>&larr;</button>
            <button onClick={() => setWeekStart(getMonday(new Date()))}>Aujourd'hui</button>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))}>&rarr;</button>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9b9a8f' }}>Chargement…</div>
          ) : (
            <>
              <PeopleTable
                title="Agents"
                people={agentsList}
                shifts={shifts}
                weekStart={weekStart}
                canEdit={canEdit}
                pickerOpen={pickerOpen}
                setPickerOpen={setPickerOpen}
                onAddShift={addShift}
                onRemoveShift={removeShift}
                onRemovePerson={removePerson}
                onAddPerson={() => addPerson(false)}
              />
              <PeopleTable
                title="Assistants"
                people={assistantsList}
                shifts={shifts}
                weekStart={weekStart}
                canEdit={canEdit}
                pickerOpen={pickerOpen}
                setPickerOpen={setPickerOpen}
                onAddShift={addShift}
                onRemoveShift={removeShift}
                onRemovePerson={removePerson}
                onAddPerson={() => addPerson(true)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setChecking(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session?.user) {
      supabase.from('profiles').select('*').eq('id', session.user.id).single()
        .then(({ data }) => setProfile(data))
    } else {
      setProfile(null)
    }
  }, [session])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  if (checking) return <div style={{ padding: 40, textAlign: 'center', color: '#9b9a8f' }}>Chargement…</div>
  if (!session) return <Login onLogin={() => {}} />
  if (!profile) return <div style={{ padding: 40, textAlign: 'center', color: '#9b9a8f' }}>Chargement du profil…</div>

  return <ScheduleApp user={session.user} profile={profile} onLogout={handleLogout} />
}
