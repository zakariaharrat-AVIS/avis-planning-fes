import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import Login from './Login'
import ChatWidget from './ChatWidget'
import PerformanceImport from './PerformanceImport'
import ReservationImport from './ReservationImport'
import AutoRoster from './AutoRoster'
import CombinedTotals from './CombinedTotals'

const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const ABSENCE_TYPES = {
  repos: { label: 'Repos', color: '#9b9a8f' },
  recup: { label: 'Récup.', color: '#5b8fc7' },
  maladie: { label: 'Maladie', color: '#c15c5c' },
  conge: { label: 'Congé', color: '#a37c3e' },
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
function hoursBetween(start, end, agencyId) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60

  // Le shift standard FZ2 (08h-19h) inclut une pause déjeuner de 2h (12h-14h), déduite du temps travaillé.
  const isStandardFZ2Shift = agencyId === 'fz2' && start === '08:00' && end === '19:00'
  if (isStandardFZ2Shift) {
    mins -= 120
  }

  return mins / 60
}
function fmtHours(h) {
  const rounded = Math.round(h * 10) / 10
  return rounded % 1 === 0 ? `${rounded}h` : `${rounded.toFixed(1)}h`
}
const WEEKLY_NORM_HOURS = 44
const HOURS_PER_ABSENCE_DAY = 8
function hoursDiffLabel(totalHours, norm) {
  const diff = Math.round((totalHours - norm) * 10) / 10
  if (diff === 0) return { text: 'À jour', color: '#5f8f5f' }
  if (diff > 0) return { text: `+${fmtHours(diff)} récup`, color: '#c88a3e' }
  return { text: `${fmtHours(diff)}`, color: '#5b8fc7' }
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

function DatePicker({ weekStart, onSelectWeek, onClose }) {
  const [viewMonth, setViewMonth] = useState(new Date(weekStart.getFullYear(), weekStart.getMonth(), 1))

  const monthLabel = viewMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const startOffset = (firstDay.getDay() + 6) % 7 // lundi = 0
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const isSelectedWeek = (day) => {
    if (!day) return false
    const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day)
    const mondayOfDate = getMonday(date)
    return toISODate(mondayOfDate) === toISODate(weekStart)
  }

  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: 4,
      background: '#fff', border: '1px solid #e2e0d8', borderRadius: 10,
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)', padding: 14, width: 260,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <button
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
          style={{ fontSize: 12, padding: '3px 8px' }}
        >&larr;</button>
        <div style={{ fontSize: 13, fontWeight: 500, textTransform: 'capitalize' }}>{monthLabel}</div>
        <button
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
          style={{ fontSize: 12, padding: '3px 8px' }}
        >&rarr;</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div key={i} style={{ fontSize: 10, color: '#9b9a8f', textAlign: 'center', padding: 2 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((day, i) => (
          <div
            key={i}
            onClick={() => {
              if (!day) return
              const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day)
              onSelectWeek(getMonday(date))
              onClose()
            }}
            style={{
              fontSize: 12, textAlign: 'center', padding: '6px 0', borderRadius: 6,
              cursor: day ? 'pointer' : 'default',
              background: isSelectedWeek(day) ? '#f5e6e7' : 'transparent',
              color: day ? '#3d3d38' : 'transparent',
              fontWeight: isSelectedWeek(day) ? 600 : 400,
            }}
          >
            {day || '-'}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between' }}>
        <button
          onClick={() => { onSelectWeek(getMonday(new Date())); onClose() }}
          style={{ fontSize: 11, padding: '5px 8px' }}
        >Aujourd'hui</button>
        <button onClick={onClose} style={{ fontSize: 11, padding: '5px 8px' }}>Fermer</button>
      </div>
    </div>
  )
}

function ShiftPicker({ onSelect, onClose, agency, dayIndex }) {
  const isSundayFZ2 = agency === 'fz2' && dayIndex === 6
  const [mode, setMode] = useState(null)
  const [start, setStart] = useState(isSundayFZ2 ? '08:00' : '08:00')
  const [end, setEnd] = useState(isSundayFZ2 ? '12:00' : '16:00')

  if (mode === 'travail') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: '#fff', border: '1px solid #e2e0d8', borderRadius: 8 }}>
        {isSundayFZ2 && (
          <div style={{ fontSize: 11, color: '#c88a3e' }}>Dimanche : agence ouverte 08h-12h</div>
        )}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: '#fff', border: '1px solid #e2e0d8', borderRadius: 10, padding: 10, minWidth: 180 }}>
      <button onClick={() => setMode('travail')} style={{ fontSize: 13, textAlign: 'left', padding: '8px 10px', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 6 }}>+ Horaire de travail</button>
      {Object.entries(ABSENCE_TYPES).map(([k, v]) => (
        <button key={k} onClick={() => { onSelect({ shift_type: k }); onClose() }} style={{ fontSize: 13, textAlign: 'left', padding: '8px 10px', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 6 }}>
          {v.label}
        </button>
      ))}
      <button onClick={onClose} style={{ fontSize: 12, textAlign: 'left', padding: '8px 10px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#9b9a8f', borderRadius: 6 }}>Fermer</button>
    </div>
  )
}

function MonthlySummary({ agency, weekStart: initialWeekStart, onClose }) {
  const [refDate, setRefDate] = useState(initialWeekStart)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [monthLabel, setMonthLabel] = useState('')

  useEffect(() => {
    (async () => {
      setLoading(true)
      const refMonth = refDate.getMonth()
      const refYear = refDate.getFullYear()
      setMonthLabel(refDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }))

      const { data: people } = await supabase.from('agents').select('*').eq('agency_id', agency).order('created_at')

      const monthStart = new Date(refYear, refMonth, 1)
      const monthEnd = new Date(refYear, refMonth + 1, 0)
      const weekStarts = []
      let cursor = getMonday(monthStart)
      while (cursor <= monthEnd) {
        weekStarts.push(toISODate(cursor))
        cursor = addDays(cursor, 7)
      }

      const { data: shifts } = await supabase
        .from('shifts').select('*').eq('agency_id', agency).in('week_start', weekStarts)

      const result = (people || []).map((p) => {
        const personShifts = (shifts || []).filter((s) => s.agent_id === p.id)
        const workShifts = personShifts.filter((s) => s.shift_type === 'travail')
        const total = workShifts.reduce((sum, s) => sum + hoursBetween(s.start_time, s.end_time, s.agency_id), 0)
        const absenceDays = personShifts.filter((s) => s.shift_type === 'conge' || s.shift_type === 'maladie').length
        const norm = (WEEKLY_NORM_HOURS * weekStarts.length) - (absenceDays * HOURS_PER_ABSENCE_DAY)
        return { name: p.name, isAssistant: p.is_assistant, total, norm, diff: total - norm }
      })
      setRows(result)
      setLoading(false)
    })()
  }, [agency, refDate])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 520, maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setRefDate(new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1))} style={{ fontSize: 12, padding: '4px 8px' }}>&larr;</button>
            <div style={{ fontSize: 16, fontWeight: 500, textTransform: 'capitalize', minWidth: 150, textAlign: 'center' }}>{monthLabel}</div>
            <button onClick={() => setRefDate(new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1))} style={{ fontSize: 12, padding: '4px 8px' }}>&rarr;</button>
          </div>
          <button onClick={onClose} style={{ fontSize: 12, padding: '6px 10px' }}>Fermer</button>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#9b9a8f' }}>Calcul en cours…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #ebe9e2', color: '#9b9a8f', fontSize: 12 }}>Nom</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid #ebe9e2', color: '#9b9a8f', fontSize: 12 }}>Heures faites</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid #ebe9e2', color: '#9b9a8f', fontSize: 12 }}>Norme</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid #ebe9e2', color: '#9b9a8f', fontSize: 12 }}>Écart</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const diffRounded = Math.round(r.diff * 10) / 10
                const diffColor = diffRounded > 0 ? '#c88a3e' : diffRounded < 0 ? '#5b8fc7' : '#5f8f5f'
                const diffText = diffRounded > 0 ? `+${fmtHours(diffRounded)} récup` : diffRounded < 0 ? fmtHours(diffRounded) : 'À jour'
                return (
                  <tr key={i}>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f5f4f0' }}>{r.name}{r.isAssistant ? ' (Assistant)' : ''}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f5f4f0', textAlign: 'center' }}>{fmtHours(r.total)}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f5f4f0', textAlign: 'center', color: '#9b9a8f' }}>{fmtHours(r.norm)}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f5f4f0', textAlign: 'center', color: diffColor, fontWeight: 500 }}>{diffText}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function PeopleTable({ title, people, shifts, allShifts, weekStart, canEdit, pickerOpen, setPickerOpen, onAddShift, onRemoveShift, onRemovePerson, onRenamePerson, onAddPerson, agency, onToggleOtherAgency, otherAgencyLabel }) {
  const [menuOpen, setMenuOpen] = useState(null)
  const cellShifts = (personId, dayIndex) => shifts.filter((s) => s.agent_id === personId && s.day_index === dayIndex)

  // Si l'agent n'a rien dans cette agence ce jour-là, mais travaille sur l'autre station ce même jour,
  // on l'affiche pour éviter une case vide trompeuse (l'agent n'est pas "absent", il est ailleurs).
  const otherStationShift = (personId, dayIndex) => {
    if (!allShifts) return null
    return allShifts.find((s) =>
      s.agent_id === personId && s.day_index === dayIndex &&
      s.agency_id !== agency && s.shift_type === 'travail'
    )
  }

  // Le total et la norme utilisent TOUS les shifts de l'agent (toutes agences confondues pour la semaine),
  // pas seulement ceux de l'agence actuellement affichée — important pour les agents partagés entre stations.
  const relevantShifts = allShifts || shifts

  const totalHours = (personId) => {
    return relevantShifts
      .filter((s) => s.agent_id === personId && s.shift_type === 'travail')
      .reduce((sum, s) => sum + hoursBetween(s.start_time, s.end_time, s.agency_id), 0)
  }

  const personalNorm = (personId) => {
    const absenceDays = relevantShifts.filter((s) =>
      s.agent_id === personId && (s.shift_type === 'conge' || s.shift_type === 'maladie')
    ).length
    return WEEKLY_NORM_HOURS - (absenceDays * HOURS_PER_ABSENCE_DAY)
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2, color: '#3d3d38' }}>{title}</div>
      <div style={{ fontSize: 11, color: '#9b9a8f', marginBottom: 10 }}>
        Norme : {WEEKLY_NORM_HOURS}h/semaine (réduite de {HOURS_PER_ABSENCE_DAY}h par jour de Congé/Maladie) — écart affiché sous le total
      </div>
      {people.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#9b9a8f', fontSize: 13, background: '#fff', border: '1px solid #ebe9e2', borderRadius: 10 }}>
          Aucune personne dans cette liste.
        </div>
      ) : (
        <div className="schedule-scroll" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', background: '#fff', borderRadius: 10, overflow: 'hidden', border: '1px solid #ebe9e2', fontSize: 13 }}>
            <thead>
              <tr>
                <th className="sticky-col" style={{ border: '1px solid #ebe9e2', padding: 10, background: '#fafaf7', fontSize: 12, color: '#9b9a8f', textAlign: 'left', minWidth: 150, fontWeight: 500 }}>Nom</th>
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
                  <td className="sticky-col" style={{ border: '1px solid #ebe9e2', padding: '8px 12px', whiteSpace: 'nowrap', position: 'relative', background: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar name={person.name} />
                      <span style={{ fontWeight: 500 }}>{person.name}</span>
                      {canEdit && (
                        <span
                          onClick={() => setMenuOpen(menuOpen === person.id ? null : person.id)}
                          style={{ cursor: 'pointer', color: '#9b9a8f', fontSize: 14, marginLeft: 2, padding: '0 4px' }}
                        >⋯</span>
                      )}
                      {menuOpen === person.id && (
                        <div style={{
                          position: 'absolute', zIndex: 20, top: '100%', left: 30,
                          background: '#fff', border: '1px solid #e2e0d8', borderRadius: 8,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.08)', minWidth: 120,
                        }}>
                          <button
                            onClick={() => { setMenuOpen(null); onRenamePerson(person.id, person.name) }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 12, padding: '7px 10px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                          >Renommer</button>
                          {onToggleOtherAgency && (
                            <button
                              onClick={() => { setMenuOpen(null); onToggleOtherAgency(person.id) }}
                              style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 12, padding: '7px 10px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                            >{otherAgencyLabel}</button>
                          )}
                          <button
                            onClick={() => { setMenuOpen(null); onRemovePerson(person.id, person.name) }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 12, padding: '7px 10px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#c15c5c' }}
                          >Supprimer</button>
                        </div>
                      )}
                    </div>
                  </td>
                  {DAYS_SHORT.map((_, d) => {
                    const cell = cellShifts(person.id, d)
                    const pickerKey = `${person.id}-${d}`
                    const otherShift = cell.length === 0 ? otherStationShift(person.id, d) : null
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
                        {otherShift && (
                          <div style={{
                            fontSize: 11, padding: '5px 7px', borderRadius: 6, marginBottom: 4,
                            background: '#e6f1fb', color: '#0c447c', textAlign: 'center',
                          }}>
                            → {otherAgencyLabel?.replace('Disponible aussi à ', '') || 'Autre station'}
                          </div>
                        )}
                        {cell.length === 0 && !otherShift && !canEdit && (
                          <div style={{ textAlign: 'center', color: '#c9c6ba', fontSize: 12, padding: '8px 0' }}>—</div>
                        )}
                        {canEdit && (
                          <div>
                            <button onClick={() => setPickerOpen(pickerOpen === pickerKey ? null : pickerKey)} style={{ width: '100%', fontSize: 11, padding: 4 }}>+ shift</button>
                            {pickerOpen === pickerKey && (
                              <>
                                <div
                                  onClick={() => setPickerOpen(null)}
                                  style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.15)' }}
                                />
                                <div style={{
                                  position: 'fixed', zIndex: 1000, top: '50%', left: '50%',
                                  transform: 'translate(-50%, -50%)',
                                  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                                }}>
                                  <ShiftPicker
                                    onSelect={(data) => onAddShift(person.id, d, data)}
                                    onClose={() => setPickerOpen(null)}
                                    agency={agency}
                                    dayIndex={d}
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td style={{ border: '1px solid #ebe9e2', padding: 8, textAlign: 'center', fontWeight: 500, color: '#3d3d38', background: '#fafaf7' }}>
                    <div>{fmtHours(totalHours(person.id))}</div>
                    <div style={{ fontSize: 10, fontWeight: 400, color: hoursDiffLabel(totalHours(person.id), personalNorm(person.id)).color, marginTop: 2 }}>
                      {hoursDiffLabel(totalHours(person.id), personalNorm(person.id)).text}
                    </div>
                    {allShifts && new Set(allShifts.filter((s) => s.agent_id === person.id).map((s) => s.agency_id)).size > 1 && (
                      <div style={{ fontSize: 9, color: '#9b9a8f', marginTop: 2 }}>(cumul 2 stations)</div>
                    )}
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
  const [allShiftsForPeople, setAllShiftsForPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState('')
  const [pickerOpen, setPickerOpen] = useState(null)
  const [showMonthly, setShowMonthly] = useState(false)
  const [showPerfImport, setShowPerfImport] = useState(false)
  const [showResImport, setShowResImport] = useState(false)
  const [showAutoRoster, setShowAutoRoster] = useState(false)
  const [showCombinedTotals, setShowCombinedTotals] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)

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
    const { data: links } = await supabase
      .from('agent_agencies').select('agent_id').eq('agency_id', agency)
    const agentIds = (links || []).map((l) => l.agent_id)
    let peopleData = []
    if (agentIds.length > 0) {
      const { data } = await supabase
        .from('agents').select('*').in('id', agentIds).order('created_at')
      peopleData = data || []
    }
    setPeople(peopleData)
    const { data: shiftData } = await supabase
      .from('shifts').select('*').eq('agency_id', agency).eq('week_start', toISODate(weekStart))
    setShifts(shiftData || [])

    // Pour le calcul du total combiné : tous les shifts de ces agents, toutes agences confondues,
    // pour cette même semaine (utile aux agents partagés entre plusieurs stations).
    if (agentIds.length > 0) {
      const { data: allShiftData } = await supabase
        .from('shifts').select('*').in('agent_id', agentIds).eq('week_start', toISODate(weekStart))
      setAllShiftsForPeople(allShiftData || [])
    } else {
      setAllShiftsForPeople([])
    }
    setLoading(false)
  }, [agency, weekStart])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const channel = supabase
      .channel('shifts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_agencies' }, loadData)
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
      const { data: newAgent, error: insertError } = await supabase
        .from('agents').insert({ agency_id: agency, name: name.trim(), is_assistant: isAssistant })
        .select().single()
      if (!insertError && newAgent) {
        await supabase.from('agent_agencies').insert({ agent_id: newAgent.id, agency_id: agency })
      }
      loadData()
    }
  }
  const removePerson = async (personId, name) => {
    if (!window.confirm(`Retirer ${name} de cette agence ?`)) return
    await supabase.from('agent_agencies').delete().eq('agent_id', personId).eq('agency_id', agency)
    loadData()
  }
  const renamePerson = async (personId, currentName) => {
    const newName = window.prompt('Nouveau nom :', currentName)
    if (newName && newName.trim() && newName.trim() !== currentName) {
      await supabase.from('agents').update({ name: newName.trim() }).eq('id', personId)
      loadData()
    }
  }
  const toggleOtherAgency = async (personId, otherAgencyId, isChecked) => {
    if (isChecked) {
      await supabase.from('agent_agencies').insert({ agent_id: personId, agency_id: otherAgencyId })
    } else {
      await supabase.from('agent_agencies').delete().eq('agent_id', personId).eq('agency_id', otherAgencyId)
    }
    loadData()
  }

  const otherAgencyId = agency === 'fez' ? 'fz2' : agency === 'fz2' ? 'fez' : null
  const otherAgencyName = agencies.find((a) => a.id === otherAgencyId)?.name || ''

  const toggleOtherAgencyForPerson = async (personId) => {
    if (!otherAgencyId) return
    const { data: existing } = await supabase
      .from('agent_agencies').select('*').eq('agent_id', personId).eq('agency_id', otherAgencyId).maybeSingle()
    await toggleOtherAgency(personId, otherAgencyId, !existing)
  }

  const agencyName = agencies.find((a) => a.id === agency)?.name || ''
  const agentsList = people.filter((p) => !p.is_assistant)
  const assistantsList = people.filter((p) => p.is_assistant)

  return (
    <div className="app-layout" style={{ display: 'flex', minHeight: '100vh', fontFamily: '-apple-system, sans-serif' }}>
      <div className="app-sidebar" style={{
        width: 200, flexShrink: 0, background: '#fff', borderRight: '1px solid #ebe9e2',
        display: 'flex', flexDirection: 'column', padding: '20px 16px',
      }}>
        <img src="/avis-logo.jpg" alt="Avis" className="sidebar-logo" style={{ width: '100%', borderRadius: 6, marginBottom: 20 }} />

        {canEdit && (
          <>
            <div className="sidebar-label" style={{ fontSize: 11, color: '#9b9a8f', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 }}>Agence</div>
            <select value={agency || ''} onChange={(e) => setAgency(e.target.value)} style={{ width: '100%', marginBottom: 20, padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #e2e0d8' }}>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </>
        )}

        <div className="sidebar-footer" style={{ marginTop: 'auto', fontSize: 11, color: '#c9c6ba' }}>{saveStatus || '\u00A0'}</div>
        <div className="sidebar-email" style={{ fontSize: 12, color: '#6b6a60', marginBottom: 8 }}>{user.email}</div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
            <button onClick={() => setWeekStart(addDays(weekStart, -7))}>&larr;</button>
            <button onClick={() => setShowDatePicker(!showDatePicker)}>📅 Choisir une date</button>
            {showDatePicker && (
              <DatePicker
                weekStart={weekStart}
                onSelectWeek={setWeekStart}
                onClose={() => setShowDatePicker(false)}
              />
            )}
            <button onClick={() => setWeekStart(addDays(weekStart, 7))}>&rarr;</button>
            <button onClick={() => setShowMonthly(true)}>Récap. mensuel</button>
            {canEdit && <button onClick={() => setShowPerfImport(true)}>📊 Import performance</button>}
            {canEdit && <button onClick={() => setShowResImport(true)}>📅 Import réservations</button>}
            {canEdit && <button onClick={() => setShowAutoRoster(true)}>🤖 Générer planning</button>}
            {canEdit && <button onClick={() => setShowCombinedTotals(true)}>Σ Total combiné</button>}
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
                allShifts={allShiftsForPeople}
                weekStart={weekStart}
                canEdit={canEdit}
                pickerOpen={pickerOpen}
                setPickerOpen={setPickerOpen}
                onAddShift={addShift}
                onRemoveShift={removeShift}
                onRemovePerson={removePerson}
                onRenamePerson={renamePerson}
                onAddPerson={() => addPerson(false)}
                agency={agency}
                onToggleOtherAgency={toggleOtherAgencyForPerson}
                otherAgencyLabel={`Disponible aussi à ${otherAgencyName}`}
              />
              <PeopleTable
                title="Assistants"
                people={assistantsList}
                shifts={shifts}
                allShifts={allShiftsForPeople}
                weekStart={weekStart}
                canEdit={canEdit}
                pickerOpen={pickerOpen}
                setPickerOpen={setPickerOpen}
                onAddShift={addShift}
                onRemoveShift={removeShift}
                onRemovePerson={removePerson}
                onRenamePerson={renamePerson}
                onAddPerson={() => addPerson(true)}
                agency={agency}
                onToggleOtherAgency={toggleOtherAgencyForPerson}
                otherAgencyLabel={`Disponible aussi à ${otherAgencyName}`}
              />
            </>
          )}
        </div>
      </div>
      {showMonthly && (
        <MonthlySummary agency={agency} weekStart={weekStart} onClose={() => setShowMonthly(false)} />
      )}
      {showPerfImport && (
        <PerformanceImport agency={agency} onClose={() => setShowPerfImport(false)} />
      )}
      {showResImport && (
        <ReservationImport agency={agency} onClose={() => setShowResImport(false)} />
      )}
      {showAutoRoster && (
        <AutoRoster
          agency={agency}
          weekStart={weekStart}
          onClose={() => setShowAutoRoster(false)}
          onApplied={loadData}
        />
      )}
      {showCombinedTotals && (
        <CombinedTotals weekStart={weekStart} onClose={() => setShowCombinedTotals(false)} />
      )}
      <ChatWidget weekStart={weekStart} canEdit={canEdit} />
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
