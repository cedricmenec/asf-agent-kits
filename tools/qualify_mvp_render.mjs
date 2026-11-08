import {
  fs,
  path,
  ROOT,
  strictFile,
  requireThat,
  isMain,
  runMain,
} from "./node/common.mjs";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { render_mvp } from "./render_mvp_kit.mjs";
export async function qualify(
  config,
  actionlint = null,
  kit = "opencode-openspec",
) {
  const preview = render_mvp(ROOT, config, kit),
    tmp = mkdtempSync(path.join(os.tmpdir(), "agentkit-mvp-"));
  try {
    for (const f of preview.files) {
      const p = path.join(tmp, f.path);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, Buffer.from(f.contentBase64, "base64"));
    }
    const runtime = path.join(
      tmp,
      kit === "opencode-direct"
        ? ".asf/agentkit/direct"
        : ".asf/agentkit/runtime",
    );
    for (const p of fs.readdirSync(runtime).filter((p) => p.endsWith(".mjs")))
      execFileSync(process.execPath, ["--check", path.join(runtime, p)]);
    execFileSync("bash", ["-n", path.join(runtime, "phase.sh")]);
    if (kit === "opencode-openspec") {
      for (const name of ["publish.sh", "stage.sh"])
        execFileSync("bash", ["-n", path.join(runtime, name)]);
    }
    if (actionlint)
      execFileSync(actionlint, [
        "-color",
        path.join(
          tmp,
          kit === "opencode-direct"
            ? ".github/workflows/asf-agentkit-direct.yml"
            : ".github/workflows/asf-agentkit-openspec.yml",
        ),
      ]);
    const { normalizeTask } = await import(
      pathToFileURL(path.join(runtime, "request.mjs"))
    );
    const { allowed } = await import(
      pathToFileURL(path.join(runtime, "scope.mjs"))
    );
    requireThat(
      normalizeTask("9") === config.taskPrefix + "-009" &&
        normalizeTask(config.taskPrefix + "-009") ===
          config.taskPrefix + "-009",
      "Task normalization smoke",
    );
    let refused = false;
    try {
      normalizeTask("../1");
    } catch {
      refused = true;
    }
    requireThat(refused, "Traversal task accepted");
    const change = config.taskPrefix.toLowerCase() + "-009";
    for (const phase of kit === "opencode-direct"
      ? ["run"]
      : ["plan", "apply", "finalize", "auto"]) {
      requireThat(
        !allowed(phase, change, ".github/workflows/evil.yml"),
        "Workflow scope guard",
      );
      requireThat(
        !allowed(phase, change, ".asf/agentkit/runtime/scope.mjs"),
        "Runtime guard",
      );
    }
    if (kit === "opencode-direct") {
      requireThat(
        allowed("run", change, "src/product.mjs") &&
          !allowed("run", change, "openspec/specs/new/spec.md"),
        "Direct scope",
      );
      return preview.files.length;
    }
    requireThat(
      allowed("plan", change, `openspec/changes/${change}/tasks.md`),
      "Plan scope",
    );
    requireThat(
      !allowed("apply", change, `openspec/changes/${change}/design.md`),
      "Plan immutability",
    );
    requireThat(
      allowed("auto", change, "openspec/specs/new/spec.md") &&
        allowed("auto", change, "src/product.mjs"),
      "Auto scope",
    );
    return preview.files.length;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
if (isMain(import.meta.url))
  runMain(async (a) => {
    console.log(
      `AK-MVP-01: ${await qualify(strictFile(a.config), a.actionlint, a.kit)} rendered files parsed and read-only runtime smoke passed`,
    );
    return 0;
  });
