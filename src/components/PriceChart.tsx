/**
 * PriceChart.tsx
 * Recharts area chart for USDC/NGN price history.
 * Clean light-theme styling matching BEACON brand.
 */

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
import type { RoundPoint } from '@/hooks/useOracle'

interface PriceChartProps {
  history: RoundPoint[]
  price: number | null
  loading: boolean
}

interface TooltipPayloadItem {
  value: number
  payload: { roundId: number; updatedAt: number }
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div
      className="rounded-xl px-3 py-2 text-xs"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-md)',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      <p className="font-bold tabular-nums" style={{ color: 'var(--ink)', fontSize: '0.85rem' }}>
        {d.value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NGN
      </p>
      <p style={{ color: 'var(--subtle)' }}>Round #{d.payload.roundId}</p>
      <p style={{ color: 'var(--subtle)' }}>
        {new Date(d.payload.updatedAt * 1000).toLocaleTimeString()}
      </p>
    </div>
  )
}

export function PriceChart({ history, price, loading }: PriceChartProps) {
  if (loading) {
    return (
      <div
        className="rounded-2xl p-6"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
      >
        <div className="h-4 w-36 rounded animate-pulse mb-4" style={{ background: 'var(--bg-muted)' }} />
        <div className="h-52 rounded-xl animate-pulse" style={{ background: 'var(--bg-muted)' }} />
      </div>
    )
  }

  if (history.length < 2) {
    return (
      <div
        className="rounded-2xl p-6 flex flex-col"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
      >
        <Header count={0} />
        <div className="flex-1 flex items-center justify-center h-52">
          <div className="text-center">
            <EmptyChartSVG />
            <p className="text-sm mt-3 font-medium" style={{ color: 'var(--muted)' }}>
              Waiting for price rounds
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
              Chart populates once the reporter submits at least 2 rounds.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const data = history.map((r) => ({ ...r, price: r.price }))

  const prices = data.map((d) => d.price)
  const minP = Math.min(...prices)
  const maxP = Math.max(...prices)
  const pad = (maxP - minP) * 0.08 || maxP * 0.01

  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <Header count={history.length} />

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="beaconGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00D66F" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#00D66F" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />

          <XAxis
            dataKey="roundId"
            tickFormatter={(v: number) => `#${v}`}
            tick={{ fontSize: 10, fill: 'var(--subtle)', fontFamily: 'JetBrains Mono, monospace' }}
            axisLine={false}
            tickLine={false}
          />

          <YAxis
            domain={[minP - pad, maxP + pad]}
            tickFormatter={(v: number) =>
              v.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
            }
            tick={{ fontSize: 10, fill: 'var(--subtle)', fontFamily: 'DM Sans, sans-serif' }}
            axisLine={false}
            tickLine={false}
            width={64}
          />

          <Tooltip content={<CustomTooltip />} />

          {price !== null && (
            <ReferenceLine
              y={price}
              stroke="#00D66F"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{ value: 'Live', position: 'insideTopRight', fill: '#00D66F', fontSize: 10 }}
            />
          )}

          <Area
            type="monotone"
            dataKey="price"
            stroke="#00D66F"
            strokeWidth={2}
            fill="url(#beaconGrad)"
            dot={false}
            activeDot={{ r: 4, fill: '#00D66F', strokeWidth: 2, stroke: '#fff' }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      <p className="text-xs mt-2" style={{ color: 'var(--subtle)', fontFamily: 'DM Sans, sans-serif' }}>
        NGN value per 1 USDC -- sourced from on-chain round history
      </p>
    </div>
  )
}

function Header({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--subtle)', letterSpacing: '0.08em' }}>
          Price History
        </p>
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>USDC / NGN</p>
      </div>
      {count > 0 && (
        <span
          className="text-xs px-2 py-1 rounded-full mono"
          style={{ background: 'var(--bg-muted)', color: 'var(--subtle)' }}
        >
          {count} rounds
        </span>
      )}
    </div>
  )
}

function EmptyChartSVG() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="mx-auto">
      <rect width="48" height="48" rx="12" fill="var(--bg-muted)" />
      <path d="M10 34 L18 24 L26 28 L38 16" stroke="var(--border-strong)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="38" cy="16" r="3" fill="#00D66F" fillOpacity="0.4" />
    </svg>
  )
}
