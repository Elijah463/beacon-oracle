/**
 * price-sources.ts
 * ----------------
 * All price source fetchers for the BEACON oracle.
 *
 * TWO INDEPENDENT LEGS:
 *   Leg A -- USDC/USD  : Coinbase, Binance, OKX, Bitget, Bybit (5 sources, quorum 3)
 *   Leg B -- NGN/USD   : CoinGecko (USDT/NGN), ExchangeRate-API (USD/NGN),
 *                        CurrencyAPI (USD/NGN) -- 3 sources, quorum 2.
 *                        All three work from any server IP -- no geo-restrictions,
 *                        no API keys required.
 *
 * CACHING STRATEGY (Leg B):
 *   CoinGecko   -- called every cycle (real-time USDT/NGN crypto market rate)
 *   ExchangeRateApi -- cached 24h (data only updates once per day; aggressive
 *                      polling risks rate-limit bans)
 *   CurrencyApi     -- cached 1h  (jsDelivr CDN, no rate limits, daily update)
 *
 * RULES PER PROVIDER:
 *   - Separate token-bucket rate limiter per provider (configurable RPS)
 *   - 429 response: respect Retry-After header; fall back to exponential backoff
 *   - Never retry in a tight loop -- all retries use await before the next attempt
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
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRateHz)
    this.lastRefill = now

    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }

    const waitMs = Math.ceil((1 - this.tokens) / this.refillRateHz * 1000)
    await sleep(waitMs)
    this.tokens = 0
    this.lastRefill = Date.now()
  }
}

// Per-provider rate limiters (conservative -- stay well within free tiers)
// Leg A (USDC/USD): CEX spot APIs, generous limits
// Leg B (NGN/USD):  CoinGecko free ~30 req/min; FX sources cached so rarely called
export const limiters: Record<string, RateLimiter> = {
  'Coinbase':         new RateLimiter(3, 0.5),
  'BinanceCEX':       new RateLimiter(3, 0.5),
  'OKX':              new RateLimiter(3, 0.5),
  'BitgetCEX':        new RateLimiter(2, 0.33),
  'BybitCEX':         new RateLimiter(2, 0.33),
  'CoinGecko':        new RateLimiter(2, 0.25),   // ~30 req/min free; 1 per 4s is safe
  'ExchangeRateApi':  new RateLimiter(1, 0.001),  // 24h cache -- limiter is a backstop only
  'CurrencyApi':      new RateLimiter(2, 0.5),    // CDN, no rate limits; limiter is courtesy
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

interface FetchOptions {
  timeoutMs?: number
  maxRetries?: number
  headers?: Record<string, string>
  method?: string
  body?: string
}

async function fetchJson<T = unknown>(
  url: string,
  sourceName: string,
  opts: FetchOptions = {}
): Promise<T> {
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

      if (!res.ok) throw new Error(`${sourceName} HTTP ${res.status}`)
      return await res.json() as T

    } catch (err: unknown) {
      clearTimeout(timer)

      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`${sourceName} timed out after ${timeoutMs}ms`)
      }

      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('http://') || msg.includes('https://')) {
        throw new Error(`${sourceName} network error (details redacted)`)
      }

      if (attempt >= maxRetries) throw err
      await sleep(backoffMs)
      backoffMs = Math.min(backoffMs * 2, 30_000)
      attempt++
    }
  }

  throw new Error(`${sourceName} exhausted ${maxRetries} retries`)
}

// ---------------------------------------------------------------------------
// USDC / USD sources  (Leg A -- direct fetch, works from any IP)
// ---------------------------------------------------------------------------

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
// NGN / USD sources  (Leg B)
// ---------------------------------------------------------------------------
//
// All three sources work from any server IP -- no geo-restrictions,
// no API keys required.
//
// Source                Update freq   Cache TTL   Notes
// --------------------  -----------   ---------   -------------------------
// CoinGecko USDT/NGN    Real-time     none        Crypto market rate; ~30 req/min free
// ExchangeRate-API      Daily         24 hours    Official FX mid-market rate
// CurrencyAPI           Daily         1 hour      jsDelivr CDN, effectively unlimited
//
// Quorum: 2 of 3 sources required.

// Response cache for sources that update less frequently than our 30s cycle.
interface CacheEntry { result: SourceResult; expiresAt: number }
const fxCache: Record<string, CacheEntry> = {}

function getCached(key: string): SourceResult | null {
  const entry = fxCache[key]
  if (entry && Date.now() < entry.expiresAt) return entry.result
  return null
}

function setCached(key: string, result: SourceResult, ttlMs: number): void {
  fxCache[key] = { result, expiresAt: Date.now() + ttlMs }
}

const H24 = 24 * 60 * 60 * 1000
const H1  =      60 * 60 * 1000

/**
 * CoinGecko: USDT/NGN market price.
 * Called every cycle -- reflects the real-time crypto market rate of USDT in NGN.
 * Free public API, no key, works from any server IP.
 * Free tier: ~30 requests/minute shared per IP. At a 30s cycle we use 2 req/min.
 */
export async function fetchNgnUsdtCoinGecko(): Promise<SourceResult> {
  await limiters['CoinGecko'].acquire()
  const data = await fetchJson<{ tether: { ngn: number } }>(
    'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=ngn',
    'CoinGecko',
    { timeoutMs: 10_000 }
  )
  const value = data.tether?.ngn
  if (!value || !Number.isFinite(value)) throw new Error('CoinGecko: missing tether.ngn in response')
  assertBounds(value, NGN_USDT_MIN, NGN_USDT_MAX, 'CoinGecko NGN/USDT')
  return { source: 'CoinGecko', value, fetchedAt: Date.now() }
}

/**
 * ExchangeRate-API (open.er-api.com): USD/NGN official FX mid-market rate.
 * Free, no API key, works from any server IP.
 * Data updates once per 24 hours -- cached for 24h to avoid rate-limit bans.
 */
export async function fetchNgnUsdtExchangeRateApi(): Promise<SourceResult> {
  const cached = getCached('ExchangeRateApi')
  if (cached) return cached
  await limiters['ExchangeRateApi'].acquire()
  const data = await fetchJson<{ rates: { NGN: number } }>(
    'https://open.er-api.com/v6/latest/USD',
    'ExchangeRateApi',
    { timeoutMs: 10_000 }
  )
  const value = data.rates?.NGN
  if (!value || !Number.isFinite(value)) throw new Error('ExchangeRateApi: missing rates.NGN in response')
  assertBounds(value, NGN_USDT_MIN, NGN_USDT_MAX, 'ExchangeRateApi NGN/USD')
  const result: SourceResult = { source: 'ExchangeRateApi', value, fetchedAt: Date.now() }
  setCached('ExchangeRateApi', result, H24)
  return result
}

/**
 * CurrencyAPI (via jsDelivr CDN): USD/NGN aggregated FX rate.
 * Open-source currency API served from Cloudflare CDN. No API key, no rate limits.
 * Data updates daily -- cached for 1h; CDN serves stale until next daily push.
 * Fallback URL: https://latest.currency-api.pages.dev/v1/currencies/usd.json
 */
export async function fetchNgnUsdtCurrencyApi(): Promise<SourceResult> {
  const cached = getCached('CurrencyApi')
  if (cached) return cached
  await limiters['CurrencyApi'].acquire()
  const data = await fetchJson<{ usd: { ngn: number } }>(
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    'CurrencyApi',
    { timeoutMs: 10_000 }
  )
  const value = data.usd?.ngn
  if (!value || !Number.isFinite(value)) throw new Error('CurrencyApi: missing usd.ngn in response')
  assertBounds(value, NGN_USDT_MIN, NGN_USDT_MAX, 'CurrencyApi NGN/USD')
  const result: SourceResult = { source: 'CurrencyApi', value, fetchedAt: Date.now() }
  setCached('CurrencyApi', result, H1)
  return result
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

export function median(values: number[]): number {
  if (values.length === 0) throw new Error('Cannot take median of empty array')
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]
    : ((sorted[mid - 1] + sorted[mid]) / 2)
}

export function rejectOutliers(
  results: SourceResult[],
  maxDeviationRatio = 0.10
): SourceResult[] {
  if (results.length <= 1) return results
  const med = median(results.map((r) => r.value))
  const clean = results.filter((r) => Math.abs(r.value - med) / med <= maxDeviationRatio)
  const rejected = results.filter((r) => Math.abs(r.value - med) / med > maxDeviationRatio)
  for (const r of rejected) {
    const pct = ((Math.abs(r.value - med) / med) * 100).toFixed(2)
    console.warn(`[outlier] ${r.source} rejected: ${r.value.toFixed(4)} deviates ${pct}% from median ${med.toFixed(4)}`)
  }
  return clean
}

export async function fetchAll(
  fetchers: Array<() => Promise<SourceResult>>
): Promise<{ successes: SourceResult[]; failures: Array<{ source: string; error: string }> }> {
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
      const safe = msg.replace(/https?:\/\/[^\s"']*/g, '[url-redacted]').slice(0, 200)
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
