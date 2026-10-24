// Every exported passport must validate against the official UNTP Digital Product Passport 0.5.0
// JSON schema (fixture downloaded from https://test.uncefact.org/vocabulary/untp/dpp/untp-dpp-schema-0.5.0.json).
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { installNativeCrypto } from "../src/lib/crypto-node.ts";
import { generateKeystore } from "../src/lib/keys.ts";
import { exportPassport } from "../src/lib/passport.ts";
import { ACTOR_IDS, seedDb } from "../src/lib/seed.ts";

installNativeCrypto();

test("every passport export validates against the UNTP DPP 0.5.0 JSON schema", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("./fixtures/untp-dpp-schema-0.5.0.json", import.meta.url), "utf8"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ajv = new (Ajv2020 as any)({ allErrors: true, strict: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (addFormats as any)(ajv);
  const validate = ajv.compile(schema);
  const db = seedDb(generateKeystore(ACTOR_IDS), "ab".repeat(32));
  for (const p of db.products) {
    const ok = validate(exportPassport(db, p, "https://orbit.example"));
    assert.ok(ok, `${p.name}: ${JSON.stringify(validate.errors?.slice(0, 5))}`);
  }
});
