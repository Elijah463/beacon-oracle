# USDC/NGN Oracle — Implementation Plan

## Summary
A Chainlink-style price oracle that derives a live USDC/NGN rate by combining CEX-sourced USDC/USD prices with FX API-sourced USD/NGN rates. A single trusted off-chain reporter node fetches, validates, and pushes price updates to a Solidity aggregator contract on Arc Testnet, enforcing heartbeat, deviation threshold, and circuit breaker guards. A live dashboard UI lets you inspect the current rate, data freshness, and reporter health.

---

## Architecture

**Blockchain:** Arc Testnet — USDC as native gas, EVM-compatible, sub-second finality.

**Price Derivation Formula:**
```
USDC/NGN = median(USDC/USD sources) × median(USD/NGN sources)

USDC/USD sources: Binance, Coinbase, Kraken REST spot feeds
USD/NGN sources:  CBN official API (primary) + ExchangeRate-API / OpenExchangeRates (fallback)
```
Each leg is fetched independently and its median taken before multiplication.

**Contract — `USDCNGNOracle.sol`:**
Chainlink-compatible aggregator with three security guards:
- **Heartbeat guard:** reverts `latestRoundData()` if price is older than `maxStaleness` seconds (default 3600s)
- **Deviation threshold:** reporter skips on-chain write if price moved less than `deviationThreshold` bps (default 50 bps = 0.5%)
- **Circuit breaker:** contract REVERTS `transmit()` if incoming price deviates more than `circuitBreakerBps` (default 1000 bps = 10%) from current price; emits `CircuitBreakerTripped`

Key functions:
- `transmit(int256 answer, uint256 timestamp)` — reporter-only, pushes a new round
- `latestRoundData()` — Chainlink-compatible (roundId, answer, startedAt, updatedAt, answeredInRound)
- `latestAnswer()` — single-value convenience getter
- `setMaxStaleness(uint256)`, `setDeviationThreshold(uint256)`, `setCircuitBreakerBps(uint256)` — owner governance
- `setReporter(address)` — owner replaces trusted reporter
- Events: `AnswerUpdated`, `CircuitBreakerTripped`, `ReporterChanged`

**Off-chain Reporter (`scripts/reporter.ts`):**
Bun script running on a ~60s loop:
1. Fetch USDC/USD from Binance, Coinbase, Kraken in parallel
2. Fetch USD/NGN from CBN API + fallback FX API in parallel
3. Take median of each leg independently
4. Multiply: `price = median(USDC/USD) × median(USD/NGN)`
5. Compare to last on-chain price — skip if below deviation threshold
6. Call `transmit()` if deviation exceeded or heartbeat interval elapsed
7. Log all fetched values, computed price, and submit/skip decision

**Frontend — React + Tailwind + wagmi:**
- Large current USDC/NGN rate card with % change
- Staleness indicator (turns red when stale)
- Circuit breaker status banner (green/red)
- Per-source reporter health table
- Round history sparkline (last 20 rounds)
- ConnectKit wallet connect (dashboard read-only without wallet)

---

## Files to Create / Modify

1. `contracts/USDCNGNOracle.sol` — Solidity aggregator: transmit, latestRoundData, heartbeat/deviation/circuit-breaker, owner governance, Chainlink-compatible interface
2. `scripts/reporter.ts` — Off-chain reporter loop: fetches 5 sources, computes derived price, deviation check, calls transmit()
3. `scripts/price-sources.ts` — Isolated fetch functions per API source (Binance, Coinbase, Kraken, CBN, fallback FX)
4. `src/App.tsx` — Root layout wired with wagmi/ConnectKit, mounts OracleDashboard
5. `src/components/OracleDashboard.tsx` — Main dashboard layout (rate card, staleness bar, circuit breaker banner, round history)
6. `src/components/RateCard.tsx` — Large USDC/NGN rate display with % change and staleness indicator
7. `src/components/SourceHealth.tsx` — Per-source reporter health table
8. `src/components/RoundHistory.tsx` — Sparkline chart of last 20 on-chain rounds
9. `src/hooks/useOracle.ts` — wagmi useReadContracts polling latestRoundData() and getRoundData() every 15 seconds
10. `src/lib/oracleAbi.ts` — ABI for USDCNGNOracle.sol as a wagmi-ready const
11. `src/config.ts` (modify) — Add deployed oracle contract address and Arc Testnet chain config
12. `.env` (modify) — Add REPORTER_PRIVATE_KEY, REPORTER_CONTRACT_ADDRESS, and any API keys

---

## Build Sequence

1. Write and deploy `USDCNGNOracle.sol` — balanced security review, deploy to Arc Testnet, record address
2. Write reporter scripts — `price-sources.ts` (per-source fetchers) then `reporter.ts` (aggregation loop + transmit)
3. Export ABI and wire config — generate `oracleAbi.ts` from compiled artifact, update `src/config.ts`
4. Build wagmi hook — `useOracle.ts` reads latestRoundData() and round history on 15s interval
5. Build UI components — RateCard, SourceHealth, RoundHistory, compose in OracleDashboard
6. Wire App.tsx — mount OracleDashboard with ConnectKit provider
7. Smoke test — run reporter script once manually to confirm transmit() hits chain and dashboard updates

---

## Done When

- [ ] `USDCNGNOracle.sol` compiles clean on Arc Testnet (Paris EVM) and is deployed
- [ ] `latestRoundData()` returns a Chainlink-compatible tuple
- [ ] Reporter script fetches all 5 sources, computes median-derived price, calls `transmit()` successfully
- [ ] Deviation threshold skips on-chain write when price change is below 0.5%
- [ ] Circuit breaker reverts a `transmit()` that moves price more than 10% in one update
- [ ] Staleness guard: `latestRoundData()` reverts when last update is older than 1 hour
- [ ] Dashboard shows current USDC/NGN rate, last update time, per-source health
- [ ] Staleness indicator turns red when price is older than heartbeat window
- [ ] Circuit breaker banner reflects correct contract state
- [ ] Round history sparkline renders last 20 rounds from on-chain data

---

## Design Notes

- CBN API can rate-limit anonymous calls — reporter always has two USD/NGN sources; one failure does not block an update
- Reporter private key lives in `.env` only — never in contract source or frontend code
- Contract's `setReporter()` means you can upgrade to a multi-node model later by pointing to a coordinator contract, without redeploying the aggregator
- Price is stored as an integer with a fixed decimal scale (e.g. 8 decimals, matching Chainlink convention) — 1 USDC = ~1600 NGN stored as 160000000000
