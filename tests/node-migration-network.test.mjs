import { gunzipSync } from 'node:zlib';
/** Previously captured GitHub mock exchanges: transport never reaches the network. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ReadUnavailable,
  GitHubReader,
  requestJson,
} from "../tools/asf_agentkit_github_read.mjs";
import {
  GitHubDraftWriter,
  GitHubAppIssuer,
  mint_target_writer,
} from "../tools/asf_agentkit_publish.mjs";
const cases = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/node-migration/network-reference.json.gz', import.meta.url))));
const decode = (v) =>
  v && typeof v === "object"
    ? Object.hasOwn(v, "$bytes")
      ? Buffer.from(v.$bytes, "base64")
      : Array.isArray(v)
        ? v.map(decode)
        : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]))
    : v;
for (const [cid, c] of cases.entries())
  test(`${c.module}.${c.function}: ${c.case} #${cid}`, async () => {
    let at = 0;
    const remote = {
      [c.method]: async (...args) => {
        const row = c.trace[at++];
        assert.ok(row, "Unexpected remote request");
        assert.deepEqual(args, decode(row.args));
        if (row.error) throw new ReadUnavailable(row.error);
        return decode(row.result);
      },
    };
    const args = decode(c.args);
    args[c.remoteIndex] = remote;
    const mod = await import(`../tools/${c.module}.mjs`);
    if (c.denied) await assert.rejects(() => mod[c.function](...args));
    else {
      const result = await mod[c.function](...args);
      assert.deepEqual(result, c.result);
    }
    assert.equal(at, c.trace.length, "Every expected exchange consumed");
  });
test("transport uses fixed host GET-only no-redirect and never emits credentials", async () => {
  const calls = [],
    transport = async (url, opts) => {
      calls.push({ url, opts });
      return new Response('{"ok":true}');
    };
  const reader = new GitHubReader("example/repo", "TOKEN", transport);
  assert.deepEqual(await reader.get("/branches/main"), { ok: true });
  assert.equal(
    calls[0].url,
    "https://api.github.com/repos/example/repo/branches/main",
  );
  assert.equal(calls[0].opts.method, "GET");
  assert.equal(calls[0].opts.redirect, "manual");
  for (const p of [
    "https://evil.invalid",
    "//evil",
    "/../other",
    "/x#fragment",
  ])
    await assert.rejects(() => reader.get(p));
});
for (const [status, body, reason] of [
  [302, "", "unexpected-redirect"],
  [403, "secret-value", "http-403"],
  [200, "not JSON", "network-or-malformed-response"],
  [200, '{"x":1,"x":2}', "network-or-malformed-response"],
  [200, "x".repeat(1048577), "oversized-response"],
])
  test("transport refuses " + reason, async () => {
    await assert.rejects(
      () =>
        requestJson(
          "https://api.github.com/repos/example/repo",
          "TOKEN",
          "GET",
          undefined,
          async () => new Response(body, { status }),
        ),
      (e) =>
        e instanceof ReadUnavailable &&
        e.status === reason &&
        !e.message.includes("TOKEN") &&
        !e.message.includes("secret-value"),
    );
  });
for (const [method, p, payload] of [
  ["DELETE", "/git/refs/heads/main", {}],
  ["PATCH", "", {}],
  ["POST", "/actions/secrets", {}],
  ["GET", "/branches/main/../../settings", undefined],
])
  test("publication transport denies " + method + " " + p, async () => {
    const writer = new GitHubDraftWriter("example/repo", "TOKEN", () => {
      throw new Error("Network must not be called");
    });
    await assert.rejects(() => writer.request(method, p, payload), /allowlist/);
  });
test("App issuer requests exactly one repository and minimal writer permissions", async () => {
  const calls = [],
    issuer = {
      transport: async () => {},
      request: async (method, p, payload) => {
        calls.push({ method, p, payload });
        return method === "GET"
          ? {
              id: 42,
              app_id: 12345,
              permissions: { contents: "write", pull_requests: "write" },
            }
          : {
              token: "PRIVATE_FAKE_TOKEN",
              permissions: { contents: "write", pull_requests: "write" },
            };
      },
    };
  const writer = await mint_target_writer(issuer, "example/repo", 12345);
  assert.ok(writer instanceof GitHubDraftWriter);
  assert.deepEqual(calls[1].payload, {
    repositories: ["repo"],
    permissions: { contents: "write", pull_requests: "write" },
  });
  assert.equal(calls.length, 2);
});
