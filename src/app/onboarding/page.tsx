'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Phone, CheckCircle, ArrowRight } from 'lucide-react'

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/'); return }
      setUser({
        name: data.user.user_metadata?.full_name || 'Usuario',
        email: data.user.email || ''
      })
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim()) return
    setLoading(true)

    try {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) throw new Error('No autenticado')

      await supabase.from('users').upsert({
        id: authUser.id,
        email: authUser.email,
        name: authUser.user_metadata?.full_name,
        avatar_url: authUser.user_metadata?.avatar_url,
        whatsapp_number: phone.replace(/\D/g, ''),
        onboarding_completed: true,
      })

      await fetch('/api/whatsapp/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.replace(/\D/g, ''), name: user?.name }),
      })

      setStep(3)
      setTimeout(() => router.push('/dashboard'), 2500)
    } catch (err) {
      console.error(err)
      setError('Hubo un problema al conectar. Verifica el número e inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--background)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem',
      position: 'relative'
    }}>
      {/* Fondo */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse at 50% 50%, rgba(249,115,22,0.1) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      <div style={{
        width: '100%', maxWidth: '440px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '24px',
        padding: '2.5rem',
        position: 'relative', zIndex: 10
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2rem' }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="36" height="36" rx="9" fill="#f97316"/>
            <rect x="7" y="11" width="22" height="17" rx="3" fill="white" fillOpacity="0.12"/>
            <rect x="7" y="11" width="22" height="6" rx="3" fill="white" fillOpacity="0.2"/>
            <rect x="13" y="8" width="3" height="5" rx="1.5" fill="white"/>
            <rect x="20" y="8" width="3" height="5" rx="1.5" fill="white"/>
            <path d="M12 24 C12 19.5 15 17 18 17 C21 17 24 19.5 24 24 Z" fill="white"/>
            <rect x="11" y="23.5" width="14" height="2" rx="1" fill="white"/>
            <path d="M18 17 L18 23.5" stroke="#f97316" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <div>
            <span style={{ fontSize: '1.1rem', fontWeight: 800, display: 'block', lineHeight: 1 }}>
              Flow<span style={{ color: 'var(--primary)' }}>Desk</span>
            </span>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              La agenda del constructor
            </span>
          </div>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '2rem' }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{
              flex: 1, height: '4px', borderRadius: '2px',
              background: s <= step ? 'var(--primary)' : 'var(--border)',
              transition: 'background 0.4s'
            }} />
          ))}
        </div>

        {step === 1 && (
          <div style={{ animation: 'fadeIn 0.4s ease' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              ¡Bienvenido, {user?.name?.split(' ')[0]}! 👋
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem', lineHeight: 1.6 }}>
              Tu cuenta de Google está conectada. Ahora vamos a configurar tu número de WhatsApp para que puedas gestionar todo desde el chat.
            </p>
            <div style={{
              padding: '1rem',
              background: 'rgba(249,115,22,0.1)',
              border: '1px solid rgba(249,115,22,0.2)',
              borderRadius: '12px',
              marginBottom: '2rem'
            }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--primary)', lineHeight: 1.6 }}>
                ✅ Google Calendar conectado<br/>
                📧 {user?.email}
              </p>
            </div>
            <button
              onClick={() => setStep(2)}
              style={{
                width: '100%', padding: '14px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                border: 'none', color: 'white', cursor: 'pointer',
                fontSize: '1rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
            >
              Continuar <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit} style={{ animation: 'fadeIn 0.4s ease' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Tu número de WhatsApp
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem', lineHeight: 1.6 }}>
              Ingresa tu número con código de país. Nuestro bot te enviará un mensaje de bienvenida.
            </p>

            <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
              <div style={{
                position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-muted)'
              }}>
                <Phone size={18} />
              </div>
              <input
                type="tel"
                placeholder="+56 9 1234 5678"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
                style={{
                  width: '100%', padding: '14px 14px 14px 46px',
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  color: 'var(--foreground)',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
              />
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Incluye el código de país. Ej: +56 para Chile, +52 para México, +54 para Argentina.
            </p>

            {error && (
              <p style={{ fontSize: '0.85rem', color: '#ef4444', marginBottom: '1rem', padding: '10px 14px', background: 'rgba(239,68,68,0.08)', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !phone.trim()}
              style={{
                width: '100%', padding: '14px',
                borderRadius: '12px',
                background: phone.trim() ? 'linear-gradient(135deg, var(--primary), var(--primary-dark))' : 'var(--border)',
                border: 'none', color: 'white', cursor: phone.trim() ? 'pointer' : 'not-allowed',
                fontSize: '1rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              {loading ? 'Enviando mensaje...' : 'Conectar WhatsApp'}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>
        )}

        {step === 3 && (
          <div style={{ textAlign: 'center', animation: 'fadeIn 0.4s ease', padding: '1rem 0' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.5rem',
              animation: 'pulse-glow 2s infinite'
            }}>
              <CheckCircle size={32} color="#22c55e" />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              ¡Todo listo! 🎉
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              Revisa tu WhatsApp, te hemos enviado un mensaje de bienvenida.<br/>
              Redirigiendo a tu panel...
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
