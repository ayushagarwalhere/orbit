// Prints the actor keystore as one line, for the ORBIT_KEYSTORE secret on a hosting provider.
// Pinning it keeps the seeded ledger (and its anchored Merkle root) identical across restarts.
import fs from "node:fs";
const file = "data/keystore.json";
if (!fs.existsSync(file)) throw new Error("Run the app once (npm run dev) to generate data/keystore.json");
process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync(file, "utf8"))) + "\n");
