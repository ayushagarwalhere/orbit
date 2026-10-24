// Witness from a browser wallet (EIP-1193): re-check the whole ledger locally, then anchor its
// root from the visitor's own account. The wallet signs; Orbit never sees a key.
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { readLedgerCheckpoints, viemChain } from "./anchor-read.ts";
import { PROTOCOL_ID } from "./auth.ts";
import { MerkleTree } from "./crypto.ts";
import { hashEntry, verifyLedger } from "./ledger.ts";
import { ANCHOR_ABI, classifySubmitter, type Network, type TrustedDeployment } from "./networks.ts";
import type { Db, LedgerEntry } from "./types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<any> };

/** Everything a witness checks before anchoring. Throws with a plain reason if anything is off. */
export async function checkForWitness(entries: LedgerEntry[], network: Network, trusted: TrustedDeployment, rpc?: string) {
  const genesis = entries[0];
  if (!genesis || genesis.type !== "ACTOR_REGISTERED" || genesis.subjectId !== PROTOCOL_ID) throw new Error("Entry #0 is not the protocol's genesis");
  const ledgerId = String(genesis.data.ledgerId);
  const report = verifyLedger({ ledger: entries } as unknown as Db);
  if (!report.ok) throw new Error(`The ledger fails its own checks at #${report.issues[0].index}: ${report.issues[0].problem}. Not anchoring.`);
  const tree = new MerkleTree();
  for (const e of entries) {
    if (hashEntry(e) !== e.hash) throw new Error(`Entry #${e.index} doesn't match its hash. Not anchoring.`);
    tree.append(e.hash);
  }
  const { checkpoints } = await readLedgerCheckpoints(network, trusted.contract, ledgerId, rpc);
  let matched = 0;
  for (const c of checkpoints) {
    if (classifySubmitter(trusted, c.submitter).role === "unidentified") continue;
    if (c.ledgerLength > entries.length || tree.root(c.ledgerLength) !== c.merkleRoot) throw new Error(`On-chain checkpoint #${c.id} doesn't match this ledger: evidence of a rewrite. Not anchoring.`);
    matched++;
  }
  return { ledgerId, size: entries.length, root: tree.root(entries.length), matched };
}

/** Ask the wallet for an account on the right chain, then anchor the checked root from it. */
export async function anchorFromWallet(eth: Eip1193, network: Network, trusted: TrustedDeployment, c: { ledgerId: string; root: string; size: number }, rpc = network.rpc) {
  const [account] = (await eth.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
  if (!account) throw new Error("The wallet gave no account");
  const hexId = `0x${network.chainId.toString(16)}`;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (e: any) {
    if (e?.code !== 4902) throw e;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: hexId, chainName: network.name, rpcUrls: [network.rpc], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, blockExplorerUrls: network.explorer ? [network.explorer] : [] }],
    });
  }
  const chain = viemChain(network, rpc);
  const wallet = createWalletClient({ account, chain, transport: custom(eth) });
  const hash = await wallet.writeContract({ address: trusted.contract as `0x${string}`, abi: ANCHOR_ABI, functionName: "anchor", args: [`0x${c.ledgerId}`, `0x${c.root}`, BigInt(c.size)] });
  const receipt = await createPublicClient({ chain, transport: http(rpc) }).waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`The anchor transaction reverted: ${hash}`);
  return { hash, account };
}
