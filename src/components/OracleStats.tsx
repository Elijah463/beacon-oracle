import { useState, useEffect } from 'react'
import { Activity, Sliders, ShieldAlert, Hash, Info } from 'lucide-react'

interface OracleStatsProps {
  maxStaleness: number | null
  deviationThresholdBps: number | null
  circuitBreakerBps: number | null
  roundId: number | null
  updatedAt: number | null   // unix seconds of last on-chain publish
}

const TOOLTIPS: Record<string, string> = {
  'Latest Round': 'The sequential counter of on-chain price updates. Increments each time the reporter publishes a new price that clears the deviation threshold or heartbeat.',
  'Heartbeat': 'Maximum time between on-chain publishes. Even if the price is stable, a new round is forced at least once per heartbeat period to prove the reporter is alive.',
  'Deviation Threshold': 'Minimum price movement required to trigger a new on-chain publish. If the price moves less than this amount since the last round, the reporter skips the update and waits for the heartbeat. Measured in basis points (1 bps = 0.01%).',
  'Circuit Breaker': 'If a single price update would move the on-chain price by more than this threshold, the contract blocks the update and sets a trip flag. The owner must manually reset it. Protects against data source errors or manipulation.',
}

function StatCard({ icon, label, value, mono, sub }: { icon: React.ReactNode; label: string; value: string; mono: boolean; sub?: string }) {
  const [show, setShow] = useState(false)
  const tip = TOOLTIPS[label]

  return (
    <div
      style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)', borderRadius: 14, padding: '16px',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {icon}
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--subtle)', letterSpacing: '0.03em' }}>{label}</span>
        </div>
        {tip && (
          <button
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
            onFocus={() => setShow(true)}
            onBlur={() => setShow(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', lineHeight: 1 }}
            aria-label={`Info about ${label}`}
          >
            <Info size={13} style={{ color: 'var(--subtle)', opacity: 0.5 }} />
          </button>
        )}
      </div>

      <p
        style={{
          fontSize: 22, fontWeight: 800, color: 'var(--ink)',
          fontFamily: mono ? "'JetBrains Mono', monospace" : "'Space Grotesk', sans-serif",
          fontVariantNumeric: 'tabular-nums', margin: 0,
        }}
      >
        {value}
      </p>

      {sub && (
        <p style={{ fontSize: 10, color: 'var(--subtle)', margin: '4px 0 0', fontVariantNumeric: 'tabular-nums' }}>
          {sub}
        </p>
      )}

      {show && tip && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, padding: '10px 14px', zIndex: 50,
          width: 260, fontSize: 12.5, color: '#94a3b8', lineHeight: 1.65,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          pointerEvents: 'none',
        }}>
          <strong style={{ color: '#f1f5f9', display: 'block', marginBottom: 4, fontSize: 12 }}>{label}</strong>
          {tip}
        </div>
      )}
    </div>
  )
}

/** Countdown ticker: returns "Xm Ys" until next heartbeat, or "now" if overdue */
function useHeartbeatCountdown(updatedAt: number | null, heartbeatSecs: number | null): string {
  const [label, setLabel] = useState('--')

  useEffect(() => {
    if (updatedAt === null || heartbeatSecs === null) return

    const tick = () => {
      const nextAt = updatedAt + heartbeatSecs
      const remaining = nextAt - Math.floor(Date.now() / 1000)
      if (remaining <= 0) { setLabel('now'); return }
      const m = Math.floor(remaining / 60)
      const s = remaining % 60
      setLabel(m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`)
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [updatedAt, heartbeatSecs])

  return label
}

export function OracleStats({ maxStaleness, deviationThresholdBps, circuitBreakerBps, roundId, updatedAt }: OracleStatsProps) {
  const countdown = useHeartbeatCountdown(updatedAt, maxStaleness)

  const stats = [
    {
      icon: <Hash size={15} style={{ color: 'var(--brand)' }} />,
      label: 'Latest Round',
      value: roundId !== null ? `#${roundId}` : '--',
      mono: true,
      sub: undefined,
    },
    {
      icon: <Activity size={15} style={{ color: 'var(--brand)' }} />,
      label: 'Heartbeat',
      value: maxStaleness !== null ? `${Math.floor(maxStaleness / 60)}m` : '--',
      mono: false,
      sub: countdown !== '--' ? `next in ${countdown}` : undefined,
    },
    {
      icon: <Sliders size={15} style={{ color: 'var(--brand)' }} />,
      label: 'Deviation Threshold',
      value: deviationThresholdBps !== null ? `${(deviationThresholdBps / 100).toFixed(2)}%` : '--',
      mono: false,
      sub: undefined,
    },
    {
      icon: <ShieldAlert size={15} style={{ color: 'var(--brand)' }} />,
      label: 'Circuit Breaker',
      value: circuitBreakerBps !== null ? `${(circuitBreakerBps / 100).toFixed(0)}%` : '--',
      mono: false,
      sub: undefined,
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((s) => (
        <StatCard key={s.label} {...s} />
      ))}
    </div>
  )
}
