/**
 * RateCard.tsx
 * Live USDC/NGN price card. Flash green on up, red on down. No framer-motion.
 */

import { useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react'
import type { RoundPoint } from '@/hooks/useOracle'

interface RateCardProps {
  price: number | null
  roundId: number | null
  secondsAgo: number | null
  isStale: boolean
  loading: boolean
  history: RoundPoint[]
}

function formatSeconds(secs: number): string {
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s ago`
  return `${Math.floor(secs / 3600)}h ago`
}

export function RateCard({ price, roundId, secondsAgo, isStale, loading, history }: RateCardProps) {
  const prevPriceRef = useRef<number | null>(null)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (price === null) return
    const prev = prevPriceRef.current
    if (prev !== null && prev !== price) {
      if (timerRef.current) clearTimeout(timerRef.current)
      setFlash(price > prev ? 'up' : 'down')
      timerRef.current = setTimeout(() => setFlash(null), 2000)
    }
    prevPriceRef.current = price
  }, [price])

  const prev = history.length >= 2 ? history[history.length - 2]?.price ?? null : null
  const pctChange = prev !== null && price !== null ? ((price - prev) / prev) * 100 : null
  const direction = pctChange === null ? 'flat' : pctChange > 0 ? 'up' : pctChange < 0 ? 'down' : 'flat'

  const formattedPrice = price !== null
    ? price.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null

  const flashColor = flash === 'up' ? '#00D66F' : flash === 'down' ? '#EF4444' : '#ffffff'

  return (
    <div style={{
      position: 'relative', borderRadius: 18, padding: '24px 28px', overflow: 'hidden',
      background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)',
    }}>


      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--subtle)', margin: 0 }}>
            Price Feed
          </p>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '3px 0 0', fontFamily: "'Space Grotesk', sans-serif" }}>
            USDC / NGN
          </p>
        </div>
        {/* Stale / Live pill */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
          background: isStale ? 'var(--danger-bg)' : 'var(--success-bg)',
          color: isStale ? 'var(--danger)' : 'var(--success)',
          border: `1px solid ${isStale ? 'rgba(239,68,68,0.2)' : 'var(--brand-border)'}`,
          transition: 'all .3s',
        }}>
          {isStale
            ? <><AlertTriangle size={11} /> Stale</>
            : <>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00D66F', display: 'inline-block', animation: 'live-glow 2s ease-in-out infinite' }} />
              Live
            </>
          }
        </div>
      </div>

      {/* Price */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--subtle)', textTransform: 'uppercase', marginBottom: 6 }}>
          1 USDC
        </p>
        {loading && price === null ? (
          <div style={{ height: 56, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: 220, height: 44, background: 'var(--bg-muted)', borderRadius: 8, animation: 'shimmer 1.5s infinite' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{
              fontSize: 'clamp(36px, 6vw, 54px)', fontWeight: 800,
              fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.03em',
              color: flashColor,
              transition: 'color 0.15s ease',
            }}>
              {formattedPrice ?? '--'}
            </span>
            <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--subtle)' }}>NGN</span>
          </div>
        )}
      </div>

      {/* Change row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {pctChange !== null && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 13.5, fontWeight: 600,
            color: direction === 'up' ? '#00D66F' : direction === 'down' ? '#EF4444' : 'var(--subtle)',
          }}>
            {direction === 'up' ? <TrendingUp size={15} /> : direction === 'down' ? <TrendingDown size={15} /> : <Minus size={15} />}
            {pctChange > 0 ? '+' : ''}{pctChange.toFixed(4)}%
          </div>
        )}
        {roundId !== null && (
          <span style={{ fontSize: 12, color: 'var(--subtle)', fontFamily: "'JetBrains Mono', monospace" }}>
            Round #{roundId}
          </span>
        )}
        {secondsAgo !== null && (
          <span style={{ fontSize: 12, color: isStale ? 'var(--danger)' : 'var(--subtle)', marginLeft: 'auto' }}>
            {formatSeconds(secondsAgo)}
          </span>
        )}
      </div>
      <style>{`
        @keyframes live-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0,214,111,0.8), 0 0 4px 1px rgba(0,214,111,0.5); opacity: 1; }
          50%       { box-shadow: 0 0 0 5px rgba(0,214,111,0), 0 0 10px 3px rgba(0,214,111,0.3); opacity: 0.7; }
        }
      `}</style>
    </div>
  )
}
