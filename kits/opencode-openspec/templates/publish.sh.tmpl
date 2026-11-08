#!/usr/bin/env bash
# Run only in the trusted publisher job after exact-ref, patch and scope gates.
set -euo pipefail

case "$PHASE" in plan|repair-plan|apply|finalize) ;; *) exit 2 ;; esac
test -n "${GH_TOKEN:-}" && test -n "${GITHUB_OUTPUT:-}"
test -n "$AGENT_BRANCH" && test -n "$TASK_ID"

# Never modify an existing ready-for-review PR as if it were a disposable
# checkpoint. This observation is made before writing the branch.
existing="$(gh pr list --repo "$GITHUB_REPOSITORY" --head "$AGENT_BRANCH" --state open --json number,isDraft --jq '.[0].number // empty')"
if [[ -n "$existing" ]]; then
  is_draft="$(gh pr view "$existing" --repo "$GITHUB_REPOSITORY" --json isDraft --jq .isDraft)"
  test "$is_draft" = true || {
    echo '::error title=ASF-PR-REVIEW::Existing PR is not draft; stop before publication and review it'; exit 1;
  }
fi

git config user.name 'asf-agentkit[bot]'
git config user.email 'asf-agentkit[bot]@users.noreply.github.com'
git commit -m "agent($TASK_ID): OpenSpec $PHASE"
# Never force-push. If the remote advanced after the observed-tip gate, an
# incompatible fast-forward refuses publication and no paid retry follows.
git -c http.extraheader="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)" \
  push origin "HEAD:refs/heads/$AGENT_BRANCH"

if [[ -z "$existing" ]]; then
  gh pr create --repo "$GITHUB_REPOSITORY" --draft --base "$DEFAULT_BRANCH" --head "$AGENT_BRANCH" \
    --title "OpenSpec: $TASK_ID" \
    --body 'Intermediate plan checkpoints require a separate quality gate. This draft does not certify acceptance, CI or merge readiness.'
else
  echo "Existing PR #$existing updated; no approval or merge implied."
fi
head_sha="$(git rev-parse HEAD)"
echo "headSha=$head_sha" >> "$GITHUB_OUTPUT"
{
  echo "### ASF OpenSpec $PHASE checkpoint"
  echo "- Branch: \`$AGENT_BRANCH\`"
  echo "- Exact SHA: \`$head_sha\`"
  echo '- Draft PR: checkpoint only, not an apply authorization'
} >> "$GITHUB_STEP_SUMMARY"
