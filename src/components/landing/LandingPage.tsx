'use client'

import { useState, useRef } from 'react'
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

      {/* ── COMPARATIVA ── */}
      <section style={{ position: 'relative', zIndex: 10, padding: '2rem 2rem 6rem' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', color: C.orange, textTransform: 'uppercase', marginBottom: '0.75rem' }}>Comparativa</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', fontWeight: 700, letterSpacing: '-0.03em', color: C.text }}>
              Con y sin FlowDesk
            </h2>
          </div>
          <ComparisonSlider />
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

// ─── Comparison Slider ───────────────────────────────────────────────────────

function ComparisonSlider() {
  const [pos, setPos] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const move = (clientX: number) => {
    if (!containerRef.current) return
    const { left, width } = containerRef.current.getBoundingClientRect()
    setPos(Math.max(5, Math.min(95, ((clientX - left) / width) * 100)))
  }

  return (
    <div>
      <div
        ref={containerRef}
        onMouseMove={e => dragging.current && move(e.clientX)}
        onMouseUp={() => { dragging.current = false }}
        onMouseLeave={() => { dragging.current = false }}
        onTouchMove={e => move(e.touches[0].clientX)}
        onTouchEnd={() => { dragging.current = false }}
        style={{
          position: 'relative', height: '440px', overflow: 'hidden',
          borderRadius: '20px', cursor: 'col-resize', userSelect: 'none',
          border: '1px solid #e8e4de', boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
        }}
      >
        {/* Lado derecho: caos */}
        <div style={{ position: 'absolute', inset: 0 }}><ChaosSide /></div>

        {/* Lado izquierdo: FlowDesk */}
        <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <FlowDeskSide />
        </div>

        {/* Handle */}
        <div
          onMouseDown={e => { dragging.current = true; e.preventDefault() }}
          onTouchStart={() => { dragging.current = true }}
          style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${pos}%`, transform: 'translateX(-50%)',
            width: '3px', background: '#f97316', zIndex: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0,
            background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(249,115,22,0.45)', cursor: 'ew-resize',
          }}>
            <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
              <path d="M5.5 3L1.5 8.5L5.5 14M11.5 3L15.5 8.5L11.5 14" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        {/* Labels */}
        <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 10, pointerEvents: 'none' }}>
          <span style={{ background: '#f97316', color: 'white', fontSize: '0.62rem', fontWeight: 700, padding: '4px 12px', borderRadius: '100px', letterSpacing: '0.05em' }}>✦ CON FLOWDESK</span>
        </div>
        <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 10, pointerEvents: 'none' }}>
          <span style={{ background: 'rgba(0,0,0,0.1)', color: 'rgba(0,0,0,0.45)', fontSize: '0.62rem', fontWeight: 700, padding: '4px 12px', borderRadius: '100px', letterSpacing: '0.05em' }}>SIN FLOWDESK</span>
        </div>
      </div>
      <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'rgba(28,25,23,0.35)', marginTop: '0.75rem' }}>← Arrastra para comparar →</p>
    </div>
  )
}

function FlowDeskSide() {
  const days: { label: string; events: { color: string; title: string; time: string; top: number; height: number }[] }[] = [
    { label: 'LUN 19', events: [
      { color: '#f97316', title: 'Reunión ITO', time: '09:00–10:30', top: 0, height: 58 },
      { color: '#3b82f6', title: 'Moldajes', time: '15:00', top: 238, height: 38 },
    ]},
    { label: 'MAR 20', events: [
      { color: '#eab308', title: 'Entregar informe', time: '11:00', top: 80, height: 38 },
    ]},
    { label: 'MIÉ 21', events: [
      { color: '#16a34a', title: 'Hormigonado', time: '13:30–15:00', top: 178, height: 58 },
    ]},
    { label: 'JUE 22', events: [
      { color: '#8b5cf6', title: 'Replanteo topógrafo', time: '12:00–14:00', top: 118, height: 78 },
    ]},
    { label: 'VIE 23', events: [
      { color: '#ec4899', title: 'Cierre semanal', time: '16:00', top: 278, height: 38 },
    ]},
  ]

  return (
    <div style={{ width: '100%', height: '100%', background: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#f97316', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <LogoSVG size={26} />
          <span style={{ color: 'white', fontWeight: 700, fontSize: '0.9rem' }}>FlowDesk</span>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.75rem' }}>Mayo 2026 · Semana 21</span>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Calendario */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Encabezados de días */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', background: '#f8f6f3', borderBottom: '1px solid #e8e4de', flexShrink: 0 }}>
            {days.map(d => (
              <div key={d.label} style={{ padding: '7px 4px', textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#78716c', letterSpacing: '0.04em', borderLeft: '1px solid #e8e4de' }}>{d.label}</div>
            ))}
          </div>

          {/* Grid de horas */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', position: 'relative' }}>
            {days.map((day, di) => (
              <div key={di} style={{ borderLeft: '1px solid #f0ede8', position: 'relative', height: '100%' }}>
                {/* Líneas de hora */}
                {[0,1,2,3,4,5,6,7,8].map(h => (
                  <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: `${h * 40}px`, borderTop: '1px solid #f5f3ef' }} />
                ))}
                {/* Eventos */}
                {day.events.map((ev, i) => (
                  <div key={i} style={{
                    position: 'absolute', left: '2px', right: '2px',
                    top: `${ev.top}px`, height: `${ev.height}px`,
                    background: ev.color, borderRadius: '6px',
                    padding: '4px 5px', overflow: 'hidden',
                  }}>
                    <div style={{ fontSize: '0.57rem', color: 'white', fontWeight: 700, lineHeight: 1.3 }}>{ev.title}</div>
                    <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.85)' }}>{ev.time}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Panel de tareas */}
        <div style={{ width: '150px', flexShrink: 0, borderLeft: '1px solid #e8e4de', padding: '12px 10px', background: '#f8f6f3', overflowY: 'auto' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em', color: '#78716c', marginBottom: '10px', textTransform: 'uppercase' }}>Tareas</div>
          {[
            { done: true, text: 'Certificado hormigón' },
            { done: true, text: 'Llamar ITO' },
            { done: false, text: 'Cubicación muros eje A' },
            { done: false, text: 'Cotizar subcontrato moldajes' },
            { done: false, text: 'Registrar HH semana 20' },
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: '7px', alignItems: 'flex-start', marginBottom: '9px' }}>
              <div style={{
                width: '14px', height: '14px', borderRadius: '3px', flexShrink: 0, marginTop: '1px',
                background: t.done ? '#f97316' : 'white', border: `1.5px solid ${t.done ? '#f97316' : '#d6d3d1'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {t.done && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>}
              </div>
              <span style={{ fontSize: '0.63rem', color: t.done ? '#a8a29e' : '#1c1917', textDecoration: t.done ? 'line-through' : 'none', lineHeight: 1.45 }}>{t.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChaosSide() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#fffef0', position: 'relative', overflow: 'hidden' }}>
      {/* Líneas de cuaderno */}
      {Array.from({ length: 18 }).map((_, i) => (
        <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${44 + i * 24}px`, height: '1px', background: 'rgba(147,197,253,0.5)' }} />
      ))}
      {/* Línea roja de margen */}
      <div style={{ position: 'absolute', left: '50px', top: 0, bottom: 0, width: '1px', background: 'rgba(239,68,68,0.3)' }} />

      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 700 440" preserveAspectRatio="xMidYMid slice">
        <text x="62" y="32" fontFamily="Georgia, serif" fontSize="13.5" fill="#374151" fontWeight="bold">Semana 19–23 mayo</text>

        <text x="62" y="62" fontFamily="Georgia, serif" fontSize="12.5" fill="#374151">Llamar al ITO del lunes → confirmar hormigonado</text>
        <line x1="58" y1="59" x2="430" y2="59" stroke="#374151" strokeWidth="1.5"/>

        <text x="62" y="90" fontFamily="Georgia, serif" fontSize="12" fill="#374151">Entregar informe avance Sector B</text>
        <text x="62" y="106" fontFamily="Georgia, serif" fontSize="10.5" fill="#888">   ↳ antes del viernes!! (¿o el lunes?)</text>

        <text x="62" y="136" fontFamily="Georgia, serif" fontSize="12.5" fill="#dc2626" fontWeight="bold">URGENTE: cubicación muros eje A</text>
        <ellipse cx="218" cy="131" rx="163" ry="13" stroke="#dc2626" strokeWidth="1.5" fill="none" strokeDasharray="5,2"/>

        <text x="62" y="166" fontFamily="Georgia, serif" fontSize="12" fill="#374151">Cotizar moldajes — subcontrato</text>
        <text x="62" y="183" fontFamily="Georgia, serif" fontSize="10.5" fill="#888">   Empresa 1: ??? / Empresa 2: llamar / Empresa 3: ???</text>

        <path d="M450 155 Q490 135 510 162" stroke="#374151" strokeWidth="1.3" fill="none"/>
        <polygon points="507,155 514,164 503,165" fill="#374151"/>
        <text x="455" y="148" fontFamily="Georgia, serif" fontSize="10" fill="#666">ver con</text>
        <text x="452" y="161" fontFamily="Georgia, serif" fontSize="10" fill="#666">arquitecto</text>

        <text x="62" y="216" fontFamily="Georgia, serif" fontSize="12" fill="#6b7280">Reunión jefatura 15:00 miércoles</text>
        <line x1="58" y1="213" x2="308" y2="213" stroke="#6b7280" strokeWidth="1.5"/>
        <text x="314" y="216" fontFamily="Georgia, serif" fontSize="10.5" fill="#f97316">→ reagendó al jueves??</text>

        <text x="62" y="248" fontFamily="Georgia, serif" fontSize="12" fill="#374151">HH semana pasada SIN registrar</text>
        <text x="62" y="265" fontFamily="Georgia, serif" fontSize="10.5" fill="#888" transform="rotate(-0.5,62,265)">   (¿cuántas fueron? preguntar a Carlos)</text>

        <text x="62" y="296" fontFamily="Georgia, serif" fontSize="12" fill="#374151">Avance obra: ~65%</text>
        <text x="62" y="313" fontFamily="Georgia, serif" fontSize="10.5" fill="#888">   (¿o era 62%? revisar foto de ayer)</text>

        <text x="62" y="344" fontFamily="Georgia, serif" fontSize="12" fill="#374151">Replanteo topógrafo — ¿martes o miércoles?</text>
        <line x1="58" y1="341" x2="362" y2="341" stroke="#374151" strokeWidth="1"/>
        <text x="365" y="344" fontFamily="Georgia, serif" fontSize="10.5" fill="#888">confirmar</text>

        {/* Garabatos lado derecho */}
        <text x="490" y="248" fontFamily="Georgia, serif" fontSize="10.5" fill="#555" transform="rotate(5,490,248)">Tel. topógrafo:</text>
        <text x="490" y="262" fontFamily="Georgia, serif" fontSize="10.5" fill="#555" transform="rotate(5,490,262)">+56 9 ???</text>
        <line x1="484" y1="266" x2="590" y2="266" stroke="#aaa" strokeWidth="0.8"/>

        <path d="M490 310 Q515 290 540 310 Q565 330 590 310" stroke="#bbb" strokeWidth="1" fill="none"/>
        <path d="M490 325 Q520 305 550 325 Q570 340 590 325" stroke="#ccc" strokeWidth="0.8" fill="none"/>
        <text x="500" y="360" fontFamily="Georgia, serif" fontSize="11" fill="#ccc" transform="rotate(-2,500,360)">¿¿ qué más ??</text>

        <text x="640" y="120" fontFamily="Georgia, serif" fontSize="36" fill="rgba(0,0,0,0.05)">?</text>
        <text x="630" y="400" fontFamily="Georgia, serif" fontSize="24" fill="rgba(0,0,0,0.05)">...</text>
      </svg>

      {/* Nota adhesiva amarilla */}
      <div style={{ position: 'absolute', top: 16, right: 22, width: '105px', padding: '9px 10px', background: '#fef08a', transform: 'rotate(3deg)', boxShadow: '2px 3px 10px rgba(0,0,0,0.15)' }}>
        <p style={{ fontSize: '0.6rem', color: '#713f12', lineHeight: 1.6, margin: 0, fontFamily: 'cursive' }}>TOPÓGRAFO<br/>¿MARTES?<br/>¡CONFIRMAR!</p>
      </div>

      {/* Nota adhesiva verde */}
      <div style={{ position: 'absolute', bottom: 65, right: 28, width: '95px', padding: '9px 10px', background: '#86efac', transform: 'rotate(-4deg)', boxShadow: '2px 3px 10px rgba(0,0,0,0.15)' }}>
        <p style={{ fontSize: '0.6rem', color: '#14532d', lineHeight: 1.6, margin: 0, fontFamily: 'cursive' }}>cubicación<br/>= 124 m³?<br/>(aprox...)</p>
      </div>

      {/* Nota adhesiva roja */}
      <div style={{ position: 'absolute', bottom: 110, left: 16, width: '115px', padding: '9px 10px', background: '#fca5a5', transform: 'rotate(-2deg)', boxShadow: '2px 3px 10px rgba(0,0,0,0.15)' }}>
        <p style={{ fontSize: '0.6rem', color: '#7f1d1d', lineHeight: 1.6, margin: 0, fontFamily: 'cursive' }}>HH semana<br/>pasada sin<br/>registrar ⚠️</p>
      </div>
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
