// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title OrbitAnchor v3: open, multi-party timestamping of supply chain ledgers
/// @notice Anyone can publish the Merkle root of an Orbit ledger (the operator, an auditor, a
///         recycler, an NGO), and every checkpoint records who submitted it. Which submitters to
///         trust is the verifier's choice: Orbit's clients pin the operator address and named
///         witnesses, and treat every other submitter as unidentified.
///         Trees follow RFC 6962 / RFC 9162 (as in Certificate Transparency):
///           leaf = sha256(0x00 || entryHash), node = sha256(0x01 || left || right).
///         - verifyInclusion proves an entry is in a checkpoint (index- and size-bound).
///         - verifyConsistency proves a later checkpoint only APPENDS to an earlier one, so a
///           rewrite of anchored history can never be made consistent, whatever its length.
/// @dev Only 32-byte roots go on-chain (no supplier data, volumes or prices).
contract OrbitAnchor {
    struct Checkpoint {
        bytes32 ledgerId; // which ledger instance this root belongs to
        bytes32 merkleRoot; // RFC 6962 root over entry hashes 0..ledgerLength-1
        uint64 ledgerLength;
        uint64 timestamp;
        address submitter; // who vouches for this root
    }

    /// @notice Orbit's own anchoring wallet (the deployer). Informational: it has no special rights.
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

    /// @notice Up to `max` checkpoints for a ledger starting at position `from`, in one call.
    function checkpointsFor(bytes32 ledgerId, uint256 from, uint256 max) external view returns (uint256[] memory ids, Checkpoint[] memory cps) {
        uint256[] storage all = idsByLedger[ledgerId];
        uint256 end = from + max > all.length ? all.length : from + max;
        uint256 n = end > from ? end - from : 0;
        ids = new uint256[](n);
        cps = new Checkpoint[](n);
        for (uint256 i = 0; i < n; i++) {
            ids[i] = all[from + i];
            cps[i] = checkpoints[ids[i]];
        }
    }

    function _node(bytes32 l, bytes32 r) private pure returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x01), l, r));
    }

    /// @notice RFC 9162 §2.1.3.2: `entryHash` is leaf `index` of checkpoint `id`.
    function verifyInclusion(uint256 id, bytes32 entryHash, uint256 index, bytes32[] calldata path) external view returns (bool) {
        Checkpoint storage c = checkpoints[id];
        if (index >= c.ledgerLength) return false;
        uint256 fn = index;
        uint256 sn = uint256(c.ledgerLength) - 1;
        bytes32 r = sha256(abi.encodePacked(bytes1(0x00), entryHash));
        for (uint256 i = 0; i < path.length; i++) {
            if (sn == 0) return false;
            if (fn & 1 == 1 || fn == sn) {
                r = _node(path[i], r);
                if (fn & 1 == 0) {
                    while (fn & 1 == 0 && fn != 0) {
                        fn >>= 1;
                        sn >>= 1;
                    }
                }
            } else {
                r = _node(r, path[i]);
            }
            fn >>= 1;
            sn >>= 1;
        }
        return sn == 0 && r == c.merkleRoot;
    }

    /// @notice RFC 9162 §2.1.4.2: checkpoint `newer` extends checkpoint `older` by appending only.
    function verifyConsistency(uint256 older, uint256 newer, bytes32[] calldata proof) external view returns (bool) {
        Checkpoint storage a = checkpoints[older];
        Checkpoint storage b = checkpoints[newer];
        uint256 m = a.ledgerLength;
        uint256 n = b.ledgerLength;
        if (m == 0 || m > n) return false;
        if (m == n) return proof.length == 0 && a.merkleRoot == b.merkleRoot;
        bool pow2 = m & (m - 1) == 0;
        uint256 start = pow2 ? 0 : 1;
        if (!pow2 && proof.length == 0) return false;
        bytes32 fr = pow2 ? a.merkleRoot : proof[0];
        bytes32 sr = fr;
        uint256 fn = m - 1;
        uint256 sn = n - 1;
        while (fn & 1 == 1) {
            fn >>= 1;
            sn >>= 1;
        }
        for (uint256 i = start; i < proof.length; i++) {
            if (sn == 0) return false;
            if (fn & 1 == 1 || fn == sn) {
                fr = _node(proof[i], fr);
                sr = _node(proof[i], sr);
                if (fn & 1 == 0) {
                    while (fn & 1 == 0 && fn != 0) {
                        fn >>= 1;
                        sn >>= 1;
                    }
                }
            } else {
                sr = _node(sr, proof[i]);
            }
            fn >>= 1;
            sn >>= 1;
        }
        return sn == 0 && fr == a.merkleRoot && sr == b.merkleRoot;
    }
}
