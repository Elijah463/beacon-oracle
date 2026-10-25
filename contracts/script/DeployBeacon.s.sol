// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {USDCNGNOracle} from "../USDCNGNOracle.sol";

/**
 * @title DeployBeacon
 * @notice Deploys the USDCNGNOracle implementation + ERC1967Proxy in one script.
 *         The deployer becomes the owner. Call with --private-key OWNER_KEY.
 *
 * Usage:
 *   forge script contracts/script/DeployBeacon.s.sol:DeployBeacon \
 *     --rpc-url https://rpc.testnet.arc.io \
 *     --private-key $OWNER_PRIVATE_KEY \
 *     --broadcast
 *
 * Constructor args passed to initialize():
 *   _reporter            = deployer address (update via setReporter() after)
 *   _maxStaleness        = 3600  (1 hour)
 *   _deviationThresholdBps = 50  (0.5%)
 *   _circuitBreakerBps   = 1000 (10%)
 */
contract DeployBeacon is Script {
    function run() external {
        address deployer = vm.addr(vm.envUint("OWNER_PRIVATE_KEY"));
        vm.startBroadcast(vm.envUint("OWNER_PRIVATE_KEY"));

        // 1. Deploy implementation
        USDCNGNOracle impl = new USDCNGNOracle();
        console.log("Implementation deployed at:", address(impl));

        // 2. Encode initialize() calldata
        bytes memory initData = abi.encodeCall(
            USDCNGNOracle.initialize,
            (
                deployer,  // _reporter (owner sets setReporter() later to signing key)
                3600,      // _maxStaleness
                50,        // _deviationThresholdBps
                1000       // _circuitBreakerBps
            )
        );

        // 3. Deploy ERC1967 proxy -- atomically initializes in the constructor
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        console.log("Proxy deployed at:         ", address(proxy));
        console.log("Owner:                     ", deployer);
        console.log("Next step: call setReporter(<REPORTER_SIGNING_ADDRESS>) from the owner wallet.");

        vm.stopBroadcast();
    }
}
