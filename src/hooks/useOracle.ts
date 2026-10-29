/**
 * useOracle.ts
 * Reads the deployed USDCNGNOracle proxy every 15 seconds using direct
 * publicClient.readContract calls -- no multicall, no wagmi useReadContracts.
 * Arc Testnet's Multicall3 deployment reverts, so every batched call must be
 * replaced with individual eth_call requests.
 *
 * PhaseId encoding: latestRound() returns (phaseId << 64) | aggregatorCounter.
 * All round-ID arithmetic uses the lower 64 bits for the human-visible counter
 * and reconstructs full encoded IDs as (phasePrefix | n) for contract calls.
 */

import { usePublicClient } from 'wagmi'
import { useEffect, useState, useCallback, useRef } from 'react'
import { arcTestnet } from 'viem/chains'
import { ORACLE_ABI } from '@/lib/oracleAbi'

const CONTRACT_ADDRESS   = import.meta.env.VITE_ORACLE_CONTRACT_ADDRESS as `0x${string}`
const ORACLE_DECIMALS    = 8
const SCALE              = 10 ** ORACLE_DECIMALS
const POLL_INTERVAL_MS   = 15_000
const PHASE_MASK         = BigInt('0xFFFFFFFFFFFFFFFF')

export interface RoundPoint {
  roundId:   number   // human counter (lower 64 bits of encoded id)
  price:     number   // human-readable NGN per USDC
  updatedAt: number   // unix seconds
}

export interface OracleState {
  price:                 number | null
  roundId:               number | null
  updatedAt:             number | null
  secondsAgo:            number | null
  isStale:               boolean
  circuitBreakerTripped: boolean
  paused:                boolean
  maxStaleness:          number | null
  deviationThresholdBps: number | null
  circuitBreakerBps:     number | null
  reporter:              string | null
  history:               RoundPoint[]
  hasData:               boolean
  error:                 string | null
  loading:               boolean
}

const EMPTY: OracleState = {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { readContract: (opts: any) => Promise<any> }

function read<T>(client: AnyClient, functionName: string, args?: unknown[]): Promise<T> {
  return client.readContract({
    address:      CONTRACT_ADDRESS,
    abi:          ORACLE_ABI,
    functionName,
    args:         args ?? [],
  }) as Promise<T>
}

export function useOracle(): OracleState {
  const [state, setState]     = useState<OracleState>(EMPTY)
  const [now, setNow]         = useState(() => Math.floor(Date.now() / 1000))
  const publicClient          = usePublicClient({ chainId: arcTestnet.id })
  const lastHistoryRound      = useRef<bigint | null>(null)
  const isFetchingRef         = useRef(false)

  // Tick secondsAgo every second -- no chain call
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000)
    return () => clearInterval(id)
  }, [])

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

  const fetchHistory = useCallback(
    async (encodedLatest: bigint): Promise<RoundPoint[]> => {
      if (!publicClient) return []
      const phasePrefix = encodedLatest & ~PHASE_MASK
      const counter     = encodedLatest &  PHASE_MASK
      // Fetch all rounds up to 200; beyond that start from (counter - 199)
      const startCount  = counter > 199n ? counter - 199n : 1n
      const ids: bigint[] = []
      for (let i = startCount; i <= counter; i++) ids.push(phasePrefix | i)

      const results = await Promise.allSettled(
        ids.map((id) =>
          publicClient.readContract({
            address:      CONTRACT_ADDRESS,
            abi:          ORACLE_ABI,
            functionName: 'getRoundData',
            args:         [id],
          })
        )
      )
      const points: RoundPoint[] = []
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          const [, answer, , updatedAt] = r.value as [bigint, bigint, bigint, bigint, bigint]
          points.push({
            roundId:   Number(ids[idx] & PHASE_MASK),
            price:     Number(answer) / SCALE,
            updatedAt: Number(updatedAt),
          })
        }
      })
      return points
    },
    [publicClient]
  )

  const poll = useCallback(async () => {
    if (!publicClient || isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      // Fire all 7 governance reads in parallel -- individual eth_calls, no multicall
      const [
        encodedRoundId,
        cbTripped,
        isPaused,
        maxStaleness,
        deviationBps,
        cbBps,
        reporterAddr,
      ] = await Promise.all([
        read<bigint>(publicClient, 'latestRound'),
        read<boolean>(publicClient, 'circuitBreakerTripped'),
        read<boolean>(publicClient, 'paused'),
        read<bigint>(publicClient, 'maxStaleness'),
        read<bigint>(publicClient, 'deviationThresholdBps'),
        read<bigint>(publicClient, 'circuitBreakerBps'),
        read<string>(publicClient, 'reporter'),
      ])

      const maxStalenessNum = Number(maxStaleness)
      const counter         = encodedRoundId & PHASE_MASK

      if (counter === 0n) {
        // No rounds written yet -- show governance values but no price
        setState((prev) => ({
          ...prev,
          loading:               false,
          hasData:               false,
          circuitBreakerTripped: cbTripped,
          paused:                isPaused,
          maxStaleness:          maxStalenessNum,
          deviationThresholdBps: Number(deviationBps),
          circuitBreakerBps:     Number(cbBps),
          reporter:              reporterAddr,
          error:                 null,
        }))
        return
      }

      // Fetch current round + history in parallel
      const [roundRaw, historyPoints] = await Promise.all([
        publicClient.readContract({
          address:      CONTRACT_ADDRESS,
          abi:          ORACLE_ABI,
          functionName: 'getRoundData',
          args:         [encodedRoundId],
        }) as Promise<[bigint, bigint, bigint, bigint, bigint]>,
        lastHistoryRound.current !== encodedRoundId
          ? fetchHistory(encodedRoundId)
          : Promise.resolve<RoundPoint[] | null>(null),
      ])

      const [, answer, , updatedAt] = roundRaw
      const updatedAtNum = Number(updatedAt)
      const priceNum     = Number(answer) / SCALE
      const stale        = (Math.floor(Date.now() / 1000) - updatedAtNum) > maxStalenessNum

      if (historyPoints !== null) lastHistoryRound.current = encodedRoundId

      setState((prev) => ({
        price:                 priceNum,
        roundId:               Number(counter),
        updatedAt:             updatedAtNum,
        secondsAgo:            Math.floor(Date.now() / 1000) - updatedAtNum,
        isStale:               stale,
        circuitBreakerTripped: cbTripped,
        paused:                isPaused,
        maxStaleness:          maxStalenessNum,
        deviationThresholdBps: Number(deviationBps),
        circuitBreakerBps:     Number(cbBps),
        reporter:              reporterAddr,
        history:               historyPoints !== null ? historyPoints : prev.history,
        hasData:               true,
        error:                 null,
        loading:               false,
      }))
    } catch (e) {
      const msg = (e as Error).message ?? 'Contract read failed'
      setState((prev) => ({ ...prev, loading: false, error: msg }))
    } finally {
      isFetchingRef.current = false
    }
  }, [publicClient, fetchHistory])

  // Initial fetch + polling interval
  useEffect(() => {
    void poll()
    const id = setInterval(() => void poll(), POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [poll])

  return state
}
