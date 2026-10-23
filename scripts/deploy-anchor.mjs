// Deploys contracts/OrbitAnchor.json to ORBIT_CHAIN using ORBIT_ANCHOR_PRIVATE_KEY and records
// ORBIT_ANCHOR_ADDRESS in .env.local. Run: npm run deploy:anchor
import fs from "node:fs";
import { createPublicClient, createWalletClient, defineChain, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const NETWORKS = {
  "base-sepolia": { id: 84532, name: "Base Sepolia", rpc: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org" },
  sepolia: { id: 11155111, name: "Ethereum Sepolia", rpc: "https://ethereum-sepolia-rpc.publicnode.com", explorer: "https://sepolia.etherscan.io" },
  "polygon-amoy": { id: 80002, name: "Polygon Amoy", rpc: "https://rpc-amoy.polygon.technology", explorer: "https://amoy.polygonscan.com" },
  localhost: { id: 31337, name: "Local Hardhat", rpc: "http://127.0.0.1:8545", explorer: "" },
};
const key = process.env.ORBIT_CHAIN ?? "base-sepolia";
const n = NETWORKS[key];
if (!n) throw new Error(`Unknown ORBIT_CHAIN ${key}`);
const pk = process.env.ORBIT_ANCHOR_PRIVATE_KEY;
if (!pk) throw new Error("ORBIT_ANCHOR_PRIVATE_KEY missing: run `npm run wallet` first");
const rpc = process.env.ORBIT_RPC_URL || n.rpc;
const chain = defineChain({ id: n.id, name: n.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const account = privateKeyToAccount(pk);
const pub = createPublicClient({ chain, transport: http(rpc) });
const wallet = createWalletClient({ account, chain, transport: http(rpc) });

const balance = await pub.getBalance({ address: account.address });
console.log(`Deployer ${account.address} on ${n.name}: ${formatEther(balance)} ETH`);
if (balance === 0n) throw new Error("Deployer has no funds: use a faucet first");

const { abi, bytecode } = JSON.parse(fs.readFileSync("contracts/OrbitAnchor.json", "utf8"));
const hash = await wallet.deployContract({ abi, bytecode });
console.log(`Deploy tx: ${n.explorer ? `${n.explorer}/tx/${hash}` : hash}`);
const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
const address = receipt.contractAddress;
console.log(`OrbitAnchor deployed at ${address}${n.explorer ? `  ${n.explorer}/address/${address}` : ""}`);

const env = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";
const lines = env.split(/\r?\n/).filter((l) => l && !l.startsWith("ORBIT_ANCHOR_ADDRESS=") && !l.startsWith("ORBIT_CHAIN="));
lines.push(`ORBIT_CHAIN=${key}`, `ORBIT_ANCHOR_ADDRESS=${address}`);
fs.writeFileSync(".env.local", lines.join("\n") + "\n");
console.log("Saved ORBIT_CHAIN and ORBIT_ANCHOR_ADDRESS to .env.local. Restart the app to start anchoring.");
