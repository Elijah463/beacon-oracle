/**
 * oracleAbi.ts
 * ABI for USDCNGNOracle.sol -- generated from the compiled Foundry artifact.
 * Auto-updated on each contract version. Do not edit manually.
 * Version: v4 (UUPS upgradeable, all 17 audit findings fixed)
 */
export const ORACLE_ABI = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function', name: 'UPGRADE_INTERFACE_VERSION',
    inputs: [], outputs: [{ name: '', type: 'string', internalType: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'acceptOwnership',
    inputs: [], outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'addConsumer',
    inputs: [{ name: 'consumer', type: 'address', internalType: 'address' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'authorizedConsumers',
    inputs: [{ name: 'consumer', type: 'address', internalType: 'address' }],
    outputs: [{ name: 'isAuthorized', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'circuitBreakerBps',
    inputs: [], outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'circuitBreakerTripped',
    inputs: [], outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'decimals',
    inputs: [], outputs: [{ name: '', type: 'uint8', internalType: 'uint8' }],
    stateMutability: 'pure',
  },
  {
    type: 'function', name: 'description',
    inputs: [], outputs: [{ name: '', type: 'string', internalType: 'string' }],
    stateMutability: 'pure',
  },
  {
    type: 'function', name: 'deviationThresholdBps',
    inputs: [], outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'getRoundData',
    inputs: [{ name: '_roundId', type: 'uint80', internalType: 'uint80' }],
    outputs: [
      { name: 'roundId',         type: 'uint80',  internalType: 'uint80'  },
      { name: 'answer',          type: 'int256',  internalType: 'int256'  },
      { name: 'startedAt',       type: 'uint256', internalType: 'uint256' },
      { name: 'updatedAt',       type: 'uint256', internalType: 'uint256' },
      { name: 'answeredInRound', type: 'uint80',  internalType: 'uint80'  },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'initialize',
    inputs: [
      { name: '_reporter',              type: 'address', internalType: 'address' },
      { name: '_maxStaleness',          type: 'uint256', internalType: 'uint256' },
      { name: '_deviationThresholdBps', type: 'uint256', internalType: 'uint256' },
      { name: '_circuitBreakerBps',     type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'latestAnswer',
    inputs: [], outputs: [{ name: '', type: 'int256', internalType: 'int256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'latestQuoteMetadata',
    inputs: [],
    outputs: [
      { name: 'roundId',    type: 'uint80',  internalType: 'uint80'  },
      { name: 'price',      type: 'int256',  internalType: 'int256'  },
      { name: 'updatedAt',  type: 'uint256', internalType: 'uint256' },
      { name: 'ageSeconds', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'latestRound',
    inputs: [], outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'latestRoundData',
    inputs: [],
    outputs: [
      { name: 'roundId',         type: 'uint80',  internalType: 'uint80'  },
      { name: 'answer',          type: 'int256',  internalType: 'int256'  },
      { name: 'startedAt',       type: 'uint256', internalType: 'uint256' },
      { name: 'updatedAt',       type: 'uint256', internalType: 'uint256' },
      { name: 'answeredInRound', type: 'uint80',  internalType: 'uint80'  },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'maxStaleness',
    inputs: [], outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'owner',
    inputs: [], outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  { type: 'function', name: 'pause',   inputs: [], outputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function', name: 'paused',
    inputs: [], outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'pendingOwner',
    inputs: [], outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'proxiableUUID',
    inputs: [], outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'quoteNGNToUSDC',
    inputs: [{ name: 'ngnAmount', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: 'usdcAmount', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'quoteUSDCToNGN',
    inputs: [{ name: 'usdcAmount', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: 'ngnAmount', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'removeConsumer',
    inputs: [{ name: 'consumer', type: 'address', internalType: 'address' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  { type: 'function', name: 'renounceOwnership', inputs: [], outputs: [], stateMutability: 'pure' },
  {
    type: 'function', name: 'reporter',
    inputs: [], outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'requireConsumerAuthorization',
    inputs: [], outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  { type: 'function', name: 'resetCircuitBreaker', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function', name: 'resetCircuitBreakerAndPublish',
    inputs: [
      { name: 'answer',    type: 'int256',  internalType: 'int256'  },
      { name: 'timestamp', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'setCircuitBreakerBps',
    inputs: [{ name: 'bps', type: 'uint256', internalType: 'uint256' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'setDeviationThreshold',
    inputs: [{ name: 'bps', type: 'uint256', internalType: 'uint256' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'setMaxStaleness',
    inputs: [{ name: 'newMaxStaleness', type: 'uint256', internalType: 'uint256' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'setReporter',
    inputs: [{ name: 'newReporter', type: 'address', internalType: 'address' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'setRequireConsumerAuthorization',
    inputs: [{ name: 'required', type: 'bool', internalType: 'bool' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'transferOwnership',
    inputs: [{ name: 'newOwner', type: 'address', internalType: 'address' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'transmit',
    inputs: [
      { name: 'answer',    type: 'int256',  internalType: 'int256'  },
      { name: 'timestamp', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [], stateMutability: 'nonpayable',
  },
  { type: 'function', name: 'unpause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function', name: 'upgradeToAndCall',
    inputs: [
      { name: 'newImplementation', type: 'address', internalType: 'address' },
      { name: 'data',              type: 'bytes',   internalType: 'bytes'   },
    ],
    outputs: [], stateMutability: 'payable',
  },
  {
    type: 'function', name: 'version',
    inputs: [], outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'pure',
  },
  // Events
  {
    type: 'event', name: 'AnswerUpdated', anonymous: false,
    inputs: [
      { name: 'current',   type: 'int256',  indexed: true,  internalType: 'int256'  },
      { name: 'roundId',   type: 'uint256', indexed: true,  internalType: 'uint256' },
      { name: 'updatedAt', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  {
    type: 'event', name: 'CircuitBreakerBpsUpdated', anonymous: false,
    inputs: [
      { name: 'oldValue', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'newValue', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  {
    type: 'event', name: 'CircuitBreakerReset', anonymous: false,
    inputs: [{ name: 'by', type: 'address', indexed: true, internalType: 'address' }],
  },
  {
    type: 'event', name: 'CircuitBreakerResetAndPublished', anonymous: false,
    inputs: [
      { name: 'by',        type: 'address', indexed: true,  internalType: 'address' },
      { name: 'newAnswer', type: 'int256',  indexed: false, internalType: 'int256'  },
      { name: 'roundId',   type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  {
    type: 'event', name: 'CircuitBreakerTripped', anonymous: false,
    inputs: [
      { name: 'current',      type: 'int256',  indexed: true,  internalType: 'int256'  },
      { name: 'incoming',     type: 'int256',  indexed: true,  internalType: 'int256'  },
      { name: 'deviationBps', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  {
    type: 'event', name: 'ReporterChanged', anonymous: false,
    inputs: [
      { name: 'oldReporter', type: 'address', indexed: true, internalType: 'address' },
      { name: 'newReporter', type: 'address', indexed: true, internalType: 'address' },
    ],
  },
  {
    type: 'event', name: 'MaxStalenessUpdated', anonymous: false,
    inputs: [
      { name: 'oldValue', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'newValue', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  {
    type: 'event', name: 'Paused', anonymous: false,
    inputs: [{ name: 'account', type: 'address', indexed: false, internalType: 'address' }],
  },
  {
    type: 'event', name: 'Unpaused', anonymous: false,
    inputs: [{ name: 'account', type: 'address', indexed: false, internalType: 'address' }],
  },
  // Errors
  { type: 'error', name: 'CircuitBreakerActive',        inputs: [] },
  { type: 'error', name: 'InvalidAnswer',               inputs: [] },
  { type: 'error', name: 'InvalidBps',                  inputs: [] },
  { type: 'error', name: 'InvalidStaleness',            inputs: [] },
  { type: 'error', name: 'InvalidTimestamp',            inputs: [] },
  { type: 'error', name: 'NoDataAvailable',             inputs: [] },
  { type: 'error', name: 'NotReporter',                 inputs: [] },
  { type: 'error', name: 'RenounceOwnershipDisabled',   inputs: [] },
  {
    type: 'error', name: 'StalePrice',
    inputs: [
      { name: 'updatedAt',    type: 'uint256', internalType: 'uint256' },
      { name: 'maxStaleness', type: 'uint256', internalType: 'uint256' },
    ],
  },
  { type: 'error', name: 'Unauthorized',  inputs: [] },
  { type: 'error', name: 'ZeroAddress',   inputs: [] },
] as const
