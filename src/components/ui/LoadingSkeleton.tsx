'use client'

const shimmerKeyframes = `
  @keyframes shimmer {
    0%   { background-position: -600px 0 }
    100% { background-position:  600px 0 }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(6px) }
    to   { opacity: 1; transform: translateY(0) }
  }
`

const skBg = `linear-gradient(90deg,
  var(--border) 25%,
  rgba(249,115,22,0.07) 50%,
  var(--border) 75%
)`

function Sk({ w = '100%', h = 14, r = 6, delay = 0, style = {} }: {
  w?: string | number; h?: number; r?: number; delay?: number; style?: React.CSSProperties
}) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r, flexShrink: 0,
      background: skBg, backgroundSize: '600px 100%',
      animation: `shimmer 1.8s ease-in-out infinite`,
      animationDelay: `${delay}s`,
      ...style,
    }} />
  )
}

/* ─── CALENDARIO ─────────────────────────────────────────── */
export function CalendarSkeleton() {
  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto', animation: 'fadeUp 0.25s ease' }}>
      <style>{shimmerKeyframes}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Sk w={150} h={26} r={6} />
          <Sk w={200} h={13} r={4} delay={0.05} />
        </div>
        <Sk w={140} h={38} r={10} delay={0.1} />
      </div>

      {/* Two-column grid: calendar + events panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem' }}>

        {/* Calendar grid */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 16, padding: '1.25rem', background: 'var(--surface)' }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <Sk w={28} h={28} r={8} />
            <Sk w={130} h={20} r={5} delay={0.05} />
            <Sk w={28} h={28} r={8} delay={0.05} />
          </div>

          {/* Day-of-week headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 8 }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <Sk key={i} w="100%" h={12} r={3} delay={i * 0.02} />
            ))}
          </div>

          {/* Day cells: 5 weeks */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
            {Array.from({ length: 35 }).map((_, i) => (
              <Sk key={i} w="100%" h={44} r={8} delay={0.02 + i * 0.008} />
            ))}
          </div>
        </div>

        {/* Events panel */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', background: 'var(--surface)' }}>
          {/* Panel header */}
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
            <Sk w={100} h={18} r={5} />
            <Sk w={70} h={12} r={4} delay={0.05} style={{ marginTop: 8 }} />
          </div>
          {/* Event cards */}
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 0.08, 0.16].map((d, i) => (
              <div key={i} style={{
                padding: '10px 12px', borderRadius: 12,
                border: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <Sk w="80%" h={13} r={4} delay={d} />
                <Sk w="50%" h={11} r={4} delay={d + 0.05} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── TAREAS ─────────────────────────────────────────────── */
export function TasksSkeleton() {
  return (
    <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto', animation: 'fadeUp 0.25s ease' }}>
      <style>{shimmerKeyframes}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Sk w={90} h={26} r={6} />
          <Sk w={160} h={13} r={4} delay={0.05} />
        </div>
        <Sk w={130} h={38} r={10} delay={0.1} />
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
        {[80, 100, 110].map((w, i) => (
          <Sk key={i} w={w} h={32} r={8} delay={i * 0.05} />
        ))}
      </div>

      {/* Task cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[0, 0.06, 0.12, 0.18, 0.24].map((d, i) => (
          <div key={i} style={{
            padding: '1rem 1.25rem', borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            {/* Circle checkbox */}
            <Sk w={20} h={20} r={10} delay={d} />
            {/* Text */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <Sk w={`${50 + (i % 4) * 12}%`} h={14} r={4} delay={d + 0.04} />
              {i % 3 !== 1 && <Sk w="35%" h={11} r={4} delay={d + 0.08} />}
            </div>
            {/* Priority badge */}
            <Sk w={58} h={22} r={100} delay={d + 0.06} />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── BITÁCORA ───────────────────────────────────────────── */
export function DiarySkeleton() {
  return (
    <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto', animation: 'fadeUp 0.25s ease' }}>
      <style>{shimmerKeyframes}</style>

      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <Sk w={110} h={26} r={6} />
        <Sk w={220} h={13} r={4} delay={0.05} style={{ marginTop: 8 }} />
      </div>

      {/* Controls: date toggle + search */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Sk w={180} h={38} r={12} delay={0.05} />
        <Sk w={200} h={38} r={10} delay={0.1} />
      </div>

      {/* Diary entry cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {[0, 0.1, 0.2].map((d, i) => (
          <div key={i} style={{
            border: '1px solid var(--border)',
            borderRadius: 14,
            overflow: 'hidden',
            background: 'var(--surface)',
          }}>
            {/* Entry header bar */}
            <div style={{
              padding: '0.875rem 1.25rem',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Sk w={28} h={28} r={8} delay={d} />
              <Sk w={100} h={14} r={4} delay={d + 0.04} />
              <Sk w={60} h={20} r={100} delay={d + 0.06} style={{ marginLeft: 'auto' }} />
            </div>
            {/* Entry body */}
            <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Sk w="100%" h={12} r={4} delay={d + 0.08} />
              <Sk w={`${65 + i * 8}%`} h={12} r={4} delay={d + 0.12} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
