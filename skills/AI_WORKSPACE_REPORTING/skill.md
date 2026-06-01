-----------
name: AI_WORKSPACE_REPORTING
version: 1.0
scope: workspace
type: documentation
owner: Expellirmud AI-Workspace
-----------

# Purpose
Standardizes how validation results and task outcomes are documented within the workspace. Ensures transparency and auditability.

# When to use
At the conclusion of a major structural task or when verifying the readiness of external tools (CodeGraph, Serena).

# Read first
- `ai-ops-registry/registry/REGISTRY_CONTRACT.md`

# Allowed actions
- Generating markdown files in `ai-ops-registry/reports/`.
- Summarizing file changes, tool readiness statuses, and boundary validations.

# Forbidden actions
- Falsifying validation results or tool readiness states.
- Omitting required checks specified in the task card.

# Workflow
1. Gather the outputs of all validation checks performed during the task.
2. Format the data into a clear markdown report.
3. Highlight any known issues, limitations, or manual setup steps required from the owner.
4. Save the report to the designated `reports/` directory.

# Required output
A comprehensive markdown report detailing the task's execution and validation results.

# Stop / Escalate conditions
- If a critical validation check fails (e.g., product boundary was breached), stop the task and report the failure immediately.
