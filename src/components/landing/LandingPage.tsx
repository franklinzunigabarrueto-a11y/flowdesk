'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { ArrowRight, Zap, MessageSquare, Calendar, CheckSquare, BookOpen, Mic, Star } from 'lucide-react'

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
    <div style={{ background: '#0a0a0f', minHeight: '100vh', color: '#f0f0f5', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Background gradients */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(124,92,252,0.25) 0%, transparent 70%)',
      }} />

      {/* ── NAVBAR ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(10,10,15,0.85)',
        backdropFilter: 'blur(16px)',
      }}>
        <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '0 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '9px',
              background: 'linear-gradient(135deg, #7c5cfc, #00e5cc)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Zap size={17} color="white" strokeWidth={2.5} />
            </div>
            <span style={{ fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Flow<span style={{ color: '#7c5cfc' }}>Desk</span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              style={{
                padding: '8px 20px', borderRadius: '8px',
                background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(240,240,245,0.8)', cursor: 'pointer',
                fontSize: '0.875rem', fontWeight: 500,
              }}
            >
              Iniciar sesión
            </button>
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              style={{
                padding: '8px 20px', borderRadius: '8px',
                background: 'linear-gradient(135deg, #7c5cfc, #5b3fd4)',
                border: 'none', color: 'white', cursor: 'pointer',
                fontSize: '0.875rem', fontWeight: 600,
              }}
            >
              Comenzar gratis
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: '7rem 2rem 5rem' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            padding: '5px 14px', borderRadius: '100px',
            background: 'rgba(124,92,252,0.12)',
            border: '1px solid rgba(124,92,252,0.35)',
            fontSize: '0.78rem', color: '#a78bfa',
            marginBottom: '2rem', letterSpacing: '0.02em', fontWeight: 500
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7c5cfc', display: 'inline-block' }} />
            Productividad desde WhatsApp · Con IA
          </div>

          <h1 style={{
            fontSize: 'clamp(2.6rem, 6vw, 4.2rem)',
            fontWeight: 800, lineHeight: 1.08,
            letterSpacing: '-0.04em', marginBottom: '1.5rem',
          }}>
            Tu agenda y tareas,{' '}
            <span style={{
              background: 'linear-gradient(135deg, #7c5cfc 0%, #00e5cc 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'
            }}>desde un mensaje</span>
          </h1>

          <p style={{
            fontSize: '1.125rem', color: 'rgba(240,240,245,0.55)',
            lineHeight: 1.75, maxWidth: '580px', margin: '0 auto 2.5rem',
          }}>
            Escribe o graba un audio en WhatsApp y FlowDesk lo convierte en tareas, eventos de calendario o apuntes de diario — automáticamente.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '10px',
                padding: '14px 28px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #7c5cfc, #5b3fd4)',
                border: 'none', color: 'white', cursor: 'pointer',
                fontSize: '1rem', fontWeight: 600,
                boxShadow: '0 0 40px rgba(124,92,252,0.35)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
            >
              <GoogleIcon />
              {loading ? 'Conectando...' : 'Comenzar con Google'}
              {!loading && <ArrowRight size={17} />}
            </button>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'rgba(240,240,245,0.3)', marginTop: '1rem' }}>
            Gratis para comenzar · Sin tarjeta de crédito
          </p>
        </div>

        {/* Mock chat preview */}
        <div style={{ maxWidth: '500px', margin: '4rem auto 0', position: 'relative' }}>
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px', padding: '1.5rem',
            boxShadow: '0 40px 80px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { from: 'user', text: '🎙️ [Audio 0:08] — reunión de obra mañana a las 9am' },
                { from: 'bot', text: '✅ Evento creado en Google Calendar\n📅 Reunión de obra — mañana 9:00 AM' },
                { from: 'user', text: 'Crear tarea: revisar planos del segundo piso' },
                { from: 'bot', text: '📋 Tarea creada: «Revisar planos del segundo piso»' },
              ].map((msg, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: msg.from === 'user' ? 'flex-end' : 'flex-start',
                }}>
                  <div style={{
                    maxWidth: '85%', padding: '10px 14px',
                    borderRadius: msg.from === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: msg.from === 'user' ? 'rgba(124,92,252,0.25)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${msg.from === 'user' ? 'rgba(124,92,252,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    fontSize: '0.85rem', lineHeight: 1.5,
                    color: msg.from === 'user' ? '#c4b5fd' : 'rgba(240,240,245,0.85)',
                    whiteSpace: 'pre-line',
                    textAlign: 'left',
                  }}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Glow under chat */}
          <div style={{
            position: 'absolute', bottom: '-40px', left: '50%', transform: 'translateX(-50%)',
            width: '60%', height: '80px',
            background: 'radial-gradient(ellipse, rgba(124,92,252,0.3) 0%, transparent 70%)',
            filter: 'blur(20px)', pointerEvents: 'none',
          }} />
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ── */}
      <section style={{ position: 'relative', zIndex: 10, padding: '6rem 2rem' }}>
        <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.1em', color: '#7c5cfc', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Cómo funciona
            </p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700, letterSpacing: '-0.03em' }}>
              Tres pasos, cero fricción
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
            {[
              {
                n: '01', color: '#7c5cfc',
                title: 'Escribe o graba',
                desc: 'Desde WhatsApp, escribe lo que necesitas hacer o manda un audio. Sin apps nuevas, sin aprender nada.',
                icon: <MessageSquare size={22} />,
              },
              {
                n: '02', color: '#00e5cc',
                title: 'La IA lo entiende',
                desc: 'FlowDesk detecta si es una tarea, un evento o una nota de diario, y lo clasifica automáticamente.',
                icon: <Zap size={22} />,
              },
              {
                n: '03', color: '#f59e0b',
                title: 'Se sincroniza todo',
                desc: 'Tu tarea aparece en el panel, el evento va a Google Calendar y el audio queda transcrito en tu diario.',
                icon: <Calendar size={22} />,
              },
            ].map((step) => (
              <div key={step.n} style={{
                padding: '2rem',
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '20px',
                position: 'relative',
                overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: '1.5rem', right: '1.5rem',
                  fontSize: '3.5rem', fontWeight: 800, color: 'rgba(255,255,255,0.03)',
                  lineHeight: 1, letterSpacing: '-0.04em',
                }}>
                  {step.n}
                </div>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '12px',
                  background: `${step.color}18`,
                  border: `1px solid ${step.color}35`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: step.color, marginBottom: '1.25rem'
                }}>
                  {step.icon}
                </div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.6rem' }}>
                  {step.title}
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'rgba(240,240,245,0.5)', lineHeight: 1.65 }}>
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CARACTERÍSTICAS ── */}
      <section style={{ position: 'relative', zIndex: 10, padding: '2rem 2rem 6rem' }}>
        <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.1em', color: '#7c5cfc', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Características
            </p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700, letterSpacing: '-0.03em' }}>
              Todo lo que necesitas
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            {[
              { icon: <CheckSquare size={20} />, color: '#00e5cc', title: 'Gestión de tareas', desc: 'Crea y completa tareas desde el chat. La IA detecta cuando algo está listo.' },
              { icon: <Calendar size={20} />, color: '#f59e0b', title: 'Google Calendar', desc: 'Agenda eventos directamente desde WhatsApp. Todo sincronizado.' },
              { icon: <BookOpen size={20} />, color: '#22c55e', title: 'Diario personal', desc: 'Guarda reflexiones y apuntes con texto o audio. Organizados por fecha.' },
              { icon: <Mic size={20} />, color: '#ef4444', title: 'Mensajes de voz', desc: 'Habla, FlowDesk transcribe y clasifica. Sin escribir, sin esfuerzo.' },
              { icon: <Zap size={20} />, color: '#7c5cfc', title: 'IA contextual', desc: 'Entiende frases naturales y detecta intenciones sin comandos especiales.' },
              { icon: <MessageSquare size={20} />, color: '#3b82f6', title: 'Solo WhatsApp', desc: 'Ninguna app nueva que aprender. Funciona donde ya estás.' },
            ].map((f, i) => (
              <div key={i} style={{
                padding: '1.4rem',
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '16px',
              }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '10px',
                  background: `${f.color}15`, border: `1px solid ${f.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: f.color, marginBottom: '0.9rem'
                }}>
                  {f.icon}
                </div>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.4rem' }}>{f.title}</h3>
                <p style={{ fontSize: '0.82rem', color: 'rgba(240,240,245,0.45)', lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL ── */}
      <section style={{ position: 'relative', zIndex: 10, padding: '2rem 2rem 6rem' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '24px',
            padding: 'clamp(2rem, 5vw, 3.5rem)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Glow */}
            <div style={{
              position: 'absolute', top: '-60px', right: '-60px',
              width: '200px', height: '200px',
              background: 'radial-gradient(ellipse, rgba(124,92,252,0.2) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />

            {/* Stars */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem' }}>
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={16} fill="#f59e0b" color="#f59e0b" />
              ))}
            </div>

            <blockquote style={{
              fontSize: 'clamp(1.05rem, 2.5vw, 1.3rem)',
              fontWeight: 500, lineHeight: 1.7,
              color: 'rgba(240,240,245,0.9)',
              marginBottom: '2rem',
              fontStyle: 'italic',
            }}>
              "En obra, el WhatsApp ya es la herramienta de comunicación principal — es lo que usamos para coordinar con cuadrillas, proveedores y jefatura mientras estamos en terreno. Entonces me pregunté: ¿por qué no organizar mi día desde ahí mismo? Creé FlowDesk porque necesitaba algo que se adaptara a ese ritmo, no al revés. Sin aprender apps nuevas, sin salir del flujo de trabajo."
            </blockquote>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #7c5cfc, #00e5cc)',
                flexShrink: 0, overflow: 'hidden',
                border: '2px solid rgba(124,92,252,0.5)',
              }}>
                <img
                  src="/franklin.jpg"
                  alt="Franklin Zuñiga"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
              <div>
                <p style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '2px' }}>Franklin Zuñiga</p>
                <p style={{ fontSize: '0.82rem', color: 'rgba(240,240,245,0.45)' }}>
                  Ingeniero Constructor · Creador de FlowDesk
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section style={{ position: 'relative', zIndex: 10, padding: '2rem 2rem 8rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.6rem)',
            fontWeight: 800, letterSpacing: '-0.03em',
            marginBottom: '1.25rem', lineHeight: 1.15,
          }}>
            Empieza hoy,{' '}
            <span style={{
              background: 'linear-gradient(135deg, #7c5cfc, #00e5cc)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'
            }}>gratis</span>
          </h2>
          <p style={{ color: 'rgba(240,240,245,0.45)', fontSize: '1rem', marginBottom: '2.5rem', lineHeight: 1.7 }}>
            Solo necesitas Google y WhatsApp. En menos de un minuto ya puedes empezar a organizar tu día.
          </p>
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              padding: '15px 32px', borderRadius: '14px',
              background: 'linear-gradient(135deg, #7c5cfc, #5b3fd4)',
              border: 'none', color: 'white', cursor: 'pointer',
              fontSize: '1rem', fontWeight: 600,
              boxShadow: '0 0 50px rgba(124,92,252,0.4)',
            }}
          >
            <GoogleIcon />
            {loading ? 'Conectando...' : 'Comenzar con Google'}
            {!loading && <ArrowRight size={17} />}
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        position: 'relative', zIndex: 10,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '2rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '1rem',
        maxWidth: '1120px', margin: '0 auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '26px', height: '26px', borderRadius: '6px',
            background: 'linear-gradient(135deg, #7c5cfc, #00e5cc)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Zap size={13} color="white" strokeWidth={2.5} />
          </div>
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
            Flow<span style={{ color: '#7c5cfc' }}>Desk</span>
          </span>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'rgba(240,240,245,0.25)' }}>
          © 2025 FlowDesk · Hecho con intención, no con ruido.
        </p>
      </footer>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path fill="rgba(255,255,255,0.9)" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="rgba(255,255,255,0.75)" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="rgba(255,255,255,0.6)" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
