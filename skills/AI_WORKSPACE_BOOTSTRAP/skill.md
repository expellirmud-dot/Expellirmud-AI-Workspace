-----------
name: AI_WORKSPACE_BOOTSTRAP
version: 1.0
scope: workspace
type: bootstrap
owner: Expellirmud AI-Workspace
-----------

# Purpose
Initializes and prepares the core AI-Workspace directory (`D:\ai-tools\AI-Workspace`) for operations. Checks system pre-requisites and establishes boundary guardrails.

# When to use
Whenever entering the `AI-Workspace` for the very first time on a new task or if a systemic configuration error is detected.

# Read first
- `AGENTS.md`
- `WORKSPACE.md`
- `workspace-modules.yaml`

# Allowed actions
- Reading configuration files.
- Verifying the presence of registry directories.
- Verifying CodeGraph index status for `D:\ai-tools\AI-Workspace`.

# Forbidden actions
- Executing product-specific tasks.
- Modifying product source code in external repositories (e.g., `D:\lumina-studio`).
- Implementing unapproved automation layers.

# Workflow
1. Read the required files.
2. Check for the existence of `ai-ops-registry`.
3. Check if CodeGraph is initialized for the workspace.
4. Report the workspace health status.

# Required output
A markdown summary report containing the health status of the workspace configuration.

# Stop / Escalate conditions
- If `AGENTS.md` or `WORKSPACE.md` is missing.
- If directed to operate outside `D:\ai-tools\AI-Workspace`.
