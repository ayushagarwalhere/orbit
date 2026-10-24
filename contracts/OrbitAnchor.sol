// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title OrbitAnchor v2: open, multi-party timestamping of supply chain ledgers
/// @notice Anyone can publish the Merkle root of an Orbit ledger: the operator, an auditor, a
///         recycler, an NGO watchdog. Every checkpoint records who submitted it. The operator is
///         one witness among many, not a gatekeeper:
///          - If the operator rewrites history, every independent witness's earlier root disagrees.
///          - If the operator withholds events from the chain, a witness that saw them anchors them anyway.
///         Holders of a passport prove an event's inclusion with an O(log n) Merkle proof.
/// @dev Only 32-byte roots go on-chain (no supplier data, volumes or prices), so the cost per
///      checkpoint is constant regardless of how many events it covers.
///      Tree: parent = sha256(left || right); an odd node is paired with itself.
contract OrbitAnchor {
    struct Checkpoint {
        bytes32 ledgerId; // which ledger instance this root belongs to
        bytes32 merkleRoot; // root over entry hashes 0..ledgerLength-1
        uint64 ledgerLength;
        uint64 timestamp;
        address submitter; // who vouches for this root
    }

    /// @notice Orbit's own anchoring wallet (the deployer). Informational only: it has no special rights.
    address public immutable operator;
    Checkpoint[] public checkpoints;
    mapping(bytes32 => uint256[]) private idsByLedger;

    event Anchored(uint256 indexed id, bytes32 indexed ledgerId, address indexed submitter, bytes32 merkleRoot, uint64 ledgerLength);

    error EmptyLedger();

    constructor() {
        operator = msg.sender;
    }

    /// @notice Publish a root you have checked yourself. Open to everyone.
    function anchor(bytes32 ledgerId, bytes32 merkleRoot, uint64 ledgerLength) external returns (uint256 id) {
        if (ledgerLength == 0) revert EmptyLedger();
        id = checkpoints.length;
        checkpoints.push(Checkpoint(ledgerId, merkleRoot, ledgerLength, uint64(block.timestamp), msg.sender));
        idsByLedger[ledgerId].push(id);
        emit Anchored(id, ledgerId, msg.sender, merkleRoot, ledgerLength);
    }

    function count() external view returns (uint256) {
        return checkpoints.length;
    }

    function countFor(bytes32 ledgerId) external view returns (uint256) {
        return idsByLedger[ledgerId].length;
    }

    /// @notice The i-th checkpoint published for a ledger (in submission order).
    function checkpointFor(bytes32 ledgerId, uint256 i) external view returns (uint256 id, Checkpoint memory cp) {
        id = idsByLedger[ledgerId][i];
        cp = checkpoints[id];
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
