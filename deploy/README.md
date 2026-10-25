# Deploy snapshot

`ledger.jsonl` is the demo ledger the hosted demo starts from (via `ORBIT_SNAPSHOT`). Its Merkle root is already anchored on Base Sepolia by Orbit's operator (checkpoint #11) and by the named witness (#12), so a freshly woken server verifies straight away without spending gas. It holds only public data: entries, public keys and signatures, no private keys.

The server must run with the same actor keystore (`ORBIT_KEYSTORE`) that signed it; otherwise it ignores the snapshot and seeds a new ledger.
