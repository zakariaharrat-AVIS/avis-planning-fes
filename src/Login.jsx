import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login') // login | forgot | reset
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError('Entrez un email et un mot de passe.')
      return
    }
    setError('')
    setLoading(true)
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setLoading(false)
    if (authError) {
      setError('Email ou mot de passe incorrect.')
      return
    }
    onLogin(data.user)
  }

  const sendResetCode = async (e) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Entrez votre email.')
      return
    }
    setError('')
    setInfo('')
    setLoading(true)
    const { error: otpError } = await supabase.auth.signInWithOtp({ email: email.trim() })
    setLoading(false)
    if (otpError) {
      setError('Erreur lors de l\'envoi du code : ' + otpError.message)
      return
    }
    setInfo('Un code à 6 chiffres a été envoyé à ' + email.trim() + '.')
    setMode('reset')
  }

  const verifyAndReset = async (e) => {
    e.preventDefault()
    if (!code.trim() || !newPassword.trim()) {
      setError('Entrez le code reçu et votre nouveau mot de passe.')
      return
    }
    if (newPassword.trim().length < 6) {
      setError('Le nouveau mot de passe doit contenir au moins 6 caractères.')
      return
    }
    setError('')
    setLoading(true)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })
    if (verifyError) {
      setLoading(false)
      setError('Code incorrect ou expiré.')
      return
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword.trim() })
    setLoading(false)
    if (updateError) {
      setError('Erreur lors de la mise à jour du mot de passe : ' + updateError.message)
      return
    }
    setInfo('Mot de passe mis à jour. Vous pouvez vous connecter.')
    setMode('login')
    setPassword('')
    setCode('')
    setNewPassword('')
  }

  const labelStyle = { fontSize: 12, color: '#6b6a60', display: 'block', marginBottom: 4 }
  const inputStyle = { width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #c9c6ba', fontSize: 14 }
  const buttonStyle = {
    marginTop: 6, background: '#d81f26', color: '#fff', border: 'none',
    padding: '10px', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer',
  }
  const linkStyle = { fontSize: 12, color: '#0c447c', cursor: 'pointer', textAlign: 'center', background: 'none', border: 'none', padding: 0 }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f5f4f0',
    }}>
      <form
        onSubmit={mode === 'login' ? handleSubmit : mode === 'forgot' ? sendResetCode : verifyAndReset}
        style={{
          background: '#fff', borderRadius: 12, padding: '32px 28px', width: 320,
          border: '0.5px solid #e2e0d8', display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <img src="/avis-logo.jpg" alt="Avis" style={{ width: 100, alignSelf: 'center', marginBottom: 8, borderRadius: 6 }} />
        <div style={{ fontSize: 15, fontWeight: 500, textAlign: 'center', marginBottom: 4 }}>
          Planning Avis Maroc
        </div>

        {mode === 'login' && (
          <>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nom@avis.ma" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Mot de passe</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={inputStyle} />
            </div>
          </>
        )}

        {mode === 'forgot' && (
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nom@avis.ma" style={inputStyle} />
          </div>
        )}

        {mode === 'reset' && (
          <>
            <div>
              <label style={labelStyle}>Code reçu par email</label>
              <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Nouveau mot de passe</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" style={inputStyle} />
            </div>
          </>
        )}

        {error && <div style={{ fontSize: 13, color: '#a32d2d' }}>{error}</div>}
        {info && <div style={{ fontSize: 13, color: '#5f8f5f' }}>{info}</div>}

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Patientez…' : mode === 'login' ? 'Se connecter' : mode === 'forgot' ? 'Envoyer le code' : 'Valider le nouveau mot de passe'}
        </button>

        {mode === 'login' && (
          <button type="button" onClick={() => { setMode('forgot'); setError(''); setInfo('') }} style={linkStyle}>
            Mot de passe oublié ?
          </button>
        )}
        {mode !== 'login' && (
          <button type="button" onClick={() => { setMode('login'); setError(''); setInfo('') }} style={linkStyle}>
            Retour à la connexion
          </button>
        )}
      </form>
    </div>
  )
}
