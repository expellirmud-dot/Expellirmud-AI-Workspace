# Expellirmud AI-Workspace Agent Instructions

## Workspace Root

```text
D:\ai-tools\AI-Workspace
```

Treat this directory as the primary workspace. Do not treat a module directory
or product repository as the system root.

## Module Boundary

`ai-ops-registry/` owns registry data, project profiles, templates, snapshots,
task records, and reports.

Product repositories remain external. Read or edit them only when an approved
task card explicitly allows it.

## Required Read Order

1. `README.md`
2. `WORKSPACE.md`
3. `workspace-modules.yaml`
4. `ai-ops-registry/AGENTS.md`
5. `ai-ops-registry/registry/REGISTRY_CONTRACT.md`
6. The selected project profile
7. The selected active-context snapshot
8. The selected task card

## V1 Safety Rules

- Manual dispatch only.
- Deny by default when scope is missing.
- Keep registry infrastructure separate from product code.
- Attach an active-project context snapshot to every new dispatched task.
- Do not auto-send prompts.
- Do not invoke subagents automatically.
- Do not trigger CI, deployment, or MCP Tasks automatically.

