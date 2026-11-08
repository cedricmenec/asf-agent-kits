#!/usr/bin/env bash
# Trusted runtime guard. Load this script from GITHUB_SHA, never from agent branch.
set -euo pipefail

mode="${1:-}"
test -n "${AGENT_BRANCH:-}" && test -n "${EXPECTED_TIP:-}" && test -n "${DEFAULT_BRANCH:-}"

case "$mode" in
  execute|publish|verify) ;;
  *) echo '::error title=ASF-STAGE::Invalid trusted stage'; exit 2 ;;
esac

for file in scope.mjs model-policy.mjs budget.mjs checklist.mjs phase.sh publish.sh; do
  git show "$GITHUB_SHA:.asf/agentkit/runtime/$file" > "$RUNNER_TEMP/$file"
  test -s "$RUNNER_TEMP/$file"
done

# Validate the default-branch policy source and exact remote tip before any
# model invocation, local patch application or verified downstream phase.
test -n "${ASF_GIT_READ_TOKEN:-}" || { echo '::error title=ASF-GIT-TOKEN::Read token unavailable'; exit 1; }
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0=http.https://github.com/.extraheader
GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$ASF_GIT_READ_TOKEN" | base64 -w0)"
export GIT_CONFIG_VALUE_0
git fetch --no-tags origin "refs/heads/$DEFAULT_BRANCH"
test "$(git rev-parse FETCH_HEAD)" = "$GITHUB_SHA" || {
  echo '::error title=ASF-DEFAULT-MOVED::Default branch moved; dispatch a fresh workflow'; exit 1;
}

remote_tip="$(git ls-remote --heads origin "refs/heads/$AGENT_BRANCH" | cut -f1)"
if [[ "$EXPECTED_TIP" == absent ]]; then
  test -z "$remote_tip" || {
    echo '::error title=ASF-STALE-BRANCH::Plan branch appeared; inspect it and dispatch again'; exit 1;
  }
  test "$mode" != verify || { echo '::error title=ASF-NO-PLAN::Missing remote plan'; exit 1; }
  git switch -c "$AGENT_BRANCH"
else
  [[ "$EXPECTED_TIP" =~ ^[0-9a-f]{40}$ ]] || exit 2
  test "$remote_tip" = "$EXPECTED_TIP" || {
    echo '::error title=ASF-STALE-SHA::Remote checkpoint changed; inspect the branch and dispatch again'; exit 1;
  }
  git fetch --no-tags origin "refs/heads/$AGENT_BRANCH"
  test "$(git rev-parse FETCH_HEAD)" = "$EXPECTED_TIP"
  git switch -c "$AGENT_BRANCH" "$EXPECTED_TIP"
fi

if [[ "$mode" == publish ]]; then
  test -s "$RUNNER_TEMP/agentkit-patch/agentkit.patch" || exit 1
  git apply --check --index "$RUNNER_TEMP/agentkit-patch/agentkit.patch"
  git apply --index "$RUNNER_TEMP/agentkit-patch/agentkit.patch"
  node "$RUNNER_TEMP/scope.mjs" staged "$PHASE" "$CHANGE_ID"
fi

if [[ "$mode" == verify ]]; then
  echo "Verified remote plan SHA: $EXPECTED_TIP" >> "$GITHUB_STEP_SUMMARY"
  echo "verifiedSha=$EXPECTED_TIP" >> "$GITHUB_OUTPUT"
fi

if [[ "$mode" == execute ]]; then
  echo "expectedSha=$EXPECTED_TIP" >> "$GITHUB_OUTPUT"
fi
