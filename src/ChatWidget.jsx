import { useState, useRef, useEffect } from 'react'

export default function ChatWidget({ agencyName, weekLabel, scheduleData }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Bonjour ! Posez-moi une question sur le planning de cette semaine (qui travaille, qui est en congé, les heures d\'un agent...).' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, open])

  const send = async () => {
    const question = input.trim()
    if (!question || loading) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: question }])
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context: { agencyName, weekLabel, scheduleData },
        }),
      })
      const data = await res.json()
      const answer = res.ok ? data.answer : `Erreur : ${data.error || 'Une erreur est survenue.'}`
      setMessages((m) => [...m, { role: 'assistant', text: answer }])
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: 'Erreur de connexion. Réessayez.' }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div style={{ position: 'fixed', bottom: 20, left: 20, zIndex: 3000 }}>
      {open && (
        <div style={{
          width: 320, height: 420, background: '#fff', borderRadius: 14,
          boxShadow: '0 8px 30px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column',
          marginBottom: 12, overflow: 'hidden', border: '1px solid #e2e0d8',
        }}>
          <div style={{
            background: '#d81f26', color: '#fff', padding: '12px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Assistant Planning</div>
            <span onClick={() => setOpen(false)} style={{ cursor: 'pointer', fontSize: 16 }}>✕</span>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  background: m.role === 'user' ? '#d81f26' : '#f5f4f0',
                  color: m.role === 'user' ? '#fff' : '#26251f',
                  padding: '8px 12px', borderRadius: 10, fontSize: 13, maxWidth: '85%', lineHeight: 1.4,
                }}
              >
                {m.text}
              </div>
            ))}
            {loading && (
              <div style={{ alignSelf: 'flex-start', color: '#9b9a8f', fontSize: 12, padding: '4px 12px' }}>
                Réflexion…
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid #ebe9e2' }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez votre question…"
              style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #c9c6ba', fontSize: 13 }}
            />
            <button onClick={send} disabled={loading} style={{ fontSize: 13, padding: '8px 12px' }}>Envoyer</button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 56, height: 56, borderRadius: '50%', background: '#d81f26', color: '#fff',
          border: 'none', boxShadow: '0 4px 14px rgba(0,0,0,0.25)', cursor: 'pointer', fontSize: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {open ? '' : '💬'}
      </button>
    </div>
  )
}
