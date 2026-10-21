# BEACON Oracle

**BEACON** is a production-grade, upgradeable USDC/NGN price oracle built on Arc Testnet.

It derives the real-time value of 1 USDC in Nigerian Naira by independently aggregating spot prices from multiple off-chain sources and publishing them on-chain through a Chainlink-compatible smart contract. External contracts can query live prices or request computed conversion quotes directly from the oracle.

---

## Architecture

```
Off-chain Reporter (Node/Bun)
      |
      |-- Fetches USDC/USD from 3 independent spot price sources
      |-- Fetches USD/NGN from 2 independent FX sources (1-hour cache)
      |-- Computes median of each leg independently
      |-- Applies outlier rejection (median-distance filter)
      |-- Checks deviation vs last on-chain price (50 bps threshold)
      |-- Clamps timestamp to latest on-chain block
      |
      v
USDCNGNOracle.sol (Arc Testnet)
      |
      |-- Stores up to 100 rounds in a circular buffer
      |-- Chainlink AggregatorV3Interface compatible
      |-- Circuit breaker: freezes on single update > 10% deviation
      |-- Staleness guard: reverts reads older than maxStaleness (1 hour)
      |-- Ownable2Step: two-step ownership transfer
      |-- UUPS upgradeable: implementation can be replaced without changing address
      |
      v
Consumer Contracts / Dashboard
      |-- latestRoundData()       -- Chainlink-compatible latest price
      |-- getRoundData(roundId)   -- Historical round (no staleness revert)
      |-- quoteUSDCToNGN(amount)  -- On-chain conversion: USDC to NGN
      |-- quoteNGNToUSDC(amount)  -- On-chain conversion: NGN to USDC
      |-- latestQuoteMetadata()   -- Round ID, price, age for auditability
```

---

## Price Derivation Formula

```
USDC/NGN = median(USDC/USD sources) x median(USD/NGN sources)
```

Both legs are fetched and validated independently. If USDC trades below $1.00 (e.g. during a depeg), the NGN rate reflects the real market price rather than assuming a 1:1 peg.

**Price storage:** `int256` with 8 decimal places (Chainlink convention).
Example: 1 USDC = 1,620.50 NGN stored as `162050000000`.

---

## Smart Contract

**Network:** Arc Testnet
**Address:** `0x5147ebbc5d7124a27325a0ea04f6b552410ec90d`
**Explorer:** https://explorer.testnet.arc.io/address/0x5147ebbc5d7124a27325a0ea04f6b552410ec90d

### Key functions

| Function | Description |
|---|---|
| `latestRoundData()` | Latest price (reverts if stale). Chainlink-compatible. |
| `getRoundData(roundId)` | Historical round data. No staleness revert. |
| `latestAnswer()` | Single int256 price value. |
| `quoteUSDCToNGN(usdcAmount)` | Convert USDC atomic units to NGN atomic units. |
| `quoteNGNToUSDC(ngnAmount)` | Convert NGN atomic units to USDC atomic units. |
| `latestQuoteMetadata()` | Round ID, price, timestamp, age for the current quote. |
| `transmit(answer, timestamp)` | Reporter-only: submit a new price round. |
| `resetCircuitBreakerAndPublish(answer, timestamp)` | Owner: accept a verified large move. |
| `decimals()` | Returns 8. |
| `description()` | Returns "USDC / NGN". |

### Security model

| Layer | Mechanism |
|---|---|
| Heartbeat | Reads revert if price older than `maxStaleness` (default 1 hour) |
| Deviation threshold | Reporter skips submission if change is below 50 bps (0.5%) |
| Circuit breaker | Contract freezes if any single update moves price more than 10% |
| Timestamp ordering | New timestamp must be strictly greater than previous round |
| Staleness floor | `maxStaleness` cannot be set below 60 seconds |
| Ownership | Ownable2Step -- transfer requires explicit acceptance by new owner |
| Renounce blocked | `renounceOwnership()` always reverts |
| Upgrades | UUPS -- only owner can authorize an implementation upgrade |

---

## Repository Structure

```
beacon-oracle/
  contracts/
    USDCNGNOracle.sol       # Core oracle contract (UUPS upgradeable)
  scripts/
    price-sources.ts        # Per-source fetch functions + aggregation utilities
    reporter.ts             # Off-chain reporter loop (Circle developer-controlled wallet)
    setup-reporter-wallet.ts # One-time wallet setup via Circle SDK
  src/
    components/             # React UI components
      LandingPage.tsx       # Marketing landing page
      OracleDashboard.tsx   # Live oracle dashboard
      RateCard.tsx          # Price display with flash animation
      PriceChart.tsx        # Recharts area line chart
      QuoteCalculator.tsx   # On-chain USDC/NGN converter
      CircuitBreakerBanner.tsx
      OracleStats.tsx
      ReporterInfo.tsx
    hooks/
      useOracle.ts          # wagmi hook: polls contract every 15s
      useLerpedNumber.ts    # Smooth number animation
    lib/
      oracleAbi.ts          # Full contract ABI
  public/                   # Static assets (add beacon-logo.png here)
  GUIDE.md                  # Full setup and operations runbook
  ENV.example               # All required environment variables documented
```

---

## Quick Start

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

Copy `ENV.example` and fill in your values:

```bash
cp ENV.example .env
# Edit .env with your credentials
```

See `ENV.example` for all required variables. See `GUIDE.md` for how to obtain each one.

### 3. Run the frontend

```bash
bun run dev
```

Open http://localhost:5173

### 4. Set up the reporter wallet (once)

Add `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` to `.env`, then:

```bash
bun run scripts/setup-reporter-wallet.ts
```

This creates a Circle developer-controlled wallet, prints the wallet ID and address, and tells you what to do next (fund it, call `setReporter()`, start the loop).

### 5. Start the reporter

```bash
bun run scripts/reporter.ts
```

The reporter fetches prices from external sources, derives the USDC/NGN rate, checks deviation against the on-chain value, and calls `transmit()` via a Circle developer-controlled wallet every ~60 seconds.

---

## Deployment

### Frontend (Vercel)

Connect the `beacon-oracle` repo to Vercel. Add one environment variable:

| Variable | Value |
|---|---|
| `VITE_ORACLE_ADDRESS` | `0x5147ebbc5d7124a27325a0ea04f6b552410ec90d` |

Framework preset: **Vite**.

### Reporter (Railway / Render / VPS)

The reporter is a long-running process and cannot run on Vercel. Deploy it as a background worker on Railway, Render, Fly.io, or any Linux server. Set all variables from `ENV.example` in that environment.

---

## Contract Integration

To consume the oracle from another contract on Arc Testnet:

```solidity
interface IBeaconOracle {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
    function quoteUSDCToNGN(uint256 usdcAmount) external view returns (uint256 ngnAmount);
    function quoteNGNToUSDC(uint256 ngnAmount) external view returns (uint256 usdcAmount);
}

contract MyContract {
    IBeaconOracle constant oracle = IBeaconOracle(0x5147ebbc5d7124a27325a0ea04f6b552410ec90d);

    function getUsdcNgnRate() external view returns (int256) {
        (, int256 answer,,,) = oracle.latestRoundData();
        return answer; // 8 decimal places
    }

    // Convert 500 USDC to NGN
    function convert500USDC() external view returns (uint256) {
        return oracle.quoteUSDCToNGN(500 * 1e6); // USDC has 6 decimals
    }
}
```

---

## Upgrading the Contract

BEACON uses UUPS proxy pattern. To deploy a new implementation:

1. Write and deploy the new implementation contract
2. Call `upgradeToAndCall(newImplementation, "")` from the owner wallet
3. The proxy address stays the same -- all consumers are unaffected

---

## License

MIT
