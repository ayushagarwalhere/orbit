import { publicKeyOf, randomPrivateKey } from "./crypto.ts";

/**
 * Private keys by actor id. Generated randomly, never committed (data/ is gitignored).
 * - orbit-protocol is the sequencer key: it only orders entries and mints credits.
 * - All other keys belong to demo actors. In production they live in each actor's wallet and the
 *   server never sees them; in demo mode the console receives them so judges can role-play.
 */
export type Keystore = Record<string, string>;

export function generateKeystore(actorIds: string[]): Keystore {
  return Object.fromEntries(actorIds.map((id) => [id, randomPrivateKey()]));
}

export function publicKeys(keys: Keystore): Record<string, string> {
  return Object.fromEntries(Object.entries(keys).map(([id, k]) => [id, publicKeyOf(k)]));
}
