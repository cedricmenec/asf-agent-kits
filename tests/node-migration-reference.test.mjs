import { gunzipSync } from 'node:zlib';
/** Frozen outcomes captured from the 316-test pre-migration suite. No legacy runtime. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const cases = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/node-migration/reference.json.gz', import.meta.url))));
const decode = (v) =>
  v && typeof v === "object"
    ? Object.hasOwn(v, "$bytes")
      ? Buffer.from(v.$bytes, "base64")
      : Object.hasOwn(v, "$number")
        ? Number(v.$number.replace("nan", "NaN").replace("inf", "Infinity"))
        : Array.isArray(v)
          ? v.map(decode)
          : Object.fromEntries(
              Object.entries(v).map(([k, x]) => [k, decode(x)]),
            )
    : v;
const encode = (v) =>
  v === undefined
    ? null
    : Buffer.isBuffer(v)
      ? { $bytes: v.toString("base64") }
      : Array.isArray(v)
        ? v.map(encode)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v).map(([k, x]) => [k, encode(x)]),
            )
          : v;
const modules = new Map();
for (const c of cases) {
  test(`${c.module}.${c.function}: ${c.case} #${cases.indexOf(c)}`, async () => {
    if (!modules.has(c.module))
      modules.set(c.module, await import(`../tools/${c.module}.mjs`));
    const fn = modules.get(c.module)[c.function];
    assert.equal(typeof fn, "function");
    const args = decode(c.args);
    if (c.denied) {
      await assert.rejects(async () => await fn(...args));
      return;
    }
    let actual = encode(await fn(...args));
    let expected = c.result;
    // Schema engines report different diagnostics; preserve accept/deny semantics.
    if (c.function === "validate") {
      assert.equal(actual.length === 0, expected.length === 0);
      return;
    }
    if (c.function === "inspect_claim" && expected.errors?.length) {
      assert.equal(actual.claimInternallyConsistent, false);
      assert.ok(actual.errors.length);
      actual = { ...actual, errors: [] };
      expected = { ...expected, errors: [] };
    }
    assert.deepEqual(actual, expected);
  });
}
