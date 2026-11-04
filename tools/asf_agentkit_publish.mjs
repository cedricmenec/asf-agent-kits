import {
  object,
  requireThat,
  REPO,
  SHA,
  HEX,
  strictParse,
  hash,
} from "./node/common.mjs";
import { requestJson, ReadUnavailable } from "./asf_agentkit_github_read.mjs";
import { profile } from "./render_mvp_kit.mjs";
export const BRANCH =
  /^asf-agentkit\/install-[a-z0-9](?:[a-z0-9-]{0,45}[a-z0-9])?$/;
export class PublishRefused extends Error {}
export class GitHubAppIssuer {
  constructor(repository, jwt, transport = fetch) {
    requireThat(
      REPO.test(repository) && jwt,
      "Expected repository and App JWT",
    );
    Object.assign(this, { repository, jwt, transport });
  }
  async request(method, p, payload) {
    requireThat(
      (method === "GET" &&
        p === "/repos/" + this.repository + "/installation" &&
        payload === undefined) ||
        (method === "POST" &&
          /^\/app\/installations\/[1-9][0-9]*\/access_tokens$/.test(p) &&
          object(payload)),
      "App endpoint outside allowlist",
    );
    return requestJson(
      "https://api.github.com" + p,
      this.jwt,
      method,
      payload,
      this.transport,
    );
  }
}
export class GitHubDraftWriter {
  constructor(repository, token, transport = fetch) {
    requireThat(
      REPO.test(repository) && token,
      "Expected repository and token",
    );
    Object.assign(this, { repository, token, transport });
  }
  async request(method, p, payload) {
    const get =
      p === "" ||
      p === "/installation/repositories?per_page=100" ||
      /^\/branches\/[A-Za-z0-9_.%-]+$/.test(p) ||
      /^\/git\/ref\/heads\/asf-agentkit\/install-[a-z0-9-]+$/.test(p) ||
      /^\/git\/commits\/[a-f0-9]{40}$/.test(p) ||
      /^\/git\/trees\/[a-f0-9]{40}\?recursive=1$/.test(p) ||
      /^\/pulls\?state=open&head=[A-Za-z0-9_.-]+%3Aasf-agentkit%2Finstall-[a-z0-9-]+&per_page=100$/.test(
        p,
      );
    const post = [
      "/git/blobs",
      "/git/trees",
      "/git/commits",
      "/git/refs",
      "/pulls",
    ].includes(p);
    requireThat(
      (method === "GET" && get && payload === undefined) ||
        (method === "POST" && post && object(payload)),
      "Publication endpoint outside allowlist",
    );
    const url =
      p === "/installation/repositories?per_page=100"
        ? "https://api.github.com" + p
        : "https://api.github.com/repos/" + this.repository + p;
    return requestJson(url, this.token, method, payload, this.transport);
  }
}
const dict = (v, label) => {
  requireThat(object(v), "Unexpected GitHub " + label);
  return v;
};
const sha = (v) => {
  requireThat(typeof v === "string" && SHA.test(v), "Invalid Git SHA response");
  return v;
};
export async function mint_target_writer(issuer, repo, id) {
  requireThat(Number.isSafeInteger(id) && id > 0, "Expected numeric App ID");
  try {
    const inst = dict(
      await issuer.request("GET", "/repos/" + repo + "/installation"),
      "installation",
    );
    requireThat(
      inst.app_id === id &&
        Number.isSafeInteger(inst.id) &&
        inst.id > 0 &&
        inst.permissions?.contents === "write" &&
        inst.permissions?.pull_requests === "write",
      "Wrong App/permissions",
    );
    const info = dict(
      await issuer.request(
        "POST",
        `/app/installations/${inst.id}/access_tokens`,
        {
          repositories: [repo.split("/")[1]],
          permissions: { contents: "write", pull_requests: "write" },
        },
      ),
      "scoped token",
    );
    requireThat(
      typeof info.token === "string" &&
        info.token &&
        info.permissions?.contents === "write" &&
        info.permissions?.pull_requests === "write",
      "Scoped token permissions not confirmed",
    );
    return new GitHubDraftWriter(repo, info.token, issuer.transport);
  } catch (e) {
    if (e instanceof ReadUnavailable)
      throw new PublishRefused("GitHub App scope refused (" + e.status + ")");
    throw e;
  }
}
export async function ensure_base(writer, branch, expected) {
  const r = dict(await writer.request("GET", "/branches/" + branch), "branch");
  requireThat(sha(r.commit?.sha) === expected, "Target base SHA moved");
}
export function remote_tree_is_create_only(tree, paths) {
  requireThat(
    object(tree) && tree.truncated === false && Array.isArray(tree.tree),
    "Incomplete remote tree",
  );
  for (const row of tree.tree) {
    requireThat(
      object(row) &&
        typeof row.path === "string" &&
        typeof row.type === "string",
      "Malformed tree entry",
    );
    for (const wanted of paths) {
      requireThat(
        row.path.toLowerCase() !== wanted.toLowerCase(),
        "Managed path exists in base",
      );
      const parts = wanted.split("/");
      for (let i = 1; i < parts.length; i++) {
        const parent = parts.slice(0, i).join("/");
        requireThat(
          row.path.toLowerCase() !== parent.toLowerCase() ||
            (row.path === parent && row.type === "tree"),
          "Remote parent conflict",
        );
      }
    }
  }
}
export async function remote_preflight(
  writer,
  repo,
  branch,
  expected,
  newBranch,
  paths,
) {
  requireThat(
    BRANCH.test(newBranch || "") && newBranch !== branch,
    "New ordinary draft branch required",
  );
  requireThat(
    SHA.test(expected || "") &&
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(branch || "") &&
      !branch.includes("..") &&
      !/\.$|\.lock$/.test(branch),
    "Exact base and SHA required",
  );
  const meta = dict(await writer.request("GET", ""), "repository");
  requireThat(
    meta.full_name === repo &&
      meta.default_branch === branch &&
      Number.isInteger(meta.id),
    "Target identity mismatch",
  );
  const scoped = dict(
    await writer.request("GET", "/installation/repositories?per_page=100"),
    "repository scope",
  );
  requireThat(
    scoped.total_count === 1 &&
      Array.isArray(scoped.repositories) &&
      scoped.repositories.length === 1 &&
      scoped.repositories[0].full_name === repo &&
      scoped.repositories[0].id === meta.id,
    "Token not scoped to exactly target",
  );
  await ensure_base(writer, branch, expected);
  let missing = false;
  try {
    await writer.request("GET", "/git/ref/heads/" + newBranch);
  } catch (e) {
    if (e instanceof ReadUnavailable && e.status === "http-404") missing = true;
    else throw e;
  }
  requireThat(missing, "Draft branch exists");
  const prs = await writer.request(
    "GET",
    `/pulls?state=open&head=${repo.split("/")[0]}%3A${newBranch.replaceAll("/", "%2F")}&per_page=100`,
  );
  requireThat(
    Array.isArray(prs) && prs.length === 0,
    "Duplicate PR or incomplete pagination",
  );
  const commit = dict(
      await writer.request("GET", "/git/commits/" + expected),
      "base commit",
    ),
    tree = sha(commit.tree?.sha);
  remote_tree_is_create_only(
    await writer.request("GET", "/git/trees/" + tree + "?recursive=1"),
    paths,
  );
  return tree;
}
export async function publish_draft(
  writer,
  repo,
  branch,
  expected,
  newBranch,
  approved,
  planSha,
  files,
  lockBytes,
) {
  requireThat(
    HEX.test(approved || "") && approved === planSha,
    "Exact approved dry-run digest required",
  );
  const lock = strictParse(lockBytes);
  const allowed = profile(lock.kitId).files.map((x) => x[1]);
  requireThat(
    object(files) &&
      Object.keys(files).length === allowed.length &&
      allowed.every((p) => Buffer.isBuffer(files[p])) &&
      Buffer.isBuffer(lockBytes),
    "Reviewed files and lock required",
  );
  requireThat(
    SHA.test(lock.sourceCommitSha || "") &&
      lock.targetRepository === repo &&
      lock.sourceTrust === "user-pinned-git-object-unattested" &&
      object(lock.managedFiles) &&
      Object.keys(lock.managedFiles).length === allowed.length &&
      allowed.every((p) => lock.managedFiles[p] === hash(files[p])),
    "Source lock/bytes mismatch",
  );
  const all = { ...files, ".asf/agentkit.lock.json": lockBytes };
  let newSha, pr;
  try {
    const base = await remote_preflight(
        writer,
        repo,
        branch,
        expected,
        newBranch,
        Object.keys(all),
      ),
      elements = [];
    for (const p of Object.keys(all).sort()) {
      const blob = await writer.request("POST", "/git/blobs", {
        content: all[p].toString("base64"),
        encoding: "base64",
      });
      elements.push({
        path: p,
        mode: "100644",
        type: "blob",
        sha: sha(blob.sha),
      });
    }
    const tree = await writer.request("POST", "/git/trees", {
      base_tree: base,
      tree: elements,
    });
    const commit = await writer.request("POST", "/git/commits", {
      message:
        lock.kitId === "opencode-direct"
          ? "chore(agentkit): propose pinned OpenCode Direct installation"
          : "chore(agentkit): propose pinned OpenCode+OpenSpec installation",
      tree: sha(tree.sha),
      parents: [expected],
    });
    newSha = sha(commit.sha);
    await ensure_base(writer, branch, expected);
    await writer.request("POST", "/git/refs", {
      ref: "refs/heads/" + newBranch,
      sha: newSha,
    });
    const created = await writer.request("GET", "/git/ref/heads/" + newBranch);
    requireThat(sha(created.object?.sha) === newSha, "Created branch moved");
    await ensure_base(writer, branch, expected);
    pr = await writer.request("POST", "/pulls", {
      title:
        lock.kitId === "opencode-direct"
          ? "AgentKit: proposed pinned OpenCode Direct installation"
          : "AgentKit: proposed pinned OpenCode+OpenSpec installation",
      head: newBranch,
      base: branch,
      draft: true,
      body: `Draft only. Exact AgentKit development source commit: ${lock.sourceCommitSha}\n\nReview generated workflow, App permissions, required secrets/rulesets, and independent CI on the exact PR SHA. No model execution or automatic merge.`,
    });
  } catch (e) {
    if (e instanceof ReadUnavailable)
      throw new PublishRefused(
        "GitHub publication refused (" +
          e.status +
          "); inspect remote before retry",
      );
    throw e;
  }
  requireThat(
    Number.isInteger(pr.number) &&
      pr.number > 0 &&
      pr.draft === true &&
      pr.head?.ref === newBranch &&
      (pr.head.sha ?? newSha) === newSha &&
      pr.base?.ref === branch,
    "Ambiguous PR response",
  );
  return {
    status: "draft-pr-created",
    repository: repo,
    baseBranch: branch,
    approvedBaseSha: expected,
    headBranch: newBranch,
    headSha: newSha,
    pullRequest: `https://github.com/${repo}/pull/${pr.number}`,
    draft: true,
    ciStatus: "pending-independent-exact-sha-validation",
    merged: false,
    paidModelInvoked: false,
    settingsChanged: false,
  };
}
