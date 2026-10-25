// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);
    function getRoundData(uint80 _roundId)
        external view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function latestRoundData()
        external view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

library OracleErrors {
    error NotReporter();
    error StalePrice(uint256 updatedAt, uint256 maxStaleness);
    error InvalidAnswer();
    error InvalidTimestamp();
    /// @dev Named differently from the CircuitBreakerTripped event to avoid ABI ambiguity.
    error CircuitBreakerLimitExceeded(int256 current, int256 incoming, uint256 deviationBps);
    error CircuitBreakerActive();
    error NoDataAvailable();
    error Unauthorized();
    error ZeroAddress();
    error InvalidBps();
    /// @dev Distinct from InvalidBps so callers can distinguish staleness misconfiguration.
    error InvalidStaleness();
    /// @dev Thrown by the renounceOwnership override to prevent permanent governance loss.
    error RenounceOwnershipDisabled();
    error InvalidSignature();
}

/**
 * @title USDCNGNOracle
 * @notice Chainlink AggregatorV3Interface-compatible USDC/NGN price oracle.
 *         Single trusted reporter for testnet PoC; upgrade reporter address to a
 *         multi-node coordinator contract without redeploying (UUPS upgradeable).
 *
 * Security model:
 *   - Heartbeat guard    : latestRoundData() reverts when price is older than maxStaleness.
 *   - Deviation threshold: off-chain hint stored on-chain; reporter skips gas when below it.
 *   - Circuit breaker    : transmit() trips the breaker and RETURNS (not reverts) when a single
 *                          update exceeds circuitBreakerBps. Flag persists. Owner resets manually.
 *   - Timestamps         : each round's timestamp must be non-decreasing (>= prior round's updatedAt).
 *   - Ownable2Step       : ownership transfer requires acceptance; renounceOwnership is blocked.
 *   - UUPS upgradeable   : only the owner can authorize an upgrade.
 */
contract USDCNGNOracle is
    Initializable,
    AggregatorV3Interface,
    Ownable2StepUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    struct RoundData {
        uint80  roundId;
        int256  answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80  answeredInRound;
    }

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 private constant BUFFER_SIZE     = 100;
    uint256 private constant MAX_BPS         = 10_000;
    uint8   private constant ORACLE_DECIMALS = 8;
    uint256 private constant ORACLE_VERSION  = 1;
    uint256 private constant PHASE_SHIFT     = 64;

    /// @dev Floor for maxStaleness. Prevents a governance mistake from bricking every read.
    uint256 private constant MIN_STALENESS = 60;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @dev Circular buffer: round N lives at slot (N % BUFFER_SIZE).
    mapping(uint256 slot => RoundData data) private roundBuffer;

    uint256 private latestRoundIdCounter;

    /// @dev Phase id increments on every UUPS upgrade. Encoded into the upper 16 bits of roundId.
    uint16 public phaseId;

    address public reporter;
    uint256 public maxStaleness;
    uint256 public deviationThresholdBps;
    uint256 public circuitBreakerBps;
    bool    public circuitBreakerTripped;

    mapping(address consumer => bool isAuthorized) public authorizedConsumers;
    bool public requireConsumerAuthorization;

    /// @dev Reserved gap for future storage variables without slot collisions on upgrade.
    uint256[49] private __gap;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt);

    /// @dev Fired when the circuit breaker fires. The price is NOT stored when this fires.
    event CircuitBreakerTripped(int256 indexed current, int256 indexed incoming, uint256 deviationBps);

    event CircuitBreakerReset(address indexed by);

    /// @dev Fired when the owner uses resetCircuitBreakerAndPublish to accept a verified large move.
    event CircuitBreakerResetAndPublished(address indexed by, int256 newAnswer, uint256 roundId);

    event ReporterChanged(address indexed oldReporter, address indexed newReporter);
    event MaxStalenessUpdated(uint256 oldValue, uint256 newValue);
    event DeviationThresholdUpdated(uint256 oldValue, uint256 newValue);
    event CircuitBreakerBpsUpdated(uint256 oldValue, uint256 newValue);
    event ConsumerAdded(address indexed consumer);
    event ConsumerRemoved(address indexed consumer);
    event ConsumerAuthorizationRequirementUpdated(bool indexed oldValue, bool indexed newValue);
    event ContractUpgraded(address indexed newImplementation);
    event NewTransmission(uint32 indexed aggregatorRoundId, int192 answer, address transmitter, uint16 phaseId);

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyReporter() {
        if (msg.sender != reporter) revert OracleErrors.NotReporter();
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // -------------------------------------------------------------------------
    // Initializer
    // -------------------------------------------------------------------------

    /**
     * @notice Initializes the proxy. Called exactly once via the proxy at deployment.
     * @param _reporter              Address allowed to submit price rounds.
     * @param _maxStaleness          Maximum age (seconds) before a read reverts as stale. Min 60.
     * @param _deviationThresholdBps Off-chain skip threshold in basis points.
     * @param _circuitBreakerBps     On-chain breaker threshold in bps (must be > _deviationThresholdBps).
     */
    function initialize(
        address _reporter,
        uint256 _maxStaleness,
        uint256 _deviationThresholdBps,
        uint256 _circuitBreakerBps
    ) external initializer {
        __Ownable_init(msg.sender);
        __Ownable2Step_init();
        __Pausable_init();
        // UUPSUpgradeable v5 has no __init -- no call needed.

        if (_reporter == address(0))                                         revert OracleErrors.ZeroAddress();
        if (_maxStaleness < MIN_STALENESS)                                   revert OracleErrors.InvalidStaleness();
        if (_deviationThresholdBps > MAX_BPS || _circuitBreakerBps > MAX_BPS) revert OracleErrors.InvalidBps();
        // Breaker must be strictly above deviation so a normal large-but-valid move
        // can always be submitted without tripping the breaker.
        if (_circuitBreakerBps <= _deviationThresholdBps)                   revert OracleErrors.InvalidBps();

        reporter             = _reporter;
        maxStaleness         = _maxStaleness;
        deviationThresholdBps = _deviationThresholdBps;
        circuitBreakerBps    = _circuitBreakerBps;
    }

    // -------------------------------------------------------------------------
    // AggregatorV3Interface -- metadata
    // -------------------------------------------------------------------------

    /// @inheritdoc AggregatorV3Interface
    function decimals() external pure override returns (uint8) { return ORACLE_DECIMALS; }

    /// @inheritdoc AggregatorV3Interface
    function description() external pure override returns (string memory) { return "USDC / NGN"; }

    /// @inheritdoc AggregatorV3Interface
    function version() external pure override returns (uint256) { return ORACLE_VERSION; }

    /**
     * @notice Returns the type and version string for Chainlink feed registry compatibility.
     * @dev Chainlink feed registries and indexers call this to identify the aggregator type.
     *      Format matches Chainlink convention: "<ContractType> <MajorVersion>.<MinorVersion>.<PatchVersion>"
     */
    function typeAndVersion() external pure returns (string memory) {
        return "USDCNGNOracle 1.0.0";
    }

    /// @notice Returns the latest round id counter.
    function latestRound() external view returns (uint256) {
        return uint256(_buildRoundId(phaseId, latestRoundIdCounter));
    }

    // -------------------------------------------------------------------------
    // AggregatorV3Interface -- price reads
    // -------------------------------------------------------------------------

    /**
     * @notice Returns the latest submitted answer.
     * @dev Reverts when stale, paused, or unauthorized.
     *      Use getRoundData(latestRound()) for a non-staleness-checked read (e.g. dashboard stale badge).
     */
    function latestAnswer() external view whenNotPaused returns (int256) {
        _enforceConsumerAuthorization();
        if (latestRoundIdCounter == 0) revert OracleErrors.NoDataAvailable();
        RoundData memory round = _getRoundDataById(_buildRoundId(phaseId, latestRoundIdCounter));
        _enforceFreshness(round.updatedAt);
        return round.answer;
    }

    /**
     * @notice Returns full data for the latest round.
     * @dev Reverts when stale. Dashboards wanting a stale badge should call
     *      getRoundData(latestRound()) and inspect updatedAt themselves.
     */
    function latestRoundData()
        external view override whenNotPaused
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        _enforceConsumerAuthorization();
        if (latestRoundIdCounter == 0) revert OracleErrors.NoDataAvailable();
        RoundData memory round = _getRoundDataById(_buildRoundId(phaseId, latestRoundIdCounter));
        _enforceFreshness(round.updatedAt);
        return (round.roundId, round.answer, round.startedAt, round.updatedAt, round.answeredInRound);
    }

    /**
     * @notice Returns full data for a specific historical round.
     * @dev Does NOT enforce freshness so callers can retrieve old rounds freely.
     *      Caller is responsible for inspecting updatedAt.
     */
    function getRoundData(uint80 _roundId)
        external view override whenNotPaused
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        _enforceConsumerAuthorization();
        RoundData memory round = _getRoundDataById(_roundId);
        return (round.roundId, round.answer, round.startedAt, round.updatedAt, round.answeredInRound);
    }

    // -------------------------------------------------------------------------
    // On-chain quote functions (composability layer)
    // -------------------------------------------------------------------------

    /**
     * @notice Converts a USDC amount to its NGN equivalent using the latest oracle price.
     * @dev Formula: ngnAmount (2 dec) = usdcAmount (6 dec) * price (8 dec) / 1e12
     *      Example: quoteUSDCToNGN(10_000e6) at price=1600e8 returns 16_000_000e2
     * @param usdcAmount Amount of USDC in atomic units (6 decimals).
     * @return ngnAmount Equivalent NGN in atomic units (2 decimals / kobo precision).
     */
    function quoteUSDCToNGN(uint256 usdcAmount) external view whenNotPaused returns (uint256 ngnAmount) {
        _enforceConsumerAuthorization();
        if (circuitBreakerTripped)    revert OracleErrors.CircuitBreakerActive();
        if (latestRoundIdCounter == 0) revert OracleErrors.NoDataAvailable();
        RoundData memory round = _getRoundDataById(_buildRoundId(phaseId, latestRoundIdCounter));
        _enforceFreshness(round.updatedAt);
        ngnAmount = (usdcAmount * uint256(round.answer)) / 1e12;
    }

    /**
     * @notice Converts an NGN amount to its USDC equivalent using the latest oracle price.
     * @dev Formula: usdcAmount (6 dec) = ngnAmount (2 dec) * 1e12 / price (8 dec)
     *      Example: quoteNGNToUSDC(16_000_000e2) at price=1600e8 returns 10_000e6
     * @param ngnAmount  Amount of NGN in atomic units (2 decimals / kobo precision).
     * @return usdcAmount Equivalent USDC in atomic units (6 decimals).
     */
    function quoteNGNToUSDC(uint256 ngnAmount) external view whenNotPaused returns (uint256 usdcAmount) {
        _enforceConsumerAuthorization();
        if (circuitBreakerTripped)    revert OracleErrors.CircuitBreakerActive();
        if (latestRoundIdCounter == 0) revert OracleErrors.NoDataAvailable();
        RoundData memory round = _getRoundDataById(_buildRoundId(phaseId, latestRoundIdCounter));
        _enforceFreshness(round.updatedAt);
        if (round.answer <= 0) revert OracleErrors.InvalidAnswer();
        usdcAmount = (ngnAmount * 1e12) / uint256(round.answer);
    }

    /**
     * @notice Returns the round metadata backing the current quote for auditability.
     * @return roundId    Round id the quote is based on.
     * @return price      Raw stored price (8 decimals).
     * @return updatedAt  Unix timestamp when this price was published.
     * @return ageSeconds Seconds elapsed since the price was published.
     */
    function latestQuoteMetadata() external view whenNotPaused returns (
        uint80  roundId,
        int256  price,
        uint256 updatedAt,
        uint256 ageSeconds
    ) {
        _enforceConsumerAuthorization();
        if (latestRoundIdCounter == 0) revert OracleErrors.NoDataAvailable();
        RoundData memory round = _getRoundDataById(_buildRoundId(phaseId, latestRoundIdCounter));
        _enforceFreshness(round.updatedAt);
        ageSeconds = block.timestamp - round.updatedAt;
        return (round.roundId, round.answer, round.updatedAt, ageSeconds);
    }

    // -------------------------------------------------------------------------
    // Transmit
    // -------------------------------------------------------------------------

    /**
     * @notice Submits a new oracle answer with an ECDSA signature over the payload.
     * @dev The reporter must sign keccak256(abi.encodePacked(address(this), answer, timestamp, latestRoundIdCounter + 1))
     *      with the reporter's private key. The contract verifies the signature matches the reporter address.
     *      This ensures the exact payload was signed by the reporter and not tampered in transit.
     * @param answer    The reported USDC/NGN price with 8 decimals (must be > 0).
     * @param timestamp Data timestamp (must be >= last updatedAt, <= block.timestamp, within maxStaleness).
     * @param signature ECDSA signature (65 bytes) over keccak256(abi.encodePacked(address(this), answer, timestamp, latestRoundIdCounter + 1)).
     */
    function transmit(int256 answer, uint256 timestamp, bytes calldata signature) external onlyReporter whenNotPaused {
        if (circuitBreakerTripped) revert OracleErrors.CircuitBreakerActive();
        if (answer <= 0)           revert OracleErrors.InvalidAnswer();

        // Verify ECDSA signature: reporter must have signed the exact payload
        bytes32 payloadHash = keccak256(abi.encodePacked(address(this), answer, timestamp, latestRoundIdCounter + 1));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", payloadHash));
        address recovered = _recoverSigner(ethSignedHash, signature);
        if (recovered != reporter) revert OracleErrors.InvalidSignature();

        _enforceTimestampWindow(timestamp);

        if (latestRoundIdCounter != 0) {
            RoundData memory latest = _getRoundDataById(_buildRoundId(phaseId, latestRoundIdCounter));

            // Timestamps must be non-decreasing. On Arc, consecutive blocks may share
            // the same block.timestamp, so we allow equal timestamps here.
            // Round counter monotonicity (latestRoundIdCounter always increments) provides
            // the secondary ordering guarantee for consumers.
            if (timestamp < latest.updatedAt) revert OracleErrors.InvalidTimestamp();

            uint256 deviationBps = _calculateDeviationBps(latest.answer, answer);
            if (deviationBps > circuitBreakerBps) {
                // FINDING 1: RETURN (not revert) so circuitBreakerTripped = true is committed.
                circuitBreakerTripped = true;
                emit CircuitBreakerTripped(latest.answer, answer, deviationBps);
                return;
            }
        }

        uint256 nextRoundId   = latestRoundIdCounter + 1;
        uint80  nextRoundId80 = _buildRoundId(phaseId, nextRoundId);

        roundBuffer[nextRoundId % BUFFER_SIZE] = RoundData({
            roundId:         nextRoundId80,
            answer:          answer,
            startedAt:       timestamp,
            updatedAt:       timestamp,
            answeredInRound: nextRoundId80
        });

        latestRoundIdCounter = nextRoundId;
        emit AnswerUpdated(answer, nextRoundId, timestamp);
        emit NewTransmission(uint32(nextRoundId), int192(answer), msg.sender, phaseId);
    }

    // -------------------------------------------------------------------------
    // Governance
    // -------------------------------------------------------------------------

    /**
     * @notice Updates the reporter address (use a coordinator contract for multi-node).
     */
    function setReporter(address newReporter) external onlyOwner {
        if (newReporter == address(0)) revert OracleErrors.ZeroAddress();
        address old = reporter;
        reporter = newReporter;
        emit ReporterChanged(old, newReporter);
    }

    /**
     * @notice Updates the staleness threshold.
     * @dev FINDING 14 FIX: uses InvalidStaleness (not InvalidBps) for clarity.
     * @param newMaxStaleness New max staleness in seconds (must be >= 60).
     */
    function setMaxStaleness(uint256 newMaxStaleness) external onlyOwner {
        if (newMaxStaleness < MIN_STALENESS) revert OracleErrors.InvalidStaleness();
        uint256 old = maxStaleness;
        maxStaleness = newMaxStaleness;
        emit MaxStalenessUpdated(old, newMaxStaleness);
    }

    /**
     * @notice Updates the off-chain deviation threshold hint.
     * @param bps New threshold in bps (must be < circuitBreakerBps).
     */
    function setDeviationThreshold(uint256 bps) external onlyOwner {
        if (bps > MAX_BPS)            revert OracleErrors.InvalidBps();
        if (bps >= circuitBreakerBps) revert OracleErrors.InvalidBps();
        uint256 old = deviationThresholdBps;
        deviationThresholdBps = bps;
        emit DeviationThresholdUpdated(old, bps);
    }

    /**
     * @notice Updates the on-chain circuit breaker threshold.
     * @param bps New threshold in bps (must be > deviationThresholdBps).
     */
    function setCircuitBreakerBps(uint256 bps) external onlyOwner {
        if (bps > MAX_BPS)                revert OracleErrors.InvalidBps();
        if (bps <= deviationThresholdBps) revert OracleErrors.InvalidBps();
        uint256 old = circuitBreakerBps;
        circuitBreakerBps = bps;
        emit CircuitBreakerBpsUpdated(old, bps);
    }

    /**
     * @notice Resets the circuit breaker flag. Use when the next normal transmit()
     *         should re-establish the price after a bad-data trip.
     */
    function resetCircuitBreaker() external onlyOwner {
        circuitBreakerTripped = false;
        emit CircuitBreakerReset(msg.sender);
    }

    /**
     * @notice FINDING 15 FIX: Reset the breaker AND publish a verified answer atomically.
     * @dev Bypasses the deviation check. Use when the breaker fired on a genuine large
     *      move (e.g. a real devaluation) that the owner has verified off-chain.
     *      Prevents the feed from being permanently bricked by a valid price move.
     * @param answer    Owner-verified price with 8 decimals (must be > 0).
     * @param timestamp Data timestamp (must be >= last round updatedAt, <= block.timestamp, within maxStaleness).
     */
    function resetCircuitBreakerAndPublish(int256 answer, uint256 timestamp) external onlyOwner whenNotPaused {
        if (answer <= 0) revert OracleErrors.InvalidAnswer();
        _enforceTimestampWindow(timestamp);

        // Ensure non-decreasing timestamp ordering (same rule as transmit).
        if (latestRoundIdCounter != 0) {
            RoundData memory latest = _getRoundDataById(_buildRoundId(phaseId, latestRoundIdCounter));
            if (timestamp < latest.updatedAt) revert OracleErrors.InvalidTimestamp();
        }

        circuitBreakerTripped = false;

        uint256 nextRoundId   = latestRoundIdCounter + 1;
        uint80  nextRoundId80 = _buildRoundId(phaseId, nextRoundId);

        roundBuffer[nextRoundId % BUFFER_SIZE] = RoundData({
            roundId:         nextRoundId80,
            answer:          answer,
            startedAt:       timestamp,
            updatedAt:       timestamp,
            answeredInRound: nextRoundId80
        });

        latestRoundIdCounter = nextRoundId;
        emit CircuitBreakerResetAndPublished(msg.sender, answer, nextRoundId);
        emit AnswerUpdated(answer, nextRoundId, timestamp);
    }

    /// @notice Adds an authorized consumer (for read-restricted mode).
    function addConsumer(address consumer) external onlyOwner {
        if (consumer == address(0)) revert OracleErrors.ZeroAddress();
        authorizedConsumers[consumer] = true;
        emit ConsumerAdded(consumer);
    }

    /// @notice Removes an authorized consumer.
    function removeConsumer(address consumer) external onlyOwner {
        authorizedConsumers[consumer] = false;
        emit ConsumerRemoved(consumer);
    }

    /// @notice Enables or disables consumer authorization checks on read methods.
    function setRequireConsumerAuthorization(bool required) external onlyOwner {
        bool old = requireConsumerAuthorization;
        requireConsumerAuthorization = required;
        emit ConsumerAuthorizationRequirementUpdated(old, required);
    }

    /// @notice Pauses transmit() and all read methods.
    function pause() external onlyOwner { _pause(); }

    /// @notice Unpauses the contract.
    function unpause() external onlyOwner { _unpause(); }

    /**
     * @notice FINDING 14 FIX: Permanently blocked.
     * @dev Renouncing ownership would brick governance functions and the UUPS upgrade path forever.
     */
    function renounceOwnership() public pure override {
        revert OracleErrors.RenounceOwnershipDisabled();
    }

    // -------------------------------------------------------------------------
    // UUPS upgrade authorization
    // -------------------------------------------------------------------------

    /// @notice Only the owner may authorize a new implementation.
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        phaseId += 1;
        emit ContractUpgraded(newImplementation);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// @dev Encodes phaseId into the upper 16 bits of a uint80 roundId, matching Chainlink proxy convention.
    function _buildRoundId(uint16 _phaseId, uint256 aggregatorRoundId) internal pure returns (uint80) {
        // Chainlink format: phaseId occupies bits [79:64], aggregatorRoundId occupies bits [63:0]
        return uint80((uint256(_phaseId) << PHASE_SHIFT) | aggregatorRoundId);
    }

    /// @dev Extracts the aggregatorRoundId (lower 64 bits) from a full Chainlink-style roundId.
    function _extractAggregatorRoundId(uint80 fullRoundId) internal pure returns (uint64) {
        return uint64(fullRoundId & type(uint64).max);
    }

    /// @dev Extracts the phaseId (upper 16 bits) from a full Chainlink-style roundId.
    function _extractPhaseId(uint80 fullRoundId) external pure returns (uint16) {
        return uint16(fullRoundId >> PHASE_SHIFT);
    }

    function _getRoundDataById(uint80 _roundId) internal view returns (RoundData memory round) {
        uint64 aggRoundId = _extractAggregatorRoundId(_roundId);
        if (aggRoundId == 0 || uint256(aggRoundId) > latestRoundIdCounter) revert OracleErrors.NoDataAvailable();
        round = roundBuffer[uint256(aggRoundId) % BUFFER_SIZE];
        if (round.roundId != _roundId) revert OracleErrors.NoDataAvailable();
    }

    function _enforceFreshness(uint256 updatedAt) internal view {
        if (block.timestamp - updatedAt > maxStaleness) {
            revert OracleErrors.StalePrice(updatedAt, maxStaleness);
        }
    }

    /**
     * @dev FINDING 8 FIX: window is 1x maxStaleness (not 2x). Timestamp must not be in the future.
     */
    function _enforceTimestampWindow(uint256 timestamp) internal view {
        if (timestamp > block.timestamp) revert OracleErrors.InvalidTimestamp();
        uint256 oldestAllowed = block.timestamp > maxStaleness ? block.timestamp - maxStaleness : 0;
        if (timestamp < oldestAllowed)   revert OracleErrors.InvalidTimestamp();
    }

    function _enforceConsumerAuthorization() internal view {
        if (requireConsumerAuthorization && msg.sender != owner() && !authorizedConsumers[msg.sender]) {
            revert OracleErrors.Unauthorized();
        }
    }

    function _calculateDeviationBps(int256 current, int256 incoming) internal pure returns (uint256) {
        if (current <= 0) revert OracleErrors.InvalidAnswer();
        uint256 currentU  = uint256(current);
        uint256 incomingU = uint256(incoming);
        uint256 absDiff   = currentU > incomingU ? currentU - incomingU : incomingU - currentU;
        return (absDiff * MAX_BPS) / currentU;
    }

    /**
     * @dev Recovers the signer address from an Ethereum signed message hash and a 65-byte ECDSA signature.
     *      Supports both 27/28 and 0/1 v values.
     */
    function _recoverSigner(bytes32 ethSignedHash, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) revert OracleErrors.InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert OracleErrors.InvalidSignature();
        address recovered = ecrecover(ethSignedHash, v, r, s);
        if (recovered == address(0)) revert OracleErrors.InvalidSignature();
        return recovered;
    }

    function _toUint80(uint256 value) internal pure returns (uint80) {
        if (value > type(uint80).max) revert OracleErrors.NoDataAvailable();
        return uint80(value);
    }
}
