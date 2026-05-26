'use client'

const shimmerStyle = `
  @keyframes shimmer {
    0% { background-position: -600px 0 }
    100% { background-position: 600px 0 }
  }
  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(8px) }
    to   { opacity: 1; transform: translateY(0) }
  }
  .sk {
    background: linear-gradient(90deg,
      var(--border) 25%,
      rgba(249,115,22,0.08) 50%,
      var(--border) 75%
    );
    background-size: 600px 100%;
    animation: shimmer 1.6s ease-in-out infinite;
    border-radius: 8px;
  }
`

function Sk({ w = '100%', h = 16, r = 8, delay = 0 }: { w?: string | number; h?: number; r?: number; delay?: number }) {
  return (
    <div className="sk" style={{
      width: w, height: h, borderRadius: r,
      animationDelay: `${delay}s`,
      flexShrink: 0,
    }} />
  )
}

export function CalendarSkeleton() {
  return (
    <div style={{ padding: '1.5rem', animation: 'fadeSlideIn 0.3s ease' }}>
      <style>{shimmerStyle}</style>

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <Sk w={160} h={28} r={8} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Sk w={32} h={32} r={8} delay={0.1} />
          <Sk w={32} h={32} r={8} delay={0.15} />
        </div>
      </div>

      {/* Day pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
        {[0,0.05,0.1,0.15,0.2,0.25,0.3].map((d, i) => (
          <Sk key={i} w={40} h={56} r={10} delay={d} />
        ))}
      </div>

      {/* Event cards */}
      {[0, 0.08, 0.16].map((d, i) => (
        <div key={i} style={{
          display: 'flex', gap: 12, alignItems: 'center',
          padding: '14px', marginBottom: 10,
          border: '1px solid var(--border)', borderRadius: 14,
          animation: `fadeSlideIn 0.4s ease ${d + 0.1}s both`,
        }}>
          <Sk w={40} h={40} r={10} delay={d} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Sk w="70%" h={14} delay={d + 0.05} />
            <Sk w="40%" h={11} delay={d + 0.1} />
          </div>
          <Sk w={60} h={24} r={6} delay={d + 0.12} />
        </div>
      ))}
    </div>
  )
}

export function TasksSkeleton() {
  return (
    <div style={{ padding: '1.5rem', animation: 'fadeSlideIn 0.3s ease' }}>
      <style>{shimmerStyle}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <Sk w={140} h={28} r={8} />
        <Sk w={100} h={32} r={8} delay={0.1} />
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
        {[80, 90, 70].map((w, i) => (
          <Sk key={i} w={w} h={30} r={20} delay={i * 0.06} />
        ))}
      </div>

      {/* Task rows */}
      {[0, 0.07, 0.14, 0.21, 0.28].map((d, i) => (
        <div key={i} style={{
          display: 'flex', gap: 12, alignItems: 'center',
          padding: '12px 14px', marginBottom: 8,
          border: '1px solid var(--border)', borderRadius: 12,
          animation: `fadeSlideIn 0.4s ease ${d + 0.1}s both`,
        }}>
          <Sk w={20} h={20} r={10} delay={d} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Sk w={`${55 + (i % 3) * 15}%`} h={13} delay={d + 0.05} />
            {i % 2 === 0 && <Sk w="35%" h={10} delay={d + 0.1} />}
          </div>
          <Sk w={50} h={20} r={10} delay={d + 0.08} />
        </div>
      ))}
    </div>
  )
}

export function DiarySkeleton() {
  return (
    <div style={{ padding: '1.5rem', animation: 'fadeSlideIn 0.3s ease' }}>
      <style>{shimmerStyle}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <Sk w={130} h={28} r={8} />
        <Sk w={180} h={34} r={10} delay={0.1} />
      </div>

      {/* Diary entries */}
      {[0, 0.1, 0.2].map((d, i) => (
        <div key={i} style={{
          padding: '16px', marginBottom: 12,
          border: '1px solid var(--border)', borderRadius: 14,
          animation: `fadeSlideIn 0.4s ease ${d + 0.1}s both`,
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <Sk w={70} h={20} r={6} delay={d} />
            <Sk w={90} h={20} r={6} delay={d + 0.05} />
          </div>
          <Sk w="100%" h={12} delay={d + 0.08} />
          <div style={{ marginTop: 8 }}>
            <Sk w={`${60 + i * 10}%`} h={12} delay={d + 0.12} />
          </div>
        </div>
      ))}
    </div>
  )
}
