# NairaOracle — Complete Build Guide

USDC/NGN on-chain price oracle deployed on Arc Testnet.
Chainlink AggregatorV3Interface compatible. Circuit breaker + heartbeat + deviation threshold built in.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Contract Reference](#2-contract-reference)
3. [Getting Your API Keys](#3-getting-your-api-keys)
4. [Environment Setup](#4-environment-setup)
5. [Running the Reporter](#5-running-the-reporter)
6. [Dashboard UI](#6-dashboard-ui)
7. [Governance (Owner Functions)](#7-governance-owner-functions)
8. [Expanding to Multi-Node](#8-expanding-to-multi-node)
9. [Deployed Addresses](#9-deployed-addresses)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Architecture Overview

```
CEX APIs (USDC/USD)          FX APIs (USD/NGN)
  Binance  ──┐                  CBN ──────────┐
  Coinbase ──┤ median()          ExchRate-API ─┤ median()
  Kraken   ──┘                  OpenExchRates ─┘
               \                   /
                v                 v
              usdcUsd   x   usdNgn
                         |
                    derivedPrice
                         |
              deviation check (off-chain)
                         |
              transmit(price, timestamp)
                         |
              USDCNGNOracle.sol (Arc Testnet)
                         |
              ┌──────────┴──────────┐
              latestRoundData()   getRoundData(id)
              (Chainlink compatible)
```

**Price derivation:** USDC/NGN = median(USDC/USD sources) x median(USD/NGN sources)

This correctly handles USDC depegs. If USDC trades at $0.9950, the NGN rate reflects that rather than assuming a $1 peg.

**Security layers:**
- Off-chain deviation threshold: reporter skips submitting if price moved less than 0.5% (saves gas)
- On-chain circuit breaker: contract REJECTS any update that moves price more than 10% in one round and trips a freeze flag
- On-chain heartbeat: `latestRoundData()` reverts with `StalePrice` if no update has arrived within 1 hour

---

## 2. Contract Reference

**Contract:** `USDCNGNOracle.sol`
**Network:** Arc Testnet (chain ID 5042002)
**Address:** `0xb83c7df0d7aae3c5b80d6c9cbda669f2fc53ab46`
**Explorer:** https://explorer.testnet.arc.io/address/0xb83c7df0d7aae3c5b80d6c9cbda669f2fc53ab46

### Read Functions

| Function | Returns | Notes |
|---|---|---|
| `latestRoundData()` | roundId, answer, startedAt, updatedAt, answeredInRound | Reverts if stale or paused. Chainlink compatible. |
| `getRoundData(uint80 id)` | same tuple | Returns historical rounds without staleness check |
| `latestAnswer()` | int256 | Price with 8 decimals, e.g. 160000000000 = 1600 NGN |
| `latestRound()` | uint256 | Current round counter |
| `decimals()` | uint8 (always 8) | Matches Chainlink convention |
| `description()` | string | "USDC / NGN" |
| `version()` | uint256 (always 1) | |
| `circuitBreakerTripped()` | bool | True when frozen |
| `paused()` | bool | True when owner has paused |
| `maxStaleness()` | uint256 | Max age in seconds before StalePrice revert |
| `deviationThresholdBps()` | uint256 | Off-chain hint in basis points |
| `circuitBreakerBps()` | uint256 | On-chain max deviation in basis points |
| `reporter()` | address | Current trusted reporter wallet |

### Price Decoding

```ts
// price is stored with 8 decimals
const SCALE = 1e8
const humanPrice = Number(answer) / SCALE
// e.g. 160000000000n / 1e8 = 1600.00 NGN per 1 USDC
```

### Write Functions (reporter only)

| Function | Who | Description |
|---|---|---|
| `transmit(int256 answer, uint256 timestamp)` | reporter wallet | Submits a new price round |

### Write Functions (owner only)

| Function | Description |
|---|---|
| `setReporter(address)` | Replace the reporter wallet (or set a coordinator contract for multi-node) |
| `setMaxStaleness(uint256)` | Change heartbeat window in seconds |
| `setDeviationThreshold(uint256 bps)` | Change off-chain deviation hint |
| `setCircuitBreakerBps(uint256 bps)` | Change on-chain max deviation before freeze |
| `resetCircuitBreaker()` | Unfreeze the oracle after a circuit breaker trip |
| `pause()` / `unpause()` | Emergency pause/unpause |
| `addConsumer(address)` / `removeConsumer(address)` | Manage authorized consumers |
| `setRequireConsumerAuthorization(bool)` | Toggle public vs restricted read access |

---

## 3. Getting Your API Keys

### USDC/USD Sources (no API key needed)

All three USDC/USD sources use free public REST endpoints. No signup required.

| Source | Endpoint | Notes |
|---|---|---|
| Binance | `https://api.binance.com/api/v3/ticker/price?symbol=USDCUSDT` | Free, no auth |
| Coinbase Exchange | `https://api.exchange.coinbase.com/products/USDC-USD/ticker` | Free, no auth |
| Kraken | `https://api.kraken.com/0/public/Ticker?pair=USDCUSD` | Free, no auth |

### USD/NGN Sources (free API keys)

**ExchangeRate-API** (recommended primary fallback):
1. Go to https://www.exchangerate-api.com/
2. Click "Get Free Key"
3. Sign up with email, verify, copy your API key
4. Free tier: 1,500 requests/month (25 requests/day)
5. Add to `.env`: `EXCHANGE_RATE_API_KEY=your_key_here`

**Open Exchange Rates** (optional secondary fallback):
1. Go to https://openexchangerates.org/signup/free
2. Create a free account
3. Copy your App ID from the dashboard
4. Free tier: 1,000 requests/month
5. Add to `.env`: `OPEN_EXCHANGE_RATES_APP_ID=your_app_id_here`

**CBN (Central Bank of Nigeria)** (no key needed):
- The CBN public data API is free and requires no authentication
- It provides the official government exchange rate (not necessarily the market rate)
- Endpoint: `https://data.cbn.gov.ng/api/ExchangeRates`
- Note: the CBN rate is the official/regulatory rate. For a market rate, use ExchangeRate-API as the primary NGN source.

---

## 4. Environment Setup

Copy the example and fill in your values:

```bash
# .env (already exists at project root)

# Reporter wallet private key -- KEEP SECRET, NEVER COMMIT
REPORTER_PRIVATE_KEY=0x...your_private_key_here...

# Oracle contract address (already set by Arc Studio)
VITE_ORACLE_CONTRACT_ADDRESS=0xb83c7df0d7aae3c5b80d6c9cbda669f2fc53ab46

# ExchangeRate-API key (get free key at exchangerate-api.com)
EXCHANGE_RATE_API_KEY=your_key_here

# Open Exchange Rates App ID (optional, get free at openexchangerates.org)
OPEN_EXCHANGE_RATES_APP_ID=your_app_id_here

# Reporter tuning (optional -- these are the defaults)
REPORTER_LOOP_INTERVAL_MS=60000       # how often to run a price check (ms)
REPORTER_HEARTBEAT_SECS=3600          # force submit even if below threshold (seconds)
```

Security rules:
- NEVER commit `.env` to git. It is already in `.gitignore`.
- NEVER share your `REPORTER_PRIVATE_KEY` in chat, logs, or code.
- The reporter wallet only needs enough USDC on Arc Testnet to pay gas. Fund it from the Arc Studio "Get test USDC" button in the sidebar.

---

## 5. Running the Reporter

### One-shot (test that it works)

```bash
bun run scripts/reporter.ts
```

This runs one full cycle: fetches all sources, computes the price, and either submits to the contract or logs why it skipped.

### Loop mode (production)

```bash
bun run scripts/reporter.ts --loop
```

Runs every 60 seconds (configurable via `REPORTER_LOOP_INTERVAL_MS`). Keep this running as a background process or deploy it as a cron job / systemd service.

### What the reporter logs

```
[2026-10-19T12:00:00.000Z] Reporter cycle starting
  Reporter wallet : 0xabc...
  Oracle contract : 0xb83c7df0d7aae3c5b80d6c9cbda669f2fc53ab46
  Current on-chain price: 1624.0000 USDC/NGN (raw: 162400000000)
  Deviation threshold: 50 bps

  Fetching USDC/USD...
  [OK] Binance:  0.99980000
  [OK] Coinbase: 0.99990000
  [OK] Kraken:   0.99985000
  USDC/USD median: 0.99985000

  Fetching USD/NGN...
  [OK] CBN:              1625.0000
  [OK] ExchangeRate-API: 1623.5000
  USD/NGN median: 1624.2500

  Derived USDC/NGN: 1623.9337
  Deviation from on-chain: 3.20 bps (threshold: 50 bps)
  Below deviation threshold -- skipping on-chain write
  [SKIP] No on-chain write needed this cycle
```

### Keeping the reporter alive (PM2 example)

```bash
# Install pm2 globally
npm install -g pm2

# Start reporter in loop mode
pm2 start --name naira-oracle-reporter "bun run /home/user/app/scripts/reporter.ts -- --loop"

# Auto-restart on reboot
pm2 save
pm2 startup
```

---

## 6. Dashboard UI

The dashboard reads the oracle contract directly via wagmi `useReadContracts` on a 15-second polling interval. Nothing is simulated.

**Landing page:** Shows the oracle architecture, feature highlights, and a "Open Dashboard" button.

**Dashboard page:**
- **Rate Card** (top left): Live USDC/NGN price with lerped animation, percent change vs previous round, staleness indicator that turns red when the heartbeat window is exceeded
- **Price Chart** (top right): Liveline real-time line chart built from the last 20 on-chain rounds. Supports hover/scrub to see exact time and value.
- **Circuit Breaker Banner**: Green when healthy, red with instructions when tripped
- **Stats Grid**: Heartbeat window, deviation threshold, circuit breaker limit, total rounds -- all read live from contract
- **Round History Table**: Last 20 rounds with price, percent change, and timestamp
- **Oracle Info**: Contract and reporter addresses with Arc Testnet explorer links

To run the frontend:

```bash
bun run dev
```

Then open the preview in Arc Studio or navigate to http://localhost:5173.

---

## 7. Governance (Owner Functions)

The deployer wallet (`0x5B12Ce46C7194aD57d143bC22847224047b1Ef42`) owns the contract. Use `cast` (Foundry) or any wallet to call owner functions.

### Adjust heartbeat window

```bash
# Set to 2 hours (7200 seconds)
cast send 0xb83c7df0d7aae3c5b80d6c9cbda669f2fc53ab46 \
  "setMaxStaleness(uint256)" 7200 \
  --rpc-url https://rpc.testnet.arc.io \
  --private-key $OWNER_PRIVATE_KEY
```

### Adjust deviation threshold

```bash
# Set to 1% (100 bps)
cast send 0xb83c7df0d7aae3c5b80d6c9cbda669f2fc53ab46 \
  "setDeviationThreshold(uint256)" 100 \
  --rpc-url https://rpc.testnet.arc.io \
  --private-key $OWNER_PRIVATE_KEY
```

### Reset a tripped circuit breaker

```bash
cast send 0xb83c7df0d7aae3c5b80d6c9cbda669f2fc53ab46 \
  "resetCircuitBreaker()" \
  --rpc-url https://rpc.testnet.arc.io \
  --private-key $OWNER_PRIVATE_KEY
```

### Emergency pause

```bash
cast send 0xb83c7df0d7aae3c5b80d6c9cbda669f2fc53ab46 \
  "pause()" \
  --rpc-url https://rpc.testnet.arc.io \
  --private-key $OWNER_PRIVATE_KEY
```

### Replace the reporter wallet

```bash
cast send 0xb83c7df0d7aae3c5b80d6c9cbda669f2fc53ab46 \
  "setReporter(address)" 0xNEW_REPORTER_ADDRESS \
  --rpc-url https://rpc.testnet.arc.io \
  --private-key $OWNER_PRIVATE_KEY
```

---

## 8. Expanding to Multi-Node

The contract is built to upgrade from single-reporter to a decentralized network without redeployment. The upgrade path is:

**Step 1: Deploy a coordinator contract**

The coordinator collects price submissions from N independent reporter wallets, enforces a minimum quorum (e.g. 3 of 5 must submit within a time window), computes the on-chain median, and calls `USDCNGNOracle.transmit()` once per aggregation round.

**Step 2: Replace the reporter**

```bash
cast send 0xb83c7df0d7aae3c5b80d6c9cbda669f2fc53ab46 \
  "setReporter(address)" 0xCOORDINATOR_CONTRACT_ADDRESS \
  --rpc-url https://rpc.testnet.arc.io \
  --private-key $OWNER_PRIVATE_KEY
```

The aggregator contract never changes. Only the reporter address changes.

**Coordinator contract features to build:**
- `submitPrice(int256 price, uint256 timestamp)` -- called by each reporter node
- Minimum quorum: require at least N submissions within a window before aggregating
- On-chain median of submissions (not average -- more manipulation-resistant)
- Reporter allowlist managed by the coordinator owner
- Reward/slashing hooks for reporter incentives

**Adding more price sources:**
To add a new source (e.g. OKX, Bybit), add a new exported function to `scripts/price-sources.ts` following the same pattern, then add it to the appropriate `fetchAll()` array in `scripts/reporter.ts`. No contract changes needed.

---

## 9. Deployed Addresses

| Item | Value |
|---|---|
| Network | Arc Testnet (chain ID 5042002) |
| Contract | `0xb83c7df0d7aae3c5b80d6c9cbda669f2fc53ab46` |
| Explorer | https://explorer.testnet.arc.io/address/0xb83c7df0d7aae3c5b80d6c9cbda669f2fc53ab46 |
| Deploy tx | `0xaaa7d2ed1d609adf481991a745063512f917449c3993417ba7d06a4454a87b89` |
| USDC (Arc Testnet) | `0x3600000000000000000000000000000000000000` |
| RPC | `https://rpc.testnet.arc.io` |
| Decimals | 8 (price stored as int256 x 10^8) |

---

## 10. Troubleshooting

**Reporter logs "REPORTER_PRIVATE_KEY not set"**
Add `REPORTER_PRIVATE_KEY=0x...` to your `.env` file. Restart the reporter after editing `.env`.

**Reporter logs "CBN API error: 429"**
The CBN API is rate-limiting you. The reporter will still succeed using ExchangeRate-API as a fallback. Consider increasing `REPORTER_LOOP_INTERVAL_MS` to reduce call frequency.

**Reporter logs "Only 1/2 sources succeeded; need at least 2"**
Two USDC/USD sources failed simultaneously. Check your network connection and that Binance/Coinbase/Kraken are reachable. The `minRequired` threshold for USDC/USD is 2.

**Dashboard shows "Waiting for price rounds"**
The reporter has not submitted any rounds yet. Run `bun run scripts/reporter.ts` at least once. After 2 or more rounds the chart and history table will populate.

**Dashboard shows "StalePrice" error**
No price update has been submitted within the heartbeat window (default 1 hour). Start the reporter loop or manually run one cycle.

**Circuit breaker is tripped on the dashboard**
A submitted price moved more than 10% from the current price. This could indicate a data source returning a bad value or a genuine market event. Investigate the cause, then call `resetCircuitBreaker()` on the contract (see Governance section above).

**"Transaction reverted: CircuitBreakerActive()"**
The circuit breaker is tripped. The reporter will automatically detect this and skip submissions. Reset the breaker first.

**Frontend shows stale data / not updating**
The dashboard polls every 15 seconds. If data looks stuck, check the browser console for RPC errors. The Arc Testnet RPC at `https://rpc.testnet.arc.io` may occasionally be slow.

**"latestRoundData reverts with NoDataAvailable"**
No rounds have been submitted yet. The contract starts empty. Run the reporter at least once.
