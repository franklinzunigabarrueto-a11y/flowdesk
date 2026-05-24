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
            <svg width="34" height="34" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="36" height="36" rx="8" fill="#f97316"/>
              <rect x="11" y="6" width="3.5" height="6" rx="1.75" stroke="white" strokeWidth="1.5"/>
              <rect x="21.5" y="6" width="3.5" height="6" rx="1.75" stroke="white" strokeWidth="1.5"/>
              <rect x="5" y="9" width="26" height="22" rx="3" stroke="white" strokeWidth="1.5"/>
              <line x1="5" y1="15" x2="31" y2="15" stroke="white" strokeWidth="1.5"/>
              <path d="M10.5 27C10.5 21 14 17.5 18 17.5C22 17.5 25.5 21 25.5 27" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <rect x="8" y="27" width="20" height="2.5" rx="1.25" stroke="white" strokeWidth="1.5"/>
              <line x1="15" y1="20" x2="14.5" y2="26.5" stroke="white" strokeWidth="1" strokeLinecap="round"/>
              <line x1="18" y1="18.5" x2="18" y2="26.5" stroke="white" strokeWidth="1" strokeLinecap="round"/>
              <line x1="21" y1="20" x2="21.5" y2="26.5" stroke="white" strokeWidth="1" strokeLinecap="round"/>
            </svg>
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
