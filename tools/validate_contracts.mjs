import Ajv from "ajv/dist/2020.js";
import formats from "ajv-formats";
import {
  ROOT,
  path,
  strictFile,
  isMain,
  runMain,
  requireThat,
} from "./node/common.mjs";
export const SCHEMAS = {
  config: "agentkit-config.schema.json",
  lock: "agentkit-lock.schema.json",
  release: "release.schema.json",
  claim: "release-claim.schema.json",
};
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });
formats(ajv);
const compiled = new Map();
export const read_json = strictFile;
export const unsafe_path = (p) =>
  typeof p !== "string" ||
  !p ||
  /^[~/]|^[A-Za-z]:|[\\\0]/.test(p) ||
  p.endsWith("//") ||
  p
    .replace(/\/$/, "")
    .split("/")
    .some((v) => !v || v === "." || v === "..");
export function validate(kind, value) {
  requireThat(Object.hasOwn(SCHEMAS, kind), "Unknown schema");
  if (!compiled.has(kind))
    compiled.set(
      kind,
      ajv.compile(strictFile(path.join(ROOT, "schemas", SCHEMAS[kind]))),
    );
  const check = compiled.get(kind);
  if (!check(value))
    return check.errors
      .map((e) => `${e.instancePath || "$"}: ${e.message}`)
      .sort();
  const errors = [];
  if (kind === "config") {
    if (!value.execution.allowedModels.includes(value.execution.defaultModel))
      errors.push("defaultModel must be included in allowedModels");
    if (value.publication.targetBranch !== value.project.baseBranch)
      errors.push("publication.targetBranch must match project.baseBranch");
    if (
      ![".github/", ".asf/", "AGENTS.md"].every((v) =>
        value.paths.protected.includes(v),
      )
    )
      errors.push("baseline protected paths missing");
    if (!Object.values(value.kits).some((v) => v.enabled))
      errors.push("at least one kit must be enabled");
    if (
      [
        value.tasks.root,
        ...[
          "protected",
          "additionalProtected",
          "allowedProductPrefixes",
        ].flatMap((k) => value.paths[k]),
      ].some(unsafe_path)
    )
      errors.push("unsafe relative path in config");
    try {
      new RegExp(value.tasks.idPattern);
    } catch {
      errors.push("tasks.idPattern is not a valid regex");
    }
  }
  if (kind === "lock") {
    if (new Set(value.kits.map((k) => k.id)).size !== value.kits.length)
      errors.push("duplicate kit id");
    for (const kit of value.kits) {
      if (kit.releaseTag !== `kits/${kit.id}/v${kit.version}`)
        errors.push("lock releaseTag does not match id and version");
      if (Object.keys(kit.managedFiles).some(unsafe_path))
        errors.push("unsafe managedFile path");
    }
  }
  if (kind === "release") {
    if (value.releaseTag !== `kits/${value.kitId}/v${value.kitVersion}`)
      errors.push("releaseTag does not match kitId and kitVersion");
    const paths = value.artifacts.map((a) => a.path);
    if (new Set(paths).size !== paths.length)
      errors.push("duplicate artifact paths");
    if (paths.some(unsafe_path)) errors.push("unsafe artifact path");
  }
  return errors.sort();
}
if (isMain(import.meta.url))
  runMain((a) => {
    const errors = validate(a._[0], strictFile(a._[1]));
    errors.forEach((e) => console.error("INVALID " + e));
    if (!errors.length) console.log("VALID " + a._[0]);
    return errors.length ? 1 : 0;
  });
