# New-session entry point for ASF Agent Kits

1. Identify `cedricmenec/asf-agent-kits`, its actual default-branch SHA, outstanding PRs, and CI. Do not assume this repository is already created or that a released kit exists.
2. Read `AGENTS.md`, `README.md`, `docs/roadmap.md`, `docs/security.md`, `docs/adr/0001-catalogue-distribution.md`, the [Notion ASF AgentKit specification](https://app.notion.com/p/40012ac916368112b7fbc8d25dbb9838) and its [living progress roadmap](https://app.notion.com/p/40112ac91636818dab99de3813963c0c).
3. For release or installed status, rely on actual verified tags, manifests and target-repository `.asf/agentkit.lock.json`; never infer versions from an example or a conversation. R2d prototypes and R3e-02 synthetic installation matches do not prove release authenticity, runtime isolation or installation permissions.
4. Initial backlog: manual OpenCode + OpenSpec, optional OpenCode direct; no V1/V3 orchestrator runtime.
5. Implement by small PRs; R0/R1/R2a-R2d and consultative R3a-R3e-02 are integrated prototypes, not deployable kits. Next R3e-03 real host qualification requires a distinct gate; R3 OpenSpec runtime, R4 direct profile, R5 PR deployment, R6 non-paying qualification, R7 owner-approved operational pilot remain ahead. Inspect actual issues/PRs before choosing work.
6. Use no paid models to install, render or test the kit; never insert private keys in Git, Notion, logs or prompts. A paid pilot and any GitHub administration need separate permission.
7. Every update must report completed work, non-paying tests with SHA, PRs, blockers, and next action. Do not label planned checks as passed.
