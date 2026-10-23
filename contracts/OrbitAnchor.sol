// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title OrbitAnchor
/// @notice Publishes Merkle roots of the Orbit ledger to a public chain. Anyone holding a
///         passport can prove an event existed at checkpoint time with a Merkle inclusion proof
///         (see merkleProof / verifyMerkleProof in src/lib/crypto.ts), without trusting Orbit.
/// @dev Only roots are stored on-chain: no supplier data, volumes or prices leak publicly,
///      and the gas cost is one storage slot per checkpoint regardless of ledger size.
contract OrbitAnchor {
    struct Checkpoint {
        bytes32 merkleRoot;
        uint64 ledgerLength;
        uint64 timestamp;
    }

    address public immutable operator;
    Checkpoint[] public checkpoints;

    event Anchored(uint256 indexed id, bytes32 merkleRoot, uint64 ledgerLength);

    error NotOperator();
    error LedgerMustGrow();

    constructor() {
        operator = msg.sender;
    }

    function anchor(bytes32 merkleRoot, uint64 ledgerLength) external returns (uint256 id) {
        if (msg.sender != operator) revert NotOperator();
        uint256 n = checkpoints.length;
        // Append-only: a later checkpoint must cover at least as many entries.
        if (n > 0 && ledgerLength < checkpoints[n - 1].ledgerLength) revert LedgerMustGrow();
        checkpoints.push(Checkpoint(merkleRoot, ledgerLength, uint64(block.timestamp)));
        id = n;
        emit Anchored(id, merkleRoot, ledgerLength);
    }

    function count() external view returns (uint256) {
        return checkpoints.length;
    }

    /// @notice Verify a leaf (entry hash) against an anchored root. Mirrors the TS implementation:
    ///         parent = sha256(hexLeft ++ hexRight) over lowercase hex strings.
    function verify(uint256 id, string calldata leafHex, string[] calldata siblings, bool[] calldata siblingIsLeft) external view returns (bool) {
        bytes memory h = bytes(leafHex);
        for (uint256 i = 0; i < siblings.length; i++) {
            bytes32 parent = siblingIsLeft[i] ? sha256(abi.encodePacked(siblings[i], h)) : sha256(abi.encodePacked(h, siblings[i]));
            h = bytes(_toHex(parent));
        }
        return keccak256(h) == keccak256(bytes(_toHex(checkpoints[id].merkleRoot)));
    }

    function _toHex(bytes32 data) private pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(64);
        for (uint256 i = 0; i < 32; i++) {
            str[i * 2] = alphabet[uint8(data[i] >> 4)];
            str[i * 2 + 1] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(str);
    }
}
