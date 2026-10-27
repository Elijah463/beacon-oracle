# BEACON Oracle -- Agent Notes

## Deployed Contracts (Arc Testnet)

### LIVE CONTRACT (owner-controlled, use this one)
| Field | Value |
|---|---|
| Proxy address | `0x8A9bC80E846125ABA50B8936fD47cdB7cBc44797` |
| Implementation | `0xe0e4894106B1e517752515D40601ec890262e0ea` |
| Owner wallet | `0xBA29b16Adbf5F1D7dD2CeD98fE57189388c65B76` |
| Reporter signing address | `0xdCF40c61Cc7A1D9A9C7F90f0be80A05797757d7b` |
| Deployed via | `forge script contracts/script/DeployBeacon.s.sol` |
| Explorer | https://explorer.testnet.arc.io/address/0x8A9bC80E846125ABA50B8936fD47cdB7cBc44797 |
| Network | Arc Testnet (chainId 5042002) |
| Contract version | v6 (UUPS upgradeable, phaseId encoding, ECDSA signature verification, typeAndVersion) |

### Previous deployments (Circle SCP deployer -- owner is Circle wallet, not usable for governance)
| Address | Notes |
|---|---|
| `0x69f5716e6453e2a43910f6cfea06500056fcf5e6` | v6 implementation only (no proxy) |
| `0xfacb599c862322229a1861df76a7fbf26ebf9f55` | v5 |
| `0x5147ebbc5d7124a27325a0ea04f6b552410ec90d` | v4 |
| `0x0135d528f94f861118d4bf7e885c836a1763bce4` | v3 |
| `0xdacfdb464393bfa6e34e442f9a5775971fdc7607` | v2 |
| `0xb83c7df0d7aae3c5b80d6c9cbda669f2fc53ab46` | v1 |

## Wallet Roles
| Role | Address | Has private key? |
|---|---|---|
| Owner (governance) | `0xBA29b16Adbf5F1D7dD2CeD98fE57189388c65B76` | Yes -- OWNER_PRIVATE_KEY in .env |
| Reporter signing key | `0xdCF40c61Cc7A1D9A9C7F90f0be80A05797757d7b` | Yes -- REPORTER_SIGNING_KEY in .env |
| Circle reporter wallet | Set after setup-reporter-wallet.ts | Yes -- managed by Circle SDK |

## Architecture
- Off-chain reporter (scripts/reporter.ts) fetches USDC/USD (5 CEX sources) and NGN/USD (3 server-friendly sources: CoinGecko USDT/NGN live, ExchangeRate-API cached 24h, CurrencyAPI cached 1h)
- Derives USDC/NGN = median(USDC/USD) x median(NGN/USD) using BigInt arithmetic
- Signs the payload with REPORTER_SIGNING_KEY, submits via Circle developer-controlled wallet
- Contract verifies ECDSA signature on-chain before writing each round
- Chainlink AggregatorV3Interface compatible: latestRoundData(), getRoundData(), quoteUSDCToNGN(), quoteNGNToUSDC()
- UUPS upgradeable: owner calls upgradeToAndCall() to upgrade implementation
- phaseId increments on every upgrade -- encoded in upper 16 bits of roundId
- Circuit breaker: trips if single update moves price >10%, freezes feed until owner resets

## Key Commands
```bash
# Check current reporter
cast call 0x8A9bC80E846125ABA50B8936fD47cdB7cBc44797 "reporter()(address)" --rpc-url https://rpc.testnet.arc.io

# Check circuit breaker
cast call 0x8A9bC80E846125ABA50B8936fD47cdB7cBc44797 "circuitBreakerTripped()(bool)" --rpc-url https://rpc.testnet.arc.io

# Check latest round
cast call 0x8A9bC80E846125ABA50B8936fD47cdB7cBc44797 "latestRound()(uint256)" --rpc-url https://rpc.testnet.arc.io

# Reset circuit breaker (owner only)
cast send 0x8A9bC80E846125ABA50B8936fD47cdB7cBc44797 "resetCircuitBreaker()" --private-key $OWNER_PRIVATE_KEY --rpc-url https://rpc.testnet.arc.io

# Set reporter signing address (owner only)
cast send 0x8A9bC80E846125ABA50B8936fD47cdB7cBc44797 "setReporter(address)" <NEW_ADDRESS> --private-key $OWNER_PRIVATE_KEY --rpc-url https://rpc.testnet.arc.io

# Upgrade implementation (owner only)
cast send 0x8A9bC80E846125ABA50B8936fD47cdB7cBc44797 "upgradeToAndCall(address,bytes)" <NEW_IMPL> 0x --private-key $OWNER_PRIVATE_KEY --rpc-url https://rpc.testnet.arc.io
```
