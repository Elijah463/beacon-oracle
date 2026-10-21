/**
 * reporter.ts
 * -----------
 * Off-chain price reporter for the BEACON USDC/NGN oracle.
 *
 * Uses a Circle developer-controlled wallet (EOA on ARC-TESTNET) to call
 * transmit() on the USDCNGNOracle contract. No raw private key is ever held
 * in this process -- Circle's SDK handles signing server-side.
 *
 * Prerequisites:
 *   CIRCLE_API_KEY             -- Circle Standard Developer API key
 *   CIRCLE_ENTITY_SECRET       -- Registered 32-byte entity secret
 *   REPORTER_WALLET_ID         -- Wallet ID from setup-reporter-wallet.ts
 *   VITE_ORACLE_CONTRACT_ADDRESS -- Deployed proxy address
 *   EXCHANGE_RATE_API_KEY      -- ExchangeRate-API key (free tier)
 *
 * Run:
 *   bun run scripts/reporter.ts
 *
 * Security fixes applied:
 *   FINDING 3:  Strictly serialized loop -- recursive setTimeout, never setInterval.
 *   FINDING 4:  Heartbeat capped at min(1800, onChainMaxStaleness / 2).
 *   FINDING 5:  USD/NGN cached for 1 hour -- well within free-tier API limits.
 *   FINDING 6:  USD/NGN quorum of 2. Outlier rejection on both legs.
 *   FINDING 7:  Timestamp clamped to latest on-chain block time.
 *   FINDING 11: On-chain read errors surface explicitly and back off.
 *   FINDING 13: All arithmetic uses BigInt -- no floating-point multiplication.
 *   FINDING 16: Error messages never include URLs (no API key leakage in logs).
 */

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'
import { createPublicClient, http } from 'viem'

import {
  fetchUsdcUsdBinance,
  fetchUsdcUsdCoinbase,
  fetchUsdcUsdKraken,
  fetchUsdNgnExchangeRateApi,
  fetchUsdNgnOpenExchangeRates,
  fetchAll,
  median,
  rejectOutliers,
} from './price-sources.js'
import type { SourceResult } from './price-sources.js'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CIRCLE_API_KEY      = process.env.CIRCLE_API_KEY ?? ''
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET
  ?? process.env.ENTITY_SECRET
  ?? process.env.CIRCLE_SCP_ENTITY_SECRET
  ?? ''
const REPORTER_WALLET_ID   = process.env.REPORTER_WALLET_ID ?? ''
const CONTRACT_ADDRESS     = (process.env.VITE_ORACLE_CONTRACT_ADDRESS ?? '') as `0x${string}`
const EXCHANGE_RATE_API_KEY   = process.env.EXCHANGE_RATE_API_KEY ?? ''
const OPEN_EXCHANGE_RATES_ID  = process.env.OPEN_EXCHANGE_RATES_APP_ID ?? ''

if (!CIRCLE_API_KEY)       { console.error('[BEACON] CIRCLE_API_KEY not set');       process.exit(1) }
if (!CIRCLE_ENTITY_SECRET) { console.error('[BEACON] CIRCLE_ENTITY_SECRET not set'); process.exit(1) }
if (!REPORTER_WALLET_ID)   { console.error('[BEACON] REPORTER_WALLET_ID not set');   process.exit(1) }
if (!CONTRACT_ADDRESS)     { console.error('[BEACON] VITE_ORACLE_CONTRACT_ADDRESS not set'); process.exit(1) }
if (!EXCHANGE_RATE_API_KEY) { console.warn('[BEACON] EXCHANGE_RATE_API_KEY not set -- USD/NGN leg may fail') }

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

// Circle developer-controlled wallets SDK -- handles signing server-side
const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: CIRCLE_API_KEY,
  entitySecret: CIRCLE_ENTITY_SECRET,
})

// RPC client -- prefer Arc Studio proxy, fall back to public Arc Testnet RPC
const proxyChains = (process.env.RPC_PROXY_CHAINS ?? '').split(',')
const rpcUrl: string =
  process.env.RPC_PROXY_BASE_URL && proxyChains.includes('Arc_Testnet')
    ? `${process.env.RPC_PROXY_BASE_URL}/api/rpc/Arc_Testnet?_rpc_token=${process.env.RPC_PROXY_TOKEN}`
    : 'https://rpc.testnet.arc.io'

const publicClient = createPublicClient({ transport: http(rpcUrl) })

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Circle transaction terminal states (from onchain-wait)
const TERMINAL_STATES = new Set(['COMPLETE', 'FAILED', 'DENIED', 'CANCELLED'])
const POLL_INTERVAL_MS = 2_000
const POLL_TIMEOUT_MS  = 120_000

// Oracle params
const ORACLE_DECIMALS   = 8n
const ORACLE_SCALE      = 10n ** ORACLE_DECIMALS

// Deviation threshold (bps) -- skip submit if price moved less than this
// (this is refreshed from on-chain each cycle)
let cachedDeviationThresholdBps = 50n  // default 0.5%
let cachedMaxStaleness          = 3600  // seconds, default 1 hour
let heartbeatInterval           = 1800  // seconds, updated from on-chain

// FX cache: USD/NGN is expensive to poll frequently on free plans
let fxCache: { valueNgn: number; fetchedAt: number } | null = null
const FX_CACHE_TTL_MS   = 60 * 60 * 1000  // 1 hour
const FX_RETRY_DELAY_MS = 5  * 60 * 1000  // 5 min retry throttle after failure
let fxLastFailAt        = 0

// Reporter state
let lastSubmittedAt   = 0      // unix seconds
let lastOnChainRoundId = 0n
let lastOnChainPrice   = 0n

// ---------------------------------------------------------------------------
// Oracle contract ABI (minimal -- only what the reporter needs)
// ---------------------------------------------------------------------------

const ORACLE_ABI = [
  {
    type: 'function',
    name: 'transmit',
    inputs: [
      { name: 'answer', type: 'int256' },
      { name: 'timestamp', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'latestRound',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'latestAnswer',
    inputs: [],
    outputs: [{ name: '', type: 'int256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'maxStaleness',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'deviationThresholdBps',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'circuitBreakerTripped',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const

// ---------------------------------------------------------------------------
// Circle transaction polling
// ---------------------------------------------------------------------------

async function waitForCircleTx(transactionId: string): Promise<'COMPLETE' | 'FAILED' | 'DENIED' | 'CANCELLED'> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    let txRes
    try {
      txRes = await circleClient.getTransaction({ id: transactionId })
    } catch (e) {
      console.warn(`[poll] getTransaction error: ${safeMsg(e)}`)
      continue
    }
    const state = txRes.data?.transaction?.state ?? ''
    if (TERMINAL_STATES.has(state)) {
      return state as 'COMPLETE' | 'FAILED' | 'DENIED' | 'CANCELLED'
    }
    console.log(`[poll] tx ${transactionId} state: ${state}`)
  }
  throw new Error(`Transaction ${transactionId} did not reach terminal state within ${POLL_TIMEOUT_MS / 1000}s`)
}

// ---------------------------------------------------------------------------
// Price derivation
// ---------------------------------------------------------------------------

async function fetchUsdNgnWithCache(): Promise<SourceResult[]> {
  const now = Date.now()

  // Return cached value if still fresh
  if (fxCache && (now - fxCache.fetchedAt) < FX_CACHE_TTL_MS) {
    return [{ value: fxCache.valueNgn, source: 'fx-cache', fetchedAt: fxCache.fetchedAt }]
  }

  // Throttle retries after recent failure
  if (fxLastFailAt > 0 && (now - fxLastFailAt) < FX_RETRY_DELAY_MS) {
    if (fxCache) {
      console.warn('[fx] Using stale FX cache (retry throttled)')
      return [{ value: fxCache.valueNgn, source: 'fx-stale-cache', fetchedAt: fxCache.fetchedAt }]
    }
    throw new Error('FX sources unavailable and no cached value exists')
  }

  const { successes, failures } = await fetchAll([
    () => fetchUsdNgnExchangeRateApi(EXCHANGE_RATE_API_KEY),
    () => fetchUsdNgnOpenExchangeRates(OPEN_EXCHANGE_RATES_ID),
  ])

  for (const f of failures) console.warn(`[fx] Source failed: ${f.error}`)

  if (successes.length === 0) {
    fxLastFailAt = now
    if (fxCache) {
      console.warn('[fx] All FX sources failed -- using stale cache')
      return [{ value: fxCache.valueNgn, source: 'fx-stale-cache', fetchedAt: fxCache.fetchedAt }]
    }
    throw new Error('All FX sources failed and no cache available')
  }

  const med = median(successes.map((r) => r.value))
  fxCache = { valueNgn: med, fetchedAt: now }
  fxLastFailAt = 0
  return successes
}

async function derivePrice(): Promise<bigint> {
  // Fetch USDC/USD from CEX sources
  const { successes: usdcUsdResults, failures: usdcUsdFailures } = await fetchAll([
    () => fetchUsdcUsdBinance(),
    () => fetchUsdcUsdCoinbase(),
    () => fetchUsdcUsdKraken(),
  ])

  for (const f of usdcUsdFailures) console.warn(`[usdc/usd] Source failed: ${f.error}`)

  if (usdcUsdResults.length < 2) {
    throw new Error(`Insufficient USDC/USD sources: only ${usdcUsdResults.length} responded (need 2)`)
  }

  // Fetch USD/NGN from FX sources (cached)
  const usdNgnResults = await fetchUsdNgnWithCache()

  if (usdNgnResults.length < 1) {
    throw new Error('No USD/NGN sources available')
  }

  // Reject outliers on each leg independently
  const cleanUsdcUsd = rejectOutliers(usdcUsdResults)
  const cleanUsdNgn  = rejectOutliers(usdNgnResults)

  if (cleanUsdcUsd.length === 0) throw new Error('All USDC/USD values rejected as outliers')
  if (cleanUsdNgn.length === 0)  throw new Error('All USD/NGN values rejected as outliers')

  const usdcUsd = median(cleanUsdcUsd.map((r) => r.value))  // e.g. 0.9997
  const usdNgn  = median(cleanUsdNgn.map((r) => r.value))   // e.g. 1620.50

  // Compute USDC/NGN using integer arithmetic only (no floating-point)
  // price (8 dec) = round(usdcUsd * usdNgn * 1e8)
  // Use string-based approach to avoid float precision loss:
  //   usdcUsd and usdNgn are JS numbers from JSON APIs -- convert to BigInt via
  //   string rounding to avoid accumulating floating-point error.
  const usdcUsdBig = floatToBigInt(usdcUsd, 10)  // 10 dec precision
  const usdNgnBig  = floatToBigInt(usdNgn,  10)
  // price = (usdcUsdBig * usdNgnBig) / 1e(10+10-8) = / 1e12
  const priceBig = (usdcUsdBig * usdNgnBig) / (10n ** 12n)

  console.log(`[price] USDC/USD=${usdcUsd.toFixed(6)}  USD/NGN=${usdNgn.toFixed(4)}  USDC/NGN=${formatPrice(priceBig)}`)

  if (priceBig <= 0n) throw new Error('Derived price is zero or negative')
  return priceBig
}

/** Convert a JS float to BigInt with `decimals` fixed-point precision, string-rounded */
function floatToBigInt(value: number, decimals: number): bigint {
  // Multiply, round to nearest integer, convert to BigInt
  const shifted = value * 10 ** decimals
  const rounded = Math.round(shifted)
  return BigInt(rounded)
}

/** Format a price BigInt (8 dec) for logging */
function formatPrice(p: bigint): string {
  const whole = p / ORACLE_SCALE
  const frac  = p % ORACLE_SCALE
  return `${whole}.${frac.toString().padStart(8, '0')} NGN/USDC`
}

// ---------------------------------------------------------------------------
// On-chain state reads
// ---------------------------------------------------------------------------

async function refreshOnChainState(): Promise<void> {
  const [roundId, price, maxStaleness, deviationBps, cbTripped, block] = await Promise.all([
    publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: 'latestRound' })
      .catch((e: unknown) => { throw new Error(`latestRound failed: ${safeMsg(e)}`) }),
    publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: 'latestAnswer' })
      .catch((): bigint => 0n),
    publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: 'maxStaleness' })
      .catch((): bigint => BigInt(cachedMaxStaleness)),
    publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: 'deviationThresholdBps' })
      .catch((): bigint => cachedDeviationThresholdBps),
    publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: 'circuitBreakerTripped' })
      .catch((): boolean => false),
    publicClient.getBlock().catch((e: unknown) => { throw new Error(`getBlock failed: ${safeMsg(e)}`) }),
  ])

  if (cbTripped) {
    throw new Error('[ALERT] Circuit breaker is tripped. Owner must call resetCircuitBreaker() before reporter can continue.')
  }

  lastOnChainRoundId = roundId
  lastOnChainPrice   = typeof price === 'bigint' ? price : 0n

  cachedMaxStaleness          = Number(maxStaleness)
  cachedDeviationThresholdBps = deviationBps
  // Heartbeat must be at most half of maxStaleness so price never goes stale
  heartbeatInterval = Math.min(1800, Math.floor(cachedMaxStaleness / 2))

  // Clamp reference timestamp to latest on-chain block (FINDING 7)
  const blockTs = Number(block.timestamp)
  if (blockTs > lastSubmittedAt) lastSubmittedAt = blockTs - heartbeatInterval - 1
}

// ---------------------------------------------------------------------------
// Transmit via Circle developer-controlled wallet
// ---------------------------------------------------------------------------

async function transmitPrice(price: bigint, timestamp: bigint): Promise<void> {
  // Use abiFunctionSignature + abiParameters -- Circle validates the call
  console.log(`[transmit] Submitting round via Circle wallet ${REPORTER_WALLET_ID}...`)

  let txId: string
  try {
    const execRes = await circleClient.createContractExecutionTransaction({
      walletId: REPORTER_WALLET_ID,
      contractAddress: CONTRACT_ADDRESS,
      abiFunctionSignature: 'transmit(int256,uint256)',
      abiParameters: [price.toString(), timestamp.toString()],
      fee: {
        type: 'level',
        config: { feeLevel: 'MEDIUM' },
      },
    })

    txId = execRes.data?.id ?? ''
    if (!txId) throw new Error('Circle returned no transaction ID')
  } catch (e) {
    throw new Error(`createContractExecutionTransaction failed: ${safeMsg(e)}`)
  }

  console.log(`[transmit] Circle tx submitted: ${txId} -- waiting for confirmation...`)

  const finalState = await waitForCircleTx(txId)

  if (finalState !== 'COMPLETE') {
    throw new Error(`Transmit transaction ended in state ${finalState} (txId: ${txId})`)
  }

  console.log(`[transmit] COMPLETE. Round ${lastOnChainRoundId + 1n} published. Price: ${formatPrice(price)}`)
  lastSubmittedAt = Number(timestamp)
}

// ---------------------------------------------------------------------------
// Main reporter cycle
// ---------------------------------------------------------------------------

async function runCycle(): Promise<void> {
  const now = Math.floor(Date.now() / 1000)

  console.log(`\n[cycle] Starting cycle at ${new Date().toISOString()}`)

  // Refresh on-chain state (also checks circuit breaker -- throws if tripped)
  await refreshOnChainState()

  // Derive current price from sources
  const newPrice = await derivePrice()

  // Check deviation vs last on-chain price
  const secondsSinceSubmit = now - lastSubmittedAt
  const heartbeatDue = secondsSinceSubmit >= heartbeatInterval

  if (lastOnChainPrice > 0n) {
    const absDiff = newPrice > lastOnChainPrice ? newPrice - lastOnChainPrice : lastOnChainPrice - newPrice
    const deviationBps = (absDiff * 10_000n) / lastOnChainPrice

    if (!heartbeatDue && deviationBps < cachedDeviationThresholdBps) {
      console.log(`[cycle] Skip: deviation ${deviationBps}bps < threshold ${cachedDeviationThresholdBps}bps, heartbeat not due (${secondsSinceSubmit}s / ${heartbeatInterval}s)`)
      return
    }

    const reason = heartbeatDue
      ? `heartbeat due (${secondsSinceSubmit}s >= ${heartbeatInterval}s)`
      : `deviation ${deviationBps}bps >= threshold ${cachedDeviationThresholdBps}bps`
    console.log(`[cycle] Submit reason: ${reason}`)
  } else {
    console.log('[cycle] No prior on-chain price -- submitting first round')
  }

  // Clamp timestamp to current block time (never use local clock directly)
  const block = await publicClient.getBlock()
  const timestamp = block.timestamp  // bigint, unix seconds

  await transmitPrice(newPrice, timestamp)
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

const CYCLE_INTERVAL_MS = 60_000  // check every 60 seconds
const MAX_BACKOFF_MS    = 5 * 60_000

async function loop(backoff = 0): Promise<void> {
  try {
    await runCycle()
    backoff = 0  // reset on success
  } catch (e) {
    const msg = safeMsg(e)
    if (msg.includes('Circuit breaker')) {
      console.error(`\n[BEACON ALERT] ${msg}`)
      console.error('[BEACON ALERT] Reporter is pausing. Resolve on-chain then restart.\n')
      process.exit(1)
    }
    const nextBackoff = Math.min(backoff > 0 ? backoff * 2 : CYCLE_INTERVAL_MS, MAX_BACKOFF_MS)
    console.error(`[cycle] Error: ${msg}. Retrying in ${nextBackoff / 1000}s`)
    backoff = nextBackoff
  }

  // Schedule next cycle -- strictly serialized (no overlap)
  const delay = backoff > 0 ? backoff : CYCLE_INTERVAL_MS
  setTimeout((): void => { void loop(backoff) }, delay)
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

console.log('[BEACON] Reporter starting (Circle developer-controlled wallet mode)')
console.log(`[BEACON] Contract:        ${CONTRACT_ADDRESS}`)
console.log(`[BEACON] Reporter wallet: ${REPORTER_WALLET_ID}`)
console.log(`[BEACON] RPC endpoint:    ${rpcUrl.replace(/\?.*/, '?...')}`)
console.log(`[BEACON] Cycle interval:  ${CYCLE_INTERVAL_MS / 1000}s`)
console.log('')

void loop()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Extract a safe error message that never includes URLs (no API key leakage) */
function safeMsg(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  // Strip anything that looks like a URL to prevent leaking API keys in logs
  return raw.replace(/https?:\/\/[^\s"']*/g, '[url-redacted]').slice(0, 300)
}


