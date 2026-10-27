/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Arc Testnet with Multicall3 disabled -- the contract reverts on Arc Testnet,
// so every batched useReadContracts call hangs. Each read goes as its own eth_call.
const arcTestnetNoMulticall = defineChain({
  ...arcTestnet,
  contracts: {
    ...arcTestnet.contracts,
    multicall3: undefined,
  },
})

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arcTestnetNoMulticall, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
