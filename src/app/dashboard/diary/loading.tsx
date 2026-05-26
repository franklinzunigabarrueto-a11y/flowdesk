export default function Loading() {
  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          height: '96px', borderRadius: '12px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          animation: 'pulse 1.5s ease-in-out infinite',
          opacity: 1 - i * 0.2,
        }} />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }`}</style>
    </div>
  )
}
