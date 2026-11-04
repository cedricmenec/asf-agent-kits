/** Prevent reintroducing a second executable language into the catalogue. */
import { fs, path, ROOT, requireThat } from "./node/common.mjs";
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if ([".git", "node_modules", "coverage"].includes(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
for (const p of walk(ROOT)) {
  requireThat(
    !p.endsWith(".py") &&
      !p.endsWith(".pyc") &&
      !/requirements.*\.txt$/.test(p),
    "Legacy runtime source: " + p,
  );
  if (p.includes("/fixtures/") || p === new URL(import.meta.url).pathname)
    continue;
  if (/\.(mjs|cjs|yml|tmpl)$/.test(p) || p.endsWith("/bin/asf-agentkit")) {
    const text = fs.readFileSync(p, "utf8");
    requireThat(
      !/#!.*\bpython[0-9]*\b|(?:execFileSync|spawnSync)\(['"]python[0-9]*['"]|setup-python@|\bpython3?\s+-m\s+(?:pip|unittest)/.test(
        text,
      ),
      "Legacy executable invocation: " + p,
    );
  }
}
console.log("Node-only source, test and CI runtime audit passed");
