# BEACON Oracle -- Project Memory

## Latest Deployed Contract

| Version | Address | Network | Deployed |
|---|---|---|---|
| v5 (current) | `0xfacb599c862322229a1861df76a7fbf26ebf9f55` | Arc Testnet | 2026-10-21 |
| v4 | `0x5147ebbc5d7124a27325a0ea04f6b552410ec90d` | Arc Testnet | 2026-10-21 |
| v3 | `0x0135d528f94f861118d4bf7e885c836a1763bce4` | Arc Testnet | 2026-10-19 |
| v2 | `0xdacfdb464393bfa6e34e442f9a5775971fdc7607` | Arc Testnet | 2026-10-19 |
| v1 | `0xb83c7df0d7aae3c5b80d6c9cbda669f2fc53ab46` | Arc Testnet | 2026-10-19 |

Explorer: https://explorer.testnet.arc.io/address/0xfacb599c862322229a1861df76a7fbf26ebf9f55

## Architecture

- **Contract**: UUPS upgradeable USDCNGNOracle (Chainlink AggregatorV3Interface compatible)
- **Reporter**: Circle developer-controlled wallet, 30s cycle, 0.2% deviation gate, 1hr heartbeat
- **Price legs**: USDC/USD (Coinbase, Binance, OKX, Bitget, Bybit) x NGN/USDT P2P (Binance P2P, Quidax, Bybit P2P, Bitget P2P)
- **Frontend**: React + wagmi, Arc Testnet, BEACON brand (#00D66F / Cloud White)

## Security Model

- Heartbeat staleness guard (1hr default, reverts stale reads)
- 0.2% off-chain deviation gate (reporter skips gas)
- On-chain circuit breaker (trips and returns on >circuitBreakerBps move, owner resets)
- Ownable2Step (two-step ownership transfer)
- renounceOwnership() blocked permanently
- UUPS upgradeable (owner only)
- MIN_STALENESS = 60s floor

## Contract Parameters (defaults)

| Parameter | Default | Description |
|---|---|---|
| maxStaleness | 3600s | Reads revert after 1 hour |
| deviationThresholdBps | 50 (0.5%) | Off-chain skip hint |
| circuitBreakerBps | 1000 (10%) | On-chain breaker threshold |

## Key Files

- `contracts/USDCNGNOracle.sol` -- upgradeable oracle implementation
- `scripts/reporter.ts` -- off-chain reporter loop
- `scripts/price-sources.ts` -- all 9 price source fetchers
- `scripts/setup-reporter-wallet.ts` -- Circle wallet setup (run once)
- `src/hooks/useOracle.ts` -- wagmi polling hook
- `src/lib/oracleAbi.ts` -- contract ABI
- `ENV.example` -- all required environment variables
- `GUIDE.md` -- full setup and operation guide
