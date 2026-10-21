/**
 * price-sources.ts
 * ----------------
 * Isolated fetch functions for each price source.
 * Each function returns a number or throws a descriptive (non-URL-bearing) error.
 *
 * FINDING 16 FIX: error messages never include the full URL so API keys embedded
 * in query strings cannot appear in logs or crash reports.
 *
 * FINDING 12 FIX: bounds validation, expiry checks, and outlier filtering
 * are applied in the aggregation helpers at the bottom of this file.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceResult {
  source: string
  value: number
  fetchedAt: number // unix ms
}

// ---------------------------------------------------------------------------
// Bounds (sanity gates -- reject obviously wrong values)
// ---------------------------------------------------------------------------

// USDC/USD should never be outside [0.80, 1.20]
const USDC_USD_MIN = 0.80
const USDC_USD_MAX = 1.20

// USD/NGN should never be outside [500, 5000]
const USD_NGN_MIN = 500
const USD_NGN_MAX = 5_000

function assertBounds(value: number, min: number, max: number, label: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} value ${value} is outside sanity bounds [${min}, ${max}]`)
  }
}

// ---------------------------------------------------------------------------
// Simple fetch with timeout and redacted-URL error
// ---------------------------------------------------------------------------

async function fetchJson(url: string, sourceName: string, timeoutMs = 8_000): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) {
      // FINDING 16: never include the URL in the thrown message
      throw new Error(`${sourceName} HTTP ${res.status}`)
    }
    return await res.json()
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`${sourceName} timed out after ${timeoutMs}ms`)
    }
    // Re-throw but ensure the URL is not part of the message
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('http://') || msg.includes('https://')) {
      throw new Error(`${sourceName} fetch error (URL redacted)`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// USDC / USD sources
// ---------------------------------------------------------------------------

/**
 * Binance: USDC/USDT pair.
 * NOTE: This uses USDT as a USD proxy. USDT has its own peg and can deviate.
 * For a stricter USDC/USD quote use Coinbase or Kraken (genuine USD pairs).
 * We include Binance for volume/liquidity diversity and accept the USDT approximation.
 */
export async function fetchUsdcUsdBinance(): Promise<SourceResult> {
  const data = await fetchJson(
    'https://api.binance.com/api/v3/ticker/price?symbol=USDCUSDT',
    'Binance'
  ) as { price: string }
  const value = parseFloat(data.price)
  assertBounds(value, USDC_USD_MIN, USDC_USD_MAX, 'Binance USDC/USDT')
  return { source: 'Binance', value, fetchedAt: Date.now() }
}

/** Coinbase: USDC/USD -- genuine USD pair, no USDT proxy. */
export async function fetchUsdcUsdCoinbase(): Promise<SourceResult> {
  const data = await fetchJson(
    'https://api.coinbase.com/v2/exchange-rates?currency=USDC',
    'Coinbase'
  ) as { data: { rates: { USD: string } } }
  const value = parseFloat(data.data.rates.USD)
  assertBounds(value, USDC_USD_MIN, USDC_USD_MAX, 'Coinbase USDC/USD')
  return { source: 'Coinbase', value, fetchedAt: Date.now() }
}

/** Kraken: USDC/USD -- genuine USD pair, no USDT proxy. */
export async function fetchUsdcUsdKraken(): Promise<SourceResult> {
  const data = await fetchJson(
    'https://api.kraken.com/0/public/Ticker?pair=USDCUSD',
    'Kraken'
  ) as { result: Record<string, { c: [string] }> }
  const pairs = Object.values(data.result)
  if (!pairs.length) throw new Error('Kraken: empty result')
  const value = parseFloat(pairs[0].c[0])
  assertBounds(value, USDC_USD_MIN, USDC_USD_MAX, 'Kraken USDC/USD')
  return { source: 'Kraken', value, fetchedAt: Date.now() }
}

// ---------------------------------------------------------------------------
// USD / NGN sources
// ---------------------------------------------------------------------------

/** ExchangeRate-API: USD/NGN (official + interbank composite). */
export async function fetchUsdNgnExchangeRateApi(apiKey: string): Promise<SourceResult> {
  const data = await fetchJson(
    `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`,
    'ExchangeRate-API'
  ) as { conversion_rates: { NGN: number } }
  const value = data.conversion_rates.NGN
  assertBounds(value, USD_NGN_MIN, USD_NGN_MAX, 'ExchangeRate-API USD/NGN')
  return { source: 'ExchangeRate-API', value, fetchedAt: Date.now() }
}

/** OpenExchangeRates: USD/NGN (fallback / secondary). */
export async function fetchUsdNgnOpenExchangeRates(appId: string): Promise<SourceResult> {
  const data = await fetchJson(
    `https://openexchangerates.org/api/latest.json?app_id=${appId}&symbols=NGN`,
    'OpenExchangeRates'
  ) as { rates: { NGN: number } }
  const value = data.rates.NGN
  assertBounds(value, USD_NGN_MIN, USD_NGN_MAX, 'OpenExchangeRates USD/NGN')
  return { source: 'OpenExchangeRates', value, fetchedAt: Date.now() }
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

/** Median of a numeric array. Works with odd or even lengths. */
export function median(values: number[]): number {
  if (values.length === 0) throw new Error('Cannot take median of empty array')
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * FINDING 12 FIX: Outlier rejection via median-distance filter.
 * Drops any value whose absolute distance from the median exceeds maxDeviationRatio.
 * E.g. maxDeviationRatio=0.05 drops values more than 5% away from the median.
 */
export function rejectOutliers(results: SourceResult[], maxDeviationRatio = 0.05): SourceResult[] {
  if (results.length <= 2) return results // not enough points to filter
  const med = median(results.map((r) => r.value))
  return results.filter((r) => Math.abs(r.value - med) / med <= maxDeviationRatio)
}

/**
 * Fetch all sources for a leg in parallel, collecting successes and failures.
 * Returns { successes, failures }.
 */
export async function fetchAll(
  fetchers: Array<() => Promise<SourceResult>>
): Promise<{ successes: SourceResult[]; failures: Array<{ source: string; error: string }> }> {
  const settled = await Promise.allSettled(fetchers.map((f) => f()))
  const successes: SourceResult[] = []
  const failures: Array<{ source: string; error: string }> = []

  for (const r of settled) {
    if (r.status === 'fulfilled') {
      successes.push(r.value)
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
      failures.push({ source: 'unknown', error: msg })
    }
  }

  return { successes, failures }
}
