import { parseAllDocuments } from "yaml";
import { diffArrays } from "diff";
import {
  fs,
  member,
  requireThat,
  strictFile,
  safeRoot,
  hash,
  readFile,
  isMain,
  runMain,
  output,
} from "./node/common.mjs";
import { validate } from "./validate_contracts.mjs";
import { load_lock, LOCK_RELATIVE } from "./plan_install.mjs";
export const MAX_MERGE_SIZE = 1048576,
  CONFIG = ".asf/agentkit.yaml";
export class PlanError extends Error {}
export function config_for(target) {
  const raw = readFile(member(target, CONFIG)).toString();
  requireThat(!raw.includes("\t"), "YAML tabs forbidden");
  const docs = parseAllDocuments(raw, { uniqueKeys: true, strict: true });
  requireThat(
    docs.length === 1 && docs[0].errors.length === 0,
    "Exactly one safe YAML mapping required",
  );
  const inspect = (n) => {
    if (!n || typeof n !== "object") return;
    requireThat(
      !n.anchor && !n.tag && n.constructor?.name !== "Alias",
      "YAML anchors, aliases and custom tags forbidden",
    );
    if (n.items)
      for (const item of n.items) {
        if (item?.key)
          requireThat(
            typeof item.key.value === "string" && item.key.value !== "<<",
            "String keys only; merge keys forbidden",
          );
        inspect(item.key);
        inspect(item.value);
        if (!item.key) inspect(item);
      }
  };
  inspect(docs[0].contents);
  const config = docs[0].toJS({ maxAliasCount: 0 });
  requireThat(validate("config", config).length === 0, "Invalid config");
  return config;
}
export function merge_hunks(base, value) {
  let at = 0;
  const result = [];
  const parts = diffArrays(base, value);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p.added && !p.removed) {
      at += p.value.length;
      continue;
    }
    const start = at;
    let added = [];
    if (p.removed) {
      at += p.value.length;
      if (parts[i + 1]?.added) added = parts[++i].value;
    } else added = p.value;
    result.push([start, at, added]);
  }
  return result;
}
export function overlaps([x, y], [u, v]) {
  if (x === y && u === v) return x === u;
  if (x === y) return u <= x && x <= v;
  if (u === v) return x <= u && u <= y;
  return x < v && u < y;
}
export function three_way(base, local, candidate) {
  if (local.equals(base)) return [candidate, "candidate"];
  if (candidate.equals(base)) return [local, "preserve-local"];
  if (local.equals(candidate)) return [local, "already-candidate"];
  for (const raw of [base, local, candidate])
    requireThat(
      raw.length <= MAX_MERGE_SIZE && !raw.includes(0) && !raw.includes(13),
      "Binary, CRLF or oversized merge requires review",
    );
  const decode = (raw) =>
    new TextDecoder("utf-8", { fatal: true })
      .decode(raw)
      .match(/[^\n]*\n|[^\n]+$/g) || [];
  const b = decode(base),
    ours = merge_hunks(b, decode(local)),
    theirs = merge_hunks(b, decode(candidate)),
    joined = [...ours];
  for (const h of theirs) {
    if (ours.some((o) => JSON.stringify(o) === JSON.stringify(h))) continue;
    requireThat(
      !ours.some((o) => overlaps(h, o)),
      "Overlapping 3-way edits require resolution",
    );
    joined.push(h);
  }
  joined.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let at = 0,
    out = [];
  for (const [start, end, lines] of joined) {
    requireThat(start >= at, "Overlapping normalized changes");
    out.push(...b.slice(at, start), ...lines);
    at = end;
  }
  out.push(...b.slice(at));
  return [Buffer.from(out.join("")), "auto-merged"];
}
export const is_protected = (p, policy) =>
  [...policy.paths.protected, ...policy.paths.additionalProtected].some(
    (rule) =>
      p === rule.replace(/\/$/, "") ||
      (rule.endsWith("/") && p.startsWith(rule)),
  );
export function verified_source(root, manifest) {
  return Object.fromEntries(
    manifest.artifacts.map((a) => {
      requireThat(
        ![CONFIG, LOCK_RELATIVE].includes(a.path),
        "Reserved source artifact",
      );
      const raw = readFile(member(root, a.path));
      requireThat(hash(raw) === a.sha256, "Source hash mismatch");
      return [a.path, raw];
    }),
  );
}
export function plan_merge(target, baseDir, baseManifest, newDir, newManifest) {
  safeRoot(target);
  safeRoot(newDir);
  const cfg = config_for(target),
    lock = load_lock(target),
    fresh =
      typeof newManifest === "string" ? strictFile(newManifest) : newManifest;
  requireThat(
    validate("release", fresh).length === 0 && cfg.kits[fresh.kitId]?.enabled,
    "Invalid/disabled candidate",
  );
  const existing = lock?.kits.find((k) => k.id === fresh.kitId);
  requireThat(!lock || existing, "Kit absent from existing lock");
  const incoming = verified_source(newDir, fresh);
  let old = {};
  if (existing) {
    requireThat(baseDir && baseManifest, "Explicit base required");
    const base =
      typeof baseManifest === "string"
        ? strictFile(baseManifest)
        : baseManifest;
    requireThat(
      validate("release", base).length === 0 &&
        base.kitId === fresh.kitId &&
        base.sourceRepository === fresh.sourceRepository,
      "Base identity mismatch",
    );
    for (const [k, s] of [
      ["version", "kitVersion"],
      ["sourceCommitSha", "sourceCommitSha"],
      ["releaseTag", "releaseTag"],
      ["sourceRepository", "sourceRepository"],
      ["coreVersion", "coreVersion"],
    ])
      requireThat(existing[k] === base[s], "Base lock identity mismatch");
    old = verified_source(baseDir, base);
    requireThat(
      Object.keys(old).sort().join() ===
        Object.keys(existing.managedFiles).sort().join() &&
        Object.entries(old).every(
          ([p, b]) => hash(b) === existing.managedFiles[p],
        ),
      "Base hashes mismatch",
    );
  } else
    requireThat(
      baseDir == null && baseManifest == null,
      "First install cannot claim base",
    );
  const other = new Set(
    (lock?.kits || [])
      .filter((k) => k.id !== fresh.kitId)
      .flatMap((k) => Object.keys(k.managedFiles)),
  );
  const operations = [
    ...new Set([...Object.keys(old), ...Object.keys(incoming)]),
  ]
    .sort()
    .map((p) => {
      if (is_protected(p, cfg) || other.has(p))
        return {
          path: p,
          action: "conflict",
          reason: "protected or owned by another kit",
        };
      let local;
      try {
        local = readFile(member(target, p));
      } catch (e) {
        if (e.code === "ENOENT") local = null;
        else throw e;
      }
      if (!old[p])
        return local !== null
          ? { path: p, action: "conflict", reason: "existing unmanaged file" }
          : { path: p, action: "create", sha256: hash(incoming[p]) };
      if (!incoming[p])
        return {
          path: p,
          action: "conflict",
          reason: "candidate removes a previously managed file",
        };
      if (local === null)
        return {
          path: p,
          action: "conflict",
          reason: "missing previously managed file",
        };
      try {
        const [merged, mode] = three_way(old[p], local, incoming[p]);
        return mode === "preserve-local"
          ? {
              path: p,
              action: "preserve-overlay",
              sha256: hash(merged),
              reason: "candidate unchanged; retain local changes",
            }
          : {
              path: p,
              action: merged.equals(local) ? "unchanged" : "update",
              mergeMode: mode,
              sha256: hash(merged),
            };
      } catch (e) {
        return { path: p, action: "conflict", reason: e.message };
      }
    });
  const conflicts = operations.filter((o) => o.action === "conflict").length;
  return {
    kind: "r2b-local-preview-only",
    kitId: fresh.kitId,
    candidateVersion: fresh.kitVersion,
    sourceProvenanceVerified: false,
    promotionAllowed: false,
    writesPerformed: false,
    status: conflicts ? "blocked" : "proposed",
    conflicts,
    operations,
  };
}
if (isMain(import.meta.url))
  runMain((a) => {
    const r = plan_merge(
      a.target,
      a.base_source ?? null,
      a.base_manifest ?? null,
      a.new_source,
      a.new_manifest,
    );
    output(r);
    return r.conflicts ? 2 : 0;
  });
