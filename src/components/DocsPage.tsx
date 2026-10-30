/**
 * DocsPage.tsx
 * BEACON developer documentation -- full integration guide with code snippets.
 * Sections: Overview, Quick Start, AggregatorV3 Interface, Quote Functions,
 *           Security Model, Deviation + Heartbeat, Circuit Breaker, Upgradeability.
 * Bottom navigation: Previous / Next section.
 */

import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, Copy, Check, ExternalLink } from 'lucide-react'
import { BeaconMark } from './BeaconLogo'

// ── Architecture flow diagram (docs) ───────────────────────────────────────
const ARCH_STEPS = [
  {
    icon: '◎',
    col: '#60a5fa',
    label: 'Market Sources',
    sub: '8 independent price feeds',
    detail: 'Five CEX spot markets supply USDC/USD. Three independent APIs supply USD/NGN rates. All sources are fetched in parallel every 30 seconds.',
  },
  {
    icon: '⬡',
    col: '#a78bfa',
    label: 'Aggregator',
    sub: 'Median + outlier filter',
    detail: 'Each price leg is median-aggregated independently. A 10% outlier filter removes any source that deviates too far from the group. A minimum quorum of 2 sources per leg is required before aggregation proceeds.',
  },
  {
    icon: '⬢',
    col: '#f472b6',
    label: 'ECDSA Signer',
    sub: 'Signing key verification',
    detail: 'The reporter signs keccak256(contractAddress, answer, timestamp, nextRoundId) with a dedicated private key. The contract verifies this signature on-chain -- no trusted submitter address required.',
  },
  {
    icon: '◈',
    col: '#00D66F',
    label: 'BEACON Contract',
    sub: 'On-chain round storage',
    detail: 'transmit() verifies the ECDSA signature, enforces monotonic timestamps, checks the deviation circuit breaker, and writes the round into a 100-slot circular buffer. Any contract can read via AggregatorV3Interface.',
  },
]

const EDGE_LABELS = ['price data', 'signed payload', 'transmit()']

function hexToRgbDocs(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}

function ArchFlowDiagram() {
  const [active, setActive] = useState<number | null>(null)
  const [animStep, setAnimStep] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setAnimStep(s => (s + 1) % (ARCH_STEPS.length + 1)), 1200)
    return () => clearInterval(id)
  }, [])

  const displayed = active !== null ? active : animStep % ARCH_STEPS.length

  return (
    <div style={{ width: '100%' }}>
      <style>{`
        @keyframes archSlideRight { from { left: 0; } to { left: 100%; } }
        .arch-docs-flow { display: flex; align-items: flex-start; justify-content: center; gap: 0; flex-wrap: wrap; }
        .arch-docs-node { width: 130px; cursor: pointer; }
        @media (max-width: 600px) {
          .arch-docs-flow { flex-direction: column; align-items: center; }
          .arch-docs-node { width: 80vw; max-width: 300px; }
          .arch-docs-connector { flex-direction: row !important; width: auto !important; height: 36px !important; }
          .arch-docs-connector-line { width: 2px !important; height: 100% !important; }
        }
      `}</style>

      {/* Step nodes */}
      <div className="arch-docs-flow">
        {ARCH_STEPS.map((node, i) => (
          <div key={node.label} style={{ display: 'contents' }}>
            <div
              className="arch-docs-node"
              onClick={() => setActive(active === i ? null : i)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 8, padding: '16px 12px',
                background: animStep > i || active === i
                  ? `linear-gradient(135deg, rgba(${hexToRgbDocs(node.col)},0.14), rgba(${hexToRgbDocs(node.col)},0.04))`
                  : 'rgba(255,255,255,0.03)',
                border: `1px solid ${animStep > i || active === i ? node.col + '66' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 14, transition: 'all 0.4s ease',
                boxShadow: animStep > i || active === i ? `0 0 20px rgba(${hexToRgbDocs(node.col)},0.15)` : 'none',
              }}
            >
              <span style={{ fontSize: 26, color: animStep > i || active === i ? node.col : '#334155', transition: 'color 0.4s' }}>{node.icon}</span>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: animStep > i || active === i ? '#f1f5f9' : '#475569', transition: 'color 0.4s', fontFamily: "'Space Grotesk', sans-serif" }}>
                  {node.label}
                </div>
                <div style={{ fontSize: 10, color: animStep > i || active === i ? '#94a3b8' : '#334155', marginTop: 2, transition: 'color 0.4s' }}>
                  {node.sub}
                </div>
              </div>
              <div style={{ fontSize: 9, color: '#475569', marginTop: 2 }}>tap for details</div>
            </div>

            {i < ARCH_STEPS.length - 1 && (
              <div className="arch-docs-connector" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 40, flexShrink: 0, paddingTop: 28 }}>
                <div className="arch-docs-connector-line" style={{
                  height: 2, width: '100%', position: 'relative',
                  background: animStep > i
                    ? `linear-gradient(90deg, ${ARCH_STEPS[i].col}, ${ARCH_STEPS[i + 1].col})`
                    : 'rgba(255,255,255,0.08)',
                  transition: 'background 0.4s',
                }}>
                  {animStep === i + 1 && (
                    <div style={{
                      position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                      width: 7, height: 7, borderRadius: '50%',
                      background: ARCH_STEPS[i].col, boxShadow: `0 0 7px ${ARCH_STEPS[i].col}`,
                      animation: 'archSlideRight 1.2s linear',
                    }} />
                  )}
                </div>
                <div style={{ fontSize: 9, color: '#334155', marginTop: 3, textAlign: 'center' }}>
                  {animStep > i ? EDGE_LABELS[i] : ''}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Detail panel for selected or auto-highlighted node */}
      <div style={{
        marginTop: 16, padding: '14px 18px',
        background: `rgba(${hexToRgbDocs(ARCH_STEPS[displayed].col)},0.07)`,
        border: `1px solid ${ARCH_STEPS[displayed].col}44`,
        borderRadius: 12, transition: 'all 0.3s ease',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: ARCH_STEPS[displayed].col, marginBottom: 6, fontFamily: "'Space Grotesk', sans-serif" }}>
          {ARCH_STEPS[displayed].icon} {ARCH_STEPS[displayed].label}
        </div>
        <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
          {ARCH_STEPS[displayed].detail}
        </div>
      </div>
    </div>
  )
}

const CONTRACT = '0xe0e4894106B1e517752515D40601ec890262e0ea'
const EXPLORER = `https://explorer.arc.io/address/${CONTRACT}`
const CHAIN_ID  = 5042

// ── Copy button ────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button
      onClick={() => { void copy() }}
      title="Copy to clipboard"
      style={{
        position: 'absolute', top: 10, right: 10,
        background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 4,
        color: copied ? '#00D66F' : '#9ca3af', fontSize: 11, fontWeight: 500,
        transition: 'color .2s',
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── Code block ─────────────────────────────────────────────────────────────
function Code({ children, lang = 'solidity' }: { children: string; lang?: string }) {
  return (
    <div style={{ position: 'relative', margin: '20px 0' }}>
      <div style={{
        background: '#0d1117', borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '7px 16px',
          background: 'rgba(255,255,255,0.04)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          fontSize: 11, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '0.04em',
        }}>
          {lang}
        </div>
        <pre style={{
          margin: 0, padding: '18px 20px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13, lineHeight: 1.75,
          color: '#e2e8f0', overflowX: 'auto',
          whiteSpace: 'pre',
        }}>
          {children.trim()}
        </pre>
      </div>
      <CopyButton text={children.trim()} />
    </div>
  )
}

// ── Callout ────────────────────────────────────────────────────────────────
function Note({ children, type = 'info' }: { children: React.ReactNode; type?: 'info' | 'warn' | 'tip' }) {
  const colors = {
    info: { bg: 'rgba(0,214,111,0.07)', border: 'rgba(0,214,111,0.25)', icon: 'INFO', col: '#00D66F' },
    warn: { bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.25)', icon: 'WARN', col: '#f59e0b' },
    tip:  { bg: 'rgba(99,102,241,0.07)', border: 'rgba(99,102,241,0.25)', icon: 'TIP',  col: '#818cf8' },
  }
  const c = colors[type]
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 10, padding: '14px 16px', margin: '20px 0',
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <span style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
        color: c.col, fontFamily: "'JetBrains Mono', monospace",
        paddingTop: 2, flexShrink: 0,
      }}>{c.icon}</span>
      <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.65 }}>{children}</div>
    </div>
  )
}

// ── Section heading ────────────────────────────────────────────────────────
function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 26, fontWeight: 800, color: '#f1f5f9',
      fontFamily: "'Space Grotesk', sans-serif",
      letterSpacing: '-0.02em', marginBottom: 8, marginTop: 48,
    }}>
      {children}
    </h2>
  )
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: 17, fontWeight: 700, color: '#e2e8f0',
      fontFamily: "'Space Grotesk', sans-serif",
      marginBottom: 6, marginTop: 32,
    }}>
      {children}
    </h3>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 15, color: '#94a3b8', lineHeight: 1.75, marginBottom: 14 }}>{children}</p>
}

function IL({ children }: { children: string }) {
  return (
    <code style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12.5, background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.1)',
      padding: '1px 6px', borderRadius: 5, color: '#86efac',
    }}>
      {children}
    </code>
  )
}

// ── Sections data ──────────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: 'overview',
    title: 'Overview',
    content: () => (
      <>
        <H2>What is BEACON?</H2>
        <P>
          BEACON is a decentralized price oracle that publishes a tamper-resistant USDC/NGN
          exchange rate on-chain. Any smart contract on Arc can read the current price,
          query historical rounds, or request a computed conversion directly from the oracle.
        </P>
        <P>
          BEACON implements the Chainlink <IL>AggregatorV3Interface</IL> standard, so any
          existing Chainlink consumer contract works with BEACON without modification.
        </P>

        <H3>Contract address (Arc Network)</H3>
        <Code lang="text">{`${CONTRACT}

Chain ID: ${CHAIN_ID}
Network:  Arc Network
RPC:      https://rpc.mainnet.arc.io`}</Code>

        <Note type="info">
          BEACON is deployed on Arc Network. The proxy address above is permanent
          even after future upgrades. Always use the proxy address, never an implementation address.
        </Note>

        <H3>Architecture flow</H3>

        {/* Inline arch flow diagram */}
        <div style={{ margin: '20px 0' }}>
          <ArchFlowDiagram />
        </div>

        <H3>How the price is derived</H3>
        <P>
          An off-chain reporter aggregates USDC/USD spot prices from five independent CEX
          markets and USD/NGN rates from three independent sources. Each leg is median-aggregated
          separately with outlier rejection applied. The final price is:
        </P>
        <Code lang="text">{`USDC/NGN = median(USDC/USD prices) × median(USD/NGN rates)`}</Code>
        <P>
          The derived price is signed with a dedicated ECDSA signing key and submitted
          to the contract via <IL>transmit()</IL>. The contract verifies the signature,
          checks monotonic timestamp ordering, and stores the round.
        </P>
      </>
    ),
  },
  {
    id: 'quickstart',
    title: 'Quick Start',
    content: () => (
      <>
        <H2>Quick Start</H2>
        <P>
          The fastest way to read the USDC/NGN price is a direct call to
          <IL>latestRoundData()</IL>. This follows the Chainlink standard and works
          with any Solidity version that supports interfaces.
        </P>

        <H3>Step 1: Define the interface</H3>
        <Code lang="solidity">{`// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBeacon {
    function latestRoundData()
        external
        view
        returns (
            uint80  roundId,
            int256  answer,    // USDC/NGN with 8 decimals
            uint256 startedAt,
            uint256 updatedAt,
            uint80  answeredInRound
        );

    function decimals() external view returns (uint8);
}`}</Code>

        <H3>Step 2: Read the price in your contract</H3>
        <Code lang="solidity">{`// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IBeacon.sol";

contract MyContract {
    IBeacon public constant BEACON =
        IBeacon(${CONTRACT});

    /// Returns how many NGN a given USDC amount is worth.
    /// @param usdcAmount  Amount in 6-decimal USDC (e.g. 1e6 = 1 USDC)
    function usdcToNgn(uint256 usdcAmount)
        external
        view
        returns (uint256 ngnAmount)
    {
        (, int256 price, , uint256 updatedAt,) =
            BEACON.latestRoundData();

        // Guard against a stale oracle
        require(price > 0, "Invalid price");
        require(block.timestamp - updatedAt < 2 hours, "Stale oracle");

        // price has 8 decimals; USDC has 6 decimals
        // NGN result is scaled to 2 decimals (kobo precision)
        ngnAmount = (usdcAmount * uint256(price)) / 1e12;
    }
}`}</Code>

        <Note type="tip">
          The oracle publishes prices with 8 decimal places. 1 USDC at 1350 NGN is stored
          as <IL>135000000000</IL> (1350 x 10^8). Divide by <IL>10**8</IL> or call
          <IL>decimals()</IL> to get the human-readable rate.
        </Note>

        <H3>Step 3: Read from a frontend</H3>
        <Code lang="typescript">{`import { createPublicClient, http } from "viem";
import { defineChain } from "viem";

const arc = defineChain({
  id: ${CHAIN_ID},
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
});

const client = createPublicClient({ chain: arc, transport: http() });

const BEACON_ADDRESS = "${CONTRACT}";
const ABI = [
  {
    name: "latestRoundData",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId",         type: "uint80"  },
      { name: "answer",          type: "int256"  },
      { name: "startedAt",       type: "uint256" },
      { name: "updatedAt",       type: "uint256" },
      { name: "answeredInRound", type: "uint80"  },
    ],
  },
] as const;

const [roundId, answer, , updatedAt] = await client.readContract({
  address: BEACON_ADDRESS,
  abi: ABI,
  functionName: "latestRoundData",
});

const priceNGN = Number(answer) / 1e8;   // e.g. 1349.44
console.log(\`1 USDC = \${priceNGN.toFixed(2)} NGN (round #\${roundId})\`);`}</Code>
      </>
    ),
  },
  {
    id: 'aggregator',
    title: 'AggregatorV3 Interface',
    content: () => (
      <>
        <H2>AggregatorV3Interface</H2>
        <P>
          BEACON implements the full Chainlink <IL>AggregatorV3Interface</IL>. Any contract
          already integrated with a Chainlink price feed can point at BEACON with no code changes.
        </P>

        <H3>Full interface</H3>
        <Code lang="solidity">{`interface IAggregatorV3 {
    function decimals()    external view returns (uint8);
    function description() external view returns (string memory);
    function version()     external view returns (uint256);

    // Get data for a specific historical round
    function getRoundData(uint80 _roundId)
        external view
        returns (
            uint80  roundId,
            int256  answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80  answeredInRound
        );

    // Get the latest round data
    function latestRoundData()
        external view
        returns (
            uint80  roundId,
            int256  answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80  answeredInRound
        );
}`}</Code>

        <H3>Return values explained</H3>
        <div style={{ overflowX: 'auto', margin: '16px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                {['Field', 'Type', 'Description'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['roundId', 'uint80', 'Phase-encoded round ID (phaseId << 64 | counter). Use the counter (lower 64 bits) for display.'],
                ['answer', 'int256', 'USDC/NGN price with 8 decimal places. Divide by 1e8 for human-readable rate.'],
                ['startedAt', 'uint256', 'Unix timestamp when this round started (same as updatedAt on BEACON).'],
                ['updatedAt', 'uint256', 'Unix timestamp of the on-chain publish. Use this for staleness checks.'],
                ['answeredInRound', 'uint80', 'Same as roundId for BEACON (no multi-round aggregation).'],
              ].map(([f, t, d]) => (
                <tr key={f} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#86efac' }}>{f}</td>
                  <td style={{ padding: '10px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#93c5fd' }}>{t}</td>
                  <td style={{ padding: '10px 16px', color: '#94a3b8', fontSize: 13.5 }}>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Note type="warn">
          <IL>latestRoundData()</IL> reverts with <IL>StaleData</IL> if the last update
          is older than <IL>maxStaleness</IL> (currently 1 hour). Use <IL>getRoundData(latestRound())</IL>
          if you want the last known price regardless of age.
        </Note>

        <H3>Additional read functions</H3>
        <Code lang="solidity">{`// Latest encoded round ID (phaseId << 64 | counter)
function latestRound() external view returns (uint256);

// Latest answer directly (reverts if stale)
function latestAnswer() external view returns (int256);

// Oracle type identifier (Chainlink convention)
function typeAndVersion() external pure returns (string memory);
// Returns: "USDCNGNOracle 1.0.0"

// Whether updates are currently paused
function paused() external view returns (bool);

// Whether the circuit breaker has tripped
function circuitBreakerTripped() external view returns (bool);`}</Code>
      </>
    ),
  },
  {
    id: 'quote-functions',
    title: 'Quote Functions',
    content: () => (
      <>
        <H2>Quote Functions</H2>
        <P>
          In addition to the standard Chainlink interface, BEACON exposes three convenience
          functions that handle decimal scaling for you. These are ideal for contracts that
          need direct USDC-to-NGN conversion without implementing arithmetic themselves.
        </P>

        <H3>quoteUSDCToNGN</H3>
        <Code lang="solidity">{`/// @notice Convert a USDC amount to its NGN value at the current oracle price.
/// @param usdcAmount  Amount in 6-decimal USDC units (1 USDC = 1_000_000)
/// @return ngnAmount  Amount in 2-decimal NGN units (1 NGN = 100 kobo)
function quoteUSDCToNGN(uint256 usdcAmount)
    external view
    returns (uint256 ngnAmount);

// Example:
// quoteUSDCToNGN(1_000_000)  =>  134944 (represents 1349.44 NGN)`}</Code>

        <H3>quoteNGNToUSDC</H3>
        <Code lang="solidity">{`/// @notice Convert an NGN amount to its USDC value at the current oracle price.
/// @param ngnAmount   Amount in 2-decimal NGN units (1 NGN = 100)
/// @return usdcAmount Amount in 6-decimal USDC units
function quoteNGNToUSDC(uint256 ngnAmount)
    external view
    returns (uint256 usdcAmount);

// Example:
// quoteNGNToUSDC(134944)  =>  ~999_998 (approximately 1 USDC)`}</Code>

        <H3>latestQuoteMetadata</H3>
        <Code lang="solidity">{`/// @notice Returns the full price context for the current round.
/// Useful for logging, auditing, or building a receipt.
function latestQuoteMetadata()
    external view
    returns (
        int256  price,       // Raw 8-decimal USDC/NGN price
        uint256 updatedAt,   // Unix timestamp of last publish
        uint80  roundId,     // Encoded round ID
        uint256 roundAge     // Seconds since last update
    );`}</Code>

        <H3>Practical example: payment contract</H3>
        <Code lang="solidity">{`// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBeacon {
    function quoteUSDCToNGN(uint256 usdcAmount)
        external view returns (uint256);
}

interface IERC20 {
    function transferFrom(address, address, uint256) external returns (bool);
}

contract NairaPayment {
    IBeacon constant BEACON =
        IBeacon(${CONTRACT});
    IERC20  constant USDC   =
        IERC20(0x036CbD53842c5426634e7929541eC2318f3dCF7e); // Replace with USDC address on your target chain

    event Paid(address indexed payer, uint256 usdc, uint256 ngn);

    /// Accept USDC and emit the NGN equivalent for off-chain settlement.
    function pay(uint256 usdcAmount) external {
        require(USDC.transferFrom(msg.sender, address(this), usdcAmount));
        uint256 ngnValue = BEACON.quoteUSDCToNGN(usdcAmount);
        emit Paid(msg.sender, usdcAmount, ngnValue);
    }
}`}</Code>

        <Note type="tip">
          Both quote functions call <IL>latestRoundData()</IL> internally, so they will
          revert if the oracle is stale. Make sure the reporter is running before deploying
          contracts that depend on live quotes.
        </Note>
      </>
    ),
  },
  {
    id: 'deviation-heartbeat',
    title: 'Deviation and Heartbeat',
    content: () => (
      <>
        <H2>Deviation Threshold and Heartbeat</H2>

        <H3>What is deviation threshold?</H3>
        <P>
          The deviation threshold is the minimum price movement (in basis points) that
          triggers a new on-chain publish. If the newly computed USDC/NGN price differs
          from the last published price by less than this threshold, the reporter skips
          the update and waits for the next cycle.
        </P>
        <P>
          BEACON uses a deviation threshold of <strong style={{ color: '#f1f5f9' }}>20 basis points (0.20%)</strong>.
          This means the price must move by at least 0.20% before a new round is written.
        </P>

        <H3>Why it matters for integrators</H3>
        <P>
          A contract that reads <IL>latestRoundData()</IL> will see the same price for
          multiple cycles if the market is stable. This is expected and correct behaviour.
          The <IL>updatedAt</IL> timestamp tells you exactly when the last publish happened.
          Do not treat a stable <IL>updatedAt</IL> as a sign of malfunction.
        </P>

        <H3>What is the heartbeat?</H3>
        <P>
          The heartbeat is the maximum time between on-chain publishes regardless of price
          movement. Even if the price never crosses the deviation threshold, the reporter
          will still publish at least once per heartbeat period.
        </P>
        <P>
          BEACON's heartbeat is <strong style={{ color: '#f1f5f9' }}>1 hour</strong>.
          The maximum staleness the contract accepts before reverting <IL>latestRoundData()</IL>
          is also 1 hour, so a healthy reporter always keeps the oracle fresh.
        </P>

        <Code lang="solidity">{`// Read current parameters from the contract
uint256 maxStaleness         = beacon.maxStaleness();          // seconds
uint256 deviationThresholdBps = beacon.deviationThresholdBps(); // basis points (20 = 0.20%)

// In your consumer contract: guard against stale data
(, int256 price, , uint256 updatedAt,) = beacon.latestRoundData();
require(
    block.timestamp - updatedAt <= maxStaleness,
    "BEACON: price is stale"
);`}</Code>

        <Note type="info">
          Basis points (bps) are hundredths of a percent. 1 bps = 0.01%. 20 bps = 0.20%.
          The contract stores thresholds as raw bps integers so arithmetic stays integer-only.
        </Note>
      </>
    ),
  },
  {
    id: 'circuit-breaker',
    title: 'Circuit Breaker',
    content: () => (
      <>
        <H2>Circuit Breaker</H2>
        <P>
          The circuit breaker is an on-chain safety mechanism that freezes oracle updates
          if the price moves by an anomalously large amount in a single round. It protects
          downstream contracts from accepting a price that may be the result of a data
          source error or manipulation.
        </P>

        <H3>How it works</H3>
        <P>
          On every <IL>transmit()</IL> call, the contract computes the deviation between
          the new price and the previous round. If that deviation exceeds
          <IL>circuitBreakerBps</IL>, the contract sets a flag
          (<IL>circuitBreakerTripped = true</IL>) and returns without storing the new round.
          The flag persists until the owner resets it.
        </P>

        <Code lang="solidity">{`// Check circuit breaker status before reading price
bool tripped = beacon.circuitBreakerTripped();
require(!tripped, "BEACON: circuit breaker active");

// Owner resets the circuit breaker (governance action)
// beacon.resetCircuitBreaker();

// Owner resets and simultaneously publishes a new price
// beacon.resetCircuitBreakerAndPublish(answer, timestamp);`}</Code>

        <H3>What integrators should do</H3>
        <P>
          Your contract should check <IL>circuitBreakerTripped()</IL> before taking any
          action that depends on the oracle price. If tripped, fall back to a safe state
          (pause the contract, reject the transaction, or use a time-locked fallback price).
        </P>
        <Code lang="solidity">{`// Safe oracle read pattern
function getSafePrice() internal view returns (int256) {
    require(!beacon.circuitBreakerTripped(), "Oracle: circuit breaker");
    require(!beacon.paused(), "Oracle: paused");

    (, int256 price, , uint256 updatedAt,) =
        beacon.latestRoundData(); // also reverts if stale

    require(price > 0, "Oracle: zero price");
    return price;
}`}</Code>

        <Note type="warn">
          When the circuit breaker trips, <IL>latestRoundData()</IL> still returns the
          last valid round (it does not revert). The trip only prevents NEW rounds from
          being stored. Always check <IL>circuitBreakerTripped()</IL> separately.
        </Note>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security Model',
    content: () => (
      <>
        <H2>Security Model</H2>

        <H3>Roles</H3>
        <div style={{ overflowX: 'auto', margin: '16px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                {['Role', 'Address', 'Capabilities'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Owner', '2-step Ownable', 'Set reporter, set governance params, pause, reset circuit breaker, upgrade logic'],
                ['Reporter', 'ECDSA signing key', 'Sign and submit transmit() payloads. Cannot change any contract state other than publishing rounds.'],
                ['Gas payer', 'Circle wallet (EOA)', 'Submits the transmit() transaction on behalf of the reporter. Can be any address.'],
              ].map(([r, a, c]) => (
                <tr key={r} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px 16px', color: '#f1f5f9', fontWeight: 600 }}>{r}</td>
                  <td style={{ padding: '10px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#86efac' }}>{a}</td>
                  <td style={{ padding: '10px 16px', color: '#94a3b8', fontSize: 13.5 }}>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H3>Ownership transfer</H3>
        <P>
          BEACON uses <IL>Ownable2Step</IL> from OpenZeppelin. Transferring ownership
          requires two transactions: the current owner proposes a new owner, and the
          new owner must explicitly accept. This prevents accidental transfers to wrong
          addresses.
        </P>
        <Code lang="solidity">{`// Step 1: current owner proposes
beacon.transferOwnership(newOwner);

// Step 2: new owner accepts (must be called by newOwner)
beacon.acceptOwnership();

// Renouncing ownership is permanently disabled on BEACON:
// beacon.renounceOwnership(); // always reverts`}</Code>

        <H3>Transmission signature</H3>
        <P>
          Every price submission is ECDSA-signed by the reporter key. The contract
          recovers the signer from the signature and verifies it matches the registered
          <IL>reporter</IL> address. This means even if the gas payer (Circle wallet)
          is compromised, an attacker cannot submit arbitrary prices without the signing key.
        </P>
        <Code lang="solidity">{`// Payload the reporter signs:
bytes32 payload = keccak256(abi.encodePacked(
    address(this),    // contract address (prevents replay across contracts)
    answer,           // the price
    timestamp,        // submission timestamp
    latestRound + 1   // expected next round (prevents replay of old submissions)
));`}</Code>

        <Note type="warn">
          The reporter signing key (<IL>0xdCF40c...757d7b</IL>) is separate from the
          gas payer wallet. Never expose the signing key. Rotate it via
          <IL>setReporter(newAddress)</IL> if you suspect it has been compromised.
        </Note>

        <H3>Consumer authorization</H3>
        <P>
          BEACON includes an optional consumer authorization gate. When enabled, only
          whitelisted contract addresses can call <IL>latestRoundData()</IL>. It is
          currently disabled (all callers allowed). To enable it:
        </P>
        <Code lang="solidity">{`// Owner enables the gate
beacon.setConsumerAuthorizationEnabled(true);

// Owner adds a consumer
beacon.addAuthorizedConsumer(myContractAddress);

// Owner removes a consumer
beacon.removeAuthorizedConsumer(myContractAddress);

// Check if a consumer is authorized
bool ok = beacon.isAuthorizedConsumer(myContractAddress);`}</Code>
      </>
    ),
  },
  {
    id: 'upgradeability',
    title: 'Upgradeability',
    content: () => (
      <>
        <H2>Upgradeability</H2>
        <P>
          BEACON is deployed as a UUPS (Universal Upgradeable Proxy Standard) proxy.
          The proxy address is permanent and should be used in all integrations. The
          implementation (logic) contract can be upgraded by the owner to add features,
          fix bugs, or extend the ABI without changing the address your contract points to.
        </P>

        <H3>Proxy vs implementation</H3>
        <Code lang="text">{`Proxy (permanent address -- always use this):
  ${CONTRACT}

Current implementation v7:
  0x71d2fe7ca6bb8ead42a5bde78d64a1bb07ea7779`}</Code>

        <H3>What happens on upgrade</H3>
        <P>
          When the implementation is upgraded, the <IL>phaseId</IL> counter increments.
          Round IDs are encoded as <IL>phaseId &lt;&lt; 64 | counter</IL>, so historical
          rounds from a previous phase are still accessible via <IL>getRoundData()</IL>
          but the counter restarts from 1 in the new phase.
        </P>

        <Code lang="solidity">{`// Decode a round ID into its phase and counter
uint16  phaseId = uint16(roundId >> 64);
uint64  counter = uint64(roundId & type(uint64).max);

// Example: roundId = 18446744073709551617
// phaseId = 1, counter = 1  (first round after first upgrade)`}</Code>

        <Note type="info">
          The storage layout is preserved across upgrades via a <IL>__gap</IL> array.
          Only the owner can call <IL>upgradeToAndCall()</IL>. The upgrade function
          also increments <IL>phaseId</IL> automatically.
        </Note>

        <H3>Subscribing to upgrades</H3>
        <P>
          Listen for the standard ERC-1967 <IL>Upgraded(address indexed implementation)</IL>
          event on the proxy address to detect when an upgrade occurs and revalidate your
          integration.
        </P>
        <Code lang="solidity">{`// ERC-1967 upgrade event emitted by the proxy
event Upgraded(address indexed implementation);

// BEACON also emits on every round:
event NewTransmission(
    uint80  indexed roundId,
    int256  answer,
    uint256 timestamp,
    address transmitter
);`}</Code>

        <a
          href={EXPLORER}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '10px 18px', borderRadius: 10,
            background: 'rgba(0,214,111,0.12)', border: '1px solid rgba(0,214,111,0.3)',
            color: '#00D66F', textDecoration: 'none', fontSize: 14, fontWeight: 600,
            marginTop: 8,
          }}
        >
          View contract on explorer <ExternalLink size={14} />
        </a>
      </>
    ),
  },
]

// ── Sidebar nav list ───────────────────────────────────────────────────────
function SidebarContents({ activeIdx, onSelect }: { activeIdx: number; onSelect: (i: number) => void }) {
  return (
    <>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#475569', textTransform: 'uppercase', padding: '0 20px 12px', margin: 0 }}>
        Contents
      </p>
      {SECTIONS.map((s, i) => (
        <button
          key={s.id}
          onClick={() => onSelect(i)}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: activeIdx === i ? 600 : 400,
            color: activeIdx === i ? '#00D66F' : '#64748b',
            borderLeft: activeIdx === i ? '2px solid #00D66F' : '2px solid transparent',
            borderRight: 'none',
            transition: 'color .15s',
          }}
        >
          {i + 1}. {s.title}
        </button>
      ))}
    </>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
type NavigateFn = (v: 'landing' | 'dashboard' | 'docs') => void

export function DocsPage({ onNavigate: _onNavigate }: { onNavigate?: NavigateFn } = {}) {
  const [activeIdx, setActiveIdx]   = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const section = SECTIONS[activeIdx]
  const prev = activeIdx > 0 ? SECTIONS[activeIdx - 1] : null
  const next = activeIdx < SECTIONS.length - 1 ? SECTIONS[activeIdx + 1] : null

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [activeIdx])

  useEffect(() => {
    if (!drawerOpen) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-drawer]')) setDrawerOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [drawerOpen])

  const selectSection = (i: number) => {
    setActiveIdx(i)
    setDrawerOpen(false)
  }

  return (
    <div style={{ background: '#080c14', minHeight: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', sans-serif" }}>

      {/* Nav */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'rgba(8,12,20,0.95)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        padding: '0 20px', height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BeaconMark size={26} />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.02em', lineHeight: 1 }}>BEACON</span>
          <span style={{ color: '#334155', fontSize: 14, marginLeft: 4 }}>/</span>
          <span style={{ color: '#64748b', fontSize: 14 }}>Docs</span>
        </div>

        {/* Hamburger -- mobile only */}
        <button
          data-drawer
          onClick={() => setDrawerOpen(o => !o)}
          aria-label="Toggle menu"
          style={{
            display: 'none',
            background: 'none', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '7px 10px', cursor: 'pointer', color: '#94a3b8',
          }}
          className="docs-hamburger"
        >
          {drawerOpen ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          )}
        </button>
      </header>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 35,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
        }} />
      )}

      {/* Mobile drawer panel */}
      <div
        data-drawer
        style={{
          position: 'fixed', top: 60, left: 0, bottom: 0, zIndex: 36,
          width: 260, background: '#0d1321',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          overflowY: 'auto', paddingTop: 24,
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform .22s ease',
          display: 'none',
        }}
        className="docs-drawer"
      >
        <SidebarContents activeIdx={activeIdx} onSelect={selectSection} />
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, maxWidth: 1200, margin: '0 auto', width: '100%' }}>

        {/* Desktop sidebar */}
        <aside
          className="docs-sidebar"
          style={{
            width: 224, flexShrink: 0,
            borderRight: '1px solid rgba(255,255,255,0.06)',
            padding: '32px 0', position: 'sticky', top: 60,
            height: 'calc(100dvh - 60px)', overflowY: 'auto',
          }}>
          <SidebarContents activeIdx={activeIdx} onSelect={selectSection} />
        </aside>

        {/* Content */}
        <main
          ref={contentRef}
          style={{ flex: 1, padding: '40px 32px 80px', overflowY: 'auto', minWidth: 0, maxWidth: '100%' }}
        >
          {section.content()}

          {/* Bottom prev/next */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 64, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.07)',
            gap: 12, flexWrap: 'wrap',
          }}>
            {prev ? (
              <button
                onClick={() => selectSection(activeIdx - 1)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, padding: '10px 18px', cursor: 'pointer',
                  color: '#94a3b8', fontSize: 13.5, fontWeight: 500,
                }}
              >
                <ChevronLeft size={16} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 10, color: '#475569', marginBottom: 2 }}>Previous</div>
                  {prev.title}
                </div>
              </button>
            ) : <span />}

            {next ? (
              <button
                onClick={() => selectSection(activeIdx + 1)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'rgba(0,214,111,0.1)', border: '1px solid rgba(0,214,111,0.25)',
                  borderRadius: 10, padding: '10px 18px', cursor: 'pointer',
                  color: '#00D66F', fontSize: 13.5, fontWeight: 600,
                }}
              >
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'rgba(0,214,111,0.6)', marginBottom: 2 }}>Next</div>
                  {next.title}
                </div>
                <ChevronRight size={16} />
              </button>
            ) : null}
          </div>
        </main>
      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 768px) {
          .docs-sidebar   { display: none !important; }
          .docs-hamburger { display: flex !important; }
          .docs-drawer    { display: block !important; }
        }
        @media (min-width: 769px) {
          .docs-drawer    { display: none !important; }
          .docs-hamburger { display: none !important; }
        }
      `}</style>
    </div>
  )
}
