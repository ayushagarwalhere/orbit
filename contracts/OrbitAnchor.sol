// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title OrbitAnchor
/// @notice Public timestamping of the Orbit ledger. The operator publishes the Merkle root of all
///         ledger entry hashes. Anyone holding a passport can then prove that an event existed, and
///         has not been altered since, with an O(log n) inclusion proof, without trusting Orbit.
/// @dev Only 32-byte roots go on-chain: no supplier data, volumes or prices are made public, and
///      the cost per checkpoint is constant regardless of how many events it covers.
///      Tree: parent = sha256(left || right); an odd node is paired with itself.
contract OrbitAnchor {
    struct Checkpoint {
        bytes32 merkleRoot;
        uint64 ledgerLength;
        uint64 timestamp;
    }

    address public immutable operator;
    Checkpoint[] public checkpoints;

    event Anchored(uint256 indexed id, bytes32 indexed merkleRoot, uint64 ledgerLength);

    error NotOperator();
    error EmptyLedger();

    constructor() {
        operator = msg.sender;
    }

    function anchor(bytes32 merkleRoot, uint64 ledgerLength) external returns (uint256 id) {
        if (msg.sender != operator) revert NotOperator();
        if (ledgerLength == 0) revert EmptyLedger();
        id = checkpoints.length;
        checkpoints.push(Checkpoint(merkleRoot, ledgerLength, uint64(block.timestamp)));
        emit Anchored(id, merkleRoot, ledgerLength);
    }

    function count() external view returns (uint256) {
        return checkpoints.length;
    }

    /// @notice True if `leaf` (a ledger entry hash) is included in checkpoint `id`.
    function verifyInclusion(uint256 id, bytes32 leaf, bytes32[] calldata siblings, bool[] calldata siblingIsLeft)
        external
        view
        returns (bool)
    {
        require(siblings.length == siblingIsLeft.length, "proof length");
        bytes32 h = leaf;
        for (uint256 i = 0; i < siblings.length; i++) {
            h = siblingIsLeft[i] ? sha256(abi.encodePacked(siblings[i], h)) : sha256(abi.encodePacked(h, siblings[i]));
        }
        return h == checkpoints[id].merkleRoot;
    }
}
