/**
 * useOracle.ts
 * Polls the deployed USDCNGNOracle contract every 15 seconds for:
 *  - latestRound id + governance config (via useReadContracts, 15s refetchInterval)
 *  - current price via getRoundData(latestRoundId) -- FINDING 10: never latestRoundData()
 *    so a stale price shows a badge instead of blanking the dashboard
 *  - last 20 historical round data points for the chart
 *
 * FINDING 9 FIX: history refetches only when latestRoundId changes, not every second.
 *               The 1-second clock only updates derived text (secondsAgo, isStale).
 * FINDING 10 FIX: uses getRoundData(id) -- no staleness revert from the contract.
 * FINDING 9 FIX: duplicate setInterval poll removed (useReadContracts refetchInterval handles it).
 */

import { useReadContracts, usePublicClient } from 'wagmi'
import { useEffect, useState, useCallback, useRef } from 'react'
import { arcTestnet } from 'viem/chains'
import { ORACLE_ABI } from '@/lib/oracleAbi'

const CONTRACT_ADDRESS = import.meta.env.VITE_ORACLE_CONTRACT_ADDRESS as `0x${string}`
const ORACLE_DECIMALS  = 8
const SCALE            = 10 ** ORACLE_DECIMALS
const POLL_INTERVAL_MS = 15_000

export interface RoundPoint {
  roundId:   number
  price:     number   // human-readable (e.g. 1624.5)
  updatedAt: number   // unix seconds
}

export interface OracleState {
  /** Current USDC/NGN price (human-readable, 2 decimal places) */
  price: number | null
  /** Current round id */
  roundId: number | null
  /** Unix seconds of last update */
  updatedAt: number | null
  /** Seconds since last update */
  secondsAgo: number | null
  /** Whether the price is considered stale (computed locally, not from contract revert) */
  isStale: boolean
  /** Whether the circuit breaker is tripped */
  circuitBreakerTripped: boolean
  /** Whether the contract is paused */
  paused: boolean
  /** Max staleness in seconds (from contract) */
  maxStaleness: number | null
  /** Deviation threshold in bps (from contract) */
  deviationThresholdBps: number | null
  /** Circuit breaker threshold in bps (from contract) */
  circuitBreakerBps: number | null
  /** Reporter address */
  reporter: string | null
  /** Last 20 historical round data points for the chart */
  history: RoundPoint[]
  /** Whether any price data has been received */
  hasData: boolean
  /** Error from the latest read */
  error: string | null
  /** True while the first fetch is in flight */
  loading: boolean
}

const EMPTY_STATE: OracleState = {
  price:                 null,
  roundId:               null,
  updatedAt:             null,
  secondsAgo:            null,
  isStale:               false,
  circuitBreakerTripped: false,
  paused:                false,
  maxStaleness:          null,
  deviationThresholdBps: null,
  circuitBreakerBps:     null,
  reporter:              null,
  history:               [],
  hasData:               false,
  error:                 null,
  loading:               true,
}

// Typed contract call descriptors for useReadContracts
const CONTRACTS = [
  { address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: 'latestRound'          } as const,
  { address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: 'circuitBreakerTripped'} as const,
  { address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: 'paused'               } as const,
  { address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: 'maxStaleness'         } as const,
  { address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: 'deviationThresholdBps'} as const,
  { address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: 'circuitBreakerBps'    } as const,
  { address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: 'reporter'             } as const,
] as const

export function useOracle(): OracleState {
  const [state, setState]   = useState<OracleState>(EMPTY_STATE)
  const [now, setNow]       = useState(() => Math.floor(Date.now() / 1000))
  const publicClient        = usePublicClient({ chainId: arcTestnet.id })

  // Tracks the last roundId for which history was fetched -- avoids redundant fetches
  const lastHistoryRound = useRef<bigint | null>(null)

  // Tick "now" every second -- ONLY for live "X seconds ago" display, not for chain refetch
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000)
    return () => clearInterval(id)
  }, [])

  // Poll governance + latest round id every 15 seconds via wagmi
  // useReadContracts refetchInterval handles the polling -- no duplicate setInterval needed
  const { data, isError, error } = useReadContracts({
    contracts: CONTRACTS,
    query: { refetchInterval: POLL_INTERVAL_MS, retry: 3 },
  })

  // FINDING 9: fetch history only when latestRoundId changes
  const fetchHistory = useCallback(
    async (latestRoundId: bigint): Promise<RoundPoint[]> => {
      if (!publicClient || latestRoundId === 0n) return []
      // Extract the aggregator counter from the lower 64 bits.
      // latestRound() returns phaseId<<64 | counter. History IDs must be
      // built as phaseId<<64 | n, not as raw integers from latestRoundId-19.
      const PHASE_MASK  = BigInt('0xFFFFFFFFFFFFFFFF')
      const phasePrefix = latestRoundId & ~PHASE_MASK          // upper bits (phaseId<<64)
      const counter     = latestRoundId &  PHASE_MASK          // lower 64 bits
      const startCount  = counter > 19n ? counter - 19n : 1n
      const ids: bigint[] = []
      for (let i = startCount; i <= counter; i++) ids.push(phasePrefix | i)

      const calls = ids.map((id) => ({
        address: CONTRACT_ADDRESS,
        abi:     ORACLE_ABI,
        functionName: 'getRoundData' as const,
        args:    [id] as const,
      }))

      try {
        const results = await publicClient.multicall({ contracts: calls })
        const points: RoundPoint[] = []
        results.forEach((r, idx) => {
          if (r.status === 'success') {
            const [, answer, , updatedAt] = r.result as [bigint, bigint, bigint, bigint, bigint]
            // Show aggregator counter (lower 64 bits), not the full encoded id
            const displayId = Number(ids[idx] & BigInt('0xFFFFFFFFFFFFFFFF'))
            points.push({
              roundId:   displayId,
              price:     Number(answer) / SCALE,
              updatedAt: Number(updatedAt),
            })
          }
        })
        return points
      } catch {
        return []
      }
    },
    [publicClient]
  )

  // Process useReadContracts data whenever it changes
  useEffect(() => {
    if (!data) return

    const [
      latestRoundRes,
      cbTrippedRes,
      pausedRes,
      maxStalenessRes,
      deviationRes,
      cbBpsRes,
      reporterRes,
    ] = data

    const latestRound     = latestRoundRes?.result
    const cbTripped       = cbTrippedRes?.result
    const contractPaused  = pausedRes?.result
    const maxStaleness    = maxStalenessRes?.result
    const deviationBps    = deviationRes?.result
    const cbBps           = cbBpsRes?.result
    const reporterAddr    = reporterRes?.result      as string  | undefined

    const roundIdBig      = latestRound ?? 0n
    const maxStalenessNum = maxStaleness !== undefined ? Number(maxStaleness) : null

    // Extract aggregator counter from lower 64 bits (phaseId lives in upper bits)
    const aggregatorCounter = roundIdBig & BigInt('0xFFFFFFFFFFFFFFFF')

    if (isError) {
      const errMsg = (error as Error | null)?.message ?? 'Contract read failed'
      setState((prev) => ({ ...prev, loading: false, error: errMsg, hasData: false }))
      return
    }

    if (aggregatorCounter === 0n) {
      // Contract deployed but no rounds written yet
      setState((prev) => ({
        ...prev,
        loading:               false,
        hasData:               false,
        circuitBreakerTripped: cbTripped      ?? false,
        paused:                contractPaused ?? false,
        maxStaleness:          maxStalenessNum,
        deviationThresholdBps: deviationBps !== undefined ? Number(deviationBps) : null,
        circuitBreakerBps:     cbBps        !== undefined ? Number(cbBps)        : null,
        reporter:              reporterAddr  ?? null,
      }))
      return
    }

    void (async () => {
      try {
        // FINDING 10: use getRoundData(id) -- never latestRoundData().
        // getRoundData does NOT enforce staleness so a stale price still arrives here
        // and we show the stale badge instead of blanking the dashboard.
        const [roundResult, historyPoints] = await Promise.all([
          publicClient?.readContract({
            address:      CONTRACT_ADDRESS,
            abi:          ORACLE_ABI,
            functionName: 'getRoundData',
            args:         [roundIdBig],
          }),
          // FINDING 9: only fetch history when roundId actually changed
          lastHistoryRound.current !== roundIdBig
            ? fetchHistory(roundIdBig)
            : Promise.resolve<RoundPoint[] | null>(null),
        ])

        if (!roundResult) return

        const [rid, answer, , updatedAt] = roundResult as [bigint, bigint, bigint, bigint, bigint]
        const updatedAtNum  = Number(updatedAt)
        const priceNum      = Number(answer) / SCALE
        const stale         = maxStalenessNum !== null && (Math.floor(Date.now() / 1000) - updatedAtNum) > maxStalenessNum
        // Display the aggregator counter, not the full phaseId-encoded roundId
        const displayRoundId = Number(BigInt(rid) & BigInt('0xFFFFFFFFFFFFFFFF'))

        setState((prev) => ({
          price:                 priceNum,
          roundId:               displayRoundId,
          updatedAt:             updatedAtNum,
          secondsAgo:            Math.floor(Date.now() / 1000) - updatedAtNum,
          isStale:               stale,
          circuitBreakerTripped: cbTripped      ?? false,
          paused:                contractPaused ?? false,
          maxStaleness:          maxStalenessNum,
          deviationThresholdBps: deviationBps !== undefined ? Number(deviationBps) : null,
          circuitBreakerBps:     cbBps        !== undefined ? Number(cbBps)        : null,
          reporter:              reporterAddr  ?? null,
          // Only replace history when it was actually fetched this cycle
          history:               historyPoints !== null ? historyPoints : prev.history,
          hasData:               true,
          error:                 null,
          loading:               false,
        }))

        if (historyPoints !== null) {
          lastHistoryRound.current = roundIdBig
        }
      } catch (e) {
        const msg      = (e as Error).message ?? 'Unknown error'
        setState((prev) => ({ ...prev, loading: false, error: msg }))
      }
    })()
  // Only react to new data from the chain read, not to the "now" clock
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isError, error])

  // Update secondsAgo and isStale every second from the local clock -- no chain call
  useEffect(() => {
    if (state.updatedAt !== null) {
      setState((prev) => ({
        ...prev,
        secondsAgo: now - (prev.updatedAt ?? now),
        isStale:    prev.maxStaleness !== null && (now - (prev.updatedAt ?? 0)) > prev.maxStaleness,
      }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now])

  return state
}
