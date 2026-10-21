/**
 * reporter.ts
 * -----------
 * BEACON off-chain price reporter -- Chainlink-style submission rules.
 *
 * CYCLE: every 30 seconds, fetch both price legs simultaneously,
 *        derive USDC/NGN, then decide whether to publish on-chain.
 *
 * PUBLISH RULES (Chainlink-style):
 *   1. DEVIATION GATE: only publish if the new price deviates >= 0.2% from the
 *      last successfully published on-chain price.
 *   2. HEARTBEAT: if the price has stayed within 0.2% for >= 1 hour without
 *      a publish, force a publish regardless (heartbeat trigger). This uses
 *      the most recently derived 30-second price round, not the first one.
 *   3. FIRST ROUND: always publish -- no prior price to compare.
 *
 * CIRCUIT BREAKER (on-chain):
 *   The contract's circuit breaker trips when a single submitted update
 *   would move the on-chain price by more than circuitBreakerBps (default 10%).
 *   When it trips:
 *     - The contract sets circuitBreakerTripped = true and emits CircuitBreakerTripped.
 *     - All subsequent transmit() calls revert with CircuitBreakerActive().
 *     - The reporter detects this, logs a loud alert, and exits.
 *   To recover:
 *     - The oracle owner must call resetCircuitBreaker() OR
 *       resetCircuitBreakerAndPublish(verifiedAnswer, timestamp) on the contract.
 *     - resetCircuitBreakerAndPublish is preferred: it atomically accepts the
 *       verified large move and resets the breaker so the feed resumes cleanly.
 *     - After reset, restart this reporter process.
 *
 * USES Circle developer-controlled wallet -- no raw private key in this process.
 *
 * Prerequisites (set in .env):
 *   CIRCLE_API_KEY                -- Circle Standard Developer API key
 *   CIRCLE_ENTITY_SECRET          -- Registered 32-byte entity secret
 *   REPORTER_WALLET_ID            -- Wallet ID from scripts/setup-reporter-wallet.ts
 *   VITE_ORACLE_CONTRACT_ADDRESS  -- Deployed BEACON proxy address on Arc Testnet
 */

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'
import { createPublicClient, http } from 'viem'
import { arcTestnet } from 'viem/chains'

import {
  fetchUsdcUsdCoinbase,
  fetchUsdcUsdBinance,
  fetchUsdcUsdOKX,
  fetchUsdcUsdBitget,
  fetchUsdcUsdBybit,
  fetchNgnUsdtBinanceP2P,
  fetchNgnUsdtQuidax,
  fetchNgnUsdtBybitP2P,
  fetchNgnUsdtBitgetP2P,
  fetchAll,
  median,
  rejectOutliers,
} from './price-sources.js'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CIRCLE_API_KEY       = process.env.CIRCLE_API_KEY ?? ''
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET
  ?? process.env.ENTITY_SECRET
  ?? process.env.CIRCLE_SCP_ENTITY_SECRET
  ?? ''
const REPORTER_WALLET_ID   = process.env.REPORTER_WALLET_ID ?? ''
const CONTRACT_ADDRESS     = (process.env.VITE_ORACLE_CONTRACT_ADDRESS ?? '') as `0x${string}`

if (!CIRCLE_API_KEY)       { console.error('[BEACON] CIRCLE_API_KEY not set');       process.exit(1) }
if (!CIRCLE_ENTITY_SECRET) { console.error('[BEACON] CIRCLE_ENTITY_SECRET not set'); process.exit(1) }
if (!REPORTER_WALLET_ID)   { console.error('[BEACON] REPORTER_WALLET_ID not set');   process.exit(1) }
if (!CONTRACT_ADDRESS)     { console.error('[BEACON] VITE_ORACLE_CONTRACT_ADDRESS not set'); process.exit(1) }

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: CIRCLE_API_KEY,
  entitySecret: CIRCLE_ENTITY_SECRET,
})

const rpcUrl: string =
  process.env.RPC_PROXY_BASE_URL &&
  (process.env.RPC_PROXY_CHAINS ?? '').split(',').includes('Arc_Testnet')
    ? `${process.env.RPC_PROXY_BASE_URL}/api/rpc/Arc_Testnet?_rpc_token=${process.env.RPC_PROXY_TOKEN}`
    : 'https://rpc.testnet.arc.io'

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(rpcUrl),
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORACLE_DECIMALS = 8n
const ORACLE_SCALE    = 10n ** ORACLE_DECIMALS

// Cycle: fetch price every 30 seconds
const CYCLE_INTERVAL_MS  = 30_000
// Deviation gate: only publish if price moved >= 0.2% (20 bps)
const DEVIATION_GATE_BPS = 20n
// Heartbeat: force publish if no update for 1 hour regardless of deviation
const HEARTBEAT_SECS     = 3600
// Quorum: minimum live sources required per leg before aggregation
const USDC_USD_QUORUM    = 2   // out of 5 sources
const NGN_USDT_QUORUM    = 2   // out of 4 sources

// Circle transaction polling
const POLL_INTERVAL_MS   = 2_000
const POLL_TIMEOUT_MS    = 120_000
const TERMINAL_STATES    = new Set(['COMPLETE', 'FAILED', 'DENIED', 'CANCELLED'])
const MAX_BACKOFF_MS     = 5 * 60_000

// ---------------------------------------------------------------------------
// Minimal oracle ABI (only what the reporter needs)
// ---------------------------------------------------------------------------

const ORACLE_ABI = [
  {
    type: 'function', name: 'transmit',
    inputs: [{ name: 'answer', type: 'int256' }, { name: 'timestamp', type: 'uint256' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'latestRound',
    inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'latestAnswer',
    inputs: [], outputs: [{ name: '', type: 'int256' }], stateMutability: 'view',
  },
  {
    type: 'function', name: 'latestRoundData',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'circuitBreakerTripped',
    inputs: [], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view',
  },
] as const

// ---------------------------------------------------------------------------
// Reporter state
// ---------------------------------------------------------------------------

// The timestamp (unix seconds) of the last successful on-chain publish
let lastPublishedAt  = 0
// The on-chain price at the time of the last successful publish
let lastPublishedPrice: bigint = 0n
// The most recently derived price (updated every 30s cycle even if not published)
let latestDerivedPrice: bigint = 0n
// Whether the first round has been published yet
let firstRoundDone = false

// ---------------------------------------------------------------------------
// Circle transaction polling
// ---------------------------------------------------------------------------

async function waitForCircleTx(
  txId: string
): Promise<'COMPLETE' | 'FAILED' | 'DENIED' | 'CANCELLED'> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    try {
      const res = await circleClient.getTransaction({ id: txId })
      const state = res.data?.transaction?.state ?? ''
      if (TERMINAL_STATES.has(state)) {
        return state as 'COMPLETE' | 'FAILED' | 'DENIED' | 'CANCELLED'
      }
      console.log(`  [poll] tx ${txId.slice(0, 8)}... state: ${state}`)
    } catch (e) {
      console.warn(`  [poll] getTransaction error: ${safeMsg(e)}`)
    }
  }
  throw new Error(`Circle tx ${txId} did not reach terminal state within ${POLL_TIMEOUT_MS / 1000}s`)
}

// ---------------------------------------------------------------------------
// Price derivation
// ---------------------------------------------------------------------------

async function derivePrice(): Promise<bigint> {
  const now = Date.now()

  // Fetch both legs simultaneously -- all 9 sources in parallel
  const [usdcResult, ngnResult] = await Promise.all([
    fetchAll([
      () => fetchUsdcUsdCoinbase(),
      () => fetchUsdcUsdBinance(),
      () => fetchUsdcUsdOKX(),
      () => fetchUsdcUsdBitget(),
      () => fetchUsdcUsdBybit(),
    ]),
    fetchAll([
      () => fetchNgnUsdtBinanceP2P(),
      () => fetchNgnUsdtQuidax(),
      () => fetchNgnUsdtBybitP2P(),
      () => fetchNgnUsdtBitgetP2P(),
    ]),
  ])

  // Log source results
  for (const f of usdcResult.failures) console.warn(`[usdc/usd] failed: ${f.error}`)
  for (const f of ngnResult.failures)  console.warn(`[ngn/usdt] failed: ${f.error}`)
  console.log(`[sources] USDC/USD: ${usdcResult.successes.length}/5 ok | NGN/USDT: ${ngnResult.successes.length}/4 ok`)

  // Enforce quorum before outlier rejection
  if (usdcResult.successes.length < USDC_USD_QUORUM) {
    throw new Error(
      `USDC/USD quorum not met: ${usdcResult.successes.length} sources (need ${USDC_USD_QUORUM})`
    )
  }
  if (ngnResult.successes.length < NGN_USDT_QUORUM) {
    throw new Error(
      `NGN/USDT quorum not met: ${ngnResult.successes.length} sources (need ${NGN_USDT_QUORUM})`
    )
  }

  // Reject outliers (10% deviation threshold, per spec)
  const cleanUsdc = rejectOutliers(usdcResult.successes, 0.10)
  const cleanNgn  = rejectOutliers(ngnResult.successes,  0.10)

  if (cleanUsdc.length === 0) throw new Error('All USDC/USD values rejected as outliers')
  if (cleanNgn.length === 0)  throw new Error('All NGN/USDT values rejected as outliers')
  if (cleanUsdc.length < USDC_USD_QUORUM) {
    throw new Error(`Post-outlier USDC/USD quorum not met: ${cleanUsdc.length} sources`)
  }
  if (cleanNgn.length < NGN_USDT_QUORUM) {
    throw new Error(`Post-outlier NGN/USDT quorum not met: ${cleanNgn.length} sources`)
  }

  // Take the median of each leg
  const usdcUsd = median(cleanUsdc.map((r) => r.value))  // e.g. 0.9997
  const ngnUsdt = median(cleanNgn.map((r) => r.value))   // e.g. 1625.00

  // USDC/NGN = USDC/USD * NGN/USDT
  // (NGN/USDT is treated as NGN/USD since USDT ~= USD in P2P markets)
  // Use BigInt arithmetic -- no floating-point multiplication
  const usdcUsdBig = floatToBigInt(usdcUsd, 12)  // 12 decimal precision
  const ngnUsdtBig = floatToBigInt(ngnUsdt, 12)
  // price (8 dec) = (usdcUsd * ngnUsdt * 1e8) / (1e12 * 1e12) * 1e12
  //              = (usdcUsdBig * ngnUsdtBig) / 1e(12+12-8) = / 1e16
  const priceBig = (usdcUsdBig * ngnUsdtBig) / (10n ** 16n)

  const elapsed = ((Date.now() - now) / 1000).toFixed(1)
  console.log(
    `[price] USDC/USD=${usdcUsd.toFixed(6)} | NGN/USDT=${ngnUsdt.toFixed(2)} | ` +
    `USDC/NGN=${formatPrice(priceBig)} | sources(${cleanUsdc.length}+${cleanNgn.length}) | ${elapsed}s`
  )

  if (priceBig <= 0n) throw new Error('Derived price is zero or negative')
  return priceBig
}

/** Convert JS float to BigInt with fixed-point precision */
function floatToBigInt(value: number, decimals: number): bigint {
  const shifted = Math.round(value * 10 ** decimals)
  return BigInt(shifted)
}

/** Format a price BigInt (8 dec) for display */
function formatPrice(p: bigint): string {
  const whole = p / ORACLE_SCALE
  const frac  = (p % ORACLE_SCALE).toString().padStart(8, '0')
  return `${whole}.${frac} NGN`
}

// ---------------------------------------------------------------------------
// On-chain state
// ---------------------------------------------------------------------------

async function refreshOnChainState(): Promise<void> {
  // Check circuit breaker first
  const cbTripped = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: ORACLE_ABI,
    functionName: 'circuitBreakerTripped',
  }).catch((e: unknown): boolean => {
    throw new Error(`circuitBreakerTripped read failed: ${safeMsg(e)}`)
  })

  if (cbTripped) {
    console.error('\n[BEACON ALERT] ====================================================')
    console.error('[BEACON ALERT] CIRCUIT BREAKER IS TRIPPED.')
    console.error('[BEACON ALERT] A submitted price exceeded the on-chain safety threshold.')
    console.error('[BEACON ALERT] The contract is now frozen.')
    console.error('[BEACON ALERT]')
    console.error('[BEACON ALERT] To recover, the oracle owner must call ONE of:')
    console.error('[BEACON ALERT]   resetCircuitBreaker()                      -- resets only, does not publish')
    console.error('[BEACON ALERT]   resetCircuitBreakerAndPublish(price, ts)   -- resets AND accepts the large move')
    console.error('[BEACON ALERT]')
    console.error('[BEACON ALERT] After reset, restart this reporter process.')
    console.error('[BEACON ALERT] ====================================================\n')
    process.exit(1)
  }

  // Read latest on-chain price and round
  try {
    const [roundId, price] = await Promise.all([
      publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: 'latestRound' }),
      publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: 'latestAnswer' })
        .catch((): bigint => 0n),
    ])
    lastPublishedPrice = typeof price === 'bigint' ? (price > 0n ? price : 0n) : 0n
    firstRoundDone     = roundId > 0n
  } catch (e) {
    throw new Error(`On-chain state read failed: ${safeMsg(e)}`)
  }
}

// ---------------------------------------------------------------------------
// Submit decision (Chainlink-style rules)
// ---------------------------------------------------------------------------

type SubmitDecision =
  | { submit: true;  reason: 'first-round' | 'deviation' | 'heartbeat' }
  | { submit: false; reason: 'within-deviation' }

function shouldSubmit(newPrice: bigint, nowSecs: number): SubmitDecision {
  // Rule 1: always submit the first round
  if (!firstRoundDone || lastPublishedPrice === 0n) {
    return { submit: true, reason: 'first-round' }
  }

  // Calculate deviation from last published price
  const absDiff = newPrice > lastPublishedPrice
    ? newPrice - lastPublishedPrice
    : lastPublishedPrice - newPrice
  const deviationBps = (absDiff * 10_000n) / lastPublishedPrice

  // Rule 3: heartbeat -- publish if no update for >= 1 hour, using latest derived price
  const secondsSincePublish = nowSecs - lastPublishedAt
  if (secondsSincePublish >= HEARTBEAT_SECS) {
    console.log(
      `[decision] Heartbeat triggered: ${secondsSincePublish}s since last publish (threshold ${HEARTBEAT_SECS}s). ` +
      `Deviation ${deviationBps}bps. Publishing latest 30s derived price.`
    )
    return { submit: true, reason: 'heartbeat' }
  }

  // Rule 2: deviation gate -- only publish if price moved >= 0.2% (20 bps)
  if (deviationBps >= DEVIATION_GATE_BPS) {
    console.log(`[decision] Deviation ${deviationBps}bps >= gate ${DEVIATION_GATE_BPS}bps. Submitting.`)
    return { submit: true, reason: 'deviation' }
  }

  console.log(
    `[decision] Skip: deviation ${deviationBps}bps < gate ${DEVIATION_GATE_BPS}bps | ` +
    `${secondsSincePublish}s / ${HEARTBEAT_SECS}s until heartbeat`
  )
  return { submit: false, reason: 'within-deviation' }
}

// ---------------------------------------------------------------------------
// Transmit via Circle developer-controlled wallet
// ---------------------------------------------------------------------------

async function transmitPrice(price: bigint, timestamp: bigint): Promise<void> {
  console.log(`[transmit] Submitting via Circle wallet ${REPORTER_WALLET_ID}...`)

  let txId: string
  try {
    const res = await circleClient.createContractExecutionTransaction({
      walletId: REPORTER_WALLET_ID,
      contractAddress: CONTRACT_ADDRESS,
      abiFunctionSignature: 'transmit(int256,uint256)',
      abiParameters: [price.toString(), timestamp.toString()],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    })
    txId = res.data?.id ?? ''
    if (!txId) throw new Error('Circle returned no transaction ID')
  } catch (e) {
    throw new Error(`createContractExecutionTransaction failed: ${safeMsg(e)}`)
  }

  console.log(`[transmit] Circle tx created: ${txId.slice(0, 8)}... Waiting for on-chain confirmation...`)

  const finalState = await waitForCircleTx(txId)

  if (finalState !== 'COMPLETE') {
    throw new Error(`Transmit tx ended in state ${finalState} (txId: ${txId})`)
  }

  // Only update local state after confirmed on-chain
  lastPublishedAt    = Number(timestamp)
  lastPublishedPrice = price

  console.log(`[transmit] CONFIRMED. Price: ${formatPrice(price)} | Timestamp: ${new Date(Number(timestamp) * 1000).toISOString()}`)
}

// ---------------------------------------------------------------------------
// Main reporter cycle (runs every 30 seconds)
// ---------------------------------------------------------------------------

async function runCycle(): Promise<void> {
  const nowMs   = Date.now()
  const nowSecs = Math.floor(nowMs / 1000)

  console.log(`\n[cycle] ${new Date(nowMs).toISOString()} ------`)

  // Step 1: read on-chain state (checks circuit breaker -- exits if tripped)
  await refreshOnChainState()

  // Step 2: derive price from all sources
  const newPrice = await derivePrice()

  // Always track the latest derived price (used by heartbeat)
  latestDerivedPrice = newPrice

  // Step 3: decide whether to submit
  const decision = shouldSubmit(newPrice, nowSecs)
  if (!decision.submit) return

  // Step 4: clamp timestamp to latest block (never use local clock directly)
  const block = await publicClient.getBlock()
  const timestamp = block.timestamp  // bigint, unix seconds

  // Step 5: transmit
  await transmitPrice(newPrice, timestamp)
}

// ---------------------------------------------------------------------------
// Strictly serialized loop (no setInterval -- one cycle at a time)
// ---------------------------------------------------------------------------

async function loop(backoffMs = 0): Promise<void> {
  try {
    await runCycle()
    backoffMs = 0  // reset backoff on success
  } catch (e) {
    const msg = safeMsg(e)
    // Circuit breaker exits the process (see refreshOnChainState)
    // Any other error: backoff and retry
    const next = Math.min(backoffMs > 0 ? backoffMs * 2 : CYCLE_INTERVAL_MS, MAX_BACKOFF_MS)
    const jitter = Math.floor(Math.random() * 3_000)
    console.error(`[cycle] Error: ${msg}`)
    console.error(`[cycle] Retrying in ${(next + jitter) / 1000}s`)
    backoffMs = next + jitter
  }

  // Schedule next cycle strictly after this one finishes
  const delay = backoffMs > 0 ? backoffMs : CYCLE_INTERVAL_MS
  setTimeout((): void => { void loop(backoffMs) }, delay)
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

console.log('[BEACON] Reporter starting')
console.log(`[BEACON] Contract:         ${CONTRACT_ADDRESS}`)
console.log(`[BEACON] Reporter wallet:  ${REPORTER_WALLET_ID}`)
console.log(`[BEACON] Cycle:            every ${CYCLE_INTERVAL_MS / 1000}s`)
console.log(`[BEACON] Deviation gate:   ${DEVIATION_GATE_BPS}bps (${Number(DEVIATION_GATE_BPS) / 100}%)`)
console.log(`[BEACON] Heartbeat:        ${HEARTBEAT_SECS}s (${HEARTBEAT_SECS / 3600}h)`)
console.log(`[BEACON] Quorum:           USDC/USD ${USDC_USD_QUORUM}/5 | NGN/USDT ${NGN_USDT_QUORUM}/4`)
console.log(`[BEACON] Outlier filter:   10% max deviation from group median`)
console.log('')

void loop()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Extract a safe error message -- never includes URLs (no API key leakage) */
function safeMsg(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.replace(/https?:\/\/[^\s"']*/g, '[url-redacted]').slice(0, 400)
}

// Suppress unused variable warning for latestDerivedPrice
// (it is tracked for future use in a status endpoint)
void latestDerivedPrice
