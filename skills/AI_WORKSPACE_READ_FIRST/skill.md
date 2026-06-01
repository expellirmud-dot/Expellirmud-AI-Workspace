-----------
name: AI_WORKSPACE_READ_FIRST
version: 1.0
scope: workspace
type: governance
owner: Expellirmud AI-Workspace
-----------

# Purpose
Enforces the strict rule that all AI agents MUST read governance documentation before executing any task inside `AI-Workspace`.

# When to use
At the very beginning of any task dispatched into the `AI-Workspace`.

# Read first
- `AGENTS.md`
- `WORKSPACE.md`
- `workspace-modules.yaml`
- `ai-ops-registry/AGENTS.md`
- `ai-ops-registry/registry/REGISTRY_CONTRACT.md`
- `ai-ops-registry/docs/WORKSPACE_GOVERNANCE.md` (if exists)
- `ai-ops-registry/docs/READ_FIRST_POLICY.md` (if exists)

# Allowed actions
- Reading text files and markdown documentation.
- Outputting summaries of the read-first policy constraints.

# Forbidden actions
- Modifying any code or configuration before reading the full context.
- Proceeding with the primary objective before confirming policy alignment.

# Workflow
1. Sequentially read the files listed in the "Read first" section.
2. Cross-reference the current task's objective against the defined `REGISTRY_CONTRACT.md` rules.
3. Validate that the task complies with the manual-safe and registry isolation policies.
4. Log that the read-first procedure is complete.

# Required output
A confirmation statement that the agent has ingested the governance rules and bound its behavior to them.

# Stop / Escalate conditions
- If a required read-first file is missing.
- If the assigned task violates the policies defined in the read-first documents.
