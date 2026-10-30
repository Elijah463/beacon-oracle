# BEACON Oracle -- Pre-Launch Security Review

Date: 2026-10-30  
Target chain: Arc Network mainnet (chainId 5042)  
Proxy: `0xe0e4894106B1e517752515D40601ec890262e0ea`

---

## Critical (fix before launch)

### C1 -- Deviation gate mismatch: reporter skips publishes the contract expects
`reporter.ts` has `DEVIATION_GATE_BPS = 20` (0.2%) hardcoded. The deployed contract has `deviationThresholdBps = 10` (0.1%). Result: price moves of 0.10–0.19% are ignored by the reporter even though the contract is configured to accept them. The oracle will be staler than intended for half the valid range.  
**Fix:** Read `deviationThresholdBps` from the contract at startup and use that value, or hardcode to 10.

### C2 -- Circuit breaker trip treated as successful publish
When a submission would move the price >50%, `transmit()` sets `circuitBreakerTripped = true` and returns (no revert). The Circle tx shows `COMPLETE`. The reporter then updates `lastPublishedAt` and `lastPublishedPrice` as if the round was written, but it was not. The reporter operates with wrong local state until the next cycle detects the breaker.  
**Fix:** After tx confirms, read `latestRound()` and verify it incremented. If it did not, the round was not stored -- log a loud alert, do not update local state.

### C3 -- No chainId in ECDSA payload (cross-chain replay)
`transmit()` signs `keccak256(abi.encodePacked(address(this), answer, timestamp, nextRound))`. No `block.chainid`. If BEACON is ever deployed at the same address on another chain (possible with Create2 or similar deployer), a valid signature from one chain can be replayed on the other.  
**Fix:** Add `block.chainid` to the signed payload in the contract and in `reporter.ts`.

---

## High

### H1 -- Front-run grief: any address can submit the reporter's signed payload first
`msg.sender` is not part of the signed payload and not checked on-chain. Anyone who sees the reporter's tx in the mempool can copy the calldata and submit it first. The oracle still updates correctly (signature is valid), but the reporter's own tx reverts, wasting gas and triggering error paths.  
**Fix:** Include the expected transmitter address in the signed payload and verify it equals `msg.sender` in `transmit()`. The Circle wallet address is known and consistent.

### H2 -- Float precision in QuoteCalculator atomic conversion
`Math.round(parseFloat(input) * 10**decimals)` uses JS floating-point. For inputs like `12345678.99` USDC (6 decimals) or large NGN amounts (2 decimals), IEEE 754 rounding errors can produce a wrong `atomicIn` and therefore a wrong quoted output.  
**Fix:** Parse using a string-based BigInt parser that handles the decimal point explicitly, avoiding float arithmetic.

---

## Medium

### M1 -- Instant governance parameter changes (no timelock)
`setReporter`, `setDeviationThreshold`, `setCircuitBreakerBps`, `setMaxStaleness`, and `upgradeToAndCall` are all immediate single-owner transactions. There is no on-chain delay or multisig requirement.  
**Impact:** If the owner key is compromised, an attacker can silently rotate the reporter key to one they control and publish arbitrary prices. Not fixable before launch without a contract upgrade. Document clearly and plan a multisig/timelock upgrade.

---

## Low / Info

### L1 -- NGN source failure fallback
If all 3 NGN sources fail simultaneously, `fetchAll()` returns an empty array, median returns `undefined`, and the reporter logs an error and skips the cycle. This is correct behavior and safe -- no bad price is published. No action needed, but consider alerting if 2+ sources fail for >1 hour.

### L2 -- UUPS upgrade has no delay
Related to M1. The owner can upgrade the implementation contract instantly. Noted for transparency; a timelock upgrade is planned post-launch.

---

## Fix plan

| ID | Priority | Fix location |
|---|---|---|
| C1 | Before launch | `reporter.ts` -- read deviation from chain |
| C2 | Before launch | `reporter.ts` -- verify round incremented after tx |
| C3 | Contract upgrade needed | `USDCNGNOracle.sol` + `reporter.ts` |
| H1 | Contract upgrade needed | `USDCNGNOracle.sol` + `reporter.ts` |
| H2 | Before launch | `QuoteCalculator.tsx` |
| M1 | Post-launch planned | Contract upgrade + multisig |
