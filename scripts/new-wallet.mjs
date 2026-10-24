// Creates a fresh EVM wallet and saves it to .env.local (gitignored).
//   npm run wallet               -> ORBIT_ANCHOR_PRIVATE_KEY (Orbit's own anchoring wallet)
//   npm run wallet -- --witness  -> ORBIT_WITNESS_PRIVATE_KEY (an independent witness's wallet)
// Fund the printed address from a testnet faucet.
import fs from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const name = process.argv.includes("--witness") ? "ORBIT_WITNESS_PRIVATE_KEY" : "ORBIT_ANCHOR_PRIVATE_KEY";
const file = ".env.local";
const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const match = existing.match(new RegExp(`^${name}=(0x[0-9a-fA-F]{64})$`, "m"));
const pk = match ? match[1] : generatePrivateKey();
if (!match) {
  const chain = existing.match(/^ORBIT_CHAIN=/m) ? "" : "ORBIT_CHAIN=base-sepolia\n";
  fs.writeFileSync(file, `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${chain}${name}=${pk}\n`);
}
console.log(`${match ? "Existing" : "New"} ${name === "ORBIT_WITNESS_PRIVATE_KEY" ? "witness" : "anchor"} wallet: ${privateKeyToAccount(pk).address}`);
console.log("Fund it with a little testnet ETH, e.g. Base Sepolia faucets: https://docs.base.org/base-chain/tools/network-faucets");
