'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { ArrowRight, MessageSquare, Calendar, CheckSquare, BookOpen, Mic, Star, Zap } from 'lucide-react'

// Colores de construcción
const C = {
  orange: '#f97316',
  orangeDark: '#c2410c',
  orangeGlow: 'rgba(249,115,22,0.25)',
  bg: '#ffffff',
  surface: 'rgba(0,0,0,0.03)',
  border: 'rgba(0,0,0,0.08)',
  text: '#1c1917',
  muted: 'rgba(28,25,23,0.5)',
}

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
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Fondo */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 40% at 50% -10%, rgba(249,115,22,0.18) 0%, transparent 70%)',
      }} />

      {/* ── NAVBAR ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        borderBottom: `1px solid ${C.border}`,
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(16px)',
      }}>
        <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '0 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
          <LogoMark />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={handleGoogleLogin} disabled={loading} style={{
              padding: '8px 18px', borderRadius: '8px',
              background: 'transparent', border: `1px solid ${C.border}`,
              color: 'rgba(28,25,23,0.6)', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500,
            }}>
              Iniciar sesión
            </button>
            <button onClick={handleGoogleLogin} disabled={loading} style={{
              padding: '8px 18px', borderRadius: '8px',
              background: C.orange, border: 'none',
              color: 'white', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600,
            }}>
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
            background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)',
            fontSize: '0.78rem', color: C.orange,
            marginBottom: '2rem', letterSpacing: '0.02em', fontWeight: 600,
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.orange, display: 'inline-block' }} />
            La agenda del constructor
          </div>

          <h1 style={{
            fontSize: 'clamp(2.5rem, 6vw, 4rem)',
            fontWeight: 800, lineHeight: 1.08,
            letterSpacing: '-0.04em', marginBottom: '1.5rem',
          }}>
            Tu obra organizada,{' '}
            <span style={{ color: C.orange }}>desde WhatsApp</span>
          </h1>

          <p style={{
            fontSize: '1.1rem', color: C.muted,
            lineHeight: 1.75, maxWidth: '560px', margin: '0 auto 2.5rem',
          }}>
            Escribe o manda un audio mientras estás en terreno y FlowDesk lo convierte en tareas, eventos de calendario o apuntes — sin salir del WhatsApp que ya usas.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleGoogleLogin} disabled={loading} style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              padding: '14px 28px', borderRadius: '12px',
              background: C.orange, border: 'none',
              color: 'white', cursor: 'pointer', fontSize: '1rem', fontWeight: 600,
              boxShadow: `0 0 40px ${C.orangeGlow}`,
            }}>
              <GoogleIcon />
              {loading ? 'Conectando...' : 'Comenzar con Google'}
              {!loading && <ArrowRight size={17} />}
            </button>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'rgba(28,25,23,0.4)', marginTop: '1rem' }}>
            Gratis para comenzar · Sin tarjeta de crédito
          </p>
        </div>

        {/* Mock chat */}
        <div style={{ maxWidth: '480px', margin: '4.5rem auto 0', position: 'relative' }}>
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${C.border}`,
            borderRadius: '20px', padding: '1.5rem',
            boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { from: 'user', text: '🎙️ [Audio 0:11] — reunión con la ITO el viernes a las 10am en obra' },
                { from: 'bot', text: '✅ Evento creado en Google Calendar\n📅 Reunión ITO — viernes 10:00 AM' },
                { from: 'user', text: 'Pendiente: solicitar certificado de hormigón al laboratorio' },
                { from: 'bot', text: '📋 Tarea creada: «Solicitar certificado de hormigón al laboratorio»' },
              ].map((msg, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: msg.from === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '88%', padding: '10px 14px',
                    borderRadius: msg.from === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: msg.from === 'user' ? 'rgba(249,115,22,0.12)' : 'rgba(0,0,0,0.04)',
                    border: `1px solid ${msg.from === 'user' ? 'rgba(249,115,22,0.3)' : C.border}`,
                    fontSize: '0.84rem', lineHeight: 1.5,
                    color: msg.from === 'user' ? '#c2410c' : 'rgba(28,25,23,0.8)',
                    whiteSpace: 'pre-line', textAlign: 'left',
                  }}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{
            position: 'absolute', bottom: '-30px', left: '50%', transform: 'translateX(-50%)',
            width: '55%', height: '60px',
            background: `radial-gradient(ellipse, ${C.orangeGlow} 0%, transparent 70%)`,
            filter: 'blur(15px)', pointerEvents: 'none',
          }} />
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ── */}
      <section style={{ position: 'relative', zIndex: 10, padding: '6rem 2rem' }}>
        <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', color: C.orange, textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Cómo funciona
            </p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 700, letterSpacing: '-0.03em' }}>
              Tres pasos, cero fricción
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {[
              {
                n: '01', color: C.orange,
                title: 'Escribe o graba',
                desc: 'Desde WhatsApp, donde ya estás. Un texto rápido o un audio mientras caminas la obra — como siempre lo has hecho.',
                icon: <MessageSquare size={22} />,
              },
              {
                n: '02', color: C.orange,
                title: 'La IA lo entiende',
                desc: 'FlowDesk detecta si es una tarea, un evento o una nota y lo clasifica solo. Sin comandos, sin estructuras especiales.',
                icon: <Zap size={22} />,
              },
              {
                n: '03', color: C.orange,
                title: 'Se sincroniza todo',
                desc: 'El evento va a Google Calendar, la tarea aparece en tu panel y el audio queda transcrito. Todo en su lugar.',
                icon: <Calendar size={22} />,
              },
            ].map((step) => (
              <div key={step.n} style={{
                padding: '2rem', background: C.surface,
                border: `1px solid ${C.border}`, borderRadius: '20px', position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: '1.25rem', right: '1.5rem',
                  fontSize: '3.5rem', fontWeight: 800, color: 'rgba(0,0,0,0.05)',
                  lineHeight: 1, letterSpacing: '-0.04em',
                }}>
                  {step.n}
                </div>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '12px',
                  background: 'rgba(249,115,22,0.1)',
                  border: '1px solid rgba(249,115,22,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: step.color, marginBottom: '1.25rem',
                }}>
                  {step.icon}
                </div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.6rem' }}>{step.title}</h3>
                <p style={{ fontSize: '0.875rem', color: C.muted, lineHeight: 1.65 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CARACTERÍSTICAS ── */}
      <section style={{ position: 'relative', zIndex: 10, padding: '2rem 2rem 6rem' }}>
        <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', color: C.orange, textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Características
            </p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 700, letterSpacing: '-0.03em' }}>
              Todo lo que necesitas en obra
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            {[
              { icon: <CheckSquare size={20} />, color: C.orange, title: 'Gestión de tareas', desc: 'Crea y completa pendientes desde el chat. La IA detecta cuando algo ya está listo.' },
              { icon: <Calendar size={20} />, color: C.orange, title: 'Google Calendar', desc: 'Agenda reuniones y visitas de inspección directamente desde WhatsApp.' },
              { icon: <BookOpen size={20} />, color: C.orange, title: 'Bitácora de obra', desc: 'Registra decisiones, observaciones y notas del día. Organizadas por fecha.' },
              { icon: <Mic size={20} />, color: C.orange, title: 'Mensajes de voz', desc: 'Habla, FlowDesk transcribe y clasifica. Ideal cuando tienes las manos ocupadas.' },
              { icon: <Zap size={20} />, color: C.orange, title: 'IA contextual', desc: 'Entiende frases naturales. No necesitas aprender comandos ni estructuras.' },
              { icon: <MessageSquare size={20} />, color: C.orange, title: 'Solo WhatsApp', desc: 'Ninguna app nueva. Funciona donde ya te comunicas con tu equipo.' },
            ].map((f, i) => (
              <div key={i} style={{ padding: '1.4rem', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '10px',
                  background: 'rgba(249,115,22,0.1)',
                  border: '1px solid rgba(249,115,22,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: f.color, marginBottom: '0.9rem',
                }}>
                  {f.icon}
                </div>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.4rem' }}>{f.title}</h3>
                <p style={{ fontSize: '0.82rem', color: C.muted, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL ── */}
      <section style={{ position: 'relative', zIndex: 10, padding: '2rem 2rem 6rem' }}>
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: '24px', padding: 'clamp(2rem, 5vw, 3.5rem)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: '-80px', right: '-80px',
              width: '220px', height: '220px',
              background: `radial-gradient(ellipse, rgba(249,115,22,0.15) 0%, transparent 70%)`,
              pointerEvents: 'none',
            }} />
            <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem' }}>
              {[...Array(5)].map((_, i) => <Star key={i} size={16} fill={C.orange} color={C.orange} />)}
            </div>
            <blockquote style={{
              fontSize: 'clamp(1rem, 2.5vw, 1.2rem)', fontWeight: 500,
              lineHeight: 1.75, color: 'rgba(28,25,23,0.85)',
              marginBottom: '2rem', fontStyle: 'italic',
            }}>
              "En obra, el WhatsApp ya es la herramienta de comunicación principal — es lo que usamos para coordinar con cuadrillas, proveedores y jefatura mientras estamos en terreno. Entonces me pregunté: ¿por qué no organizar mi día desde ahí mismo? Creé FlowDesk porque necesitaba algo que se adaptara a ese ritmo, no al revés. Sin aprender apps nuevas, sin salir del flujo de trabajo."
            </blockquote>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '50%',
                flexShrink: 0, overflow: 'hidden',
                border: `2px solid rgba(249,115,22,0.5)`,
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
                <p style={{ fontSize: '0.82rem', color: C.muted }}>Ingeniero Constructor · Creador de FlowDesk</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section style={{ position: 'relative', zIndex: 10, padding: '2rem 2rem 8rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '580px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '1.25rem', lineHeight: 1.15 }}>
            Empieza hoy,{' '}
            <span style={{ color: C.orange }}>gratis</span>
          </h2>
          <p style={{ color: C.muted, fontSize: '1rem', marginBottom: '2.5rem', lineHeight: 1.7 }}>
            Solo necesitas Google y WhatsApp. En menos de un minuto ya puedes empezar a organizar tu día de obra.
          </p>
          <button onClick={handleGoogleLogin} disabled={loading} style={{
            display: 'inline-flex', alignItems: 'center', gap: '10px',
            padding: '15px 32px', borderRadius: '14px',
            background: C.orange, border: 'none',
            color: 'white', cursor: 'pointer', fontSize: '1rem', fontWeight: 600,
            boxShadow: `0 0 50px ${C.orangeGlow}`,
          }}>
            <GoogleIcon />
            {loading ? 'Conectando...' : 'Comenzar con Google'}
            {!loading && <ArrowRight size={17} />}
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        position: 'relative', zIndex: 10,
        borderTop: `1px solid ${C.border}`,
        padding: '2rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '1rem',
        maxWidth: '1120px', margin: '0 auto',
      }}>
        <LogoMark />
        <p style={{ fontSize: '0.8rem', color: 'rgba(28,25,23,0.4)' }}>
          © 2026 FlowDesk · Hecho para la obra, desde la obra.
        </p>
      </footer>
    </div>
  )
}

function LogoMark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <LogoSVG size={36} />
      <div>
        <span style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
          Flow<span style={{ color: '#f97316' }}>Desk</span>
        </span>
        <p style={{ fontSize: '0.62rem', color: 'rgba(28,25,23,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: '1px', lineHeight: 1 }}>
          La agenda del constructor
        </p>
      </div>
    </div>
  )
}

function LogoSVG({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="8" fill="#f97316"/>
      {/* Pines del calendario */}
      <rect x="11" y="6" width="3.5" height="6" rx="1.75" stroke="white" strokeWidth="1.5"/>
      <rect x="21.5" y="6" width="3.5" height="6" rx="1.75" stroke="white" strokeWidth="1.5"/>
      {/* Marco calendario */}
      <rect x="5" y="9" width="26" height="22" rx="3" stroke="white" strokeWidth="1.5"/>
      {/* Línea divisoria del encabezado */}
      <line x1="5" y1="15" x2="31" y2="15" stroke="white" strokeWidth="1.5"/>
      {/* Domo del casco */}
      <path d="M10.5 27C10.5 21 14 17.5 18 17.5C22 17.5 25.5 21 25.5 27" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Ala del casco */}
      <rect x="8" y="27" width="20" height="2.5" rx="1.25" stroke="white" strokeWidth="1.5"/>
      {/* Ranuras de ventilación */}
      <line x1="15" y1="20" x2="14.5" y2="26.5" stroke="white" strokeWidth="1" strokeLinecap="round"/>
      <line x1="18" y1="18.5" x2="18" y2="26.5" stroke="white" strokeWidth="1" strokeLinecap="round"/>
      <line x1="21" y1="20" x2="21.5" y2="26.5" stroke="white" strokeWidth="1" strokeLinecap="round"/>
    </svg>
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
