-----------
name: AI_WORKSPACE_DISPATCH_GOVERNANCE
version: 1.0
scope: workspace
type: governance
owner: Expellirmud AI-Workspace
-----------

# Purpose
Regulates how the AI-Workspace Dashboard generates and handles task dispatch payloads. Ensures the manual-safe barrier is never breached.

# When to use
Whenever modifying or testing the task dispatch mechanism within the Dashboard UI or `vite.config.js`.

# Read first
- `ai-ops-registry/docs/WORKSPACE_GOVERNANCE.md`
- `ai-ops-registry/registry/channels.yaml`
- `ai-ops-registry/registry/automation-policy.yaml`

# Allowed actions
- Modifying UI components to display dispatch payloads.
- Modifying backend logic to generate dispatch markdown files.
- Implementing UI flows to copy messages to the clipboard and open target URLs.
- Modifying the task state tracking logic (`draft` -> `ready_to_dispatch` -> `sent`).

# Forbidden actions
- Implementing auto-send features or auto-typing into external browser windows.
- Enabling Playwright or Selenium automation to bypass manual actions.
- Automatically scraping responses from ChatGPT or other external AI channels.

# Workflow
1. Verify the `automation-policy.yaml` explicitly enforces manual-safe mode.
2. Construct the required logic for payload generation.
3. Bind the execution to manual triggers (e.g., "Start/Prepare", "Confirm Sent").
4. Validate that no external product repo state is altered during dispatch.

# Required output
Source code updates that adhere strictly to the manual-safe communication architecture.

# Stop / Escalate conditions
- If a task requires implementing auto-send or automated browser interaction.
- If the owner requests scraping capabilities.
