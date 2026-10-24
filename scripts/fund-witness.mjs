// Sends a little testnet ETH from the anchor wallet to the witness wallet (both from .env.local).
//   npm run fund:witness                        # 0.00002 ETH to our own witness wallet
//   npm run fund:witness -- 0.00002 --to 0xABC  # gas for an outside witness's wallet
import { createPublicClient, createWalletClient, defineChain, formatEther, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const chain = defineChain({ id: 84532, name: "Base Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://sepolia.base.org"] } } });
const from = privateKeyToAccount(process.env.ORBIT_ANCHOR_PRIVATE_KEY);
const toArg = process.argv.indexOf("--to");
const to = toArg !== -1 ? process.argv[toArg + 1] : privateKeyToAccount(process.env.ORBIT_WITNESS_PRIVATE_KEY).address;
if (!/^0x[0-9a-fA-F]{40}$/.test(to ?? "")) throw new Error("--to needs a 0x address");
const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ account: from, chain, transport: http() });
const hash = await wallet.sendTransaction({ to, value: parseEther(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "0.00002") });
await pub.waitForTransactionReceipt({ hash });
console.log(`Funded witness ${to}: https://sepolia.basescan.org/tx/${hash}`);
console.log(`Anchor wallet left: ${formatEther(await pub.getBalance({ address: from.address }))} ETH, witness: ${formatEther(await pub.getBalance({ address: to }))} ETH`);
