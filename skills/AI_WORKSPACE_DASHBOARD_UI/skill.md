-----------
name: AI_WORKSPACE_DASHBOARD_UI
version: 1.0
scope: workspace
type: frontend
owner: Expellirmud AI-Workspace
-----------

# Purpose
Guides the implementation and modification of the React-based AI-Workspace Dashboard interface (`src/App.jsx`, `src/styles.css`).

# When to use
Whenever a task requires modifying the visual layout, components, or client-side logic of the dashboard.

# Read first
- `ai-ops-registry/docs/WORKSPACE_GOVERNANCE.md`

# Allowed actions
- Modifying React components in `src/App.jsx`.
- Updating CSS styles in `src/styles.css`.
- Interacting with the backend Vite API endpoints.
- Running `npm run build` to validate compilation.

# Forbidden actions
- Adding complex state management libraries (e.g., Redux) unless strictly necessary.
- Hardcoding external product data into the UI.
- Violating the manual-safe design principles (e.g., hiding the manual confirm buttons).

# Workflow
1. Analyze the UI requirement.
2. Implement the changes in `App.jsx` and/or `styles.css`.
3. Verify that the UI correctly reflects the backend state (especially governance and automation policies).
4. Run `npm run build` to ensure no syntax or compilation errors exist.

# Required output
Updated UI components that successfully compile and align with the manual-safe control center concept.

# Stop / Escalate conditions
- If a UI change requires breaking the single-page application structure into an overly complex multi-page routing system prematurely.
