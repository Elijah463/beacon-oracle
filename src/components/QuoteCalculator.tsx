/**
 * QuoteCalculator.tsx
 * BEACON Converter -- swap-style UI for USDC/NGN on-chain quotes.
 * No framer-motion. Pure CSS transitions.
 */

import { useState, useCallback } from 'react'
import { usePublicClient } from 'wagmi'
import { arc } from 'viem/chains'
import { ArrowUpDown, Loader2, AlertCircle } from 'lucide-react'
import { ORACLE_ABI } from '@/lib/oracleAbi'
import { formatCompact, parseDecimalToBigInt } from '@/lib/formatNumber'

const CONTRACT_ADDRESS = import.meta.env.VITE_ORACLE_CONTRACT_ADDRESS as `0x${string}`
const USDC_DECIMALS = 6
const NGN_DECIMALS  = 2

type Direction = 'usdc-to-ngn' | 'ngn-to-usdc'

function formatNGN(raw: bigint): string {
  return formatCompact(Number(raw) / 10 ** NGN_DECIMALS, 2)
}
function formatUSDC(raw: bigint): string {
  return formatCompact(Number(raw) / 10 ** USDC_DECIMALS, 2)
}

// Real PNG logos from public/
function USDCIcon({ size = 56 }: { size?: number }) {
  return <img src="/USDC_Logo.png" alt="USDC" width={size} height={size} style={{ objectFit: 'contain', borderRadius: '50%' }} />
}
function NGNIcon({ size = 56 }: { size?: number }) {
  return <img src="/NGN_Logo.png" alt="NGN" width={size} height={size} style={{ objectFit: 'contain', borderRadius: '50%' }} />
}

export function QuoteCalculator() {
  const [direction, setDirection]   = useState<Direction>('usdc-to-ngn')
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading]       = useState(false)
  const [outputValue, setOutputValue] = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [flipping, setFlipping]     = useState(false)

  const publicClient = usePublicClient({ chainId: arc.id })

  const fromCurrency = direction === 'usdc-to-ngn' ? 'USDC' : 'NGN'
  const toCurrency   = direction === 'usdc-to-ngn' ? 'NGN'  : 'USDC'

  // Format a plain number string with commas for display
  const formatWithCommas = (raw: string): string => {
    const clean = raw.replace(/,/g, '')
    if (!clean) return ''
    const [intPart, decPart] = clean.split('.')
    const intFormatted = (intPart ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return decPart !== undefined ? `${intFormatted}.${decPart}` : intFormatted
  }

  const handleInputChange = (raw: string) => {
    // Allow only digits, one dot, and strip everything else
    const cleaned = raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
    setInputValue(cleaned)
    setError(null)
    setOutputValue(null)
  }

  const flip = useCallback(() => {
    setFlipping(true)
    setTimeout(() => setFlipping(false), 300)
    setDirection(d => d === 'usdc-to-ngn' ? 'ngn-to-usdc' : 'usdc-to-ngn')
    setInputValue('')
    setOutputValue(null)
    setError(null)
  }, [])

  const handleConvert = useCallback(async () => {
    if (!publicClient) return
    // H2 fix: parse using string arithmetic to avoid IEEE-754 float precision loss.
    // e.g. "12345678.99" with 6 decimals => 12345678990000n exactly, no rounding error.
    const raw = inputValue.replace(/,/g, '')
    const atomicIn = parseDecimalToBigInt(raw, direction === 'usdc-to-ngn' ? USDC_DECIMALS : NGN_DECIMALS)
    if (atomicIn === null || atomicIn <= 0n) { setError('Enter a valid amount.'); return }
    setLoading(true); setError(null); setOutputValue(null)
    try {
      if (direction === 'usdc-to-ngn') {
        const result = await publicClient.readContract({
          address: CONTRACT_ADDRESS, abi: ORACLE_ABI,
          functionName: 'quoteUSDCToNGN', args: [atomicIn],
        })
        setOutputValue(formatNGN(result))
      } else {
        const result = await publicClient.readContract({
          address: CONTRACT_ADDRESS, abi: ORACLE_ABI,
          functionName: 'quoteNGNToUSDC', args: [atomicIn],
        })
        setOutputValue(formatUSDC(result))
      }
    } catch (e) {
      const msg = (e as Error).message ?? ''
      if (msg.toLowerCase().includes('stale'))                                           setError('Price is stale. Reporter may be down.')
      else if (msg.toLowerCase().includes('nodata') || msg.toLowerCase().includes('no data')) setError('No price yet. Check back soon.')
      else if (msg.toLowerCase().includes('circuit'))                                    setError('Circuit breaker active. Rates paused.')
      else if (msg.toLowerCase().includes('paused'))                                     setError('Oracle is paused.')
      else                                                                               setError('Could not fetch rate. Try again.')
    } finally {
      setLoading(false)
    }
  }, [direction, inputValue, publicClient])

  return (
    <div style={{
      borderRadius: 20, padding: '24px',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--subtle)', margin: 0 }}>Converter</p>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '3px 0 0' }}>Live on-chain rate</p>
      </div>

      {/* From token */}
      <div style={{
        borderRadius: 14, padding: '14px 16px',
        background: 'var(--bg-muted)', border: '1px solid var(--border)',
        marginBottom: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--subtle)', fontWeight: 500 }}>From</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 14px 6px 6px' }}>
            {direction === 'usdc-to-ngn' ? <USDCIcon size={40} /> : <NGNIcon size={40} />}
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{fromCurrency}</span>
          </div>
        </div>
        <input
          type="text" inputMode="decimal"
          value={formatWithCommas(inputValue)}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void handleConvert() }}
          placeholder="0.00"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'none', border: 'none', outline: 'none',
            fontSize: 28, fontWeight: 700, color: 'var(--ink)',
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: '-0.02em', padding: 0,
          }}
        />
      </div>

      {/* Flip arrow */}
      <div style={{ display: 'flex', justifyContent: 'center', position: 'relative', zIndex: 1, margin: '-1px 0' }}>
        <button
          onClick={flip}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--bg-card)', border: '2px solid var(--border)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--brand)',
            transform: flipping ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s ease',
          }}
        >
          <ArrowUpDown size={15} />
        </button>
      </div>

      {/* To token */}
      <div style={{
        borderRadius: 14, padding: '14px 16px',
        background: 'var(--bg-muted)', border: '1px solid var(--border)',
        marginTop: 2, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--subtle)', fontWeight: 500 }}>To</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 14px 6px 6px' }}>
            {direction === 'usdc-to-ngn' ? <NGNIcon size={40} /> : <USDCIcon size={40} />}
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{toCurrency}</span>
          </div>
        </div>
        <div style={{
          fontSize: 28, fontWeight: 700, color: outputValue ? 'var(--brand)' : 'var(--placeholder)',
          fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em',
          minHeight: 36, display: 'flex', alignItems: 'center',
        }}>
          {loading
            ? <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--subtle)' }} />
            : outputValue ?? '0.00'
          }
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', marginBottom: 12 }}>
          <AlertCircle size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: 'var(--danger)', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Convert button */}
      <button
        onClick={() => void handleConvert()}
        disabled={loading || !inputValue}
        style={{
          width: '100%', padding: '14px', borderRadius: 12,
          background: 'var(--brand)', color: '#031a0a',
          border: 'none', cursor: loading || !inputValue ? 'not-allowed' : 'pointer',
          fontSize: 15, fontWeight: 700,
          opacity: loading || !inputValue ? 0.45 : 1,
          transition: 'opacity 0.15s',
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        {loading ? 'Converting...' : 'Convert'}
      </button>
    </div>
  )
}
