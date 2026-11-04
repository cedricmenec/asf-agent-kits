# GitHub setup

Complete this setup after reviewing the installation PR and before the first agent run.

## Required GitHub settings

| Item | What to set |
| --- | --- |
| GitHub Actions | Enable the installed workflow and the project PR CI |
| GitHub App | Install an approved App on the target repository |
| App permissions | Contents: read and write; Pull requests: read and write |
| APP\_ID variable | The App ID |
| APP\_PRIVATE\_KEY secret | The App private key |
| OPENROUTER\_API\_KEY secret | The provider API key |
| Default branch protection | Require PR review and the actual independent project CI check |

Names can be changed in the kit configuration before installation. Secret values belong only in GitHub secrets. Do not put them in tasks, config files, chat or Notion.

You may reuse a suitable App across approved repositories. The kit does not require a new App for every repository.

## Check the actual rules

Use the settings of the target repository. A JSON ruleset committed to Git does not activate a GitHub rule.

Require the correct CI check for this project. Review who can bypass the rule. Confirm that branch protection applies to the default branch and that the App cannot silently bypass your review process.

## Actor restriction

The current workflow compares the actor with github.repository\_owner. In a personal repository, that means the repository owner. In an organization repository, the owner is the organization name; normal user actors will not match. Organization use needs a reviewed workflow change. Being an organization admin is not enough to pass this comparison.

## Provider and cost

The current workflow uses OpenRouter and a fixed list of three models. It does not currently offer an OpenAI model. Adding one requires a code and policy change, then validation.

Auto can run up to three OpenCode phase invocations. An invocation may make several provider requests. There is no kit-enforced dollar cap. Use provider controls and review usage.

## Check before the first run

Confirm that the task exists on the default branch, the App is installed on this repository, the variable and both secret names are set, the selected model is allowed and your CI runs on PRs. Start with a small task and phase plan.

## Continue

[Run a task](use.md) · [Limits, isolation and costs](limits.md) · [Documentation index](../../README.md)
