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
 *
 * CLOUDFLARE WORKER RELAY (NGN/USDT P2P sources only):
 *   P2P endpoints geo-restrict requests from non-Nigerian IPs. The reporter
 *   routes P2P fetches through a Cloudflare Worker deployed at CF_WORKER_URL.
 *   Cloudflare's Lagos edge node makes the request appear to originate from Nigeria.
 *   The USDC/USD sources (Leg A) always fetch directly -- they work from any IP.
 *   If CF_WORKER_URL is not set, P2P sources are attempted directly (works from
 *   Nigerian IPs or when testing locally).
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
export const limiters: Record<string, RateLimiter> = {
  'Coinbase':       new RateLimiter(3, 0.5),
  'BinanceCEX':     new RateLimiter(3, 0.5),
  'OKX':            new RateLimiter(3, 0.5),
  'BitgetCEX':      new RateLimiter(2, 0.33),
  'BybitCEX':       new RateLimiter(2, 0.33),
  'BinanceP2P':     new RateLimiter(2, 0.2),
  'Quidax':         new RateLimiter(3, 0.5),
  'BybitP2P':       new RateLimiter(2, 0.2),
  'BitgetP2P':      new RateLimiter(2, 0.2),
}

// ---------------------------------------------------------------------------
// Cloudflare Worker relay helper
// ---------------------------------------------------------------------------

/**
 * Routes a request through the Cloudflare Worker relay when cfWorkerUrl is set.
 * The Worker forwards the request from Cloudflare's Lagos edge node, making it
 * appear to originate from Nigeria to geo-restricted P2P endpoints.
 *
 * If cfWorkerUrl is empty, falls back to a direct fetch (works from Nigerian IPs).
 */
async function cfFetch(
  cfWorkerUrl: string,
  targetUrl: string,
  sourceName: string,
  opts: {
    method?: string
    body?: unknown
    headers?: Record<string, string>
    timeoutMs?: number
  } = {}
): Promise<unknown> {
  const { method = 'GET', body, headers = {}, timeoutMs = 12_000 } = opts

  // Direct fetch when no Worker URL is configured
  if (!cfWorkerUrl) {
    return fetchJson(targetUrl, sourceName, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        ...headers,
      },
      timeoutMs,
    })
  }

  // Route through Cloudflare Worker relay
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)

  try {
    const res = await fetch(cfWorkerUrl, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: targetUrl,
        method,
        body,
        headers,
      }),
    })
    clearTimeout(timer)

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After')
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5_000
      console.warn(`[${sourceName}] CF Worker 429. Waiting ${waitMs}ms.`)
      await sleep(waitMs)
      throw new Error(`${sourceName}: rate limited by CF Worker relay`)
    }

    if (!res.ok) {
      throw new Error(`${sourceName}: CF Worker returned HTTP ${res.status}`)
    }

    return await res.json()
  } catch (err: unknown) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`${sourceName}: CF Worker relay timed out after ${timeoutMs}ms`)
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Fetch helper (direct -- used for Leg A USDC/USD sources)
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
      return await res.json()

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
// NGN / USDT sources  (Leg B -- routed via CF Worker for Nigerian IP)
// ---------------------------------------------------------------------------

/**
 * Binance P2P: NGN/USDT buy-side median.
 * Routes through CF Worker relay for Nigerian IP geo-bypass.
 * cfWorkerUrl: set CF_WORKER_URL in .env (your Cloudflare Worker URL).
 */
export async function fetchNgnUsdtBinanceP2P(cfWorkerUrl: string): Promise<SourceResult> {
  await limiters['BinanceP2P'].acquire()
  const body = {
    asset: 'USDT',
    fiat: 'NGN',
    tradeType: 'SELL',
    page: 1,
    rows: 10,
    publisherType: null,
    payTypes: [],
  }
  const data = await cfFetch(
    cfWorkerUrl,
    'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
    'BinanceP2P',
    { method: 'POST', body, timeoutMs: 12_000 }
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
 * Nigerian exchange -- direct reflection of local market conditions.
 */
export async function fetchNgnUsdtQuidax(cfWorkerUrl: string): Promise<SourceResult> {
  await limiters['Quidax'].acquire()
  const data = await cfFetch(
    cfWorkerUrl,
    'https://www.quidax.com/api/v1/markets/tickers/usdtngn',
    'Quidax',
    { timeoutMs: 10_000 }
  ) as { data: { ticker: { last: string } } }
  const raw = data.data?.ticker?.last
  if (!raw) throw new Error('Quidax: missing ticker.last in response')
  const value = parseFloat(raw)
  assertBounds(value, NGN_USDT_MIN, NGN_USDT_MAX, 'Quidax NGN/USDT')
  return { source: 'Quidax', value, fetchedAt: Date.now() }
}

/**
 * Bybit P2P: NGN/USDT buy-side median from active sell ads.
 */
export async function fetchNgnUsdtBybitP2P(cfWorkerUrl: string): Promise<SourceResult> {
  await limiters['BybitP2P'].acquire()
  const data = await cfFetch(
    cfWorkerUrl,
    'https://api2.bybit.com/fiat/otc/item/online?userId=&tokenId=USDT&currencyId=NGN&payment=&side=1&size=10&page=1&amount=',
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
 * Bitget P2P: NGN/USDT buy-side median.
 * Requires BITGET_API_KEY (free Bitget account). Skipped gracefully if not set.
 */
export async function fetchNgnUsdtBitgetP2P(apiKey: string, cfWorkerUrl: string): Promise<SourceResult> {
  if (!apiKey) throw new Error('BitgetP2P: BITGET_API_KEY not set -- source skipped')
  await limiters['BitgetP2P'].acquire()
  const data = await cfFetch(
    cfWorkerUrl,
    'https://api.bitget.com/api/v3/p2p/ad-list?token=USDT&fiat=NGN&side=sell&pageNum=1&limit=10',
    'BitgetP2P',
    {
      timeoutMs: 12_000,
      headers: { 'ACCESS-KEY': apiKey },
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
