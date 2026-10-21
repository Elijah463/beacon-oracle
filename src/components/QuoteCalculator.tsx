/**
 * QuoteCalculator.tsx
 * On-chain quote panel. No framer-motion -- CSS transitions only.
 */

import { useState, useCallback } from 'react'
import { usePublicClient } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { ArrowLeftRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { ORACLE_ABI } from '@/lib/oracleAbi'

const CONTRACT_ADDRESS = import.meta.env.VITE_ORACLE_CONTRACT_ADDRESS as `0x${string}`
const USDC_DECIMALS = 6
const NGN_DECIMALS  = 2

type Direction = 'usdc-to-ngn' | 'ngn-to-usdc'

interface QuoteResult {
  input:      string
  output:     string
  roundId:    number
  ageSeconds: number
  direction:  Direction
}

function formatNGN(raw: bigint): string {
  return (Number(raw) / 10 ** NGN_DECIMALS).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatUSDC(raw: bigint): string {
  return (Number(raw) / 10 ** USDC_DECIMALS).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
}

function formatAge(secs: number): string {
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s ago`
  return `${Math.floor(secs / 3600)}h ago`
}

export function QuoteCalculator() {
  const [direction, setDirection]   = useState<Direction>('usdc-to-ngn')
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading]       = useState(false)
  const [result, setResult]         = useState<QuoteResult | null>(null)
  const [error, setError]           = useState<string | null>(null)

  const publicClient = usePublicClient({ chainId: arcTestnet.id })

  const flip = useCallback(() => {
    setDirection((d) => d === 'usdc-to-ngn' ? 'ngn-to-usdc' : 'usdc-to-ngn')
    setInputValue(''); setResult(null); setError(null)
  }, [])

  const handleQuote = useCallback(async () => {
    if (!publicClient) return
    const parsed = parseFloat(inputValue.replace(/,/g, ''))
    if (!isFinite(parsed) || parsed <= 0) { setError('Enter a valid positive amount.'); return }
    setLoading(true); setError(null); setResult(null)

    try {
      const metaCall = publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: 'latestQuoteMetadata' })

      if (direction === 'usdc-to-ngn') {
        const atomicIn = BigInt(Math.round(parsed * 10 ** USDC_DECIMALS))
        const [quoteRes, metaRes] = await Promise.all([
          publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: 'quoteUSDCToNGN', args: [atomicIn] }),
          metaCall,
        ])
        const [rid, , , age] = metaRes as [bigint, bigint, bigint, bigint]
        setResult({
          input:      `${parsed.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC`,
          output:     `${formatNGN(quoteRes)} NGN`,
          roundId:    Number(rid),
          ageSeconds: Number(age),
          direction,
        })
      } else {
        const atomicIn = BigInt(Math.round(parsed * 10 ** NGN_DECIMALS))
        const [quoteRes, metaRes] = await Promise.all([
          publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: 'quoteNGNToUSDC', args: [atomicIn] }),
          metaCall,
        ])
        const [rid, , , age] = metaRes as [bigint, bigint, bigint, bigint]
        setResult({
          input:      `${parsed.toLocaleString('en-NG', { minimumFractionDigits: 2 })} NGN`,
          output:     `${formatUSDC(quoteRes)} USDC`,
          roundId:    Number(rid),
          ageSeconds: Number(age),
          direction,
        })
      }
    } catch (e) {
      const msg = (e as Error).message ?? 'Quote failed'
      if (msg.toLowerCase().includes('stale')) setError('Oracle price is stale. Submit a fresh round first.')
      else if (msg.toLowerCase().includes('nodata') || msg.toLowerCase().includes('no data')) setError('No price data on-chain yet. Run the reporter to submit the first round.')
      else if (msg.toLowerCase().includes('circuit')) setError('Circuit breaker is active. The oracle owner must reset it first.')
      else setError(msg)
    } finally {
      setLoading(false)
    }
  }, [direction, inputValue, publicClient])

  const inputCurrency = direction === 'usdc-to-ngn' ? 'USDC' : 'NGN'

  return (
    <div style={{ borderRadius: 18, padding: '24px 26px', background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--subtle)', margin: 0 }}>On-Chain Quote</p>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '3px 0 0' }}>Computed directly by the smart contract</p>
        </div>
        <button onClick={flip} title="Flip direction" style={{ padding: 8, borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--brand)', display: 'flex', alignItems: 'center' }}>
          <ArrowLeftRight size={16} />
        </button>
      </div>

      {/* Input row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            type="number" min="0" step="any"
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); setError(null); setResult(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleQuote() }}
            placeholder={`Amount in ${inputCurrency}`}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '12px 52px 12px 14px', borderRadius: 10,
              background: 'var(--bg)', border: '1px solid var(--border)',
              color: 'var(--ink)', fontSize: 14, fontFamily: "'JetBrains Mono', monospace",
              outline: 'none',
            }}
          />
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>
            {inputCurrency}
          </span>
        </div>
        <button
          onClick={() => void handleQuote()}
          disabled={loading || !inputValue}
          style={{ padding: '12px 20px', borderRadius: 10, background: 'var(--brand)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: (loading || !inputValue) ? 0.45 : 1, transition: 'opacity .15s' }}
        >
          {loading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : 'Quote'}
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
        {direction === 'usdc-to-ngn' ? 'Converting USDC to NGN using live on-chain rate' : 'Converting NGN to USDC using live on-chain rate'}
        {' -- flip with arrows'}
      </p>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: '12px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
          <AlertCircle size={15} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13.5, color: 'var(--danger)', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Result */}
      {result && !error && (
        <div style={{ borderRadius: 12, padding: '14px 16px', background: 'rgba(0,214,111,0.05)', border: '1px solid rgba(0,214,111,0.18)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <CheckCircle2 size={15} color="var(--brand)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand)' }}>Quote ready</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', fontFamily: "'JetBrains Mono', monospace" }}>{result.input}</span>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>equals</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand)', fontFamily: "'Space Grotesk', sans-serif" }}>{result.output}</span>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 12, color: 'var(--muted)' }}>
            <span>Round #{result.roundId}</span>
            <span>Price {formatAge(result.ageSeconds)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
