# BEACON Oracle -- Agent Notes

## Latest Deployed Contract (v6)
- **Address:** `0x69f5716e6453e2a43910f6cfea06500056fcf5e6`
- **Network:** Arc Testnet
- **Explorer:** https://explorer.testnet.arc.io/address/0x69f5716e6453e2a43910f6cfea06500056fcf5e6
- **Pattern:** UUPS upgradeable proxy (implementation + ERC-1967 proxy)
- **Deployed:** 2026-10-25

## Deployment History
| Version | Address | What changed |
|---------|---------|-------------|
| v6 | `0x69f5716e6453e2a43910f6cfea06500056fcf5e6` | typeAndVersion(), phaseId roundId encoding, ECDSA signature verification on transmit() |
| v5 | `0xfacb599c862322229a1861df76a7fbf26ebf9f55` | Arc timestamp monotonicity fix, resetCircuitBreakerAndPublish timestamp guard |
| v4 | `0x5147ebbc5d7124a27325a0ea04f6b552410ec90d` | All 17 audit findings fixed |
| v3 | `0x0135d528f94f861118d4bf7e885c836a1763bce4` | BEACON rebrand, light theme, UUPS upgradeable |
| v2 | `0xdacfdb464393bfa6e34e442f9a5775971fdc7607` | Quote functions, Ownable2Step, MIN_STALENESS |
| v1 | `0xb83c7df0d7aae3c5b80d6c9cbda669f2fc53ab46` | Initial deploy |

## Architecture
- **Off-chain:** `scripts/reporter.ts` runs every 30s, fetches 9 price sources (5 USDC/USD CEX + 4 NGN/USDT P2P), derives median USDC/NGN, signs payload with REPORTER_SIGNING_KEY, submits via Circle developer-controlled wallet
- **On-chain:** `contracts/USDCNGNOracle.sol` -- Chainlink AggregatorV3Interface compatible, 100-slot circular buffer, ECDSA signature verification, phaseId-encoded roundIds, circuit breaker, UUPS upgradeable
- **Frontend:** React + wagmi dashboard on Arc Testnet, polls contract every 15s

## Key Decisions
- USDT used as USD proxy for NGN/USDT leg (realistic Nigerian P2P market price)
- Nigerian residential proxy (NGN_PROXY_URL) needed for P2P sources from non-Nigerian IPs
- REPORTER_SIGNING_KEY is separate from the Circle wallet -- signing key address is set as `reporter` on contract
- phaseId starts at 0, increments on every UUPS upgrade via _authorizeUpgrade()
- Circuit breaker: trips on >circuitBreakerBps move in one update, requires owner reset
