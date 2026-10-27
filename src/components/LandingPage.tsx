/**
 * LandingPage.tsx
 * BEACON -- on-chain oracle for USDC/NGN.
 * No framer-motion. Pure CSS transitions only.
 */

import { ArrowRight, Shield, Zap, Clock, GitBranch, ExternalLink, ChevronRight } from 'lucide-react'
import { BeaconLogo } from './BeaconLogo'

interface LandingPageProps {
  onEnterDashboard: () => void
}

const CONTRACT = '0x8A9bC80E846125ABA50B8936fD47cdB7cBc44797'
const EXPLORER = `https://explorer.testnet.arc.io/address/${CONTRACT}`
const SHORT_CONTRACT = `${CONTRACT.slice(0, 8)}...${CONTRACT.slice(-6)}`

export function LandingPage({ onEnterDashboard }: LandingPageProps) {
  return (
    <div style={{ background: '#F5F7FA', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Nav ───────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'rgba(245,247,250,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #e8eaf0',
      }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BeaconLogo size={32} />
          <nav style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a href={EXPLORER} target="_blank" rel="noreferrer" style={navLinkStyle}>
              Contract <ExternalLink size={12} style={{ display: 'inline', marginLeft: 2 }} />
            </a>
            <a href="https://developers.circle.com" target="_blank" rel="noreferrer" style={navLinkStyle}>
              Docs
            </a>
            <button onClick={onEnterDashboard} style={ctaButtonStyle}>
              Open Dashboard <ChevronRight size={15} />
            </button>
          </nav>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '80px 24px 64px' }}>

        {/* Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#e8faf2', border: '1px solid #b3f0d0', borderRadius: 999, padding: '4px 14px', marginBottom: 32 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00D66F', display: 'inline-block' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#00a855', letterSpacing: '0.03em' }}>Live on Arc Testnet</span>
        </div>

        <h1 style={{ fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em', color: '#0a0a0a', maxWidth: 800, margin: '0 auto 24px', fontFamily: "'Space Grotesk', sans-serif" }}>
          The on-chain price oracle for{' '}
          <span style={{ color: '#00D66F' }}>USDC/NGN</span>
        </h1>

        <p style={{ fontSize: 18, lineHeight: 1.65, color: '#5a6275', maxWidth: 600, margin: '0 auto 40px' }}>
          BEACON aggregates real-time exchange rate data across independent sources,
          derives a tamper-resistant USDC/NGN price, and publishes it on-chain
          via a Chainlink-compatible interface. Any smart contract can read it.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={onEnterDashboard} style={{ ...ctaButtonStyle, padding: '13px 28px', fontSize: 16, gap: 8 }}>
            View Live Price <ArrowRight size={17} />
          </button>
          <a href={EXPLORER} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '13px 24px', borderRadius: 10, border: '1.5px solid #d1d5e0', background: 'white', color: '#3a3f4d', fontSize: 16, fontWeight: 500, textDecoration: 'none', transition: 'border-color .15s' }}>
            {SHORT_CONTRACT} <ExternalLink size={14} />
          </a>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'center', marginTop: 56, paddingTop: 40, borderTop: '1px solid #e0e3eb', width: '100%', maxWidth: 720 }}>
          {[
            { value: '8', label: 'Decimal precision' },
            { value: '100', label: 'Rounds in history' },
            { value: '0.2%', label: 'Deviation threshold' },
            { value: 'UUPS', label: 'Upgradeable proxy' },
          ].map(({ value, label }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#0a0a0a', fontFamily: "'Space Grotesk', sans-serif" }}>{value}</div>
              <div style={{ fontSize: 13, color: '#8891a4', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────── */}
      <section style={{ background: 'white', borderTop: '1px solid #e8eaf0', borderBottom: '1px solid #e8eaf0', padding: '72px 24px' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#00D66F', textTransform: 'uppercase', marginBottom: 12 }}>Architecture</p>
            <h2 style={{ fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 800, color: '#0a0a0a', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em', margin: 0 }}>
              Two layers. One trusted price.
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            {/* Off-chain */}
            <div style={featureCardStyle}>
              <div style={{ ...iconWrapStyle, background: '#f0faf6' }}>
                <Zap size={20} color="#00D66F" />
              </div>
              <h3 style={cardTitleStyle}>Off-chain aggregation</h3>
              <p style={cardBodyStyle}>
                A reporter service fetches USDC/USD quotes from five independent
                CEX spot markets and USD/NGN rates from three independent sources:
                CoinGecko (real-time USDT/NGN crypto market rate), ExchangeRate-API,
                and CurrencyAPI. Each leg is aggregated independently and the final
                USDC/NGN price is median(USDC/USD) multiplied by median(NGN/USD).
              </p>
              <ul style={listStyle}>
                <li>5 USDC/USD sources (Coinbase, Binance, OKX, Bitget, Bybit)</li>
                <li>3 NGN/USD sources, quorum 2, outlier-filtered</li>
                <li>FX sources cached (24h / 1h) to stay within free tier limits</li>
                <li>0.2% deviation gate + 1h heartbeat publish rules</li>
              </ul>
            </div>

            {/* On-chain */}
            <div style={featureCardStyle}>
              <div style={{ ...iconWrapStyle, background: '#f0faf6' }}>
                <Shield size={20} color="#00D66F" />
              </div>
              <h3 style={cardTitleStyle}>On-chain settlement</h3>
              <p style={cardBodyStyle}>
                Aggregated prices are submitted to the oracle contract via a
                permissioned <code style={codeStyle}>transmit()</code> call.
                The contract stores rounds in a 100-slot circular buffer and
                exposes a Chainlink-compatible <code style={codeStyle}>AggregatorV3Interface</code>,
                so any existing Chainlink consumer integration works without
                modification.
              </p>
              <ul style={listStyle}>
                <li>Staleness guard reverts reads older than 1 hour</li>
                <li>On-chain circuit breaker freezes updates on large single moves</li>
                <li>Strict timestamp ordering per round</li>
                <li>UUPS proxy -- logic upgradeable without address change</li>
              </ul>
            </div>

            {/* Quotes */}
            <div style={featureCardStyle}>
              <div style={{ ...iconWrapStyle, background: '#f0faf6' }}>
                <GitBranch size={20} color="#00D66F" />
              </div>
              <h3 style={cardTitleStyle}>On-chain quote functions</h3>
              <p style={cardBodyStyle}>
                External contracts can request computed conversions directly
                without implementing any arithmetic. The oracle handles decimal
                scaling, staleness validation, and circuit breaker checks before
                returning the result.
              </p>
              <ul style={listStyle}>
                <li><code style={codeStyle}>quoteUSDCToNGN(usdcAmount)</code></li>
                <li><code style={codeStyle}>quoteNGNToUSDC(ngnAmount)</code></li>
                <li><code style={codeStyle}>latestQuoteMetadata()</code> for auditability</li>
                <li>6-decimal USDC in, 2-decimal NGN out (kobo precision)</li>
              </ul>
            </div>

            {/* Security */}
            <div style={featureCardStyle}>
              <div style={{ ...iconWrapStyle, background: '#f0faf6' }}>
                <Clock size={20} color="#00D66F" />
              </div>
              <h3 style={cardTitleStyle}>Security model</h3>
              <p style={cardBodyStyle}>
                BEACON follows the Chainlink security model adapted for a single
                trusted reporter. The reporter role is an address stored in
                contract state -- it can be replaced by the owner with a
                coordinator contract to transition to a decentralized multi-node
                model without redeploying the oracle.
              </p>
              <ul style={listStyle}>
                <li>Ownable2Step -- two-step ownership transfer</li>
                <li><code style={codeStyle}>renounceOwnership()</code> permanently disabled</li>
                <li>Consumer authorization gate (optional)</li>
                <li>Pause / unpause by owner for emergency stop</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA strip ─────────────────────────────────────────── */}
      <section style={{ padding: '64px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(22px, 3.5vw, 34px)', fontWeight: 800, color: '#0a0a0a', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em', marginBottom: 16 }}>
            Ready to integrate?
          </h2>
          <p style={{ color: '#5a6275', fontSize: 16, marginBottom: 32, lineHeight: 1.6 }}>
            The contract is live. Read the on-chain price directly,
            call the quote functions from your own contract, or plug
            in any Chainlink-compatible consumer.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onEnterDashboard} style={{ ...ctaButtonStyle, padding: '12px 26px' }}>
              Open Dashboard <ArrowRight size={16} />
            </button>
            <a href={EXPLORER} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 22px', borderRadius: 10, border: '1.5px solid #d1d5e0', background: 'white', color: '#3a3f4d', fontSize: 15, fontWeight: 500, textDecoration: 'none' }}>
              View contract <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <LandingFooter onEnterDashboard={onEnterDashboard} />
    </div>
  )
}

const CURRENT_YEAR = new Date().getFullYear()

export function LandingFooter({ onEnterDashboard }: { onEnterDashboard?: () => void }) {
  return (
    <footer style={{ borderTop: '1px solid #e0e3eb', background: 'white', padding: '48px 24px 28px' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 40, marginBottom: 40 }}>
          {/* Brand */}
          <div>
            <BeaconLogo size={30} />
            <p style={{ marginTop: 12, fontSize: 13.5, color: '#8891a4', lineHeight: 1.6, maxWidth: 200 }}>
              A USDC/NGN on-chain price oracle built on Arc. Chainlink-compatible. Upgradeable.
            </p>
          </div>
          {/* Product */}
          <div>
            <p style={footerHeadStyle}>Product</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li><button onClick={onEnterDashboard} style={footerLinkStyle}>Dashboard</button></li>
              <li><a href={EXPLORER} target="_blank" rel="noreferrer" style={footerLinkStyle}>Contract</a></li>
              <li><a href={`${EXPLORER}#readContract`} target="_blank" rel="noreferrer" style={footerLinkStyle}>ABI Reference</a></li>
            </ul>
          </div>
          {/* Developers */}
          <div>
            <p style={footerHeadStyle}>Developers</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li><a href="https://developers.circle.com" target="_blank" rel="noreferrer" style={footerLinkStyle}>Circle Docs</a></li>
              <li><a href="https://docs.arc.io" target="_blank" rel="noreferrer" style={footerLinkStyle}>Arc Network</a></li>
              <li><a href="https://docs.chain.link/data-feeds" target="_blank" rel="noreferrer" style={footerLinkStyle}>Chainlink Interface</a></li>
            </ul>
          </div>
          {/* Network */}
          <div>
            <p style={footerHeadStyle}>Network</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li>
                <a href={`https://explorer.testnet.arc.io`} target="_blank" rel="noreferrer" style={footerLinkStyle}>
                  Arc Testnet Explorer
                </a>
              </li>
              <li>
                <a href={EXPLORER} target="_blank" rel="noreferrer" style={footerLinkStyle}>
                  {SHORT_CONTRACT}
                </a>
              </li>
            </ul>
          </div>
        </div>
        {/* Bottom bar */}
        <div style={{ borderTop: '1px solid #eaecf0', paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#a0a8b8' }}>&copy; {CURRENT_YEAR} BEACON. Built on Arc by Circle.</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00D66F', display: 'inline-block' }} />
            <span style={{ fontSize: 12, color: '#a0a8b8' }}>Arc Testnet</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ── Shared styles ──────────────────────────────────────────
const navLinkStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 3,
  fontSize: 14, fontWeight: 500, color: '#5a6275',
  textDecoration: 'none', padding: '6px 10px', borderRadius: 7,
  transition: 'color .15s',
}

const ctaButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '9px 18px', borderRadius: 10,
  background: '#00D66F', color: 'white',
  border: 'none', cursor: 'pointer',
  fontSize: 14, fontWeight: 600,
  transition: 'opacity .15s',
}

const featureCardStyle: React.CSSProperties = {
  background: '#fafbfc', border: '1px solid #e8eaf0',
  borderRadius: 16, padding: '28px 26px',
}

const iconWrapStyle: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 12,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  marginBottom: 16,
}

const cardTitleStyle: React.CSSProperties = {
  fontSize: 17, fontWeight: 700, color: '#0a0a0a',
  marginBottom: 10, fontFamily: "'Space Grotesk', sans-serif",
}

const cardBodyStyle: React.CSSProperties = {
  fontSize: 14.5, color: '#5a6275', lineHeight: 1.65, marginBottom: 14,
}

const listStyle: React.CSSProperties = {
  listStyle: 'none', padding: 0, margin: 0,
  display: 'flex', flexDirection: 'column', gap: 6,
}

const codeStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12.5, background: '#f0f2f5',
  padding: '1px 5px', borderRadius: 4, color: '#1a7a4a',
}

const footerHeadStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: '#b0b8c8', marginBottom: 12,
}

const footerLinkStyle: React.CSSProperties = {
  display: 'block', fontSize: 14, color: '#5a6275',
  textDecoration: 'none', padding: '4px 0',
  background: 'none', border: 'none', cursor: 'pointer',
  fontFamily: 'inherit',
}
