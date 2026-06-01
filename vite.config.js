import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import YAML from "yaml";

const rootDir = process.cwd();
const registryDir = path.join(rootDir, "ai-ops-registry");
const projectsDir = path.join(registryDir, "projects");
const snapshotsDir = path.join(registryDir, "snapshots", "active-context");

const tasksInboxDir = path.join(registryDir, "tasks", "inbox");
const tasksActiveDir = path.join(registryDir, "tasks", "active");
const tasksCompletedDir = path.join(registryDir, "tasks", "completed");
const tasksBlockedDir = path.join(registryDir, "tasks", "blocked");
const reportsDir = path.join(registryDir, "reports");
const dashboardStatePath = path.join(registryDir, "dashboard-state.yaml");

const channelsPath = path.join(registryDir, "registry", "channels.yaml");
const automationPolicyPath = path.join(registryDir, "registry", "automation-policy.yaml");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

[tasksInboxDir, tasksActiveDir, tasksCompletedDir, tasksBlockedDir, snapshotsDir, reportsDir, path.join(registryDir, "registry")].forEach(ensureDir);

function readYaml(filePath) {
  try {
    return YAML.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    return null;
  }
}

function writeYaml(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, YAML.stringify(data), "utf8");
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    return "";
  }
}

function writeText(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, text, "utf8");
}

function appendText(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, text, "utf8");
}

function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureDefaults() {
  if (!fs.existsSync(automationPolicyPath)) {
    const defaultPolicy = {
      manual_safe_mode: true,
      auto_send_enabled: false,
      playwright_bridge_enabled: false,
      response_scraping_enabled: false,
      subagent_automation_enabled: false,
      owner_confirmation_required: true
    };
    writeYaml(automationPolicyPath, defaultPolicy);
  }
  
  if (!fs.existsSync(channelsPath)) {
    const defaultChannels = [
      {
        channel_id: "chatgpt_controller_expellirmud_ai_workspace",
        label: "ChatGPT Controller - Expellirmud AI-Workspace",
        app: "chatgpt",
        role: "controller",
        binding: "gpt_5_5_chatgpt_system_architect",
        dispatch_method: "open_url_and_copy",
        response_method: "manual_paste",
        target_url: "https://chatgpt.com/g/g-p-6a1d63babda881919c333a9897aa2a7a-expellirmud-ai-workspace/c/6a1d3a09-e448-83ec-95b8-4b1dc453f3e7",
        fallback_url: "https://chatgpt.com",
        automation_status: "manual_safe_only",
        readiness_status: "manual_only",
        owner_confirmation_required: true,
        future_automation: {
          planned: true, allowed_now: false, method: "browser_or_api_bridge_later", note: "Auto-send may be considered only after dashboard communication flow is stable and explicitly approved."
        },
        limitations: ["Dashboard must not auto-type into ChatGPT now.", "Dashboard must not press Enter automatically now.", "Dashboard must not scrape ChatGPT responses now.", "Owner must paste/send manually for now.", "Owner must paste the response back into dashboard for now."]
      },
      {
        channel_id: "chatgpt_controller_new_chat",
        label: "ChatGPT Controller - New Chat",
        app: "chatgpt",
        role: "controller",
        binding: "gpt_5_5_chatgpt_system_architect",
        dispatch_method: "open_url_and_copy",
        response_method: "manual_paste",
        target_url: "https://chatgpt.com",
        automation_status: "manual_safe_only",
        readiness_status: "manual_only",
        owner_confirmation_required: true
      },
      {
        channel_id: "antigravity_gemini_worker",
        label: "Antigravity Worker",
        app: "gemini",
        role: "worker",
        binding: "gemini_3_1_pro",
        dispatch_method: "manual_paste_or_task_file",
        response_method: "manual_paste",
        automation_status: "manual_safe_only",
        readiness_status: "manual_only"
      },
      {
        channel_id: "gemini_cli_worker",
        label: "Gemini CLI",
        app: "cli",
        role: "worker",
        binding: "gemini_1_5_flash",
        dispatch_method: "cli_command_future",
        response_method: "command_output_paste",
        automation_status: "planned_later",
        readiness_status: "needs_config"
      },
      {
        channel_id: "opencode_gemma_verifier",
        label: "OpenCode",
        app: "opencode",
        role: "verifier",
        binding: "gemma_4",
        dispatch_method: "manual_or_cli_future",
        response_method: "manual_paste",
        automation_status: "planned_later",
        readiness_status: "needs_config"
      }
    ];
    writeYaml(channelsPath, defaultChannels);
  }
}
ensureDefaults();

function listProjectProfiles() {
  if (!fs.existsSync(projectsDir)) return [];
  return fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const filePath = path.join(projectsDir, entry.name, "project.yaml");
      const project = readYaml(filePath);
      if (!project) return null;
      const rulesPath = path.join(projectsDir, entry.name, project.project.rules_file || "PROJECT_RULES.md");
      const forbiddenPath = path.join(projectsDir, entry.name, project.project.forbidden_actions_file || "FORBIDDEN_ACTIONS.md");
      const workflowPath = path.join(projectsDir, entry.name, project.project.workflow_file || "WORKFLOW.md");
      const skillsPath = path.join(projectsDir, entry.name, project.project.skills_file || "SKILLS.md");
      return {
        slug: entry.name,
        profilePath: filePath,
        project: project.project,
        rules: readText(rulesPath) || readYaml(rulesPath),
        forbiddenActions: readText(forbiddenPath) || readYaml(forbiddenPath),
        workflow: readText(workflowPath) || readYaml(workflowPath),
        skills: readText(skillsPath) || readYaml(skillsPath),
      };
    }).filter(Boolean);
}

function listYamlFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")))
    .map((entry) => {
      const filePath = path.join(dirPath, entry.name);
      return {
        name: entry.name,
        path: filePath,
        data: readYaml(filePath)
      };
    });
}

function listAllTasks() {
  return [
    ...listYamlFiles(tasksInboxDir).map(t => ({ ...t, folder: 'inbox' })),
    ...listYamlFiles(tasksActiveDir).map(t => ({ ...t, folder: 'active' })),
    ...listYamlFiles(tasksCompletedDir).map(t => ({ ...t, folder: 'completed' })),
    ...listYamlFiles(tasksBlockedDir).map(t => ({ ...t, folder: 'blocked' }))
  ];
}

function getTaskFolderForStatus(status) {
  if (['draft', 'ready_to_dispatch'].includes(status)) return tasksInboxDir;
  if (['accepted', 'done'].includes(status)) return tasksCompletedDir;
  if (['blocked', 'rejected'].includes(status)) return tasksBlockedDir;
  return tasksActiveDir;
}

function findTaskFile(taskId) {
  const dirs = [tasksInboxDir, tasksActiveDir, tasksCompletedDir, tasksBlockedDir];
  for (const dir of dirs) {
    const p = path.join(dir, `${taskId}.yaml`);
    if (fs.existsSync(p)) return { dir, path: p };
  }
  return null;
}

function logEvent(taskId, logType, message) {
  const logPath = path.join(reportsDir, taskId, "logs", `${logType}.log.md`);
  appendText(logPath, `[${isoNow()}] ${message}\n`);
}

function buildSnapshot(projectSlug, objective) {
  const profile = listProjectProfiles().find((item) => item.slug === projectSlug);
  if (!profile) throw new Error(`Unknown project: ${projectSlug}`);
  const id = `${slugify(profile.project.id)}-${Date.now()}`;
  const selectedBindingId = profile.project.allowed_model_ids?.includes("gpt-5.5-thinking")
    ? "codex-controller-gpt55"
    : "codex-worker-gpt53";
  const snapshot = {
    schema_version: "1.0",
    active_context: {
      id,
      created_at: isoNow(),
      immutable_after_dispatch: true,
      project: {
        id: profile.project.id,
        profile_version: profile.project.profile_version,
        path: profile.project.path,
      },
      tool_requirements: profile.project.required_tools || [],
      task_id: `${profile.project.id.toUpperCase()}-DISPATCH-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`,
      selected_binding_id: selectedBindingId,
      rules: profile.rules?.map?.((r) => (typeof r === "string" ? r : JSON.stringify(r))) || [],
      forbidden_actions: profile.forbiddenActions?.forbidden_actions || profile.forbiddenActions || [],
      preferred_workflow: profile.workflow?.preferred_workflow || [],
      allowed_models: profile.project.allowed_model_ids || [],
      required_skills: profile.skills?.skills || [],
      required_tools: profile.project.required_tools || [],
      required_runtimes: profile.project.required_runtimes || [],
      allowed_files: [
        `${profile.project.path}\\AGENTS.md`,
        `${profile.project.path}\\PROJECT_RULES.md`,
        `${profile.project.path}\\AI_HANDOFF.md`,
        `${profile.project.path}\\reports\\*.md`,
      ],
      forbidden_files: [`${profile.project.path}\\**`],
      validation_commands: [
        "git status --short",
        "python -c \"import yaml, pathlib; yaml.safe_load(pathlib.Path(r'D:\\ai-tools\\AI-Workspace\\ai-ops-registry\\projects\\lumina-studio\\project.yaml').read_text(encoding='utf-8')); print('PROJECT_YAML_OK')\"",
      ],
      notes: ["Immutable once dispatched."],
      workspace_governance_readiness: {
        read_first_policy: "present",
        workspace_skills: "present",
        codegraph: "ready",
        serena_mcp: "ready_active_project_mapped"
      },
      read_first_sources: [
        "AGENTS.md",
        "WORKSPACE.md",
        "workspace-modules.yaml",
        "ai-ops-registry/AGENTS.md",
        "ai-ops-registry/docs/READ_FIRST_POLICY.md",
        "ai-ops-registry/docs/WORKSPACE_GOVERNANCE.md",
        "ai-ops-registry/docs/TOOL_PREFLIGHT.md"
      ]
    },
  };
  const snapshotPath = path.join(snapshotsDir, `${snapshot.active_context.id}.yaml`);
  writeYaml(snapshotPath, snapshot);
  return { snapshot, snapshotPath, profile };
}

function buildTaskCard(snapshot, objective, title, channels) {
  const id = title || `${snapshot.active_context.project.id.toUpperCase()}-TASK-${Date.now()}`;
  const task = {
    schema_version: "1.0",
    task: {
      id,
      title: objective.slice(0, 72) || "Workspace dashboard task",
      status: "draft",
      project_id: snapshot.active_context.project.id,
      active_context_snapshot: `snapshots/active-context/${snapshot.active_context.id}.yaml`,
      requested_by: "owner",
      objective,
      mode: "manual-safe",
      assigned_channels: channels || {},
      assigned_binding_id: snapshot.active_context.selected_binding_id,
      required_tools: snapshot.active_context.required_tools,
      required_runtimes: snapshot.active_context.required_runtimes,
      allowed_files: snapshot.active_context.allowed_files,
      forbidden_files: snapshot.active_context.forbidden_files,
      allowed_actions: ["read", "inspect", "prepare-manual-dispatch"],
      forbidden_actions: ["edit-product-code", "auto-send", "use-playwright-bridge", "subagent-automation", "ci", "deployment"],
      read_first: [
        "D:\\ai-tools\\AI-Workspace\\AGENTS.md",
        "D:\\ai-tools\\AI-Workspace\\WORKSPACE.md",
        "D:\\ai-tools\\AI-Workspace\\workspace-modules.yaml",
        "D:\\ai-tools\\AI-Workspace\\ai-ops-registry\\registry\\REGISTRY_CONTRACT.md",
      ],
      validation_commands: snapshot.active_context.validation_commands,
      outputs: ["worker-report", "verifier-report", "manual-dispatch-message"],
      handoff: { next_role: "verifier", automatic_dispatch: false, owner_approval_required: true },
      workspace_governance_readiness: {
        read_first_policy: "present",
        workspace_skills: "present",
        codegraph: "ready",
        serena_mcp: "ready_active_project_mapped"
      },
      required_preflight: [
        "read_workspace_governance",
        "read_relevant_workspace_skills",
        "confirm_task_boundary",
        "use_serena_for_workspace_understanding_when_needed",
        "use_codegraph_for_dependency_or_impact_review_when_needed"
      ]
    },
  };
  const taskPath = path.join(tasksInboxDir, `${task.task.id}.yaml`);
  writeYaml(taskPath, task);
  logEvent(task.task.id, 'system', `Task ${task.task.id} created.`);
  logEvent(task.task.id, 'task', `Status changed to draft`);
  return { task, taskPath };
}

function buildDispatchMessages(snapshot, objective, taskId, channels = {}) {
  const controllerId = channels.controller || "not_assigned";
  const workerId = channels.worker || "not_assigned";
  const verifierId = channels.verifier || "not_assigned";

  const controller = `You are the Controller for LUMINA.

Governance Readiness:
- READ-FIRST Policy: Present
- Workspace Skills: Present
- CodeGraph: Ready
- Serena MCP: Ready

role: controller
task_id: ${taskId}
objective: ${objective}
active_context_snapshot: ai-ops-registry/snapshots/active-context/${snapshot.active_context.id}.yaml
selected_worker: ${workerId}
selected_verifier: ${verifierId}

Controller must:
- read governance context first
- respect manual-safe policy
- use selected_worker and selected_verifier from task card
- not assume missing dashboard state
- request clarification if active context is missing
- recommend whether Worker should use Serena or CodeGraph

rules:
- Manual-safe only.
- No auto-send.
- No Playwright bridge.
- No subagent automation.
- No CI or deployment.
- No product repository edits.

required_output_format: controller_response_v1
`;
  const worker = `You are the Worker for LUMINA.

role: worker
task_id: ${taskId}
objective: ${objective}
active_context_snapshot: ai-ops-registry/snapshots/active-context/${snapshot.active_context.id}.yaml
selected_controller: ${controllerId}
selected_verifier: ${verifierId}

workspace_governance_readiness:
  read_first_policy: ${snapshot.active_context.workspace_governance_readiness.read_first_policy}
  workspace_skills: ${snapshot.active_context.workspace_governance_readiness.workspace_skills}
  codegraph: ${snapshot.active_context.workspace_governance_readiness.codegraph}
  serena_mcp: ${snapshot.active_context.workspace_governance_readiness.serena_mcp}

read_first_sources:
${snapshot.active_context.read_first_sources.map(s => `  - ${s}`).join("\n")}

allowed_files:
${snapshot.active_context.allowed_files.map(s => `  - ${s}`).join("\n")}

forbidden_files:
${snapshot.active_context.forbidden_files.map(s => `  - ${s}`).join("\n")}

tool_preflight:
  - read_workspace_governance
  - read_relevant_workspace_skills
  - confirm_task_boundary
  - use_serena_for_workspace_understanding_when_needed
  - use_codegraph_for_dependency_or_impact_review_when_needed

rules:
- Manual-safe only.
- No auto-send.
- No Playwright bridge.
- No subagent automation.
- No CI or deployment.
- No product repository edits.

required_output_format: worker_report_v1

READ-FIRST REQUIRED:
Before doing anything:
1. Read AGENTS.md
2. Read WORKSPACE.md
3. Read ai-ops-registry/docs/READ_FIRST_POLICY.md
4. Read the relevant task card
5. Read the active-context snapshot
6. Read required workspace skill if relevant
7. Use Serena for workspace/file understanding when useful
8. Use CodeGraph for impact/dependency review when useful

Worker must not:
- edit files outside allowed scope
- touch external product repositories unless explicitly allowed
- skip READ-FIRST
- bypass owner gate
- claim tool readiness without verifying actual tool output
`;
  const verifier = `You are the Verifier for LUMINA.

Task ID: ${taskId}
Verify:
- READ-FIRST was followed
- workspace skill was used if relevant
- Serena/CodeGraph were used or intentionally skipped with reason
- task stayed within allowed files
- product boundary stayed intact
- manual-safe policy stayed intact
`;
  
  const dispatchDir = path.join(reportsDir, taskId, "dispatch");
  ensureDir(dispatchDir);
  writeText(path.join(dispatchDir, "controller.md"), controller);
  writeText(path.join(dispatchDir, "worker.md"), worker);
  writeText(path.join(dispatchDir, "verifier.md"), verifier);
  
  logEvent(taskId, 'system', 'Dispatch messages generated.');
  
  return {
    controllerPath: `ai-ops-registry/reports/${taskId}/dispatch/controller.md`,
    workerPath: `ai-ops-registry/reports/${taskId}/dispatch/worker.md`,
    verifierPath: `ai-ops-registry/reports/${taskId}/dispatch/verifier.md`,
    controller,
    worker,
    verifier,
  };
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "workspace-registry-api",
      configureServer(server) {
        const jsonBody = async (req) => {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        };

        server.middlewares.use("/api/workspace-data", (_req, res) => {
          const dashboardState = readYaml(dashboardStatePath) || {};
          const channels = readYaml(channelsPath) || [];
          const automationPolicy = readYaml(automationPolicyPath) || {};
          
          const data = {
            workspaceRoot: rootDir,
            registryDir,
            projects: listProjectProfiles(),
            activeContexts: listYamlFiles(snapshotsDir),
            tasks: listAllTasks(),
            dashboardState,
            channels,
            automationPolicy,
            governance: {
               readFirst: fs.existsSync(path.join(registryDir, "docs", "READ_FIRST_POLICY.md")),
               workspaceSkills: fs.existsSync(path.join(rootDir, "skills", "AI_WORKSPACE_BOOTSTRAP", "skill.md")),
               serena: "needs_setup",
               codeGraph: fs.existsSync(path.join(rootDir, ".codegraph")) ? "ready" : "not_initialized"
            }
          };
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(data));
        });

        server.middlewares.use("/api/dashboard-state", async (req, res) => {
          if (req.method !== "POST") return res.end();
          const body = await jsonBody(req);
          const state = readYaml(dashboardStatePath) || {};
          Object.assign(state, body);
          writeYaml(dashboardStatePath, state);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: true }));
        });

        server.middlewares.use("/api/generate-snapshot", async (req, res) => {
          if (req.method !== "POST") return res.end();
          const body = await jsonBody(req);
          const { snapshot, snapshotPath } = buildSnapshot(body.projectSlug, body.objective || "Dashboard task");
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ snapshot, snapshotPath }));
        });

        server.middlewares.use("/api/generate-task", async (req, res) => {
          if (req.method !== "POST") return res.end();
          const body = await jsonBody(req);
          const { snapshot } = buildSnapshot(body.projectSlug, body.objective || "Dashboard task");
          const { task, taskPath } = buildTaskCard(snapshot, body.objective || "Dashboard task", body.taskId, body.channels);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ task, taskPath, snapshotId: snapshot.active_context.id }));
        });

        server.middlewares.use("/api/generate-dispatch", async (req, res) => {
          if (req.method !== "POST") return res.end();
          const body = await jsonBody(req);
          const { snapshot } = buildSnapshot(body.projectSlug, body.objective || "Dashboard task");
          const taskId = body.taskId || snapshot.active_context.task_id;
          
          let channels = {};
          const taskFile = findTaskFile(taskId);
          if (taskFile) {
            const t = readYaml(taskFile.path);
            channels = t.task.assigned_channels || {};
            if (t.task.status === 'draft') {
              t.task.status = 'ready_to_dispatch';
              fs.unlinkSync(taskFile.path);
              writeYaml(path.join(tasksInboxDir, `${taskId}.yaml`), t);
              logEvent(taskId, 'task', `Status changed to ready_to_dispatch`);
            }
          }

          const output = buildDispatchMessages(snapshot, body.objective || "Dashboard task", taskId, channels);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(output));
        });

        server.middlewares.use("/api/task/status", async (req, res) => {
          if (req.method !== "POST") return res.end();
          const { taskId, status } = await jsonBody(req);
          const taskFile = findTaskFile(taskId);
          if (!taskFile) {
            res.statusCode = 404;
            return res.end(JSON.stringify({ error: "Task not found" }));
          }
          const t = readYaml(taskFile.path);
          const oldStatus = t.task.status;
          t.task.status = status;
          
          const newDir = getTaskFolderForStatus(status);
          const newPath = path.join(newDir, `${taskId}.yaml`);
          
          if (taskFile.path !== newPath) {
             fs.unlinkSync(taskFile.path);
          }
          writeYaml(newPath, t);
          logEvent(taskId, 'task', `Status changed from ${oldStatus} to ${status}. Moved to ${path.basename(newDir)} folder.`);
          
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: true, task: t }));
        });

        server.middlewares.use("/api/task/log-event", async (req, res) => {
          if (req.method !== "POST") return res.end();
          const { taskId, logType, message } = await jsonBody(req);
          logEvent(taskId, logType, message);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: true }));
        });

        server.middlewares.use("/api/task/response", async (req, res) => {
          if (req.method !== "POST") return res.end();
          const { taskId, role, content } = await jsonBody(req);
          
          const responsePath = path.join(reportsDir, taskId, "responses", `${role}-response.md`);
          writeText(responsePath, content);
          logEvent(taskId, 'response', `Received response from ${role}. Saved to responses/${role}-response.md`);
          
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: true }));
        });

        server.middlewares.use("/api/task/decision", async (req, res) => {
          if (req.method !== "POST") return res.end();
          const { taskId, decision, reason, nextAction } = await jsonBody(req);
          
          const timestamp = isoNow().replace(/[:.]/g, "-");
          const decisionPath = path.join(reportsDir, taskId, "decisions", `owner-decision-${timestamp}.md`);
          
          const content = `# Owner Decision
- **Decision:** ${decision}
- **Timestamp:** ${isoNow()}
- **Reason:** ${reason}
- **Next Action:** ${nextAction}
`;
          writeText(decisionPath, content);
          logEvent(taskId, 'task', `Owner decision: ${decision}. Reason: ${reason}`);
          
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: true }));
        });

        server.middlewares.use("/api/task/logs", async (req, res) => {
          if (req.method !== "POST") return res.end();
          const { taskId } = await jsonBody(req);
          const logsDir = path.join(reportsDir, taskId, "logs");
          const logs = {
            system: readText(path.join(logsDir, "system.log.md")),
            task: readText(path.join(logsDir, "task.log.md")),
            response: readText(path.join(logsDir, "response.log.md")),
            banter: readText(path.join(logsDir, "banter.log.md"))
          };
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(logs));
        });

        server.middlewares.use("/api/task/files", async (req, res) => {
           if (req.method !== "POST") return res.end();
           const { taskId } = await jsonBody(req);
           const dispatchDir = path.join(reportsDir, taskId, "dispatch");
           const responsesDir = path.join(reportsDir, taskId, "responses");
           const decisionsDir = path.join(reportsDir, taskId, "decisions");
           res.setHeader("Content-Type", "application/json");
           res.end(JSON.stringify({
              dispatch: {
                 controller: readText(path.join(dispatchDir, "controller.md")),
                 worker: readText(path.join(dispatchDir, "worker.md")),
                 verifier: readText(path.join(dispatchDir, "verifier.md"))
              },
              responses: {
                 controller: readText(path.join(responsesDir, "controller-response.md")),
                 worker: readText(path.join(responsesDir, "worker-response.md")),
                 verifier: readText(path.join(responsesDir, "verifier-response.md")),
                 final: readText(path.join(responsesDir, "final-review.md"))
              },
              decisions: fs.existsSync(decisionsDir) ? fs.readdirSync(decisionsDir).map(f => readText(path.join(decisionsDir, f))) : []
           }));
        });

      }
    }
  ],
});
