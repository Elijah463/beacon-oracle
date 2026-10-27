/**
 * LandingPage.tsx
 * BEACON -- dark-mode oracle landing page.
 * Background: animated orderbook numbers + floating data particles.
 * Architecture section: animated SVG flow diagram.
 * Hero: glossy 3D-style price orb.
 * No framer-motion. Pure CSS + React.
 */

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Shield, Zap, Clock, GitBranch, ExternalLink, ChevronRight, BookOpen } from 'lucide-react'
import { BeaconLogo } from './BeaconLogo'

interface LandingPageProps {
  onEnterDashboard: () => void
  onOpenDocs: () => void
}

const CONTRACT    = '0x8A9bC80E846125ABA50B8936fD47cdB7cBc44797'
const EXPLORER    = `https://explorer.testnet.arc.io/address/${CONTRACT}`
const SHORT_CONTRACT = `${CONTRACT.slice(0, 8)}...${CONTRACT.slice(-6)}`

// ── Orderbook background canvas ────────────────────────────────────────────
// Alternates between two pairs every 4 seconds:
//   USDC/USD: prices 0.9990 - 1.0010
//   NGN/USD:  prices 1300 - 1600
function OrderbookCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number
    let pair: 'USDC/USD' | 'NGN/USD' = 'USDC/USD'
    let pairSwitchAt = Date.now() + 4000
    let pairLabel = 'USDC/USD'

    type Row = { y: number; val: string; alpha: number; speed: number; color: string; isAsk: boolean }
    type Col  = { x: number; rows: Row[] }
    let cols: Col[] = []

    const rand = (min: number, max: number) => Math.random() * (max - min) + min

    const fmtForPair = (p: typeof pair) => {
      if (p === 'USDC/USD') {
        // Tight spread around 1.0000
        const base  = rand(0.9990, 1.0010)
        const isAsk = Math.random() > 0.5
        return { val: base.toFixed(4), isAsk }
      } else {
        // NGN market: 1300-1600 range
        const base  = rand(1300, 1600)
        const dp    = Math.random() > 0.5 ? 2 : 0
        const isAsk = Math.random() > 0.5
        return { val: base.toFixed(dp), isAsk }
      }
    }

    const fmtVol = () => rand(50, 50000).toFixed(0)

    const resize = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      init()
    }

    const init = () => {
      const colCount = Math.floor(canvas.width / 120)
      cols = Array.from({ length: colCount }, (_, i) => ({
        x: (i + 0.5) * (canvas.width / colCount),
        rows: Array.from({ length: Math.floor(canvas.height / 22) }, (_, j) => {
          const usePrice = Math.random() > 0.45
          const { val, isAsk } = fmtForPair(pair)
          return {
            y:      j * 22 + 14,
            val:    usePrice ? val : fmtVol(),
            alpha:  rand(0.18, 0.55),
            speed:  rand(0.0004, 0.0018),
            color:  isAsk ? '#00D66F' : '#94a3b8',
            isAsk,
          }
        }),
      }))
    }

    // Label overlay: show current pair top-right of canvas
    const drawLabel = () => {
      ctx.save()
      ctx.globalAlpha = 0.7
      ctx.font = 'bold 12px "JetBrains Mono", monospace'
      ctx.textAlign = 'right'
      ctx.fillStyle = '#00D66F'
      ctx.fillText(pairLabel, canvas.width - 16, 22)
      ctx.restore()
    }

    let t = 0
    const draw = () => {
      t += 1

      // Switch pair every 4 seconds
      if (Date.now() > pairSwitchAt) {
        pair = pair === 'USDC/USD' ? 'NGN/USD' : 'USDC/USD'
        pairLabel = pair
        pairSwitchAt = Date.now() + 4000
        // Refresh ~40% of cells with new pair values
        for (const col of cols) {
          for (const row of col.rows) {
            if (Math.random() > 0.6) {
              const usePrice = Math.random() > 0.45
              const { val, isAsk } = fmtForPair(pair)
              row.val   = usePrice ? val : fmtVol()
              row.color = isAsk ? '#00D66F' : '#94a3b8'
              row.isAsk = isAsk
            }
          }
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.font = '11px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'

      for (const col of cols) {
        for (const row of col.rows) {
          const pulse = Math.sin(t * row.speed * 60 + row.y) * 0.5 + 0.5
          ctx.globalAlpha = row.alpha * (0.5 + pulse * 0.5)
          ctx.fillStyle   = row.color
          ctx.fillText(row.val, col.x, row.y)
          // Trickle refresh individual cells
          if (t % 90 === 0 && Math.random() > 0.88) {
            const usePrice = Math.random() > 0.45
            const { val, isAsk } = fmtForPair(pair)
            row.val   = usePrice ? val : fmtVol()
            row.color = isAsk ? '#00D66F' : '#94a3b8'
            row.isAsk = isAsk
          }
        }
      }

      drawLabel()
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }

    resize()
    draw()
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none',
      }}
    />
  )
}

// ── Animated architecture diagram ──────────────────────────────────────────
function ArchDiagram() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setStep(s => (s + 1) % 4), 1200)
    return () => clearInterval(id)
  }, [])

  const nodes = [
    { label: 'Market Sources', sub: '8 independent feeds', icon: '◎', col: '#60a5fa' },
    { label: 'Aggregator', sub: 'Median + outlier filter', icon: '⬡', col: '#a78bfa' },
    { label: 'ECDSA Signer', sub: 'Signing key verification', icon: '⬢', col: '#f472b6' },
    { label: 'BEACON Contract', sub: 'On-chain round storage', icon: '◈', col: '#00D66F' },
  ]

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 0, minWidth: 640, padding: '24px 0',
      }}>
        {nodes.map((node, i) => (
          <div key={node.label} style={{ display: 'flex', alignItems: 'center' }}>
            {/* Node */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 8, padding: '20px 24px',
              background: step >= i
                ? `linear-gradient(135deg, rgba(${hexToRgb(node.col)},0.12), rgba(${hexToRgb(node.col)},0.04))`
                : 'rgba(255,255,255,0.03)',
              border: `1px solid ${step >= i ? node.col + '55' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 16, width: 140, transition: 'all 0.4s ease',
              boxShadow: step >= i ? `0 0 24px rgba(${hexToRgb(node.col)},0.15)` : 'none',
            }}>
              <span style={{ fontSize: 28, color: step >= i ? node.col : '#334155', transition: 'color 0.4s' }}>{node.icon}</span>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: step >= i ? '#f1f5f9' : '#475569', transition: 'color 0.4s', fontFamily: "'Space Grotesk', sans-serif" }}>
                  {node.label}
                </div>
                <div style={{ fontSize: 11, color: step >= i ? '#94a3b8' : '#334155', marginTop: 3, transition: 'color 0.4s' }}>
                  {node.sub}
                </div>
              </div>
            </div>

            {/* Arrow between nodes */}
            {i < nodes.length - 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 48, flexShrink: 0 }}>
                <div style={{
                  height: 2, width: '100%',
                  background: step > i
                    ? `linear-gradient(90deg, ${nodes[i].col}, ${nodes[i + 1].col})`
                    : 'rgba(255,255,255,0.08)',
                  transition: 'background 0.4s',
                  position: 'relative',
                }}>
                  {/* Moving dot on active edge */}
                  {step === i + 1 && (
                    <div style={{
                      position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                      width: 8, height: 8, borderRadius: '50%',
                      background: nodes[i].col, boxShadow: `0 0 8px ${nodes[i].col}`,
                      animation: 'slideRight 1.2s linear',
                    }} />
                  )}
                </div>
                <div style={{ fontSize: 10, color: '#334155', marginTop: 4 }}>
                  {step > i ? ['price data', 'signed payload', 'transmit()'][i] : ''}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slideRight {
          from { left: 0; }
          to   { left: 100%; }
        }
      `}</style>
    </div>
  )
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}

// ── 3D Glossy price orb ────────────────────────────────────────────────────
function PriceOrb() {
  return (
    <div style={{ position: 'relative', width: 200, height: 200, margin: '0 auto 32px' }}>
      {/* Outer glow */}
      <div style={{
        position: 'absolute', inset: -20,
        background: 'radial-gradient(circle, rgba(0,214,111,0.18) 0%, transparent 70%)',
        borderRadius: '50%',
        animation: 'orbPulse 3s ease-in-out infinite',
      }} />
      {/* Orb body */}
      <div style={{
        width: 200, height: 200, borderRadius: '50%',
        background: 'radial-gradient(circle at 38% 35%, rgba(0,214,111,0.35) 0%, rgba(0,214,111,0.1) 40%, rgba(0,30,15,0.9) 80%)',
        border: '1px solid rgba(0,214,111,0.4)',
        boxShadow: '0 0 60px rgba(0,214,111,0.2), 0 0 120px rgba(0,214,111,0.08), inset 0 1px 0 rgba(255,255,255,0.15)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Specular highlight */}
        <div style={{
          position: 'absolute', top: 18, left: 42, width: 60, height: 30,
          background: 'radial-gradient(ellipse, rgba(255,255,255,0.18) 0%, transparent 70%)',
          borderRadius: '50%', transform: 'rotate(-20deg)',
        }} />
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(0,214,111,0.8)', textTransform: 'uppercase', marginBottom: 6 }}>
          USDC / NGN
        </div>
        <div style={{
          fontSize: 32, fontWeight: 800, color: '#fff',
          fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.03em',
          fontVariantNumeric: 'tabular-nums',
        }}>
          LIVE
        </div>
        <div style={{ width: 40, height: 2, background: 'rgba(0,214,111,0.5)', borderRadius: 1, margin: '6px 0' }} />
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em' }}>Arc Testnet</div>
      </div>
      {/* Orbiting ring */}
      <div style={{
        position: 'absolute', inset: -8,
        border: '1px solid rgba(0,214,111,0.2)',
        borderRadius: '50%',
        animation: 'orbRing 8s linear infinite',
      }}>
        <div style={{
          position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)',
          width: 8, height: 8, borderRadius: '50%',
          background: '#00D66F', boxShadow: '0 0 8px #00D66F',
        }} />
      </div>
      <style>{`
        @keyframes orbPulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        @keyframes orbRing {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export function LandingPage({ onEnterDashboard, onOpenDocs }: LandingPageProps) {
  return (
    <div style={{ background: '#060a12', minHeight: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', sans-serif", color: '#f1f5f9' }}>

      {/* Nav */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'rgba(6,10,18,0.88)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <BeaconLogo size={30} />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.02em', lineHeight: 1 }}>BEACON</span>
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={onOpenDocs} style={navBtn}>
              <BookOpen size={14} /> Docs
            </button>
            <a href={EXPLORER} target="_blank" rel="noreferrer" style={navLink}>
              Contract <ExternalLink size={11} />
            </a>
            <button onClick={onEnterDashboard} style={ctaBtn}>
              Dashboard <ChevronRight size={14} />
            </button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '80px 24px 0' }}>
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, width: '100%' }}>

          {/* Live badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(0,214,111,0.1)', border: '1px solid rgba(0,214,111,0.3)', borderRadius: 999, padding: '5px 16px', marginBottom: 40 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00D66F', display: 'inline-block', boxShadow: '0 0 6px #00D66F', animation: 'blink 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#00D66F', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Live on Arc Testnet</span>
          </div>

          <PriceOrb />

          <h1 style={{ fontSize: 'clamp(34px,5.5vw,68px)', fontWeight: 900, lineHeight: 1.06, letterSpacing: '-0.03em', color: '#fff', marginBottom: 20, fontFamily: "'Space Grotesk', sans-serif" }}>
            The on-chain price oracle{' '}
            <br />
            <span style={{ color: '#00D66F' }}>for USDC/NGN</span>
          </h1>

          <p style={{ fontSize: 17, lineHeight: 1.7, color: '#64748b', maxWidth: 560, margin: '0 auto 48px' }}>
            BEACON aggregates real-time exchange rate data across eight independent market sources,
            derives a tamper-resistant USDC/NGN price, and publishes it on-chain via a
            Chainlink-compatible interface. Any smart contract can read it.
          </p>

          {/* CTA panel: tall canvas window, buttons overlaid at the bottom */}
          <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(0,214,111,0.18)', height: 320 }}>
            {/* Full-height orderbook canvas */}
            <OrderbookCanvas />

            {/* Top fade so numbers don't compete with nothing */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'linear-gradient(180deg, rgba(6,10,18,0.4) 0%, transparent 35%, transparent 45%, rgba(6,10,18,0.72) 75%, rgba(6,10,18,0.92) 100%)',
            }} />

            {/* Buttons pinned to the bottom */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2,
              padding: '24px 32px 28px',
              backdropFilter: 'blur(6px)',
              display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
            }}>
              <button onClick={onEnterDashboard} style={{ ...ctaBtn, padding: '14px 32px', fontSize: 15, gap: 8 }}>
                View Live Price <ArrowRight size={16} />
              </button>
              <button onClick={onOpenDocs} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '14px 28px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.07)', color: '#e2e8f0', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>
                <BookOpen size={16} /> Get Started
              </button>
            </div>
          </div>

          {/* Stats strip */}
          <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', justifyContent: 'center', marginTop: 56, paddingTop: 36, borderTop: '1px solid rgba(255,255,255,0.07)', width: '100%', marginBottom: 72 }}>
            {[
              { value: '8', label: 'Decimal precision' },
              { value: '0.2%', label: 'Deviation threshold' },
              { value: '1h', label: 'Heartbeat' },
              { value: 'UUPS', label: 'Upgradeable proxy' },
            ].map(({ value, label }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', fontFamily: "'Space Grotesk', sans-serif" }}>{value}</div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 3, letterSpacing: '0.03em' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
        <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      </section>

      {/* Architecture section */}
      <section style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '80px 24px' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#00D66F', textTransform: 'uppercase', marginBottom: 10 }}>Architecture</p>
            <h2 style={{ fontSize: 'clamp(22px,3.5vw,38px)', fontWeight: 800, color: '#f1f5f9', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em', margin: 0 }}>
              Two layers. One trusted price.
            </h2>
            <p style={{ color: '#475569', fontSize: 14, marginTop: 12 }}>
              Watch how a price moves from raw market data to an on-chain round.
            </p>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: '32px 20px' }}>
            <ArchDiagram />
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 16 }}>
          {[
            {
              icon: <Zap size={20} color="#00D66F" />,
              title: 'Off-chain aggregation',
              body: 'Eight independent market sources are sampled every cycle. Outliers are rejected before median aggregation. Both price legs (USDC/USD and USD/NGN) require quorum to proceed.',
              bullets: ['Outlier rejection', '0.2% deviation gate', '1h heartbeat publish', 'Quorum required on both legs'],
            },
            {
              icon: <Shield size={20} color="#818cf8" />,
              title: 'On-chain settlement',
              body: 'Prices are ECDSA-signed and submitted to the contract. The contract verifies signatures, enforces monotonic ordering, and stores rounds in a circular buffer.',
              bullets: ['ECDSA signature verification', '100-round history buffer', 'Staleness guard on reads', 'On-chain circuit breaker'],
            },
            {
              icon: <GitBranch size={20} color="#f472b6" />,
              title: 'Chainlink-compatible',
              body: 'Implements the full AggregatorV3Interface. Existing Chainlink consumers work without modification. Phase-encoded round IDs are compatible with the Chainlink Feed Registry.',
              bullets: ['AggregatorV3Interface', 'latestRoundData() + getRoundData()', 'typeAndVersion() identifier', 'Phase-encoded round IDs'],
            },
            {
              icon: <Clock size={20} color="#fbbf24" />,
              title: 'Security model',
              body: 'Ownable2Step governance prevents accidental ownership transfers. renounceOwnership is permanently disabled. The reporter role is separate from the gas payer.',
              bullets: ['Ownable2Step (2-tx transfer)', 'UUPS upgradeable proxy', 'Consumer authorization gate', 'Pause / circuit breaker'],
            },
          ].map(({ icon, title, body, bullets }) => (
            <div key={title} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '26px 24px', transition: 'border-color .2s' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                {icon}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 10, fontFamily: "'Space Grotesk', sans-serif" }}>{title}</h3>
              <p style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.65, marginBottom: 14 }}>{body}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {bullets.map(b => (
                  <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#475569' }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#00D66F', flexShrink: 0 }} />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* CTA strip */}
      <section style={{ padding: '0 24px 80px', textAlign: 'center' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', background: 'rgba(0,214,111,0.04)', border: '1px solid rgba(0,214,111,0.15)', borderRadius: 24, padding: '56px 40px' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(0,214,111,0.1)', border: '1px solid rgba(0,214,111,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <BookOpen size={24} color="#00D66F" />
          </div>
          <h2 style={{ fontSize: 'clamp(20px,3vw,30px)', fontWeight: 800, color: '#f1f5f9', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em', marginBottom: 12 }}>
            Ready to integrate?
          </h2>
          <p style={{ color: '#64748b', fontSize: 15, marginBottom: 32, lineHeight: 1.65 }}>
            Read the full integration guide with verified code snippets, interface definitions,
            security notes, and best practices for building on top of BEACON.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onOpenDocs} style={{ ...ctaBtn, padding: '12px 26px', fontSize: 15 }}>
              Read the Docs <BookOpen size={15} />
            </button>
            <button onClick={onEnterDashboard} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 24px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#94a3b8', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>
              Open Dashboard <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <LandingFooter onEnterDashboard={onEnterDashboard} onOpenDocs={onOpenDocs} />
    </div>
  )
}

const CURRENT_YEAR = new Date().getFullYear()

export function LandingFooter({ onEnterDashboard, onOpenDocs }: { onEnterDashboard?: () => void; onOpenDocs?: () => void }) {
  return (
    <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: '#040710', padding: '48px 24px 28px' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 40, marginBottom: 40 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <BeaconLogo size={26} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.02em', lineHeight: 1 }}>BEACON</span>
            </div>
            <p style={{ marginTop: 12, fontSize: 13, color: '#475569', lineHeight: 1.65, maxWidth: 200 }}>
              A USDC/NGN on-chain price oracle built on Arc. Chainlink-compatible. Upgradeable.
            </p>
          </div>
          <div>
            <p style={footerHead}>Product</p>
            <ul style={footerList}>
              <li><button onClick={onEnterDashboard} style={footerLinkBtn}>Dashboard</button></li>
              <li><a href={EXPLORER} target="_blank" rel="noreferrer" style={footerLink}>Contract</a></li>
              <li><button onClick={onOpenDocs} style={footerLinkBtn}>Documentation</button></li>
            </ul>
          </div>
          <div>
            <p style={footerHead}>Developers</p>
            <ul style={footerList}>
              <li><a href="https://developers.circle.com" target="_blank" rel="noreferrer" style={footerLink}>Circle Docs</a></li>
              <li><a href="https://docs.arc.io" target="_blank" rel="noreferrer" style={footerLink}>Arc Network</a></li>
              <li><a href="https://docs.chain.link/data-feeds" target="_blank" rel="noreferrer" style={footerLink}>Chainlink Interface</a></li>
            </ul>
          </div>
          <div>
            <p style={footerHead}>Network</p>
            <ul style={footerList}>
              <li><a href="https://explorer.testnet.arc.io" target="_blank" rel="noreferrer" style={footerLink}>Arc Testnet Explorer</a></li>
              <li><a href={EXPLORER} target="_blank" rel="noreferrer" style={footerLink}>{SHORT_CONTRACT}</a></li>
            </ul>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#1e293b' }}>&copy; {CURRENT_YEAR} BEACON. Built on Arc by Circle.</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00D66F', display: 'inline-block' }} />
            <span style={{ fontSize: 12, color: '#334155' }}>Arc Testnet</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
const navBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  fontSize: 13.5, fontWeight: 500, color: '#64748b',
  background: 'none', border: 'none', cursor: 'pointer',
  padding: '6px 10px', borderRadius: 7, transition: 'color .15s',
  fontFamily: "'DM Sans', sans-serif",
}

const navLink: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  fontSize: 13.5, fontWeight: 500, color: '#64748b',
  textDecoration: 'none', padding: '6px 10px', borderRadius: 7,
}

const ctaBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '9px 18px', borderRadius: 10,
  background: '#00D66F', color: '#031a0a',
  border: 'none', cursor: 'pointer',
  fontSize: 13.5, fontWeight: 700,
  transition: 'opacity .15s', fontFamily: "'DM Sans', sans-serif",
}

const footerHead: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: '#1e293b', marginBottom: 12,
}

const footerList: React.CSSProperties = {
  listStyle: 'none', padding: 0, margin: 0,
}

const footerLink: React.CSSProperties = {
  display: 'block', fontSize: 13.5, color: '#334155',
  textDecoration: 'none', padding: '4px 0',
}

const footerLinkBtn: React.CSSProperties = {
  display: 'block', fontSize: 13.5, color: '#334155',
  background: 'none', border: 'none', cursor: 'pointer',
  padding: '4px 0', fontFamily: 'inherit', textAlign: 'left',
}
