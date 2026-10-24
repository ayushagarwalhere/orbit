// Compiles contracts/OrbitAnchor.sol with solc-js and writes the ABI + bytecode artifact.
import fs from "node:fs";
import solc from "solc";

const source = fs.readFileSync("contracts/OrbitAnchor.sol", "utf8");
const input = {
  language: "Solidity",
  sources: { "OrbitAnchor.sol": { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "metadata"] } } },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors ?? []).filter((e) => e.severity === "error");
for (const e of out.errors ?? []) console.error(e.formattedMessage);
if (errors.length) process.exit(1);
const c = out.contracts["OrbitAnchor.sol"].OrbitAnchor;
const artifact = { contractName: "OrbitAnchor", compiler: `solc ${solc.version()}`, abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` };
fs.writeFileSync("contracts/OrbitAnchor.json", JSON.stringify(artifact, null, 2) + "\n");
// Solidity metadata (embedded by hash in the bytecode) lets anyone verify the source on Sourcify.
fs.writeFileSync("contracts/OrbitAnchor.metadata.json", c.metadata);
console.log(`Compiled OrbitAnchor with ${artifact.compiler}: ${(c.evm.bytecode.object.length / 2) | 0} bytes`);
