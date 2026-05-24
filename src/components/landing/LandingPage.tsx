'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { MessageSquare, Calendar, CheckSquare, BookOpen, Zap, ArrowRight, Mic } from 'lucide-react'

export default function LandingPage() {
  const [loading, setLoading] = useState(false)

  async function handleGoogleLogin() {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'openid email profile https://www.googleapis.com/auth/calendar',
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
  }

  return (
    <div style={{ background: 'var(--background)', minHeight: '100vh', overflow: 'hidden' }}>
      {/* Fondo con gradiente */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        background: 'radial-gradient(ellipse at 20% 50%, rgba(124,92,252,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(0,229,204,0.1) 0%, transparent 50%)',
        pointerEvents: 'none'
      }} />

      {/* Navbar */}
      <nav style={{
        position: 'relative', zIndex: 10,
        borderBottom: '1px solid var(--border)',
        background: 'rgba(10,10,15,0.8)',
        backdropFilter: 'blur(12px)',
        padding: '0 2rem'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: 'linear-gradient(135deg, var(--primary), var(--accent))',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Zap size={18} color="white" />
            </div>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Flow<span style={{ color: 'var(--primary)' }}>Desk</span>
            </span>
          </div>
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
              transition: 'all 0.2s'
            }}
          >
            Iniciar sesión
          </button>
        </div>
      </nav>

      {/* Hero */}
      <main style={{ position: 'relative', zIndex: 10, maxWidth: '1200px', margin: '0 auto', padding: '6rem 2rem 4rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '6px 16px', borderRadius: '100px',
            background: 'rgba(124,92,252,0.1)',
            border: '1px solid rgba(124,92,252,0.3)',
            fontSize: '0.8rem', color: 'var(--primary)',
            marginBottom: '2rem'
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary)', animation: 'pulse-glow 2s infinite' }} />
            Tu segundo cerebro en WhatsApp
          </div>

          <h1 style={{
            fontSize: 'clamp(2.5rem, 6vw, 4rem)',
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            marginBottom: '1.5rem',
            background: 'linear-gradient(135deg, #f0f0f5 0%, rgba(240,240,245,0.7) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            Organiza tu vida desde{' '}
            <span style={{
              background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>WhatsApp</span>
          </h1>

          <p style={{
            fontSize: '1.125rem',
            color: 'var(--text-muted)',
            lineHeight: 1.7,
            marginBottom: '3rem',
            maxWidth: '600px',
            margin: '0 auto 3rem'
          }}>
            Escribe o graba un audio en WhatsApp y FlowDesk lo convierte automáticamente en tareas, eventos de calendario o entradas de tu diario personal.
          </p>

          {/* CTA */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '14px 28px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                border: 'none', color: 'white', cursor: 'pointer',
                fontSize: '1rem', fontWeight: 600,
                boxShadow: '0 0 30px var(--primary-glow)',
                transition: 'all 0.2s'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="rgba(255,255,255,0.8)" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="rgba(255,255,255,0.6)" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="rgba(255,255,255,0.9)" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {loading ? 'Conectando...' : 'Comenzar con Google'}
              {!loading && <ArrowRight size={18} />}
            </button>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
            Gratis para comenzar · Sin tarjeta de crédito
          </p>
        </div>

        {/* Features */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.5rem',
          marginTop: '6rem'
        }}>
          {[
            {
              icon: <MessageSquare size={22} />, color: '#7c5cfc',
              title: 'WhatsApp como centro',
              desc: 'Escribe o manda un audio. FlowDesk entiende el contexto y lo clasifica automáticamente.'
            },
            {
              icon: <CheckSquare size={22} />, color: '#00e5cc',
              title: 'Gestión de tareas',
              desc: 'Crea, actualiza y marca tareas como completadas desde el chat. Se sincronizan en tiempo real.'
            },
            {
              icon: <Calendar size={22} />, color: '#f59e0b',
              title: 'Calendario integrado',
              desc: 'Agenda eventos directamente desde WhatsApp. Sincronizado con Google Calendar.'
            },
            {
              icon: <BookOpen size={22} />, color: '#22c55e',
              title: 'Diario personal',
              desc: 'Registra tu día a día con texto o audio. Filtrable por fecha, siempre disponible.'
            },
            {
              icon: <Mic size={22} />, color: '#ef4444',
              title: 'Transcripción de voz',
              desc: 'Envía un audio y la IA lo transcribe y clasifica. Habla, FlowDesk escucha.'
            },
            {
              icon: <Zap size={22} />, color: '#7c5cfc',
              title: 'IA que comprende',
              desc: 'Detecta si completaste una tarea pendiente y la marca automáticamente.'
            }
          ].map((feature, i) => (
            <div key={i} style={{
              padding: '1.5rem',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              transition: 'all 0.2s',
              cursor: 'default'
            }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '10px',
                background: `${feature.color}20`,
                border: `1px solid ${feature.color}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: feature.color, marginBottom: '1rem'
              }}>
                {feature.icon}
              </div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                {feature.title}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        position: 'relative', zIndex: 10,
        borderTop: '1px solid var(--border)',
        padding: '2rem',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '0.85rem'
      }}>
        © 2024 FlowDesk · Tu productividad, simplificada.
      </footer>
    </div>
  )
}
