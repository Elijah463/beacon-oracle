/**
 * OracleDashboard.tsx
 * BEACON dashboard -- light theme, #F5F7FA, proper nav + footer, no framer-motion.
 */

import { useState } from 'react'
import { LandingFooter } from './LandingPage'
import { useOracle } from '@/hooks/useOracle'
import { RateCard } from './RateCard'
import { PriceChart } from './PriceChart'
import { CircuitBreakerBanner } from './CircuitBreakerBanner'
import { OracleStats } from './OracleStats'
import { ReporterInfo } from './ReporterInfo'
import { QuoteCalculator } from './QuoteCalculator'
import { BeaconMark } from './BeaconLogo'
import type { RoundPoint } from '@/hooks/useOracle'

const CONTRACT_ADDRESS = import.meta.env.VITE_ORACLE_CONTRACT_ADDRESS as string

type NavigateFn = (v: 'landing' | 'dashboard' | 'docs') => void

export function OracleDashboard({ onNavigate }: { onNavigate?: NavigateFn }) {
  const oracle = useOracle()

  return (
    <div data-theme="dark" style={{ minHeight: '100dvh', background: '#060a12', display: 'flex', flexDirection: 'column' }}>

      {/* Sticky nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 30,
        padding: '0 24px', height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(6,10,18,0.92)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BeaconMark size={26} />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.02em', lineHeight: 1 }}>BEACON</span>
        </div>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, maxWidth: 1152, margin: '0 auto', padding: '28px 24px', width: '100%', boxSizing: 'border-box' }}>

        {/* Health banner -- only renders when tripped or paused */}
        {(oracle.circuitBreakerTripped || oracle.paused) && (
          <div style={{ marginBottom: 16 }}>
            <CircuitBreakerBanner
              tripped={oracle.circuitBreakerTripped}
              circuitBreakerBps={oracle.circuitBreakerBps}
              paused={oracle.paused}
            />
          </div>
        )}

        {/* Hero: RateCard + Chart */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16, alignItems: 'stretch' }}>
          <div style={{ minWidth: 0 }}>
            <RateCard
              price={oracle.price}
              roundId={oracle.roundId}
              secondsAgo={oracle.secondsAgo}
              isStale={oracle.isStale}
              loading={oracle.loading}
              history={oracle.history}
            />
          </div>
          <div style={{ minWidth: 0, gridColumn: 'span 2' }}>
            <PriceChart history={oracle.history} price={oracle.price} loading={oracle.loading} />
          </div>
        </div>

        {/* Stats */}
        <div style={{ marginBottom: 16 }}>
          <OracleStats
            maxStaleness={oracle.maxStaleness}
            deviationThresholdBps={oracle.deviationThresholdBps}
            circuitBreakerBps={oracle.circuitBreakerBps}
            roundId={oracle.roundId}
            totalTransmissions={oracle.totalTransmissions}
          />
        </div>

        {/* Quote + Reporter */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
          <QuoteCalculator />
          <ReporterInfo reporter={oracle.reporter} contractAddress={CONTRACT_ADDRESS} />
        </div>

        {/* Round history */}
        <RoundHistoryTable history={oracle.history} loading={oracle.loading} />

        {/* Error */}
        {oracle.error && (
          <div style={{ marginTop: 12, borderRadius: 10, padding: '10px 14px', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", background: 'var(--danger-bg)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)' }}>
            {oracle.error}
          </div>
        )}
      </main>

      <LandingFooter
        onEnterDashboard={onNavigate ? () => onNavigate('dashboard') : undefined}
        onOpenDocs={onNavigate ? () => onNavigate('docs') : undefined}
      />
    </div>
  )
}

const PAGE_SIZE = 20

function RoundHistoryTable({ history, loading }: { history: RoundPoint[]; loading: boolean }) {
  // page 0 = newest rounds (latest), page 1 = next older block, etc.
  const [page, setPage] = useState(0)

  const reversed   = [...history].reverse()            // newest first
  const totalPages = Math.max(1, Math.ceil(reversed.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages - 1)    // clamp if history shrinks
  const pageRows   = reversed.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const onLatest   = safePage === 0
  const onOldest   = safePage >= totalPages - 1

  const btnBase: React.CSSProperties = {
    fontSize: 13, fontWeight: 700, borderRadius: 8, padding: '6px 14px',
    border: '1px solid var(--border)', background: 'var(--bg-muted)',
    color: 'var(--ink)', cursor: 'pointer',
  }
  const btnDisabled: React.CSSProperties = { ...btnBase, opacity: 0.3, cursor: 'default' }
  const btnGreen: React.CSSProperties   = { ...btnBase, color: 'var(--brand)', border: '1px solid var(--brand-border)', background: 'rgba(0,214,111,0.08)' }

  const showPagination = totalPages > 1

  return (
    <div style={{ borderRadius: 18, overflow: 'hidden', background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
      {/* Header -- title + count only, no nav buttons here */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--subtle)', margin: 0 }}>Round History</p>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: '3px 0 0' }}>
          {reversed.length > 0 ? `${reversed.length} on-chain round${reversed.length !== 1 ? 's' : ''}` : 'No rounds yet'}
        </p>
      </div>

      {loading ? (
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} style={{ height: 36, borderRadius: 8, background: 'var(--bg-muted)', animation: 'shimmer 1.5s infinite' }} />
          ))}
        </div>
      ) : reversed.length === 0 ? (
        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 13.5, color: 'var(--subtle)' }}>No rounds yet. The reporter publishes on first cycle.</p>
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Round', 'Price (NGN)', 'Change', 'Updated At'].map((h) => (
                    <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--subtle)', background: 'var(--bg)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, idx) => {
                  const nextRow = pageRows[idx + 1]
                  const change  = nextRow ? ((row.price - nextRow.price) / nextRow.price) * 100 : null
                  const isUp    = change !== null && change > 0
                  const isDown  = change !== null && change < 0
                  return (
                    <tr key={row.roundId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '11px 20px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--subtle)' }}>#{row.roundId}</td>
                      <td style={{ padding: '11px 20px', fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                        {row.price.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '11px 20px', fontSize: 12, fontWeight: 600, color: isUp ? 'var(--success)' : isDown ? 'var(--danger)' : 'var(--subtle)', fontVariantNumeric: 'tabular-nums' }}>
                        {change !== null ? `${change > 0 ? '+' : ''}${change.toFixed(3)}%` : '--'}
                      </td>
                      <td style={{ padding: '11px 20px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--subtle)' }}>
                        {new Date(row.updatedAt * 1000).toLocaleTimeString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {showPagination && (
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              {!onLatest
                ? <button onClick={() => setPage(0)} style={btnGreen}>Go to Latest</button>
                : <span />
              }
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setPage(p => p + 1)} disabled={onOldest} style={onOldest ? btnDisabled : btnBase} title="Older rounds">
                  {'<<<<'}
                </button>
                <span style={{ fontSize: 12, color: 'var(--subtle)', minWidth: 56, textAlign: 'center' }}>
                  {safePage + 1} / {totalPages}
                </span>
                <button onClick={() => setPage(p => Math.max(p - 1, 0))} disabled={onLatest} style={onLatest ? btnDisabled : btnBase} title="Newer rounds">
                  {'>>>>'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
