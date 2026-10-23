// Creates a fresh EVM wallet for publishing anchors and saves it to .env.local (gitignored).
// Fund the printed address from a testnet faucet, then run `npm run deploy:anchor`.
import fs from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const file = ".env.local";
const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const match = existing.match(/^ORBIT_ANCHOR_PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/m);
const pk = match ? match[1] : generatePrivateKey();
if (!match) {
  const chain = existing.match(/^ORBIT_CHAIN=/m) ? "" : "ORBIT_CHAIN=base-sepolia\n";
  fs.writeFileSync(file, `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${chain}ORBIT_ANCHOR_PRIVATE_KEY=${pk}\n`);
}
console.log(`${match ? "Existing" : "New"} anchor wallet: ${privateKeyToAccount(pk).address}`);
console.log("Fund it with a little testnet ETH, e.g. Base Sepolia faucets: https://docs.base.org/base-chain/tools/network-faucets");
