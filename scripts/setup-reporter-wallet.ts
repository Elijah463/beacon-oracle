/**
 * setup-reporter-wallet.ts
 * -------------------------
 * Run ONCE to create the Circle developer-controlled reporter wallet.
 *
 * What it does:
 *   1. Creates a wallet set named "BEACON Reporter"
 *   2. Creates one EOA wallet on ARC-MAINNET inside that set
 *   3. Prints the wallet address and wallet ID to stdout
 *   4. You then:
 *      a. Copy REPORTER_WALLET_ID into your .env
 *      b. Fund the wallet address with Arc Network USDC (gas on Arc IS USDC)
 *         via the "Get test USDC" button in the Arc Studio sidebar
 *      c. Call setReporter(<wallet-address>) on the oracle contract as the owner
 *
 * Prerequisites in .env:
 *   CIRCLE_API_KEY=<your Circle Standard Developer API key>
 *   CIRCLE_ENTITY_SECRET=<your registered 32-byte entity secret>
 *
 * Run:
 *   bun run scripts/setup-reporter-wallet.ts
 */

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'
import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Validate env
// ---------------------------------------------------------------------------

const CIRCLE_API_KEY     = process.env.CIRCLE_API_KEY     ?? ''
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET
  ?? process.env.ENTITY_SECRET
  ?? process.env.CIRCLE_SCP_ENTITY_SECRET
  ?? ''

if (!CIRCLE_API_KEY) {
  console.error('[setup] CIRCLE_API_KEY is not set in .env')
  process.exit(1)
}
if (!CIRCLE_ENTITY_SECRET) {
  console.error('[setup] CIRCLE_ENTITY_SECRET is not set in .env')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// SDK client
// ---------------------------------------------------------------------------

const client = initiateDeveloperControlledWalletsClient({
  apiKey: CIRCLE_API_KEY,
  entitySecret: CIRCLE_ENTITY_SECRET,
})

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('[setup] Creating BEACON Reporter wallet set...')

  // Step 1: Create wallet set
  const walletSetRes = await client.createWalletSet({
    name: 'BEACON Reporter',
    idempotencyKey: randomUUID(),
  })

  const walletSetId = walletSetRes.data?.walletSet?.id
  if (!walletSetId) {
    console.error('[setup] Failed to create wallet set:', JSON.stringify(walletSetRes))
    process.exit(1)
  }
  console.log(`[setup] Wallet set created: ${walletSetId}`)

  // Step 2: Create one EOA wallet on ARC-MAINNET
  // EOA is the right choice here: no creation fees, highest TPS, and Arc Network
  // uses USDC as native gas -- no separate gas token needed.
  console.log('[setup] Creating EOA wallet on ARC...')

  const walletRes = await client.createWallets({
    accountType: 'EOA',
    blockchains: ['ARC'],
    count: 1,
    walletSetId,
    idempotencyKey: randomUUID(),
  })

  const wallets = walletRes.data?.wallets ?? []
  if (wallets.length === 0) {
    console.error('[setup] Failed to create wallet:', JSON.stringify(walletRes))
    process.exit(1)
  }

  const wallet = wallets[0]
  const walletId      = wallet.id
  const walletAddress = wallet.address

  // ---------------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------------

  console.log('\n=== BEACON Reporter Wallet Created ===')
  console.log(`Wallet ID:      ${walletId}`)
  console.log(`Wallet Address: ${walletAddress}`)
  console.log(`Network:        ARC`)
  console.log('')
  console.log('Next steps:')
  console.log(`  1. Add to .env:`)
  console.log(`       REPORTER_WALLET_ID=${walletId}`)
  console.log(`       REPORTER_WALLET_ADDRESS=${walletAddress}`)
  console.log('')
  console.log(`  2. Fund the wallet with Arc Network USDC (USDC is gas on Arc):`)
  console.log(`       - Use the "Get test USDC" button in the Arc Studio sidebar`)
  console.log(`       - Or drip from https://faucet.circle.com`)
  console.log(`       - Send to: ${walletAddress}`)
  console.log('')
  console.log(`  3. Set this wallet as the oracle reporter (run as owner):`)
  console.log(`       cast send ${process.env.VITE_ORACLE_CONTRACT_ADDRESS ?? '<CONTRACT>'} \\`)
  console.log(`         "setReporter(address)" ${walletAddress} \\`)
  console.log(`         --rpc-url https://rpc.mainnet.arc.io \\`)
  console.log(`         --private-key <OWNER_PRIVATE_KEY>`)
  console.log('')
  console.log(`  4. Start the reporter loop:`)
  console.log(`       bun run scripts/reporter.ts`)
  console.log('=====================================')
}

main().catch((err: unknown) => {
  console.error('[setup] Fatal error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
