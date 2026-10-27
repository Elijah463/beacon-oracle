/**
 * OracleDashboard.tsx
 * BEACON dashboard -- light theme, #F5F7FA, proper nav + footer, no framer-motion.
 */

import { ConnectKitButton } from 'connectkit'
import { ExternalLink } from 'lucide-react'
import { useOracle } from '@/hooks/useOracle'
import { RateCard } from './RateCard'
import { PriceChart } from './PriceChart'
import { CircuitBreakerBanner } from './CircuitBreakerBanner'
import { OracleStats } from './OracleStats'
import { ReporterInfo } from './ReporterInfo'
import { QuoteCalculator } from './QuoteCalculator'
import { BeaconLogo } from './BeaconLogo'
import type { RoundPoint } from '@/hooks/useOracle'

const CONTRACT_ADDRESS = import.meta.env.VITE_ORACLE_CONTRACT_ADDRESS as string
const SHORT_CONTRACT = `${CONTRACT_ADDRESS.slice(0, 8)}...${CONTRACT_ADDRESS.slice(-6)}`
const EXPLORER = `https://explorer.testnet.arc.io/address/${CONTRACT_ADDRESS}`

interface OracleDashboardProps {
  onBack?: () => void
}

export function OracleDashboard({ onBack }: OracleDashboardProps) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BeaconLogo size={28} />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.02em', lineHeight: 1 }}>BEACON</span>
          {onBack && (
            <button onClick={onBack} style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', padding: '4px 10px', borderRadius: 6 }}>
              Home
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href={EXPLORER} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontFamily: "'JetBrains Mono', monospace" }}>
            {SHORT_CONTRACT} <ExternalLink size={11} />
          </a>
          <ConnectKitButton />
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

      {/* Dashboard footer */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(6,10,18,0.95)', padding: '16px 24px' }}>
        <div style={{ maxWidth: 1152, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <BeaconLogo size={22} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.02em', lineHeight: 1 }}>BEACON</span>
          </div>
          <a href={EXPLORER} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textDecoration: 'none', fontFamily: "'JetBrains Mono', monospace", display: 'flex', alignItems: 'center', gap: 4 }}>
            {CONTRACT_ADDRESS} <ExternalLink size={10} />
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00D66F', display: 'inline-block', boxShadow: '0 0 6px #00D66F' }} />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Arc Testnet</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function RoundHistoryTable({ history, loading }: { history: RoundPoint[]; loading: boolean }) {
  const reversed = [...history].reverse()

  return (
    <div style={{ borderRadius: 18, overflow: 'hidden', background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--subtle)', margin: 0 }}>Round History</p>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: '3px 0 0' }}>Last {history.length} on-chain rounds</p>
      </div>

      {loading ? (
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} style={{ height: 36, borderRadius: 8, background: 'var(--bg-muted)', animation: 'shimmer 1.5s infinite' }} />
          ))}
        </div>
      ) : reversed.length === 0 ? (
        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 13.5, color: 'var(--subtle)' }}>No rounds yet. Start the reporter to populate data.</p>
        </div>
      ) : (
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
              {reversed.map((row, idx) => {
                const nextRow = reversed[idx + 1]
                const change = nextRow ? ((row.price - nextRow.price) / nextRow.price) * 100 : null
                const isUp = change !== null && change > 0
                const isDown = change !== null && change < 0
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
      )}
    </div>
  )
}
