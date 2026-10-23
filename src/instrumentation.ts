// Runs once when the Next.js server starts: make sure the current ledger is anchored on-chain.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bootAnchor } = await import("./lib/chain.ts");
  bootAnchor();
}
