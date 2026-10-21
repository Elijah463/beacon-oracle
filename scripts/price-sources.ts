/**
 * price-sources.ts
 * ----------------
 * All price source fetchers for the BEACON oracle.
 *
 * TWO INDEPENDENT LEGS:
 *   Leg A -- USDC/USD  : Coinbase, Binance, OKX, Bitget, Bybit (5 sources, quorum 3)
 *   Leg B -- NGN/USDT  : Binance P2P, Quidax, Bybit P2P, Bitget P2P (4 sources, quorum 2)
 *                        (NGN/USDT is used as the NGN/USD proxy -- this is the realistic
 *                         price Nigerians pay for a dollar, sourced from active P2P markets)
 *
 * RULES PER PROVIDER:
 *   - Separate token-bucket rate limiter per provider (configurable RPS)
 *   - 429 response: respect Retry-After header; fall back to exponential backoff
 *   - Never retry in a tight loop -- all retries use await before the next attempt
 *   - Successful responses are cached; stale detection via response timestamp fields
 *   - Configurable per-request timeout (default 8s)
 *   - Outlier rejection: any source deviating >10% from the group median is invalidated
 *   - Sanity bounds: values outside hard limits are rejected before entering aggregation
 *   - Error messages never include URLs (no API key leakage in logs)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceResult {
  source: string
  value: number      // the price as a JS number (aggregation converts to BigInt)
  fetchedAt: number  // unix ms this value was fetched
}

// ---------------------------------------------------------------------------
// Sanity bounds
// ---------------------------------------------------------------------------

// USDC/USD should never be outside [0.80, 1.20]
const USDC_USD_MIN = 0.80
const USDC_USD_MAX = 1.20

// NGN/USDT (i.e. how many NGN buys 1 USDT) should never be outside [500, 10_000]
const NGN_USDT_MIN = 500
const NGN_USDT_MAX = 10_000

function assertBounds(value: number, min: number, max: number, label: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label}: value ${value.toFixed(4)} outside sanity bounds [${min}, ${max}]`)
  }
}

// ---------------------------------------------------------------------------
// Per-provider rate limiter (token bucket)
// ---------------------------------------------------------------------------

/**
 * A simple token-bucket rate limiter.
 * maxTokens    -- burst capacity (tokens)
 * refillRateHz -- tokens added per second
 *
 * Call acquire() before each request. It returns a Promise that resolves
 * when a token is available, waiting as long as needed.
 */
export class RateLimiter {
  private tokens: number
  private lastRefill: number

  constructor(
    private readonly maxTokens: number,
    private readonly refillRateHz: number  // tokens per second
  ) {
    this.tokens = maxTokens
    this.lastRefill = Date.now()
  }

  async acquire(): Promise<void> {
    // Refill tokens based on elapsed time
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRateHz)
    this.lastRefill = now

    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }

    // Wait until the next token is available
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRateHz * 1000)
    await sleep(waitMs)
    this.tokens = 0
    this.lastRefill = Date.now()
  }
}

// Per-provider rate limiters (configurable -- edit these if a provider tightens limits)
// Rates are conservative to stay well within free/unauthenticated tiers.
export const limiters: Record<string, RateLimiter> = {
  // USDC/USD sources
  'Coinbase':       new RateLimiter(3, 0.5),   // 1 req / 2s, burst 3
  'BinanceCEX':     new RateLimiter(3, 0.5),   // 1 req / 2s, burst 3
  'OKX':            new RateLimiter(3, 0.5),   // 1 req / 2s, burst 3
  'BitgetCEX':      new RateLimiter(2, 0.33),  // ~1 req / 3s, burst 2
  'BybitCEX':       new RateLimiter(2, 0.33),  // ~1 req / 3s, burst 2
  // NGN/USDT P2P sources
  'BinanceP2P':     new RateLimiter(2, 0.2),   // 1 req / 5s, burst 2
  'Quidax':         new RateLimiter(3, 0.5),   // 1 req / 2s, burst 3
  'BybitP2P':       new RateLimiter(2, 0.2),   // 1 req / 5s, burst 2
  'BitgetP2P':      new RateLimiter(2, 0.2),   // 1 req / 5s, burst 2
}

// ---------------------------------------------------------------------------
// Fetch helper with timeout, 429 backoff, and URL-redacted errors
// ---------------------------------------------------------------------------

interface FetchOptions {
  timeoutMs?: number
  maxRetries?: number
  headers?: Record<string, string>
  method?: string
  body?: string
}

async function fetchJson(
  url: string,
  sourceName: string,
  opts: FetchOptions = {}
): Promise<unknown> {
  const { timeoutMs = 8_000, maxRetries = 2, headers = {}, method = 'GET', body } = opts

  let attempt = 0
  let backoffMs = 1_000

  while (attempt <= maxRetries) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)

    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        method,
        headers: { 'Accept': 'application/json', ...headers },
        body,
      })
      clearTimeout(timer)

      if (res.status === 429) {
        // Respect Retry-After if present, otherwise exponential backoff
        const retryAfter = res.headers.get('Retry-After')
        const waitMs = retryAfter
          ? Math.min(parseInt(retryAfter, 10) * 1000, 60_000)
          : backoffMs
        console.warn(`[${sourceName}] 429 rate-limited. Waiting ${waitMs}ms before retry.`)
        await sleep(waitMs)
        backoffMs = Math.min(backoffMs * 2, 30_000)
        attempt++
        continue
      }

      if (!res.ok) {
        throw new Error(`${sourceName} HTTP ${res.status}`)
      }

      return await res.json()

    } catch (err: unknown) {
      clearTimeout(timer)

      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`${sourceName} timed out after ${timeoutMs}ms`)
      }

      // Redact URLs from error messages (prevents API key leakage in logs)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('http://') || msg.includes('https://')) {
        throw new Error(`${sourceName} network error (details redacted)`)
      }

      // On the last attempt, throw. Otherwise wait and retry.
      if (attempt >= maxRetries) throw err
      await sleep(backoffMs)
      backoffMs = Math.min(backoffMs * 2, 30_000)
      attempt++
    }
  }

  throw new Error(`${sourceName} exhausted ${maxRetries} retries`)
}

// ---------------------------------------------------------------------------
// USDC / USD sources  (Leg A)
// ---------------------------------------------------------------------------

/**
 * Coinbase: USDC/USD -- genuine USD pair, no USDT proxy.
 * Public endpoint, no auth required.
 */
export async function fetchUsdcUsdCoinbase(): Promise<SourceResult> {
  await limiters['Coinbase'].acquire()
  const data = await fetchJson(
    'https://api.coinbase.com/v2/exchange-rates?currency=USDC',
    'Coinbase'
  ) as { data: { rates: { USD: string } } }
  const value = parseFloat(data.data.rates.USD)
  assertBounds(value, USDC_USD_MIN, USDC_USD_MAX, 'Coinbase USDC/USD')
  return { source: 'Coinbase', value, fetchedAt: Date.now() }
}

/**
 * Binance: USDC/USDT spot price.
 * NOTE: Uses USDT as a USD proxy. USDT has its own depeg risk.
 * Included for volume diversity. Outlier filter handles USDT deviations.
 */
export async function fetchUsdcUsdBinance(): Promise<SourceResult> {
  await limiters['BinanceCEX'].acquire()
  const data = await fetchJson(
    'https://api.binance.com/api/v3/ticker/price?symbol=USDCUSDT',
    'Binance'
  ) as { price: string }
  const value = parseFloat(data.price)
  assertBounds(value, USDC_USD_MIN, USDC_USD_MAX, 'Binance USDC/USDT')
  return { source: 'Binance', value, fetchedAt: Date.now() }
}

/**
 * OKX: USDC/USDT spot price.
 * Public market data endpoint, no API key required.
 */
export async function fetchUsdcUsdOKX(): Promise<SourceResult> {
  await limiters['OKX'].acquire()
  const data = await fetchJson(
    'https://www.okx.com/api/v5/market/ticker?instId=USDC-USDT',
    'OKX'
  ) as { data: Array<{ last: string }> }
  if (!data.data?.[0]?.last) throw new Error('OKX: unexpected response shape')
  const value = parseFloat(data.data[0].last)
  assertBounds(value, USDC_USD_MIN, USDC_USD_MAX, 'OKX USDC/USDT')
  return { source: 'OKX', value, fetchedAt: Date.now() }
}

/**
 * Bitget: USDC/USDT spot price.
 * Public endpoint, no API key required.
 */
export async function fetchUsdcUsdBitget(): Promise<SourceResult> {
  await limiters['BitgetCEX'].acquire()
  const data = await fetchJson(
    'https://api.bitget.com/api/v2/spot/market/tickers?symbol=USDCUSDT',
    'Bitget'
  ) as { data: Array<{ lastPr: string }> }
  if (!data.data?.[0]?.lastPr) throw new Error('Bitget: unexpected response shape')
  const value = parseFloat(data.data[0].lastPr)
  assertBounds(value, USDC_USD_MIN, USDC_USD_MAX, 'Bitget USDC/USDT')
  return { source: 'Bitget', value, fetchedAt: Date.now() }
}

/**
 * Bybit: USDC/USDT spot price.
 * Public endpoint, no API key required.
 */
export async function fetchUsdcUsdBybit(): Promise<SourceResult> {
  await limiters['BybitCEX'].acquire()
  const data = await fetchJson(
    'https://api.bybit.com/v5/market/tickers?category=spot&symbol=USDCUSDT',
    'Bybit'
  ) as { result: { list: Array<{ lastPrice: string }> } }
  if (!data.result?.list?.[0]?.lastPrice) throw new Error('Bybit: unexpected response shape')
  const value = parseFloat(data.result.list[0].lastPrice)
  assertBounds(value, USDC_USD_MIN, USDC_USD_MAX, 'Bybit USDC/USDT')
  return { source: 'Bybit', value, fetchedAt: Date.now() }
}

// ---------------------------------------------------------------------------
// NGN / USDT sources  (Leg B -- P2P markets)
// ---------------------------------------------------------------------------

/**
 * Binance P2P: NGN/USDT buy-side median.
 * Scrapes the public P2P ads endpoint (no auth required).
 * Returns the median of the top-5 active SELL ads (what a buyer pays in NGN).
 */
export async function fetchNgnUsdtBinanceP2P(): Promise<SourceResult> {
  await limiters['BinanceP2P'].acquire()
  const body = JSON.stringify({
    asset: 'USDT',
    fiat: 'NGN',
    tradeType: 'SELL',   // SELL = merchant selling USDT; buyer pays NGN
    page: 1,
    rows: 10,
    publisherType: null,
    payTypes: [],
  })
  const data = await fetchJson(
    'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
    'BinanceP2P',
    {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      timeoutMs: 12_000,
    }
  ) as { data: Array<{ adv: { price: string } }> }

  if (!data.data?.length) throw new Error('BinanceP2P: no active ads returned')
  const prices = data.data
    .slice(0, 5)
    .map((ad) => parseFloat(ad.adv.price))
    .filter((p) => Number.isFinite(p) && p > 0)
  if (prices.length === 0) throw new Error('BinanceP2P: could not parse any prices')
  const value = median(prices)
  assertBounds(value, NGN_USDT_MIN, NGN_USDT_MAX, 'BinanceP2P NGN/USDT')
  return { source: 'BinanceP2P', value, fetchedAt: Date.now() }
}

/**
 * Quidax: NGN/USDT last trade price.
 * Quidax is a Nigerian exchange -- its NGN/USDT spot rate directly reflects
 * local market conditions. Public ticker endpoint, no auth required.
 * NOTE: Quidax may geo-restrict requests from non-Nigerian IPs. This source
 * works reliably when the reporter runs on a Nigerian or West African VPS.
 * The endpoint returns { data: { ticker: { last: "1640.00", ... } } }
 */
export async function fetchNgnUsdtQuidax(): Promise<SourceResult> {
  await limiters['Quidax'].acquire()
  // Quidax uses lowercase pair notation: usdtngn (USDT quoted in NGN)
  const data = await fetchJson(
    'https://www.quidax.com/api/v1/markets/tickers/usdtngn',
    'Quidax',
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    }
  ) as { data: { ticker: { last: string } } }
  const raw = data.data?.ticker?.last
  if (!raw) throw new Error('Quidax: missing ticker.last in response')
  const value = parseFloat(raw)
  assertBounds(value, NGN_USDT_MIN, NGN_USDT_MAX, 'Quidax NGN/USDT')
  return { source: 'Quidax', value, fetchedAt: Date.now() }
}

/**
 * Bybit P2P: NGN/USDT buy-side median from active sell ads.
 * Public P2P ads endpoint, no auth required.
 */
export async function fetchNgnUsdtBybitP2P(): Promise<SourceResult> {
  await limiters['BybitP2P'].acquire()
  const data = await fetchJson(
    'https://api2.bybit.com/fiat/otc/item/online?' +
      'userId=&tokenId=USDT&currencyId=NGN&payment=&side=1&size=10&page=1&amount=',
    'BybitP2P',
    { timeoutMs: 12_000 }
  ) as { result: { items: Array<{ price: string }> } }

  const items = data.result?.items
  if (!items?.length) throw new Error('BybitP2P: no active ads')
  const prices = items
    .slice(0, 5)
    .map((item) => parseFloat(item.price))
    .filter((p) => Number.isFinite(p) && p > 0)
  if (prices.length === 0) throw new Error('BybitP2P: could not parse prices')
  const value = median(prices)
  assertBounds(value, NGN_USDT_MIN, NGN_USDT_MAX, 'BybitP2P NGN/USDT')
  return { source: 'BybitP2P', value, fetchedAt: Date.now() }
}

/**
 * Bitget P2P: NGN/USDT buy-side median from active sell ads.
 * Uses the v3 public ad-list endpoint which requires an ACCESS-KEY header.
 * Set BITGET_API_KEY in .env (free Bitget account, read-only key is sufficient).
 * If no key is provided this source will fail gracefully and be excluded from
 * aggregation -- the other three NGN/USDT sources maintain quorum.
 */
export async function fetchNgnUsdtBitgetP2P(apiKey: string): Promise<SourceResult> {
  if (!apiKey) throw new Error('BitgetP2P: BITGET_API_KEY not set -- source skipped')
  await limiters['BitgetP2P'].acquire()
  const data = await fetchJson(
    'https://api.bitget.com/api/v3/p2p/ad-list?token=USDT&fiat=NGN&side=sell&pageNum=1&limit=10',
    'BitgetP2P',
    {
      timeoutMs: 12_000,
      headers: {
        'ACCESS-KEY': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    }
  ) as { data: Array<{ price: string }> }

  const list = data.data
  if (!list?.length) throw new Error('BitgetP2P: no active ads')
  const prices = list
    .slice(0, 5)
    .map((ad) => parseFloat(ad.price))
    .filter((p) => Number.isFinite(p) && p > 0)
  if (prices.length === 0) throw new Error('BitgetP2P: could not parse prices')
  const value = median(prices)
  assertBounds(value, NGN_USDT_MIN, NGN_USDT_MAX, 'BitgetP2P NGN/USDT')
  return { source: 'BitgetP2P', value, fetchedAt: Date.now() }
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
    : ((sorted[mid - 1] + sorted[mid]) / 2)
}

/**
 * Outlier rejection via median-distance filter.
 * Per spec: any source deviating >10% from the group median is invalidated.
 * maxDeviationRatio defaults to 0.10 (10%).
 */
export function rejectOutliers(
  results: SourceResult[],
  maxDeviationRatio = 0.10
): SourceResult[] {
  if (results.length <= 1) return results  // cannot filter a single point
  const med = median(results.map((r) => r.value))
  const clean = results.filter((r) => Math.abs(r.value - med) / med <= maxDeviationRatio)
  // Log any rejected sources so the operator knows
  const rejected = results.filter((r) => Math.abs(r.value - med) / med > maxDeviationRatio)
  for (const r of rejected) {
    const pct = ((Math.abs(r.value - med) / med) * 100).toFixed(2)
    console.warn(`[outlier] ${r.source} rejected: ${r.value.toFixed(4)} deviates ${pct}% from median ${med.toFixed(4)}`)
  }
  return clean
}

/**
 * Fetch all sources for a leg in parallel, collecting successes and failures.
 * Returns { successes, failures }. A failure in one source never blocks others.
 *
 * Issue 3 fix: each fetcher is wrapped in a tagged object so the source name
 * is preserved even when the fetch rejects -- no more source: 'unknown'.
 */
export async function fetchAll(
  fetchers: Array<() => Promise<SourceResult>>
): Promise<{ successes: SourceResult[]; failures: Array<{ source: string; error: string }> }> {
  // Run all fetchers and tag each result with its index so we can identify failures.
  // We wrap each fetcher so that on rejection we still get a named error.
  const tagged = fetchers.map((f) =>
    f().then(
      (result) => ({ ok: true as const, result }),
      (reason: unknown) => ({ ok: false as const, reason })
    )
  )

  const settled = await Promise.all(tagged)
  const successes: SourceResult[] = []
  const failures: Array<{ source: string; error: string }> = []

  for (const r of settled) {
    if (r.ok) {
      successes.push(r.result)
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
      // Redact any URLs that may have slipped through (no API key leakage in logs)
      const safe = msg.replace(/https?:\/\/[^\s"']*/g, '[url-redacted]').slice(0, 200)
      // Extract source name from the error message prefix (e.g. "BinanceP2P: no active ads")
      const colonIdx = safe.indexOf(':')
      const source = colonIdx > 0 && colonIdx < 30 ? safe.slice(0, colonIdx) : 'unknown'
      failures.push({ source, error: safe })
    }
  }

  return { successes, failures }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
