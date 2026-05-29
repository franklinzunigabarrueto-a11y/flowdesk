'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  Calendar, CheckSquare, BookOpen, LogOut, User,
  ChevronDown, ChevronUp, X, Sun, Moon,
  CreditCard, Settings, Check, Smartphone, Pencil, CheckCircle, AlertCircle,
  FolderKanban, BarChart2,
} from 'lucide-react'
import { UserProfile } from '@/types'

interface Props {
  user: UserProfile
  children: React.ReactNode
}

const navItems = [
  { href: '/dashboard/project',     icon: FolderKanban, label: 'Proyecto'    },
  { href: '/dashboard/seguimiento', icon: BarChart2,    label: 'Seguimiento' },
  { href: '/dashboard',             icon: Calendar,     label: 'Calendario'  },
  { href: '/dashboard/tasks',       icon: CheckSquare,  label: 'Tareas'      },
  { href: '/dashboard/diary',       icon: BookOpen,     label: 'Bitácora'    },
]

export default function DashboardShell({ user, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [modal, setModal] = useState<null | 'cuenta' | 'plan' | 'preferencias'>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const menuRef = useRef<HTMLDivElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('flowdesk-theme') as 'light' | 'dark' | null
    const initial = saved || 'light'
    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
  }, [])

  // Register (or renew) Google Calendar webhook on every dashboard mount.
  // The route skips the call if the existing channel is still valid.
  useEffect(() => {
    fetch('/api/events/google-sync/register', { method: 'POST' }).catch(() => {})
    // Create FlowDesk👷 calendar if it doesn't exist yet (idempotent)
    fetch('/api/setup/calendar', { method: 'POST' }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      const inDesktop = menuRef.current?.contains(e.target as Node)
      const inMobile  = mobileMenuRef.current?.contains(e.target as Node)
      if (!inDesktop && !inMobile) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  useEffect(() => {
    if (!modal) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setModal(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [modal])

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('flowdesk-theme', next)
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  function openModal(m: typeof modal) {
    setMenuOpen(false)
    setModal(m)
  }

  const profileDropdownItems = (
    <>
      {([
        { icon: User,       label: 'Mi cuenta',    action: () => openModal('cuenta') },
        { icon: CreditCard, label: 'Mi plan',      action: () => openModal('plan') },
        { icon: Settings,   label: 'Preferencias', action: () => openModal('preferencias') },
      ] as const).map(({ icon: Icon, label, action }) => (
        <button key={label} onClick={action} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
          padding: '11px 14px', background: 'transparent', border: 'none',
          color: 'var(--foreground)', cursor: 'pointer', fontSize: '0.875rem', textAlign: 'left',
        }}>
          <Icon size={15} color="var(--text-muted)" /> {label}
        </button>
      ))}
      <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
      <button onClick={() => { setMenuOpen(false); handleLogout() }} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
        padding: '11px 14px', background: 'transparent', border: 'none',
        color: '#ef4444', cursor: 'pointer', fontSize: '0.875rem', textAlign: 'left',
      }}>
        <LogOut size={15} color="#ef4444" /> Cerrar sesión
      </button>
    </>
  )

  return (
    <div className="shell-root" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--background)' }}>

      {/* ── Mobile header (hidden on desktop via CSS) ── */}
      <header className="shell-mobile-header" style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '52px',
        alignItems: 'center', justifyContent: 'space-between',
        padding: '0 1rem', zIndex: 50,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/logo.png?v=4" width="30" height="30" alt="FlowDesk" />
          <span style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Flow<span style={{ color: '#f97316' }}>Desk</span>
          </span>
        </div>
        <div ref={mobileMenuRef} style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(o => !o)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}>
            {user.avatar_url
              ? <img src={user.avatar_url} alt="" style={{ width: '34px', height: '34px', borderRadius: '50%' }} />
              : <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={18} color="white" /></div>
            }
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '220px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '14px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
              overflow: 'hidden', animation: 'fadeIn 0.15s ease', zIndex: 100,
            }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</p>
              </div>
              {profileDropdownItems}
            </div>
          )}
        </div>
      </header>

      {/* ── Sidebar (hidden on mobile via CSS) ── */}
      <aside className="shell-sidebar" style={{
        width: '220px', flexShrink: 0,
        background: 'var(--surface)', borderRight: '1px solid var(--border)',
        flexDirection: 'column', padding: '1.5rem 0',
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
      }}>
        <div style={{ padding: '0 1.25rem 1.5rem', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/logo.png?v=4" width="42" height="42" alt="FlowDesk" style={{ display: 'block', flexShrink: 0 }} />
            <span style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
              Flow<span style={{ color: '#f97316' }}>Desk</span>
            </span>
          </div>
        </div>
        <nav style={{ flex: 1, padding: '0 0.75rem' }}>
          {navItems.map(({ href, icon: Icon, label }) => {
            const active = pathname === href
            return (
              <Link key={href} href={href} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '10px', marginBottom: '4px',
                fontSize: '0.9rem', fontWeight: active ? 600 : 400,
                color: active ? 'white' : 'var(--text-muted)',
                background: active ? '#f97316' : 'transparent',
                textDecoration: 'none', transition: 'all 0.2s',
                boxShadow: active ? '0 0 15px rgba(249,115,22,0.35)' : 'none',
              }}>
                <Icon size={18} /> {label}
              </Link>
            )
          })}
        </nav>
        <div ref={menuRef} style={{ padding: '1rem 0.75rem 0', borderTop: '1px solid var(--border)', marginTop: '1rem', position: 'relative' }}>
          {menuOpen && (
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '14px', boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
              overflow: 'hidden', animation: 'fadeIn 0.15s ease', zIndex: 60,
            }}>
              {profileDropdownItems}
            </div>
          )}
          <button onClick={() => setMenuOpen(o => !o)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
            padding: '8px 10px', borderRadius: '10px',
            background: menuOpen ? 'var(--surface-hover)' : 'transparent',
            border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
          }}>
            {user.avatar_url
              ? <img src={user.avatar_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0 }} />
              : <div style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0, background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={16} color="white" /></div>
            }
            <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--foreground)', margin: 0 }}>{user.name}</p>
              <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{user.email}</p>
            </div>
            {menuOpen ? <ChevronUp size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} /> : <ChevronDown size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="shell-main" style={{ flex: 1, marginLeft: '220px', height: '100vh', overflow: 'hidden' }}>
        {children}
      </main>

      {/* ── Mobile bottom nav (hidden on desktop via CSS) ── */}
      <nav className="shell-bottom-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: '60px', zIndex: 50,
        alignItems: 'stretch',
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '3px',
              textDecoration: 'none', position: 'relative',
              color: active ? 'var(--primary)' : 'var(--text-muted)',
              fontSize: '0.6rem', fontWeight: active ? 700 : 400,
              transition: 'color 0.15s',
            }}>
              {active && <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '32px', height: '3px', borderRadius: '0 0 4px 4px', background: 'var(--primary)' }} />}
              <Icon size={active ? 22 : 20} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* ── Modals ── */}
      {modal && (
        <div onClick={() => setModal(null)} style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '20px',
            width: modal === 'preferencias' ? '360px' : '480px',
            maxWidth: '92vw', maxHeight: '85vh', overflow: 'auto',
            boxShadow: '0 24px 80px rgba(0,0,0,0.22)', animation: 'fadeIn 0.18s ease',
          }}>
            {modal === 'cuenta'       && <ModalCuenta       user={user}   onClose={() => setModal(null)} />}
            {modal === 'plan'         && <ModalPlan                       onClose={() => setModal(null)} />}
            {modal === 'preferencias' && <ModalPreferencias theme={theme} onToggle={toggleTheme} onClose={() => setModal(null)} />}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Modal: Mi cuenta ─── */
function ModalCuenta({ user, onClose }: { user: UserProfile; onClose: () => void }) {
  const parts = (user.name || '').trim().split(' ')
  const firstName = parts[0] || ''
  const lastName = parts.slice(1).join(' ') || '—'

  const [editing, setEditing] = useState(false)
  const [phone, setPhone] = useState(user.whatsapp_number || '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function savePhone() {
    setSaving(true)
    setStatus('idle')
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp_number: phone }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Error al guardar')
        setStatus('error')
      } else {
        setStatus('ok')
        setEditing(false)
      }
    } catch {
      setErrorMsg('Error de conexión')
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  // Format for display: add + prefix if number looks like digits only
  const displayPhone = phone
    ? (phone.startsWith('+') ? phone : `+${phone}`)
    : '—'

  return (
    <div style={{ padding: '1.75rem' }}>
      <ModalHeader title="Mi cuenta" onClose={onClose} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '1.75rem' }}>
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" style={{ width: '64px', height: '64px', borderRadius: '50%', border: '3px solid var(--border)', flexShrink: 0 }} />
        ) : (
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #f97316, #fb923c)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <User size={28} color="white" />
          </div>
        )}
        <div>
          <p style={{ fontWeight: 700, fontSize: '1rem', margin: 0 }}>{user.name || '—'}</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '3px 0 0' }}>{user.email}</p>
        </div>
      </div>

      <SectionLabel>Datos personales</SectionLabel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <Field label="Nombre"   value={firstName} />
        <Field label="Apellido" value={lastName} />

        {/* Email — solo lectura con aviso */}
        <div style={{ gridColumn: '1 / -1' }}>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 500 }}>Correo electrónico</p>
          <div style={{
            padding: '9px 12px', borderRadius: '9px',
            background: 'var(--surface-hover)', border: '1px solid var(--border)',
            fontSize: '0.875rem', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ flex: 1 }}>{user.email}</span>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.5, opacity: 0.8 }}>
            El correo no puede modificarse — está vinculado a los calendarios de tu cuenta.
          </p>
        </div>

        {/* WhatsApp — editable */}
        <div style={{ gridColumn: '1 / -1' }}>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 500 }}>
            Número WhatsApp
          </p>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '9px', background: 'var(--background)', border: '1.5px solid var(--primary)' }}>
                  <Smartphone size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                  <input
                    autoFocus
                    value={phone}
                    onChange={e => { setPhone(e.target.value); setStatus('idle') }}
                    onKeyDown={e => { if (e.key === 'Enter') savePhone(); if (e.key === 'Escape') setEditing(false) }}
                    placeholder="56912345678"
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '0.875rem', color: 'var(--foreground)' }}
                  />
                </div>
                <button onClick={savePhone} disabled={saving} style={{ padding: '9px 14px', borderRadius: '9px', background: 'var(--primary)', border: 'none', color: 'white', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, flexShrink: 0 }}>
                  {saving ? '...' : 'Guardar'}
                </button>
                <button onClick={() => { setEditing(false); setStatus('idle') }} style={{ padding: '9px 12px', borderRadius: '9px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.82rem', flexShrink: 0 }}>
                  Cancelar
                </button>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                Incluye el código de país sin el +. Ej: <strong>56912345678</strong>
              </p>
              {status === 'error' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontSize: '0.78rem' }}>
                  <AlertCircle size={13} /> {errorMsg}
                </div>
              )}
            </div>
          ) : (
            <div style={{
              padding: '9px 12px', borderRadius: '9px',
              background: 'var(--background)', border: '1px solid var(--border)',
              fontSize: '0.875rem', color: 'var(--foreground)',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <Smartphone size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{displayPhone}</span>
              {status === 'ok' && <CheckCircle size={14} color="#22c55e" />}
              <button
                onClick={() => { setEditing(true); setStatus('idle') }}
                title="Cambiar número"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex', flexShrink: 0 }}
              >
                <Pencil size={13} />
              </button>
            </div>
          )}
          {!editing && (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.5, opacity: 0.8 }}>
              Al cambiar el número, el bot de WhatsApp enviará los mensajes al nuevo contacto.
            </p>
          )}
        </div>
      </div>

      <div style={{
        marginTop: '1.25rem', padding: '10px 14px', borderRadius: '10px',
        background: 'var(--surface-hover)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cuenta activa · Plan gratuito</span>
      </div>
    </div>
  )
}

/* ─── Modal: Mi plan ─── */
function ModalPlan({ onClose }: { onClose: () => void }) {
  const features = [
    'Registro diario desde WhatsApp (texto, audio, foto)',
    'Transcripción de audios con IA',
    'Gestión de tareas y pendientes',
    'Calendario de eventos',
    'Bitácora de obra con resumen IA',
    'Sugerencias inteligentes de seguimiento',
  ]

  return (
    <div style={{ padding: '1.75rem' }}>
      <ModalHeader title="Mi plan" onClose={onClose} />

      <div style={{
        border: '2px solid var(--primary)',
        borderRadius: '16px', padding: '1.5rem',
        background: 'rgba(249,115,22,0.04)',
        marginBottom: '1.5rem',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: '-12px', left: '20px',
          background: 'var(--primary)', color: 'white',
          fontSize: '0.68rem', fontWeight: 700, padding: '3px 10px',
          borderRadius: '100px', letterSpacing: '0.07em',
        }}>
          PLAN ACTIVO
        </div>
        <p style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 4px' }}>Gratuito</p>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
          Acceso completo durante el período beta
        </p>
      </div>

      <SectionLabel>Incluido en tu plan</SectionLabel>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {features.map(f => (
          <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.875rem' }}>
            <div style={{
              width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0, marginTop: '1px',
              background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Check size={11} color="#22c55e" />
            </div>
            <span style={{ color: 'var(--foreground)', lineHeight: 1.5 }}>{f}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Modal: Preferencias ─── */
function ModalPreferencias({ theme, onToggle, onClose }: {
  theme: 'light' | 'dark'; onToggle: () => void; onClose: () => void
}) {
  return (
    <div style={{ padding: '1.75rem' }}>
      <ModalHeader title="Preferencias" onClose={onClose} />

      <SectionLabel>Apariencia</SectionLabel>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
        {(['light', 'dark'] as const).map(t => {
          const active = theme === t
          return (
            <button
              key={t}
              onClick={() => { if (!active) onToggle() }}
              style={{
                flex: 1, padding: '18px 12px', borderRadius: '14px',
                border: active ? '2px solid var(--primary)' : '1.5px solid var(--border)',
                background: active ? 'rgba(249,115,22,0.06)' : 'var(--background)',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                transition: 'all 0.2s',
              }}
            >
              {t === 'light'
                ? <Sun size={24} color={active ? 'var(--primary)' : 'var(--text-muted)'} />
                : <Moon size={24} color={active ? 'var(--primary)' : 'var(--text-muted)'} />}
              <span style={{ fontSize: '0.875rem', fontWeight: active ? 700 : 400, color: active ? 'var(--primary)' : 'var(--text-muted)' }}>
                {t === 'light' ? 'Claro' : 'Oscuro'}
              </span>
              {active && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary)' }} />}
            </button>
          )
        })}
      </div>

      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.55, margin: 0 }}>
        El tema se guarda automáticamente en este navegador.
      </p>
    </div>
  )
}

/* ─── Shared sub-components ─── */
function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>{title}</h2>
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', borderRadius: '6px', display: 'flex' }}>
        <X size={20} />
      </button>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 0.75rem' }}>
      {children}
    </p>
  )
}

function Field({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 500, margin: '0 0 4px' }}>{label}</p>
      <div style={{
        padding: '9px 12px', borderRadius: '9px',
        background: 'var(--background)', border: '1px solid var(--border)',
        fontSize: '0.875rem', color: 'var(--foreground)',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        {icon && <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{icon}</span>}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      </div>
    </div>
  )
}
