import { parse as parseYaml } from "yaml";
import {
  fs,
  path,
  ROOT,
  requireThat,
  hash,
  canonical,
  git,
  REPO,
  SHA,
  HEX,
  VERSION,
  exact,
  object,
  strictParse,
  strictFile,
  equal,
  isMain,
  runMain,
  cliArgs,
} from "./node/common.mjs";
import {
  observe,
  exclusiveFile,
  recoverCreated,
  replaceManaged,
  managedIdentity,
} from "./node/secure-fs.mjs";
import {
  FILES,
  DIRECT_FILES,
  KIT_IDS,
  profile_lock_path,
  profile,
  checked_config,
  render_mvp,
} from "./render_mvp_kit.mjs";
import {
  build_git_candidate,
  RELEASE_KEYS,
  git_artifact_bytes,
} from "./build_candidate.mjs";
import { GitHubReader, remote_doctor } from "./asf_agentkit_github_read.mjs";
import {
  BRANCH,
  GitHubAppIssuer,
  mint_target_writer,
  publish_draft,
} from "./asf_agentkit_publish.mjs";
import os from "node:os";
export class CliError extends Error {}
export const LOCK_PATH = ".asf/agentkit.lock.json",
  ALLOWED = new Set([...FILES, ...DIRECT_FILES].map((x) => x[1]));
export const digest = hash;
export { canonical, git };
export function origin(value) {
  return typeof value === "string"
    ? /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(
        value,
      )?.[1] || null
    : null;
}
export function checkout(dir, repo) {
  const root = path.resolve(dir);
  requireThat(
    fs.lstatSync(root).isDirectory() && REPO.test(repo),
    "Explicit checkout and owner/repo required",
  );
  requireThat(
    origin(git(root, "remote", "get-url", "origin").toString().trim()) === repo,
    "Target remote does not match --repo",
  );
  return root;
}
export function observed(root, p) {
  requireThat(
    ALLOWED.has(p) ||
      p === LOCK_PATH ||
      KIT_IDS.some((k) => p === profile_lock_path(k)),
    "Outside managed allowlist",
  );
  return observe(root, p);
}
function read_lock_file(root, lockPath) {
  const raw = observed(root, lockPath);
  if (raw === null) return null;
  const lock = strictParse(raw);
  requireThat(
    exact(lock, [
      "schemaVersion",
      "kitId",
      "version",
      "sourceRepository",
      "sourceCommitSha",
      "sourceTrust",
      "targetRepository",
      "configurationSha256",
      "managedFiles",
    ]) && lock.schemaVersion === 2,
    "Exact lock schema v2 required",
  );
  requireThat(
    ["opencode-openspec", "opencode-direct"].includes(lock.kitId) &&
      typeof lock.version === "string" &&
      VERSION.test(lock.version) &&
      lock.sourceRepository === "cedricmenec/asf-agent-kits" &&
      SHA.test(lock.sourceCommitSha) &&
      lock.sourceTrust === "user-pinned-git-object-unattested" &&
      REPO.test(lock.targetRepository) &&
      HEX.test(lock.configurationSha256),
    "Invalid local-source lock metadata",
  );
  requireThat(
    object(lock.managedFiles) &&
      Object.keys(lock.managedFiles).length > 0 &&
      Object.entries(lock.managedFiles).every(
        ([p, h]) =>
          profile(lock.kitId).files.some(([, dest]) => dest === p) &&
          typeof h === "string" &&
          HEX.test(h),
      ),
    "Invalid ownership inventory",
  );
  return lock;
}
export function read_locks(root) {
  const result = [];
  for (const p of [LOCK_PATH, ...KIT_IDS.map(profile_lock_path)]) {
    const lock = read_lock_file(root, p);
    if (!lock) continue;
    requireThat(
      p === LOCK_PATH || p === profile_lock_path(lock.kitId),
      "Profile lock path/identity mismatch",
    );
    requireThat(
      !result.some((x) => x.lock.kitId === lock.kitId),
      "Duplicate profile locks",
    );
    result.push({ path: p, lock });
  }
  return result;
}
export function read_lock(root, kit = null) {
  if (kit) profile(kit);
  const locks = read_locks(root);
  if (kit) return locks.find((x) => x.lock.kitId === kit)?.lock || null;
  requireThat(locks.length <= 1, "Several profiles installed; select --kit");
  return locks[0]?.lock || null;
}
export function selected_lock_path(root, kit) {
  const locks = read_locks(root);
  return (
    locks.find((x) => x.lock.kitId === kit)?.path ||
    (locks.length ? profile_lock_path(kit) : LOCK_PATH)
  );
}
function check_coinstallation(root, config, kit) {
  for (const { lock } of read_locks(root)) {
    requireThat(
      lock.targetRepository === config.targetRepository,
      "Repository/lock mismatch",
    );
    if (lock.kitId === kit) continue;
    const p = profile(lock.kitId).files[0][1],
      bytes = observed(root, p);
    requireThat(
      bytes && hash(bytes) === lock.managedFiles[p],
      "Other profile workflow missing or drifted",
    );
    const workflow = parseYaml(bytes.toString("utf8"));
    requireThat(
      workflow?.jobs?.execute?.concurrency?.group === config.mutexGroup &&
        workflow.jobs.execute.concurrency["cancel-in-progress"] === false,
      "Co-installed profiles must share the same paid execution mutex",
    );
  }
}
export function source_snapshot(
  source,
  commit,
  version,
  kit = "opencode-openspec",
) {
  const root = checkout(source, "cedricmenec/asf-agent-kits");
  requireThat(
    typeof commit === "string" &&
      SHA.test(commit) &&
      git(root, "rev-parse", "--verify", commit + "^{commit}")
        .toString()
        .trim() === commit,
    "Complete explicit Git SHA required",
  );
  requireThat(
    typeof version === "string" && VERSION.test(version),
    "Exact stable SemVer required",
  );
  const read = (p) => git_artifact_bytes(root, commit, p);
  profile(kit);
  const metadata = strictParse(read(`kits/${kit}/version.json`));
  requireThat(
    exact(metadata, [
      "schemaVersion",
      "kitVersion",
      "distribution",
      "releaseStatus",
    ]) &&
      metadata.schemaVersion === 1 &&
      metadata.kitVersion === version &&
      metadata.distribution === "user-pinned-git-commit" &&
      ["development-unreleased", "stable"].includes(metadata.releaseStatus),
    "Pinned source version mismatch",
  );
  return read;
}
export function rendered_source(
  source,
  commit,
  version,
  config,
  kit = "opencode-openspec",
) {
  const read = source_snapshot(source, commit, version, kit),
    selected = profile(kit),
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asf-agentkit-source-"));
  try {
    for (const [name] of selected.files) {
      const p = path.join(tmp, selected.templates, name);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, read(selected.templates + name));
    }
    return Object.fromEntries(
      render_mvp(tmp, config, kit).files.map((f) => [
        f.path,
        Buffer.from(f.contentBase64, "base64"),
      ]),
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
export function check_candidate_manifest(
  source,
  commit,
  version,
  p,
  kit = "opencode-openspec",
) {
  const candidate = strictFile(p);
  requireThat(
    object(candidate) &&
      Array.isArray(candidate.artifacts) &&
      candidate.artifacts.length > 0 &&
      candidate.artifacts.length <= 50 &&
      candidate.artifacts.every((a) => object(a) && typeof a.path === "string"),
    "Invalid candidate",
  );
  requireThat(
    candidate.sourceRepository === "cedricmenec/asf-agent-kits" &&
      candidate.sourceCommitSha === commit &&
      candidate.kitId === kit &&
      candidate.kitVersion === version,
    "Candidate identity mismatch",
  );
  const paths = candidate.artifacts.map((a) => a.path);
  requireThat(
    profile(kit).files.every(([name]) =>
      paths.includes(profile(kit).templates + name),
    ),
    "Missing templates",
  );
  const descriptor = Object.fromEntries(
    RELEASE_KEYS.map((k) => [k, candidate[k]]),
  );
  descriptor.paths = paths;
  requireThat(
    equal(build_git_candidate(source, commit, descriptor), candidate),
    "Candidate differs from pinned Git",
  );
  return hash(canonical(candidate));
}
export function desired_lock(
  files,
  config,
  version,
  sha,
  kit = "opencode-openspec",
) {
  return {
    schemaVersion: 2,
    kitId: kit,
    version,
    sourceRepository: "cedricmenec/asf-agent-kits",
    sourceCommitSha: sha,
    sourceTrust: "user-pinned-git-object-unattested",
    targetRepository: config.targetRepository,
    configurationSha256: hash(canonical(config)),
    managedFiles: Object.fromEntries(
      Object.entries(files)
        .sort()
        .map(([p, b]) => [p, hash(b)]),
    ),
  };
}
export const compareVersion = (a, b) => {
  const x = a.split(".").map(BigInt),
    y = b.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) {
    if (x[i] < y[i]) return -1;
    if (x[i] > y[i]) return 1;
  }
  return 0;
};
export function plan(target, config, files, lock, newLock, operation) {
  requireThat(
    !lock || lock.targetRepository === config.targetRepository,
    "Lock belongs to another repository",
  );
  requireThat(
    !lock || lock.kitId === newLock.kitId,
    "Changing installed kit requires a separate reviewed migration",
  );
  if (operation === "upgrade")
    requireThat(
      lock && compareVersion(newLock.version, lock.version) > 0,
      "Upgrade version must be greater than locked version",
    );
  check_coinstallation(target, config, newLock.kitId);
  const lockPath = selected_lock_path(target, newLock.kitId);
  const operations = Object.keys(files)
    .sort()
    .map((p) => {
      const actual = observed(target, p),
        prior = lock?.managedFiles[p];
      let action, reason;
      if (actual === null)
        [action, reason] = prior
          ? ["conflict", "previously managed file missing"]
          : ["create", null];
      else if (!prior)
        [action, reason] = ["conflict", "unmanaged pre-existing path"];
      else if (hash(actual) !== prior)
        [action, reason] = [
          "conflict",
          "local overlay differs from locked bytes",
        ];
      else action = actual.equals(files[p]) ? "unchanged" : "update";
      return { path: p, action, ...(reason ? { reason } : {}) };
    });
  const installed = observed(target, lockPath),
    proposed = canonical(newLock);
  operations.push({
    path: lockPath,
    action:
      !lock && installed === null
        ? "create"
        : installed?.equals(proposed)
          ? "unchanged"
          : "update",
  });
  operations.sort((a, b) => (a.path < b.path ? -1 : 1));
  const conflicts = operations.filter((x) => x.action === "conflict").length;
  return {
    operation,
    ...(lockPath !== LOCK_PATH ? { lockPath } : {}),
    kitId: newLock.kitId,
    targetRepository: config.targetRepository,
    version: newLock.version,
    sourceCommitSha: newLock.sourceCommitSha,
    sourceTrust: "user-pinned-git-object-unattested",
    status: conflicts ? "blocked" : "proposed",
    conflicts,
    operations,
    writesPerformed: false,
    remotePublicationPerformed: false,
    releaseProvenanceVerified: false,
  };
}
export function checked_apply_branch(target, expected, branch) {
  requireThat(
    typeof expected === "string" &&
      SHA.test(expected) &&
      git(target, "rev-parse", "HEAD").toString().trim() === expected,
    "Target HEAD is not approved SHA",
  );
  const current = git(target, "symbolic-ref", "--quiet", "--short", "HEAD")
    .toString()
    .trim();
  requireThat(
    current &&
      ![branch, "main", "master"].includes(current) &&
      !current.startsWith("refs/"),
    "Ordinary non-default branch required",
  );
  requireThat(
    git(target, "status", "--porcelain", "--untracked-files=all").length === 0,
    "Clean checkout required",
  );
}
export function create_only(target, files, newLock, preview, expected, branch) {
  requireThat(
    preview.status === "proposed" &&
      preview.operations.every((x) =>
        ["create", "unchanged"].includes(x.action),
      ),
    "Create-only conflict-free plan required",
  );
  checked_apply_branch(target, expected, branch);
  const pending = {
      ...files,
      [preview.lockPath || LOCK_PATH]: canonical(newLock),
    },
    created = [];
  try {
    for (const item of preview.operations)
      if (item.action === "create")
        created.push([
          item.path,
          exclusiveFile(target, item.path, pending[item.path]),
        ]);
    return created.length;
  } catch (e) {
    for (const [p, id] of created.reverse()) recoverCreated(target, p, id);
    throw e;
  }
}
export function apply_upgrade(
  target,
  files,
  oldLock,
  newLock,
  preview,
  expected,
  branch,
) {
  requireThat(
    oldLock && preview.operation === "upgrade" && preview.status === "proposed",
    "Existing lock and conflict-free upgrade required",
  );
  checked_apply_branch(target, expected, branch);
  requireThat(
    observed(target, preview.lockPath || LOCK_PATH)?.equals(canonical(oldLock)),
    "Exact old lock bytes required",
  );
  const pending = {
      ...files,
      [preview.lockPath || LOCK_PATH]: canonical(newLock),
    },
    previous = {},
    applied = [];
  for (const { path: p, action } of preview.operations) {
    const actual = observed(target, p);
    if (action === "create" && actual === null) continue;
    if (action === "unchanged" && actual?.equals(pending[p])) continue;
    requireThat(
      action === "update" &&
        actual !== null &&
        (p === (preview.lockPath || LOCK_PATH) ||
          hash(actual) === oldLock.managedFiles[p]),
      "Upgrade plan changed",
    );
    previous[p] = actual;
  }
  try {
    for (const item of [...preview.operations].sort(
      (a, b) =>
        Number(a.path === (preview.lockPath || LOCK_PATH)) -
        Number(b.path === (preview.lockPath || LOCK_PATH)),
    )) {
      const p = item.path;
      if (item.action === "create")
        applied.push([p, "create", exclusiveFile(target, p, pending[p])]);
      if (item.action === "update")
        applied.push([
          p,
          "update",
          replaceManaged(target, p, previous[p], pending[p]),
        ]);
    }
    for (const [p, data] of Object.entries(pending))
      requireThat(
        observed(target, p)?.equals(data),
        "Upgrade verification failed",
      );
    return [
      applied.filter((x) => x[1] === "create").length,
      applied.filter((x) => x[1] === "update").length,
    ];
  } catch (e) {
    const failed = [];
    for (const [p, action, id] of applied.reverse()) {
      try {
        requireThat(
          observed(target, p)?.equals(pending[p]),
          "Upgrade result changed during rollback",
        );
        requireThat(
          managedIdentity(target, p) === id,
          "Upgrade inode changed before rollback",
        );
        if (action === "create") recoverCreated(target, p, id);
        else replaceManaged(target, p, pending[p], previous[p]);
      } catch {
        failed.push(p);
      }
    }
    requireThat(
      failed.length === 0,
      "Manual recovery required: " + failed.join(", "),
    );
    throw e;
  }
}
export function status(target, repo, kit = null) {
  const locks = read_locks(target);
  if (!kit && locks.length > 1) {
    const profiles = Object.fromEntries(
      locks.map(({ lock }) => [lock.kitId, status(target, repo, lock.kitId)]),
    );
    return {
      status: Object.values(profiles).every((p) => p.status === "hash-match")
        ? "hash-match"
        : "drifted",
      targetRepository: repo,
      profiles,
      sourceProvenanceVerified: false,
    };
  }
  const lock = read_lock(target, kit);
  if (!lock)
    return {
      status: "unmanaged",
      targetRepository: repo,
      sourceProvenanceVerified: false,
      files: [],
    };
  requireThat(lock.targetRepository === repo, "Repository/lock mismatch");
  const files = Object.entries(lock.managedFiles)
    .sort()
    .map(([p, h]) => {
      const data = observed(target, p);
      return {
        path: p,
        state:
          data === null
            ? "missing"
            : hash(data) === h
              ? "hash-match"
              : "drifted",
      };
    });
  return {
    status: files.every((f) => f.state === "hash-match")
      ? "hash-match"
      : "drifted",
    targetRepository: repo,
    kitVersion: lock.version,
    sourceCommitSha: lock.sourceCommitSha,
    sourceProvenanceVerified: false,
    files,
  };
}
export function doctor(target, repo, config, kit = null) {
  const locks = read_locks(target);
  if (!kit && locks.length > 1) {
    const profiles = Object.fromEntries(
      locks.map(({ lock }) => [
        lock.kitId,
        doctor(target, repo, null, lock.kitId),
      ]),
    );
    return {
      kind: "read-only-local-doctor",
      repository: repo,
      profiles,
      writesPerformed: false,
    };
  }
  const file = (p) => {
    try {
      return fs.lstatSync(path.join(target, p)).isFile();
    } catch {
      return false;
    }
  };
  const direct = read_lock(target, kit)?.kitId === "opencode-direct";
  const localChecks = {
    ...(!direct ? { openspecConfigPresent: file("openspec/config.yaml") } : {}),
    packageLockPresent: file("package-lock.json"),
    packageJsonPresent: file("package.json"),
    managedWorkflowPresent: file(
      direct
        ? ".github/workflows/asf-agentkit-direct.yml"
        : ".github/workflows/asf-agentkit-openspec.yml",
    ),
  };
  if (config) {
    try {
      localChecks.taskDirectoryPresent = fs
        .lstatSync(path.join(target, config.taskDirectory))
        .isDirectory();
    } catch {
      localChecks.taskDirectoryPresent = false;
    }
  }
  return {
    kind: "read-only-local-doctor",
    repository: repo,
    installation: status(target, repo, kit),
    localChecks,
    githubAppStatus: "unknown-not-queried",
    rulesetsStatus: "unknown-not-queried",
    secretsStatus: "unknown-not-queried",
    requiredVariableNames: [config?.appIdVar || "APP_ID"],
    requiredSecretNames: [
      config?.appPrivateKeySecret || "APP_PRIVATE_KEY",
      config?.openRouterSecret || "OPENROUTER_API_KEY",
    ],
    manualSteps: [
      "Owner: review GitHub App installation and minimum repository permissions",
      "Owner: configure required variable and secret names; never paste values into CLI",
      "Owner: verify effective branch ruleset and independent CI in GitHub Settings",
      "Owner: authorize provider calls; no automatic paid retry",
    ],
    writesPerformed: false,
  };
}
export async function main(argv = process.argv.slice(2)) {
  const a = cliArgs(argv);
  if (a.help || a._[0] === "help") {
    console.log(
      "asf-agentkit <install|upgrade|status|doctor> --repo OWNER/REPO --checkout PATH\ninstall/upgrade: --kit opencode-openspec|opencode-direct --version X.Y.Z --source PATH --source-commit SHA --config FILE (--dry-run|--apply|--pr)\nLocal apply: --expected-head SHA; upgrade/PR also require --expected-plan-sha DIGEST",
    );
    return 0;
  }
  requireThat(
    a._.length === 1 &&
      ["install", "upgrade", "status", "doctor"].includes(a._[0]),
    "Unknown command",
  );
  const command = a._[0],
    known = ["_", "repo", "checkout", "kit"];
  if (["install", "upgrade"].includes(command))
    known.push(
      "kit",
      "version",
      "source",
      "source_commit",
      "candidate_manifest",
      "config",
      "dry_run",
      "apply",
      "expected_head",
      "expected_plan_sha",
    );
  if (command === "install")
    known.push(
      "pr",
      "base_branch",
      "new_branch",
      "expected_base_sha",
      "expected_app_id",
      "github_app_jwt_env",
    );
  if (command === "doctor")
    known.push("config", "github_read", "github_token_env");
  requireThat(
    Object.keys(a).every((k) => known.includes(k)),
    "Unknown option",
  );
  for (const flag of ["dry_run", "apply", "pr", "github_read"]) {
    requireThat(
      !Object.hasOwn(a, flag) || a[flag] === true,
      `--${flag.replaceAll("_", "-")} takes no value`,
    );
  }
  requireThat(
    typeof a.repo === "string" && typeof a.checkout === "string",
    "--repo and --checkout required",
  );
  const target = checkout(a.checkout, a.repo);
  let cfg = null;
  if (a.config) {
    cfg = strictFile(a.config);
    checked_config(cfg);
    requireThat(cfg.targetRepository === a.repo, "Config repository mismatch");
  }
  let report;
  if (command === "status") report = status(target, a.repo, a.kit);
  else if (command === "doctor") {
    report = doctor(target, a.repo, cfg, a.kit);
    if (a.github_read) {
      requireThat(cfg, "--github-read requires --config");
      const env = a.github_token_env || "GITHUB_TOKEN";
      requireThat(
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(env) && process.env[env],
        "Configured token variable required",
      );
      report.githubRead = await remote_doctor(
        a.repo,
        cfg,
        new GitHubReader(a.repo, process.env[env]),
      );
    }
  } else {
    requireThat(
      cfg &&
        ["opencode-openspec", "opencode-direct"].includes(a.kit) &&
        typeof a.version === "string" &&
        typeof a.source === "string" &&
        typeof a.source_commit === "string",
      "Explicit kit, version, source, commit and config required",
    );
    requireThat(
      [a.apply, a.dry_run, ...(command === "install" ? [a.pr] : [])].filter(
        Boolean,
      ).length === 1,
      "Choose exactly one operation",
    );
    requireThat(
      !a.candidate_manifest || a.dry_run,
      "Untrusted candidate only allowed in dry-run",
    );
    requireThat(
      path.resolve(a.source) !== target,
      "Source and target must differ",
    );
    const candidate = a.candidate_manifest
        ? check_candidate_manifest(
            a.source,
            a.source_commit,
            a.version,
            a.candidate_manifest,
            a.kit,
          )
        : null,
      files = rendered_source(a.source, a.source_commit, a.version, cfg, a.kit),
      newLock = desired_lock(files, cfg, a.version, a.source_commit, a.kit),
      oldLock = read_lock(target, a.kit);
    report = plan(target, cfg, files, oldLock, newLock, command);
    Object.assign(report, {
      configurationSha256: newLock.configurationSha256,
      managedFilesSha256: newLock.managedFiles,
      lockSha256: hash(canonical(newLock)),
    });
    if (candidate)
      Object.assign(report, {
        candidateManifestCanonicalSha256: candidate,
        candidateBytesMatchPinnedGit: true,
        releaseProvenanceVerified: false,
      });
    const planSha = hash(canonical(report));
    report.planSha256 = planSha;
    if (a.apply) {
      if (command === "install")
        report.createdFiles = create_only(
          target,
          files,
          newLock,
          report,
          a.expected_head,
          cfg.defaultBranch,
        );
      else {
        requireThat(
          a.expected_plan_sha === planSha,
          "Approved upgrade plan digest mismatch",
        );
        [report.createdFiles, report.updatedFiles] = apply_upgrade(
          target,
          files,
          oldLock,
          newLock,
          report,
          a.expected_head,
          cfg.defaultBranch,
        );
      }
      report.writesPerformed = true;
      report.status = "applied-locally-uncommitted";
    }
    if (a.pr) {
      requireThat(
        report.status === "proposed" &&
          report.operations.every((x) => x.action === "create"),
        "Entirely create-only plan required",
      );
      requireThat(
        a.base_branch === cfg.defaultBranch &&
          SHA.test(a.expected_base_sha || "") &&
          BRANCH.test(a.new_branch || "") &&
          a.expected_plan_sha === planSha,
        "Approved PR branch/base/plan required",
      );
      const appId = Number(a.expected_app_id);
      requireThat(
        Number.isSafeInteger(appId) && appId > 0,
        "Expected App ID required",
      );
      requireThat(
        git(target, "rev-parse", "HEAD").toString().trim() ===
          a.expected_base_sha &&
          git(target, "status", "--porcelain", "--untracked-files=all")
            .length === 0,
        "Clean approved checkout required",
      );
      const env = a.github_app_jwt_env || "GITHUB_APP_JWT";
      requireThat(
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(env) && process.env[env],
        "Configured App JWT required",
      );
      report = await publish_draft(
        await mint_target_writer(
          new GitHubAppIssuer(a.repo, process.env[env]),
          a.repo,
          appId,
        ),
        a.repo,
        a.base_branch,
        a.expected_base_sha,
        a.new_branch,
        a.expected_plan_sha,
        planSha,
        files,
        canonical(newLock),
        report.lockPath || LOCK_PATH,
      );
    }
  }
  console.log(JSON.stringify(report, null, 2));
  return report.status === "blocked" ? 2 : 0;
}
if (isMain(import.meta.url)) runMain(() => main());
