// Server-only: installs Node's native (OpenSSL) Ed25519 as the signing/verification backend.
// Imported for its side effect by the store, scripts and tests. Never imported by client code.
import nodeCrypto from "node:crypto";
import { setEd25519Backend, type Ed25519Backend } from "./crypto.ts";

// DER prefixes that wrap a raw 32-byte Ed25519 key as SPKI (public) / PKCS#8 (private).
const SPKI = Buffer.from("302a300506032b6570032100", "hex");
const PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");

const pubCache = new Map<string, nodeCrypto.KeyObject>();
const privCache = new Map<string, nodeCrypto.KeyObject>();

function pub(hex: string) {
  let k = pubCache.get(hex);
  if (!k) {
    k = nodeCrypto.createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(hex, "hex")]), format: "der", type: "spki" });
    pubCache.set(hex, k);
  }
  return k;
}
function priv(hex: string) {
  let k = privCache.get(hex);
  if (!k) {
    k = nodeCrypto.createPrivateKey({ key: Buffer.concat([PKCS8, Buffer.from(hex, "hex")]), format: "der", type: "pkcs8" });
    privCache.set(hex, k);
  }
  return k;
}

export const nativeBackend: Ed25519Backend = {
  sha256: (d) => new Uint8Array(nodeCrypto.createHash("sha256").update(d).digest()),
  sign: (hashHex, privateKeyHex) => nodeCrypto.sign(null, Buffer.from(hashHex, "hex"), priv(privateKeyHex)).toString("hex"),
  verify: (hashHex, signatureHex, publicKeyHex) => {
    try {
      if (publicKeyHex.length !== 64 || signatureHex.length !== 128) return false;
      return nodeCrypto.verify(null, Buffer.from(hashHex, "hex"), pub(publicKeyHex), Buffer.from(signatureHex, "hex"));
    } catch {
      return false;
    }
  },
};

export function installNativeCrypto() {
  setEd25519Backend(nativeBackend);
}
installNativeCrypto();
