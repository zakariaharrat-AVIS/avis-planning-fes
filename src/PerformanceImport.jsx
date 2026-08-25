import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

// Pondération du score de performance (doit totaliser 100)
const WEIGHTS = {
  scdw: 0.40,
  rsn: 0.25,
  pai: 0.15,
  fuf: 0.05,
  wifi: 0.05,
  lli: 0.05,
  upsell: 0.05,
}
const MIN_RELIABLE_RENTALS = 5

function computeScore(row) {
  const rentals = row.rentals || 0
  const fufRate = rentals > 0 ? (row.fuf_count || 0) / rentals : 0
  const wifiRate = rentals > 0 ? (row.wifi_count || 0) / rentals : 0

  const score =
    (row.scdw_rate || 0) * WEIGHTS.scdw +
    (row.rsn_rate || 0) * WEIGHTS.rsn +
    (row.pai_rate || 0) * WEIGHTS.pai +
    fufRate * WEIGHTS.fuf +
    wifiRate * WEIGHTS.wifi +
    (row.lli_rate || 0) * WEIGHTS.lli +
    (row.upsell_rate || 0) * WEIGHTS.upsell

  return Math.round(score * 1000) / 10 // en pourcentage, arrondi à 1 décimale
}

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

export default function PerformanceImport({ agency, onClose }) {
  const [step, setStep] = useState('upload') // upload | mapping | results
  const [parsedRows, setParsedRows] = useState([])
  const [unmappedIds, setUnmappedIds] = useState([])
  const [agentsList, setAgentsList] = useState([])
  const [mapping, setMapping] = useState({}) // co_agent_id -> agent_id (uuid)
  const [scores, setScores] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('agents').select('*').eq('agency_id', agency).then(({ data }) => {
      setAgentsList(data || [])
    })
  }, [agency])

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setError('')
    try {
      const rows = parseExcelFile ? await parseExcelFile(file) : []
      if (rows.length === 0) {
        setError('Le fichier semble vide ou dans un format inattendu.')
        return
      }

      const normalized = rows.map((r) => ({
        co_agent_id: String(r['entering_co_agent_id'] ?? '').trim(),
        agency_mnemonic: r['co_loc_mnemonic'] ?? '',
        year: parseInt(r['Année de entering_checkin_date']) || null,
        month: r['Mois de entering_checkin_date'] ?? '',
        rentals: Number(r['Rentals']) || 0,
        scdw_rate: Number(r['Col SCDW Rental HR']) || 0,
        rsn_rate: Number(r['RSN Rental HR']) || 0,
        pai_rate: Number(r['Col PAI Rental HR']) || 0,
        lli_rate: Number(r['Col LLI Rental HR']) || 0,
        upsell_rate: Number(r['Upsell Rental HR']) || 0,
        fuf_count: Number(r['FUF Rental']) || 0,
        wifi_count: Number(r['wifi_rented']) || 0,
      })).filter((r) => r.co_agent_id)

      setParsedRows(normalized)

      // Vérifier la correspondance existante en base
      const ids = [...new Set(normalized.map((r) => r.co_agent_id))]
      const { data: existingMappings } = await supabase
        .from('agent_id_mapping').select('*').in('co_agent_id', ids)

      const existingMap = {}
      ;(existingMappings || []).forEach((m) => { existingMap[m.co_agent_id] = m.agent_id })
      setMapping(existingMap)

      const missing = ids.filter((id) => !existingMap[id])
      setUnmappedIds(missing)
      setStep(missing.length > 0 ? 'mapping' : 'results')
      if (missing.length === 0) {
        computeAndShowScores(normalized, existingMap)
      }
    } catch (err) {
      console.error(err)
      setError('Erreur lors de la lecture du fichier. Vérifiez qu\'il s\'agit bien d\'un export au format attendu.')
    }
  }

  const confirmMapping = async () => {
    const toInsert = unmappedIds
      .filter((id) => mapping[id])
      .map((id) => ({ co_agent_id: id, agent_id: mapping[id] }))

    if (toInsert.length > 0) {
      await supabase.from('agent_id_mapping').upsert(toInsert, { onConflict: 'co_agent_id' })
    }
    computeAndShowScores(parsedRows, mapping)
  }

  const computeAndShowScores = (rows, currentMapping) => {
    // Fusionner les lignes du même agent (ex: apparaît dans plusieurs agences du fichier)
    const grouped = {}
    rows.forEach((r) => {
      const key = `${r.co_agent_id}-${r.year}-${r.month}`
      if (!grouped[key]) grouped[key] = { ...r, _rows: [r] }
      else grouped[key]._rows.push(r)
    })

    const results = Object.values(grouped).map((g) => {
      const rs = g._rows
      const totalRentals = rs.reduce((sum, r) => sum + (r.rentals || 0), 0)
      const weightedAvg = (field) => {
        if (totalRentals === 0) return 0
        return rs.reduce((sum, r) => sum + (r[field] || 0) * (r.rentals || 0), 0) / totalRentals
      }
      const merged = {
        rentals: totalRentals,
        scdw_rate: weightedAvg('scdw_rate'),
        rsn_rate: weightedAvg('rsn_rate'),
        pai_rate: weightedAvg('pai_rate'),
        lli_rate: weightedAvg('lli_rate'),
        upsell_rate: weightedAvg('upsell_rate'),
        fuf_count: rs.reduce((sum, r) => sum + (r.fuf_count || 0), 0),
        wifi_count: rs.reduce((sum, r) => sum + (r.wifi_count || 0), 0),
      }
      const score = computeScore(merged)
      const agentId = currentMapping[g.co_agent_id]
      const agent = agentsList.find((a) => a.id === agentId)
      return { ...merged, score, agentName: agent?.name || `ID ${g.co_agent_id} (non lié)` }
    }).sort((a, b) => b.score - a.score)

    setScores(results)
    setStep('results')
  }

  const saveImport = async () => {
    setSaving(true)

    // Si un même agent apparaît sur plusieurs lignes (ex: deux agences dans le fichier),
    // on fusionne en sommant les volumes bruts et en faisant une moyenne pondérée des taux,
    // pour n'avoir qu'une seule ligne par agent/mois (contrainte imposée par la base).
    const grouped = {}
    parsedRows.forEach((r) => {
      const key = `${r.co_agent_id}-${r.year}-${r.month}`
      if (!grouped[key]) {
        grouped[key] = { ...r, _rows: [r] }
      } else {
        grouped[key]._rows.push(r)
      }
    })

    const toInsert = Object.values(grouped).map((g) => {
      const rows = g._rows
      const totalRentals = rows.reduce((sum, r) => sum + (r.rentals || 0), 0)
      const weightedAvg = (field) => {
        if (totalRentals === 0) return 0
        return rows.reduce((sum, r) => sum + (r[field] || 0) * (r.rentals || 0), 0) / totalRentals
      }
      const merged = {
        co_agent_id: g.co_agent_id,
        agency_mnemonic: rows.map((r) => r.agency_mnemonic).filter(Boolean).join(', '),
        year: g.year,
        month: g.month,
        rentals: totalRentals,
        scdw_rate: weightedAvg('scdw_rate'),
        rsn_rate: weightedAvg('rsn_rate'),
        pai_rate: weightedAvg('pai_rate'),
        lli_rate: weightedAvg('lli_rate'),
        upsell_rate: weightedAvg('upsell_rate'),
        fuf_count: rows.reduce((sum, r) => sum + (r.fuf_count || 0), 0),
        wifi_count: rows.reduce((sum, r) => sum + (r.wifi_count || 0), 0),
      }
      return { ...merged, score: computeScore(merged) }
    })

    const { error: insertError } = await supabase
      .from('performance_imports').upsert(toInsert, { onConflict: 'co_agent_id,year,month' })
    setSaving(false)
    if (insertError) {
      setError('Erreur lors de l\'enregistrement : ' + insertError.message)
    } else {
      onClose()
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 640, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Importer les performances</div>
          <button onClick={onClose} style={{ fontSize: 12, padding: '6px 10px' }}>Fermer</button>
        </div>

        {error && <div style={{ color: '#c15c5c', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {step === 'upload' && (
          <div>
            <p style={{ fontSize: 13, color: '#6b6a60', marginBottom: 12 }}>
              Sélectionnez le fichier Excel de performance exporté du système Avis (format "Staff Performance Report").
            </p>
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ fontSize: 13 }} />
          </div>
        )}

        {step === 'mapping' && (
          <div>
            <p style={{ fontSize: 13, color: '#6b6a60', marginBottom: 12 }}>
              {unmappedIds.length} identifiant(s) agent trouvé(s) dans le fichier ne sont pas encore liés à un agent de cette agence. Faites la correspondance :
            </p>
            {unmappedIds.map((id) => (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 13, width: 100 }}>ID {id}</div>
                <select
                  value={mapping[id] || ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [id]: e.target.value }))}
                  style={{ fontSize: 13, padding: '6px 8px', flex: 1 }}
                >
                  <option value="">— Ignorer cet ID —</option>
                  {agentsList.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            ))}
            <button onClick={confirmMapping} style={{ marginTop: 12, fontSize: 13, padding: '8px 14px' }}>
              Valider et calculer les scores
            </button>
          </div>
        )}

        {step === 'results' && (
          <div>
            <p style={{ fontSize: 12, color: '#9b9a8f', marginBottom: 12 }}>
              Score basé sur : SCDW 40%, RSN 25%, PAI 15%, FUF 5%, WiFi 5%, LLI 5%, Upsell 5%.
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #ebe9e2', color: '#9b9a8f', fontSize: 12 }}>Agent</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid #ebe9e2', color: '#9b9a8f', fontSize: 12 }}>Contrats</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid #ebe9e2', color: '#9b9a8f', fontSize: 12 }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s, i) => (
                  <tr key={i}>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f5f4f0' }}>{s.agentName}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f5f4f0', textAlign: 'center' }}>{s.rentals}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #f5f4f0', textAlign: 'center', fontWeight: 500 }}>
                      {s.score}%
                      {s.rentals < MIN_RELIABLE_RENTALS && (
                        <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: '#c88a3e', marginTop: 2 }}>
                          ⚠ Peu de contrats
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={saveImport} disabled={saving} style={{ marginTop: 16, fontSize: 13, padding: '8px 14px' }}>
              {saving ? 'Enregistrement…' : 'Enregistrer ces performances'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
