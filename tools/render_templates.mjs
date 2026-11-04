import {
  fs,
  path,
  MAX_FILE,
  hash,
  safePath,
  readFile,
  safeRoot,
  member,
  strictFile,
  exact,
  requireThat,
  REPO,
  isMain,
  runMain,
  output,
} from "./node/common.mjs";
export { MAX_FILE };
export const MAX_TOTAL = 10 * MAX_FILE,
  MAX_FILES = 250,
  MAX_DESCRIPTOR = 65536;
export class RenderError extends Error {}
export const safe_path = safePath;
export const read_regular = (root, p, max) => readFile(member(root, p), max);
export function render(source, descriptor) {
  const root = safeRoot(source),
    desc = typeof descriptor === "string" ? strictFile(descriptor) : descriptor;
  requireThat(
    exact(desc, ["schemaVersion", "kitId", "targetRepository", "files"]) &&
      desc.schemaVersion === 1 &&
      ["opencode-openspec", "opencode-direct"].includes(desc.kitId) &&
      REPO.test(desc.targetRepository) &&
      !desc.targetRepository.split("/").some((p) => [".", ".."].includes(p)),
    "Invalid descriptor",
  );
  requireThat(
    Array.isArray(desc.files) &&
      desc.files.length > 0 &&
      desc.files.length <= 250,
    "Invalid files",
  );
  const seen = new Set();
  let total = 0;
  const files = desc.files.map((entry) => {
    requireThat(exact(entry, ["template", "path"]), "Invalid file entry");
    const src = safePath(entry.template),
      dest = safePath(entry.path);
    requireThat(
      dest.startsWith(".asf/agentkit/") && !seen.has(dest.toLowerCase()),
      "Invalid/duplicate destination",
    );
    seen.add(dest.toLowerCase());
    const raw = read_regular(root, src, MAX_FILE);
    let text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    requireThat(!/[\0\r]/.test(text), "Invalid template bytes");
    text = text.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
      const vars = {
        KIT_ID: desc.kitId,
        TARGET_REPOSITORY: desc.targetRepository,
      };
      requireThat(Object.hasOwn(vars, key), "Unknown placeholder");
      return vars[key];
    });
    requireThat(
      !text.includes("{{") && !text.includes("}}"),
      "Unmatched placeholder",
    );
    const data = Buffer.from(text);
    total += data.length;
    requireThat(data.length <= MAX_FILE && total <= MAX_TOTAL, "Size limit");
    return {
      path: dest,
      sha256: hash(data),
      contentBase64: data.toString("base64"),
    };
  });
  return {
    kind: "r2d-local-render-preview",
    kitId: desc.kitId,
    sourceProvenanceVerified: false,
    writesPerformed: false,
    files: files.sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
}
if (isMain(import.meta.url))
  runMain((a) => output(render(a.source, a.descriptor)));
