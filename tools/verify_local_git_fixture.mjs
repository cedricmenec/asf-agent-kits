import { execFileSync } from "node:child_process";
import { fs, path, requireThat, SHA, hash, equal } from "./node/common.mjs";
import { inventory_fdrelative } from "./inventory_fdrelative.mjs";
export class LocalGitFixtureError extends Error {}
export function verify_local_git_fixture(gitDir, snapshot, pinned, expected) {
  try {
    requireThat(
      typeof gitDir === "string" &&
        path.isAbsolute(gitDir) &&
        typeof snapshot === "string" &&
        path.isAbsolute(snapshot) &&
        typeof pinned === "string" &&
        SHA.test(pinned) &&
        fs.lstatSync(gitDir).isDirectory(),
      "Invalid local fixture",
    );
    const inventory = inventory_fdrelative(snapshot, pinned, expected),
      local = Object.fromEntries(
        inventory.files.map((f) => [f.path, f.sha256]),
      );
    const git = (...args) =>
      execFileSync("git", ["--git-dir=" + gitDir, ...args], {
        cwd: "/",
        env: {
          PATH: process.env.PATH,
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_NO_REPLACE_OBJECTS: "1",
          GIT_OPTIONAL_LOCKS: "0",
          GIT_TERMINAL_PROMPT: "0",
        },
        input: Buffer.alloc(0),
        timeout: 5000,
        maxBuffer: 1049600,
      });
    requireThat(
      git("rev-parse", "--verify", "HEAD^{commit}").toString().trim() ===
        pinned,
      "Local HEAD mismatch",
    );
    const raw = git("ls-tree", "-r", "-z", "--full-tree", pinned).toString();
    requireThat(raw.endsWith("\0"), "Malformed tree");
    const rows = raw.slice(0, -1).split("\0");
    requireThat(rows.length === expected.length, "Tree path count mismatch");
    const seen = new Set();
    for (const row of rows) {
      const m = /^100644 blob ([a-f0-9]{40})\t([^\0]+)$/.exec(row);
      requireThat(
        m && Object.hasOwn(local, m[2]) && !seen.has(m[2]),
        "Unsafe tree entry",
      );
      seen.add(m[2]);
      const size = Number(git("cat-file", "-s", m[1]).toString().trim());
      requireThat(Number.isInteger(size) && size <= 1048576, "Oversized blob");
      const data = git("cat-file", "blob", m[1]);
      requireThat(
        data.length === size && hash(data) === local[m[2]],
        "Blob mismatch",
      );
    }
    requireThat(
      git("rev-parse", "--verify", "HEAD^{commit}").toString().trim() ===
        pinned &&
        equal(inventory_fdrelative(snapshot, pinned, expected), inventory),
      "Fixture changed",
    );
    return {
      kind: "r3g04-disposable-git-object-preview",
      observedLocalGitHeadSha: pinned,
      localGitObjectsMatchSnapshot: true,
      filesReviewed: seen.size,
      remoteGitHubEvidenceVerified: false,
      sourceProvenanceVerified: false,
      authorizedToExecute: false,
      promotionAllowed: false,
      writesPerformed: false,
      paidApprovalRequired: true,
    };
  } catch {
    throw new LocalGitFixtureError(
      "R3g-04 DENY: local Git fixture does not match pinned bytes",
    );
  }
}
