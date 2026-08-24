import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
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

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f5f4f0',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#fff', borderRadius: 12, padding: '32px 28px', width: 320,
        border: '0.5px solid #e2e0d8', display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <img src="/avis-logo.jpg" alt="Avis" style={{ width: 100, alignSelf: 'center', marginBottom: 8, borderRadius: 6 }} />
        <div style={{ fontSize: 15, fontWeight: 500, textAlign: 'center', marginBottom: 4 }}>
          Planning Avis Maroc
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#6b6a60', display: 'block', marginBottom: 4 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nom@avis.ma"
            style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #c9c6ba', fontSize: 14 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#6b6a60', display: 'block', marginBottom: 4 }}>Mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #c9c6ba', fontSize: 14 }}
          />
        </div>
        {error && <div style={{ fontSize: 13, color: '#a32d2d' }}>{error}</div>}
        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 6, background: '#d81f26', color: '#fff', border: 'none',
            padding: '10px', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}
        >
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  )
}
