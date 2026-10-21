import { Activity, Sliders, ShieldAlert, Hash } from 'lucide-react'

interface OracleStatsProps {
  maxStaleness: number | null
  deviationThresholdBps: number | null
  circuitBreakerBps: number | null
  roundId: number | null
}

export function OracleStats({ maxStaleness, deviationThresholdBps, circuitBreakerBps, roundId }: OracleStatsProps) {
  const stats = [
    {
      icon: <Hash size={16} style={{ color: 'var(--brand)' }} />,
      label: 'Latest Round',
      value: roundId !== null ? `#${roundId}` : '--',
      mono: true,
    },
    {
      icon: <Activity size={16} style={{ color: 'var(--brand)' }} />,
      label: 'Heartbeat',
      value: maxStaleness !== null ? `${Math.floor(maxStaleness / 60)}m` : '--',
      mono: false,
    },
    {
      icon: <Sliders size={16} style={{ color: 'var(--brand)' }} />,
      label: 'Deviation Threshold',
      value: deviationThresholdBps !== null ? `${(deviationThresholdBps / 100).toFixed(2)}%` : '--',
      mono: false,
    },
    {
      icon: <ShieldAlert size={16} style={{ color: 'var(--brand)' }} />,
      label: 'Circuit Breaker',
      value: circuitBreakerBps !== null ? `${(circuitBreakerBps / 100).toFixed(0)}%` : '--',
      mono: false,
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl px-4 py-4"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            {s.icon}
            <span className="text-xs font-medium" style={{ color: 'var(--subtle)' }}>{s.label}</span>
          </div>
          <p
            className={`text-xl font-bold ${s.mono ? 'mono' : 'display'} tabular-nums`}
            style={{ color: 'var(--ink)' }}
          >
            {s.value}
          </p>
        </div>
      ))}
    </div>
  )
}
