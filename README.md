# BEACON Oracle

**BEACON** is a production-grade, upgradeable USDC/NGN price oracle built on Arc Network.

It derives the real-time value of 1 USDC in Nigerian Naira by independently aggregating spot prices from multiple off-chain sources and publishing them on-chain through a Chainlink-compatible smart contract. External contracts can query live prices or request computed conversion quotes directly from the oracle.

---

## Architecture

```
Off-chain Reporter (Bun on Fly.io)
      |
      |-- Leg A: USDC/USD from 5 CEX spot sources (Coinbase, Binance, OKX, Bitget, Bybit)
      |-- Leg B: NGN/USD from 3 server-friendly sources (quorum 2):
      |     CoinGecko USDT/NGN  -- real-time, called every 30s cycle
      |     ExchangeRate-API    -- USD/NGN mid-market, cached 24h
      |     CurrencyAPI         -- USD/NGN aggregated, cached 1h
      |-- Computes median of each leg independently
      |-- Applies outlier rejection (10% median-distance filter)
      |-- Checks deviation vs last on-chain price (0.2% / 20 bps threshold)
      |-- Heartbeat: force-publish every 1h even if no deviation
      |
      v
USDCNGNOracle.sol (Arc Network)
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

**Network:** Arc Network
**Address:** `0xe0e4894106B1e517752515D40601ec890262e0ea` (ERC1967 proxy)
**Explorer:** https://explorer.arc.io/address/0xe0e4894106B1e517752515D40601ec890262e0ea

### Key functions

| Function | Description |
|---|---|
| `latestRoundData()` | Latest price (reverts if stale). Chainlink-compatible. |
| `getRoundData(roundId)` | Historical round data. No staleness revert. |
| `latestAnswer()` | Single int256 price value. |
| `quoteUSDCToNGN(usdcAmount)` | Convert USDC atomic units to NGN atomic units. |
| `quoteNGNToUSDC(ngnAmount)` | Convert NGN atomic units to USDC atomic units. |
| `latestQuoteMetadata()` | Round ID, price, timestamp, age for the current quote. |
| `transmit(answer, timestamp, signature)` | Reporter-only: submit a signed price round. |
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


## Contract Integration

To consume the oracle from another contract on Arc Network:

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


## Links

- [Live App](https://beacon-oracle.vercel.app)
- [Documentation](https://beacon-oracle.vercel.app/#/docs)
- [ArcScan Explorer](https://explorer.arc.io/address/0xe0e4894106B1e517752515D40601ec890262e0ea)
- [Twitter / X](https://x.com/Elijah463_)

## License

MIT
