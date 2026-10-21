/**
 * CircuitBreakerBanner.tsx -- no framer-motion, CSS transition only.
 */
import { AlertTriangle, CheckCircle2, PauseCircle } from 'lucide-react'

interface CircuitBreakerBannerProps {
  tripped: boolean
  paused: boolean
  circuitBreakerBps: number | null
}

export function CircuitBreakerBanner({ tripped, paused, circuitBreakerBps }: CircuitBreakerBannerProps) {
  const threshold = circuitBreakerBps !== null ? (circuitBreakerBps / 100).toFixed(0) : '10'

  const bannerStyle = (bg: string, border: string, color: string) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    borderRadius: 12, padding: '12px 16px', fontSize: 13.5, fontWeight: 500,
    background: bg, border: `1px solid ${border}`, color,
    transition: 'all .3s',
  } as React.CSSProperties)

  if (paused) return (
    <div style={bannerStyle('var(--warning-bg)', 'rgba(245,158,11,0.25)', 'var(--warning)')}>
      <PauseCircle size={16} />
      <span>Oracle is paused. The owner must call <code style={mono}>unpause()</code> to resume submissions.</span>
    </div>
  )

  if (tripped) return (
    <div style={bannerStyle('var(--danger-bg)', 'rgba(239,68,68,0.2)', 'var(--danger)')}>
      <AlertTriangle size={16} />
      <span>Circuit breaker tripped. A single update exceeded the {threshold}% deviation limit. Owner must call <code style={mono}>resetCircuitBreaker()</code> to resume.</span>
    </div>
  )

  return (
    <div style={bannerStyle('var(--success-bg)', 'var(--brand-border)', 'var(--success)')}>
      <CheckCircle2 size={16} />
      <span>Oracle healthy. Circuit breaker armed at {threshold}% max deviation per round.</span>
    </div>
  )
}

const mono: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12, background: 'rgba(0,0,0,0.06)',
  padding: '1px 5px', borderRadius: 4,
}
