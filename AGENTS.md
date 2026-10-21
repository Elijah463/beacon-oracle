# BEACON -- Project Memory

## App Name
BEACON -- USDC/NGN On-Chain Oracle

## Deployed Contracts

### USDCNGNOracle (v4 -- CURRENT -- UUPS Upgradeable, all 17 audit findings fixed)
- Network: Arc Testnet
- Address: `0x5147ebbc5d7124a27325a0ea04f6b552410ec90d`
- Explorer: https://explorer.testnet.arc.io/address/0x5147ebbc5d7124a27325a0ea04f6b552410ec90d
- Tx Hash: `0x0d58e4133d23318d287fe3f8bdda95421d98f0532264fc595e726cf8991fa1af`
- Deployed: 2026-10-20
- Fixes vs v3: circuit breaker returns (not reverts) so flag persists; renounceOwnership blocked; InvalidStaleness error; zero-staleness + zero-breaker + breaker<=deviation all rejected; resetCircuitBreakerAndPublish added; timestamp strictly increasing; window 1x not 2x

### USDCNGNOracle (v3 -- superseded)
- Address: `0x0135d528f94f861118d4bf7e885c836a1763bce4`

### USDCNGNOracle (v2 -- superseded)
- Address: `0xdacfdb464393bfa6e34e442f9a5775971fdc7607`

### USDCNGNOracle (v1 -- superseded)
- Address: `0xb83c7df0d7aae3c5b80d6c9cbda669f2fc53ab46`

## Key Env Variables
- `VITE_ORACLE_CONTRACT_ADDRESS` -- set to v4 address above
- `REPORTER_PRIVATE_KEY` -- private key of the reporter wallet
- `EXCHANGE_RATE_API_KEY` -- from https://www.exchangerate-api.com/
- `OPEN_EXCHANGE_RATES_APP_ID` -- optional fallback from https://openexchangerates.org/

## Brand
- Name: BEACON
- Primary color: #00D66F
- Background: #F5F7FA (Cloud White)
- Logo: BeaconLogo.tsx (lighthouse SVG in speech-bubble circle)

## Architecture
- Price feed: median(USDC/USD from Binance+Coinbase+Kraken) x median(USD/NGN from ExchangeRate-API+OpenExchangeRates)
- Quorum: 2 USDC/USD sources, 2 USD/NGN sources minimum
- Outlier rejection: median-distance filter (2% for stablecoins, 5% for FX)
- On-chain interface: Chainlink AggregatorV3Interface compatible
- Price stored as int256 with 8 decimals
- Quote functions: 6 USDC decimals, 2 NGN decimals (kobo precision)
- Circular buffer: last 100 rounds (slot = roundId % 100)
- FX cache: 1 hour TTL (24 calls/day, within free tier)
- Reporter loop: strictly serialized, jittered backoff, BigInt arithmetic
- Heartbeat: min(1800s, maxStaleness/2)
- UUPS upgrade: deploy new impl, call upgradeToAndCall(newImpl, "")
- Multi-node upgrade: call setReporter(coordinatorAddress)
