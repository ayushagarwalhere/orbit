# Be a witness for Orbit (about 10 minutes)

Orbit publishes a fingerprint of its whole ledger on a public blockchain. A **witness** is someone outside the Orbit team who downloads the ledger, checks every entry on their own computer, and then publishes the same fingerprint from **their own wallet**. After that, Orbit can't quietly rewrite history: the result would no longer match your fingerprint.

You don't need to trust us or understand the cryptography. The script does the checking and prints ✓ or ✕.

## What you need
- [Node.js](https://nodejs.org) 22.18 or newer (`node -v`)
- The ledger file the Orbit team sends you (`ledger.jsonl`), or the URL of a running Orbit node
- For step 3 only: a tiny amount of free Base Sepolia test ETH (no real money)

## 1. Get the code
```
git clone https://github.com/ayushagarwalhere/orbit && cd orbit
npm install
```

## 2. Check the ledger (no wallet, no gas)
```
npm run witness -- --file path/to/ledger.jsonl --check-only
```
Or, against a running node (in Windows PowerShell, first run `$env:ORBIT_URL="https://<the node>"`, then the npm command):
```
ORBIT_URL=https://<the node> npm run witness -- --check-only
```
You should see something like:
```
[witness] path/to/ledger.jsonl: ledger 4c6b0e7363f0…, 82 entries
  ✓ hashes, signatures, signed times and replay of every instruction: all OK
  ✓ on-chain checkpoint #0 by Orbit operator: 65 entries match
  ...
[witness] Verified. (--check-only: nothing anchored.)
```
Your computer has re-hashed every entry, checked every signature, re-run every rule, and compared the result with the fingerprints already on the blockchain. A ✕ means the ledger you were given doesn't match what Orbit published. Please tell us if you see one.

## 3. Publish your own fingerprint
```
npm run wallet -- --witness
```
This creates a new test wallet (or reuses the one already there), saves its key to `.env.local` (which never leaves your machine), and prints its address. Get a little test ETH for it from a [Base Sepolia faucet](https://docs.base.org/base-chain/tools/network-faucets), or send the address to the Orbit team and we'll send you some. Then run:
```
npm run witness -- --file path/to/ledger.jsonl
```
The script checks everything again, then anchors the fingerprint from your wallet and prints a link to your transaction.

## 4. Tell us
Send the Orbit team:
- your wallet address
- the transaction link
- a name to list you under (your own, or an organisation)

We'll add your address to the list of named witnesses in the code (`OFFICIAL_ANCHORS` in `src/lib/networks.ts`). From then on, every browser that verifies an Orbit passport also checks it against your fingerprint.

## What you're vouching for, and what you're not
- **You are saying:** "On this date, the ledger I received was internally consistent and matched Orbit's own published fingerprints."
- **You are not saying** the supply-chain facts are true. A factory can still sign a false energy figure. Orbit catches that only where someone else's signature contradicts it.

---
*For the Orbit team: send the witness `data/ledger.jsonl`, or a saved copy of `/api/ledger`. To send them gas, run `npm run fund:witness -- 0.00002 --to 0xTHEIR_ADDRESS`.*
