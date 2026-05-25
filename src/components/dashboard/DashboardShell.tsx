'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Calendar, CheckSquare, BookOpen, LogOut, User } from 'lucide-react'
import { UserProfile } from '@/types'

interface Props {
  user: UserProfile
  children: React.ReactNode
}

const navItems = [
  { href: '/dashboard', icon: Calendar, label: 'Calendario' },
  { href: '/dashboard/tasks', icon: CheckSquare, label: 'Tareas' },
  { href: '/dashboard/diary', icon: BookOpen, label: 'Bitácora' },
]

export default function DashboardShell({ user, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--background)' }}>
      {/* Sidebar */}
      <aside style={{
        width: '220px', flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        padding: '1.5rem 0',
        position: 'fixed', top: 0, left: 0, bottom: 0,
        zIndex: 50
      }}>
        {/* Logo */}
        <div style={{ padding: '0 1.25rem 1.5rem', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/logo.png?v=2" width="34" height="34" alt="FlowDesk" style={{ display: 'block', flexShrink: 0 }} />
            <div>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.02em', display: 'block', lineHeight: 1 }}>
                Flow<span style={{ color: '#f97316' }}>Desk</span>
              </span>
              <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                La agenda del constructor
              </span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0 0.75rem' }}>
          {navItems.map(({ href, icon: Icon, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  marginBottom: '4px',
                  fontSize: '0.9rem', fontWeight: active ? 600 : 400,
                  color: active ? 'white' : 'var(--text-muted)',
                  background: active ? '#f97316' : 'transparent',
                  textDecoration: 'none',
                  transition: 'all 0.2s',
                  boxShadow: active ? '0 0 15px rgba(249,115,22,0.35)' : 'none'
                }}
              >
                <Icon size={18} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* User */}
        <div style={{
          padding: '1rem 1.25rem 0',
          borderTop: '1px solid var(--border)',
          marginTop: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
            ) : (
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <User size={16} color="white" />
              </div>
            )}
            <div style={{ overflow: 'hidden' }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.name}
              </p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              width: '100%', padding: '8px',
              borderRadius: '8px',
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: '0.8rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, marginLeft: '220px', minHeight: '100vh', overflow: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
