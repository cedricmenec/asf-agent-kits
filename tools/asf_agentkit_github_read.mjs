import { REPO, object, requireThat, strictParse } from "./node/common.mjs";
export class ReadUnavailable extends Error {
  constructor(status) {
    super(status);
    this.status = status;
  }
}
export async function requestJson(
  url,
  token,
  method = "GET",
  payload,
  transport = fetch,
) {
  try {
    const response = await transport(url, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: "Bearer " + token,
        "User-Agent": "asf-agentkit",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    if (response.status >= 300 && response.status < 400)
      throw new ReadUnavailable("unexpected-redirect");
    if (!response.ok) throw new ReadUnavailable("http-" + response.status);
    const reader = response.body.getReader(),
      chunks = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 1048576) {
          await reader.cancel();
          throw new ReadUnavailable("oversized-response");
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    return strictParse(Buffer.concat(chunks));
  } catch (e) {
    if (e instanceof ReadUnavailable) throw e;
    throw new ReadUnavailable("network-or-malformed-response");
  }
}
export class GitHubReader {
  constructor(repository, token, transport = fetch) {
    requireThat(
      typeof repository === "string" && REPO.test(repository) && token,
      "Exact repository/token required",
    );
    this.prefix = "https://api.github.com/repos/" + repository;
    this.token = token;
    this.transport = transport;
  }
  async get(p) {
    requireThat(
      typeof p === "string" &&
        (!p ||
          (p.startsWith("/") &&
            !p.includes("..") &&
            !p.includes("//") &&
            !/[\r\n#]/.test(p))),
      "Unsupported read path",
    );
    return requestJson(
      this.prefix + p,
      this.token,
      "GET",
      undefined,
      this.transport,
    );
  }
}
async function read_safe(reader, p) {
  try {
    return [await reader.get(p), null];
  } catch (e) {
    if (e instanceof ReadUnavailable) return [null, e.status];
    throw e;
  }
}
export async function collection_names(reader, p, key, required) {
  const [data, error] = await read_safe(reader, p);
  if (error) return { state: "unknown", reason: error };
  if (
    !object(data) ||
    !Number.isInteger(data.total_count) ||
    !Array.isArray(data[key])
  )
    return { state: "unknown", reason: "invalid-paged-response" };
  if (data.total_count > data[key].length)
    return { state: "unknown", reason: "incomplete-pagination" };
  const names = data[key].map((x) => (object(x) ? x.name : null));
  if (!names.every((x) => typeof x === "string"))
    return { state: "unknown", reason: "invalid-name-list" };
  return {
    state: "observed",
    required: Object.fromEntries(
      required.map((n) => [n, names.includes(n) ? "present" : "absent"]),
    ),
  };
}
export async function remote_doctor(repo, config, reader) {
  const result = {
    kind: "read-only-github-doctor",
    repository: repo,
    writesPerformed: false,
    secretsDisplayed: false,
  };
  const [metadata, error] = await read_safe(reader, "");
  result.repositoryMetadata = error
    ? { state: "unknown", reason: error }
    : !object(metadata) || metadata.full_name !== repo
      ? { state: "unknown", reason: "unexpected-identity" }
      : {
          state: "observed",
          defaultBranch: metadata.default_branch,
          defaultBranchMatchesConfig:
            metadata.default_branch === config.defaultBranch,
          callerPermissions: Object.fromEntries(
            ["pull", "push", "admin"]
              .filter((k) => typeof metadata.permissions?.[k] === "boolean")
              .map((k) => [k, metadata.permissions[k]]),
          ),
        };
  result.variables = await collection_names(
    reader,
    "/actions/variables?per_page=100",
    "variables",
    [config.appIdVar],
  );
  result.secrets = await collection_names(
    reader,
    "/actions/secrets?per_page=100",
    "secrets",
    [config.appPrivateKeySecret, config.openRouterSecret],
  );
  const [app, appError] = await read_safe(reader, "/installation");
  result.githubApp = appError
    ? { state: "unknown", reason: appError }
    : object(app) && Number.isInteger(app.app_id)
      ? { state: "observed-installation", appId: app.app_id }
      : { state: "unknown", reason: "invalid-installation-response" };
  const [rules, rulesError] = await read_safe(
    reader,
    "/rulesets?includes_parents=true&per_page=100",
  );
  result.rulesets = rulesError
    ? { state: "unknown", reason: rulesError }
    : Array.isArray(rules) && rules.length < 100 && rules.every(object)
      ? {
          state: "observed-summaries-require-manual-applicability-review",
          activeCount: rules.filter((x) => x.enforcement === "active").length,
        }
      : { state: "unknown", reason: "incomplete-or-invalid-ruleset-list" };
  const workflows = await collection_names(
    reader,
    "/actions/workflows?per_page=100",
    "workflows",
    [],
  );
  result.workflows =
    workflows.state === "observed"
      ? { state: "unknown", reason: "needs-explicit-path-review" }
      : workflows;
  const [branch, branchError] = await read_safe(
    reader,
    "/branches/" + encodeURIComponent(config.defaultBranch),
  );
  if (branchError) result.branch = { state: "unknown", reason: branchError };
  else if (
    !object(branch) ||
    !object(branch.commit) ||
    !/^[a-f0-9]{40}$/.test(branch.commit.sha)
  )
    result.branch = { state: "unknown", reason: "invalid-branch-observation" };
  else {
    result.branch = {
      state: "observed",
      headSha: branch.commit.sha,
      protectedFlag:
        typeof branch.protected === "boolean" ? branch.protected : null,
    };
    const checks = await collection_names(
      reader,
      "/commits/" + branch.commit.sha + "/check-runs?per_page=100",
      "check_runs",
      [],
    );
    result.checks =
      checks.state === "observed"
        ? { state: "observed-require-manual-required-check-review" }
        : checks;
  }
  return result;
}
