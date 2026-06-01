-----------
name: AI_WORKSPACE_REGISTRY_GOVERNANCE
version: 1.0
scope: workspace
type: governance
owner: Expellirmud AI-Workspace
-----------

# Purpose
Maintains the integrity and structure of the `ai-ops-registry` directory. Ensures all data models (projects, snapshots, tasks, channels) conform to standard schemas.

# When to use
When reading from or writing to the YAML files inside the `ai-ops-registry` database structure.

# Read first
- `ai-ops-registry/AGENTS.md`
- `ai-ops-registry/registry/REGISTRY_CONTRACT.md`

# Allowed actions
- Reading and parsing YAML project profiles and snapshots.
- Writing new task cards and reports.
- Creating or merging configuration files (`channels.yaml`, `automation-policy.yaml`).
- Enforcing structural immutability (e.g., active-context snapshots must not be altered after dispatch).

# Forbidden actions
- Deleting historical decision logs or completed task records.
- Altering the active-context snapshot of an already dispatched task.
- Overwriting registry files silently without checking for existing user modifications.

# Workflow
1. Parse the target YAML file.
2. Apply changes strictly adhering to the existing data schema.
3. If creating a new default file, check if it already exists to prevent accidental overwrites.
4. Save the file inside the designated registry subdirectory (e.g., `tasks/inbox/`, `registry/`).

# Required output
Valid YAML or Markdown files saved in the correct registry directory.

# Stop / Escalate conditions
- If the schema of a registry file is fundamentally changed without approval.
- If a destructive operation on historical records is requested.
