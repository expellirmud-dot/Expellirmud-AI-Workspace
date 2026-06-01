import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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


function checkSafePath(targetRelPath) {
  const resolved = path.resolve(registryDir, targetRelPath);
  const rel = path.relative(registryDir, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error("Path boundary violation: " + targetRelPath);
  }
  return resolved;
}

function validateTaskId(taskId) {
  if (!taskId || typeof taskId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(taskId)) {
    throw new Error("Invalid taskId format");
  }
  return taskId;
}

function generateSafeTimestampFilename(prefix, extension = "md") {
  const iso = new Date().toISOString();
  const safeIso = iso.replace(/[:.]/g, "-");
  const suffix = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${safeIso}-${suffix}.${extension}`;
}

function writeAppendOnlyArtifact(relPath, content) {
  const absPath = checkSafePath(relPath);
  ensureDir(path.dirname(absPath));
  fs.writeFileSync(absPath, content, { encoding: "utf8", flag: "wx" });
}

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

function readLatestArtifact(relDir, prefix, parser = (text) => text) {
  const absDir = checkSafePath(relDir);
  if (!fs.existsSync(absDir)) return null;
  const files = fs.readdirSync(absDir).filter((file) => file.startsWith(prefix)).sort();
  if (files.length === 0) return null;
  const filename = files[files.length - 1];
  return {
    filename,
    content: parser(readText(path.join(absDir, filename)))
  };
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

const CANONICAL_STATUSES = [
  'DRAFT', 'CONTROLLER_PLAN_RECORDED', 'READY_TO_START',
  'CODEX_ORCHESTRATING', 'WORKER_RUNNING', 'VALIDATING',
  'ORCHESTRATOR_REPORTED', 'READY_FOR_FINAL_GATE',
  'READY_TO_COMMIT', 'DONE', 'BLOCKED', 'NEEDS_FIX'
];

const ALLOWED_TRANSITIONS = {
  'DRAFT': ['CONTROLLER_PLAN_RECORDED'],
  'CONTROLLER_PLAN_RECORDED': ['READY_TO_START'],
  'READY_TO_START': ['CODEX_ORCHESTRATING'],
  'CODEX_ORCHESTRATING': ['WORKER_RUNNING'],
  'WORKER_RUNNING': ['VALIDATING', 'BLOCKED', 'NEEDS_FIX'],
  'VALIDATING': ['ORCHESTRATOR_REPORTED', 'BLOCKED', 'NEEDS_FIX'],
  'ORCHESTRATOR_REPORTED': ['READY_FOR_FINAL_GATE'],
  'READY_FOR_FINAL_GATE': ['READY_TO_COMMIT', 'NEEDS_FIX', 'BLOCKED'],
  'READY_TO_COMMIT': ['DONE'],
  'BLOCKED': ['READY_TO_START', 'WORKER_RUNNING'],
  'NEEDS_FIX': ['WORKER_RUNNING']
};

function normalizeStatus(status) {
  const upper = String(status).toUpperCase();
  if (upper === 'READY_TO_DISPATCH') return 'READY_TO_START';
  if (upper === 'ACCEPTED') return 'DONE';
  if (upper === 'REJECTED') return 'BLOCKED';
  return upper;
}

function validateTransition(fromStatus, toStatus) {
  if (!CANONICAL_STATUSES.includes(toStatus)) {
    const err = new Error(`Unknown status: ${toStatus}`);
    err.status_code = 400;
    throw err;
  }
  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus) && fromStatus !== toStatus) {
    const err = new Error(`Illegal transition from ${fromStatus} to ${toStatus}`);
    err.status_code = 409;
    throw err;
  }
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
  const s = normalizeStatus(status);
  if (['DRAFT', 'CONTROLLER_PLAN_RECORDED', 'READY_TO_START'].includes(s)) return tasksInboxDir;
  if (['CODEX_ORCHESTRATING', 'WORKER_RUNNING', 'VALIDATING', 'ORCHESTRATOR_REPORTED', 'READY_FOR_FINAL_GATE', 'READY_TO_COMMIT'].includes(s)) return tasksActiveDir;
  if (['DONE'].includes(s)) return tasksCompletedDir;
  if (['BLOCKED', 'NEEDS_FIX'].includes(s)) return tasksBlockedDir;
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
  validateTaskId(taskId);
  const logPath = checkSafePath(path.join("reports", taskId, "logs", `${logType}.log.md`));
  appendText(logPath, `[${isoNow()}] ${message}\n`);
}

function buildCodexHandoff(task, taskFilePath) {
  const taskId = task.task.id;
  const taskCardPath = path.relative(rootDir, taskFilePath);
  const snapshotPath = task.task.active_context_snapshot;
  return `# Codex Local Orchestration Handoff

contract: codex_orchestration_handoff_v1
task_id: ${taskId}
task_card: ${taskCardPath}
active_context_snapshot: ai-ops-registry/${snapshotPath}
mode: manual-safe

## Required Preflight
- READ-FIRST required
- Read and use workspace skills from D:\\ai-tools\\AI-Workspace\\skills
- Use Serena for workspace understanding
- Use CodeGraph for dependency / impact review
- Stay within task.allowed_files
- Respect task.forbidden_files
- Do not touch external product repositories unless explicitly allowed
- Do not commit, push, or deploy without owner approval
- Invoke at most one CLI worker at a time
- Keep every worker command and validation result auditable

## Objective
${task.task.objective}

## Allowed Files
${task.task.allowed_files.map((file) => `- ${file}`).join("\n")}

## Forbidden Files
${task.task.forbidden_files.map((file) => `- ${file}`).join("\n")}

## Completion Contract
When local validation is complete, POST an orchestrator_report_v1 JSON payload to:
http://127.0.0.1:5173/api/task/orchestrator-report

Required fields:
- taskId
- schemaVersion: orchestrator_report_v1
- summary
- diffSummary
- validationResults
- workersCalled
- blockers

Dashboard execution boundary:
- This handoff does not auto-run Codex or any worker.
- This handoff does not auto-send data to ChatGPT Web.
- Owner approval remains required before commit or push.
`;
}

function buildFinalGateSummary(taskId, report) {
  const validationLines = Object.entries(report.validationResults)
    .map(([name, result]) => `- ${name}: ${String(result)}`)
    .join("\n") || "- none reported";
  const workerLines = report.workersCalled.map((worker) => `- ${worker}`).join("\n") || "- none";
  const blockerLines = report.blockers.map((blocker) => `- ${blocker}`).join("\n") || "- none";
  return `# ChatGPT Web Final Gate Summary

task_id: ${taskId}
schema_version: orchestrator_report_v1
status: READY_FOR_FINAL_GATE

## Orchestrator Summary
${report.summary}

## Diff Summary
${report.diffSummary}

## Validation Results
${validationLines}

## Workers Called
${workerLines}

## Blockers
${blockerLines}

## Final Gate Request
Review the evidence and return APPROVED or REJECTED with a concise reason.
`;
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
        name: profile.project.name,
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
      allowed_files: profile.slug === 'expellirmud-ai-workspace'
        ? [
            `${profile.project.path}\\AGENTS.md`,
            `${profile.project.path}\\WORKSPACE.md`,
            `${profile.project.path}\\workspace-modules.yaml`,
            `${profile.project.path}\\ai-ops-registry\\AGENTS.md`,
            `${profile.project.path}\\ai-ops-registry\\docs\\READ_FIRST_POLICY.md`,
            `${profile.project.path}\\ai-ops-registry\\docs\\WORKSPACE_GOVERNANCE.md`,
            `${profile.project.path}\\ai-ops-registry\\docs\\TOOL_PREFLIGHT.md`,
            `${profile.project.path}\\ai-ops-registry\\registry\\channels.yaml`,
            `${profile.project.path}\\ai-ops-registry\\registry\\automation-policy.yaml`,
            `${profile.project.path}\\skills\\AI_WORKSPACE_BOOTSTRAP\\skill.md`,
            `${profile.project.path}\\skills\\AI_WORKSPACE_READ_FIRST\\skill.md`,
            `${profile.project.path}\\skills\\AI_WORKSPACE_DISPATCH_GOVERNANCE\\skill.md`,
            `${profile.project.path}\\skills\\AI_WORKSPACE_REGISTRY_GOVERNANCE\\skill.md`,
            `${profile.project.path}\\skills\\AI_WORKSPACE_DASHBOARD_UI\\skill.md`,
            `${profile.project.path}\\skills\\AI_WORKSPACE_REPORTING\\skill.md`,
            `${profile.project.path}\\reports\\*.md`,
          ]
        : [
            `${profile.project.path}\\AGENTS.md`,
            `${profile.project.path}\\PROJECT_RULES.md`,
            `${profile.project.path}\\AI_HANDOFF.md`,
            `${profile.project.path}\\reports\\*.md`,
          ],
      forbidden_files: profile.slug === 'expellirmud-ai-workspace'
        ? ['D:\\lumina-studio\\**']
        : [`${profile.project.path}\\**`],
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
  validateTaskId(id);
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
      operation_mode: snapshot.active_context.project.id === 'expellirmud-ai-workspace' ? 'read_only_verification' : 'standard',
      read_first: snapshot.active_context.project.id === 'expellirmud-ai-workspace'
        ? [
            "D:\\ai-tools\\AI-Workspace\\AGENTS.md",
            "D:\\ai-tools\\AI-Workspace\\WORKSPACE.md",
            "D:\\ai-tools\\AI-Workspace\\workspace-modules.yaml",
            "D:\\ai-tools\\AI-Workspace\\ai-ops-registry\\AGENTS.md",
            "D:\\ai-tools\\AI-Workspace\\ai-ops-registry\\docs\\READ_FIRST_POLICY.md",
            "D:\\ai-tools\\AI-Workspace\\ai-ops-registry\\docs\\WORKSPACE_GOVERNANCE.md",
            "D:\\ai-tools\\AI-Workspace\\ai-ops-registry\\docs\\TOOL_PREFLIGHT.md",
            "D:\\ai-tools\\AI-Workspace\\ai-ops-registry\\registry\\REGISTRY_CONTRACT.md",
          ]
        : [
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

  const controller = `You are the Controller for ${snapshot.active_context.project.name}.

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
  const worker = `You are the Worker for ${snapshot.active_context.project.name}.

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
6. Provide skill verification evidence in the following table format:

| Skill Path | Exists | Readable | Format Header Present | Required Sections Present | Evidence / Notes |
|---|---|---|---|---|---|

7. Use Serena for workspace/file understanding when useful
8. Use CodeGraph for impact/dependency review when useful

Worker must not:
- edit files outside allowed scope
- touch external product repositories unless explicitly allowed
- skip READ-FIRST
- bypass owner gate
- claim tool readiness without verifying actual tool output
`;
  const verifier = `You are the Verifier for ${snapshot.active_context.project.name}.

Task ID: ${taskId}
Verify:
- READ-FIRST was followed (Check both task.read_first and snapshot.read_first_sources)
- workspace skill was used if relevant (Verify evidence table provided by Worker)
- Serena/CodeGraph were used or intentionally skipped with reason
- task stayed within allowed files (Distinguish between READ-FIRST governance reads and product repo reads)
- product boundary stayed intact (External product repos must remain untouched)
- manual-safe policy stayed intact

Boundary Verification Note:
Do not mark required READ-FIRST governance reads as violations if they are listed in allowed_files or read_first_sources.
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

        server.middlewares.use("/api/connector-readiness", (req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            channel: "chatgpt_web_project",
            dispatch_method: "manual_copy",
            approved_connector_allowed: false,
            status: "CONNECTOR_POLICY_PENDING",
            can_send: false,
            reason: "Phase 2B approval required before MCP/API dispatch."
          }));
        });

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
          try {
            const body = await jsonBody(req);
            if (body.taskId) validateTaskId(body.taskId);
            const { snapshot } = buildSnapshot(body.projectSlug, body.objective || "Dashboard task");
            const { task, taskPath } = buildTaskCard(snapshot, body.objective || "Dashboard task", body.taskId, body.channels);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ task, taskPath, snapshotId: snapshot.active_context.id }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });

        server.middlewares.use("/api/generate-dispatch", async (req, res) => {
          if (req.method !== "POST") return res.end();
          try {
            const body = await jsonBody(req);
            const taskId = validateTaskId(body.taskId);

            const taskFile = findTaskFile(taskId);
            if (!taskFile) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: "Task not found" }));
            }

            const t = readYaml(taskFile.path);
            let channels = t.task.assigned_channels || {};

            let snapshotRelPath = t.task.active_context_snapshot;
            if (snapshotRelPath.startsWith("ai-ops-registry/")) {
              snapshotRelPath = snapshotRelPath.replace("ai-ops-registry/", "");
            }

            const resolvedSnapshotPath = path.resolve(registryDir, snapshotRelPath);
            const snapshotRelToDir = path.relative(snapshotsDir, resolvedSnapshotPath);
            if (snapshotRelToDir.startsWith('..') || path.isAbsolute(snapshotRelToDir)) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: "Snapshot must be located in snapshots/active-context" }));
            }
            const snapshotAbsPath = resolvedSnapshotPath;
            const snapshotData = readYaml(snapshotAbsPath);

            if (!snapshotData) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: "Snapshot not found" }));
            }

            const currentStatus = normalizeStatus(t.task.status);
            if (['DRAFT', 'CONTROLLER_PLAN_RECORDED'].includes(currentStatus)) {
              const decDir = checkSafePath(path.join("reports", taskId, "decisions"));
              if (!fs.existsSync(decDir) || !fs.readdirSync(decDir).some(f => f.startsWith('controller-'))) {
                res.statusCode = 409;
                return res.end(JSON.stringify({ error: "Cannot dispatch: Missing controller decision artifact" }));
              }
              if (currentStatus === 'DRAFT') {
                validateTransition('DRAFT', 'CONTROLLER_PLAN_RECORDED');
                logEvent(taskId, 'task', `Status changed from DRAFT to CONTROLLER_PLAN_RECORDED via dispatch (artifact detected)`);
              }
              validateTransition('CONTROLLER_PLAN_RECORDED', 'READY_TO_START');

              t.task.status = 'READY_TO_START';
              fs.unlinkSync(taskFile.path);
              writeYaml(path.join(tasksInboxDir, `${taskId}.yaml`), t);
              logEvent(taskId, 'task', `Status changed from CONTROLLER_PLAN_RECORDED to READY_TO_START via dispatch`);
            }

            const output = buildDispatchMessages(snapshotData, t.task.objective || "Dashboard task", taskId, channels);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(output));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });

        server.middlewares.use("/api/task/status", async (req, res) => {
          if (req.method !== "POST") return res.end();
          try {
            const body = await jsonBody(req);
            const taskId = validateTaskId(body.taskId);
            const status = body.status;

            const taskFile = findTaskFile(taskId);
            if (!taskFile) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: "Task not found" }));
            }

            const t = readYaml(taskFile.path);
            const oldStatus = normalizeStatus(t.task.status);
            const newStatus = normalizeStatus(status);

            validateTransition(oldStatus, newStatus);

            if (newStatus === 'READY_TO_START') {
              const decDir = checkSafePath(path.join("reports", taskId, "decisions"));
              if (!fs.existsSync(decDir) || !fs.readdirSync(decDir).some(f => f.startsWith('controller-'))) {
                res.statusCode = 409;
                return res.end(JSON.stringify({ error: "Missing controller decision artifact" }));
              }
            }

            if (newStatus === 'READY_TO_COMMIT') {
              const decDir = checkSafePath(path.join("reports", taskId, "decisions"));
              let approved = false;
              if (fs.existsSync(decDir)) {
                const files = fs.readdirSync(decDir).filter(f => f.startsWith('final-gate-')).sort();
                if (files.length > 0) {
                  const lastFile = files[files.length - 1];
                  const contentPath = checkSafePath(path.join("reports", taskId, "decisions", lastFile));
                  const text = readText(contentPath);
                  if (text.includes('decision: APPROVED') || text.includes('decision: "APPROVED"')) {
                    approved = true;
                  }
                }
              }
              if (!approved) {
                res.statusCode = 409;
                return res.end(JSON.stringify({ error: "Missing approving final-gate artifact" }));
              }
            }

            t.task.status = newStatus; // persist uppercase

            const newDir = getTaskFolderForStatus(newStatus);
            const newPath = path.join(newDir, `${taskId}.yaml`);

            if (taskFile.path !== newPath) {
               fs.unlinkSync(taskFile.path);
            }
            writeYaml(newPath, t);
            logEvent(taskId, 'task', `Status changed from ${oldStatus} to ${newStatus}. Moved to ${path.basename(newDir)} folder.`);

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true, task: t }));
          } catch (e) {
            res.statusCode = e.status_code || 409;
            if (e.message.includes('Path boundary') || e.message.includes('Invalid taskId')) res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });

        server.middlewares.use("/api/task/start-codex-orchestration", async (req, res) => {
          if (req.method !== "POST") return res.end();
          try {
            const { taskId } = await jsonBody(req);
            validateTaskId(taskId);
            const taskFile = findTaskFile(taskId);
            if (!taskFile) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: "Task not found" }));
            }

            const t = readYaml(taskFile.path);
            const oldStatus = normalizeStatus(t.task.status);
            validateTransition(oldStatus, 'CODEX_ORCHESTRATING');
            if (!Array.isArray(t.task.allowed_files) || t.task.allowed_files.length === 0) {
              res.statusCode = 409;
              return res.end(JSON.stringify({ error: "Cannot start Codex orchestration: missing allowed_files scope" }));
            }
            if (!Array.isArray(t.task.forbidden_files)) {
              res.statusCode = 409;
              return res.end(JSON.stringify({ error: "Cannot start Codex orchestration: missing forbidden_files scope" }));
            }
            if (!t.task.active_context_snapshot) {
              res.statusCode = 409;
              return res.end(JSON.stringify({ error: "Cannot start Codex orchestration: missing active context snapshot" }));
            }
            checkSafePath(t.task.active_context_snapshot);

            const newPath = path.join(tasksActiveDir, `${taskId}.yaml`);
            const handoff = buildCodexHandoff(t, newPath);
            const filename = generateSafeTimestampFilename('codex-handoff');
            writeAppendOnlyArtifact(path.join("reports", taskId, "handoffs", filename), handoff);

            t.task.status = 'CODEX_ORCHESTRATING';
            if (taskFile.path !== newPath) fs.unlinkSync(taskFile.path);
            writeYaml(newPath, t);
            logEvent(taskId, 'task', `Status changed from ${oldStatus} to CODEX_ORCHESTRATING via governed Codex handoff.`);
            logEvent(taskId, 'system', `Generated append-only Codex orchestration handoff: handoffs/${filename}`);

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true, handoff, filename, task: t }));
          } catch (e) {
            res.statusCode = e.status_code || 409;
            if (e.message.includes('Path boundary') || e.message.includes('Invalid taskId')) res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });

        server.middlewares.use("/api/task/log-event", async (req, res) => {
          if (req.method !== "POST") return res.end();
          try {
            const { taskId, logType, message } = await jsonBody(req);
            validateTaskId(taskId);
            if (!findTaskFile(taskId)) {
               res.statusCode = 404;
               return res.end(JSON.stringify({ error: "Task not found" }));
            }
            if (!['system', 'task', 'response', 'banter', 'error'].includes(logType)) {
               res.statusCode = 400;
               return res.end(JSON.stringify({ error: "Invalid logType" }));
            }
            logEvent(taskId, logType, message);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });

        server.middlewares.use("/api/task/response", async (req, res) => {
          if (req.method !== "POST") return res.end();
          try {
            const { taskId, role, content } = await jsonBody(req);
            validateTaskId(taskId);
            if (!findTaskFile(taskId)) {
               res.statusCode = 404;
               return res.end(JSON.stringify({ error: "Task not found" }));
            }
            if (!content) throw new Error("Content is required");
            if (!['controller', 'worker', 'verifier', 'orchestrator', 'final-gate'].includes(role)) {
               res.statusCode = 400;
               return res.end(JSON.stringify({ error: "Invalid role" }));
            }
            const responsePath = checkSafePath(path.join("reports", taskId, "responses", `${role}-response.md`));
            writeText(responsePath, content);
            logEvent(taskId, 'response', `Received response from ${role}. Saved to responses/${role}-response.md`);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });

        server.middlewares.use("/api/task/decision", async (req, res) => {
          if (req.method !== "POST") return res.end();
          try {
            const { taskId, decision, reason, nextAction } = await jsonBody(req);
            validateTaskId(taskId);
            if (!findTaskFile(taskId)) {
               res.statusCode = 404;
               return res.end(JSON.stringify({ error: "Task not found" }));
            }
            if (!decision) throw new Error("Decision is required");
            const filename = generateSafeTimestampFilename('owner-decision');
            const contentStr = `# Owner Decision
- **Decision:** ${decision}
- **Timestamp:** ${new Date().toISOString()}
- **Reason:** ${reason}
- **Next Action:** ${nextAction}
`;
            writeAppendOnlyArtifact(path.join("reports", taskId, "decisions", filename), contentStr);
            logEvent(taskId, 'task', `Owner decision: ${decision}. Reason: ${reason}`);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });

        server.middlewares.use("/api/task/logs", async (req, res) => {
          if (req.method !== "POST") return res.end();
          try {
            const { taskId } = await jsonBody(req);
            validateTaskId(taskId);
            if (!findTaskFile(taskId)) {
               res.statusCode = 404;
               return res.end(JSON.stringify({ error: "Task not found" }));
            }
            const logsDir = checkSafePath(path.join("reports", taskId, "logs"));
            const logs = {
              system: readText(path.join(logsDir, "system.log.md")),
              task: readText(path.join(logsDir, "task.log.md")),
              response: readText(path.join(logsDir, "response.log.md")),
              banter: readText(path.join(logsDir, "banter.log.md"))
            };
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(logs));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });

        server.middlewares.use("/api/task/files", async (req, res) => {
           if (req.method !== "POST") return res.end();
           try {
             const { taskId } = await jsonBody(req);
             validateTaskId(taskId);
             if (!findTaskFile(taskId)) {
                res.statusCode = 404;
                return res.end(JSON.stringify({ error: "Task not found" }));
             }
             const dispatchDir = checkSafePath(path.join("reports", taskId, "dispatch"));
             const responsesDir = checkSafePath(path.join("reports", taskId, "responses"));
             const decisionsDir = checkSafePath(path.join("reports", taskId, "decisions"));
             const codexHandoff = readLatestArtifact(path.join("reports", taskId, "handoffs"), 'codex-handoff-');
             const orchestratorReport = readLatestArtifact(
               path.join("reports", taskId, "reports"),
               'orchestrator-report-',
               (text) => JSON.parse(text)
             );
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
                decisions: fs.existsSync(decisionsDir) ? fs.readdirSync(decisionsDir).map(f => readText(path.join(decisionsDir, f))) : [],
                codexHandoff,
                orchestratorReport,
                finalGateSummary: orchestratorReport ? buildFinalGateSummary(taskId, orchestratorReport.content) : ""
             }));
           } catch (e) {
             res.statusCode = 400;
             res.end(JSON.stringify({ error: e.message }));
           }
        });

        server.middlewares.use("/api/task/controller-decision", async (req, res) => {
          if (req.method !== "POST") return res.end();
          try {
            const { taskId, decision, content } = await jsonBody(req);
            validateTaskId(taskId);
            if (!findTaskFile(taskId)) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: "Task not found" }));
            }
            if (!decision) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: "Decision is required" }));
            }
            const filename = generateSafeTimestampFilename('controller');
            writeAppendOnlyArtifact(path.join("reports", taskId, "decisions", filename), content || `# Controller Decision

Decision: ${decision}
`);
            logEvent(taskId, 'task', `Controller decision: ${decision}`);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });

        server.middlewares.use("/api/task/report", async (req, res) => {
          if (req.method !== "POST") return res.end();
          try {
            const { taskId, role, content } = await jsonBody(req);
            validateTaskId(taskId);
            if (!findTaskFile(taskId)) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: "Task not found" }));
            }
            if (!content) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: "Content is required" }));
            }
            if (!['orchestrator', 'worker', 'verifier', 'controller', 'final-gate'].includes(role)) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: "Invalid role" }));
            }
            const filename = generateSafeTimestampFilename(role);
            writeAppendOnlyArtifact(path.join("reports", taskId, "reports", filename), content);
            logEvent(taskId, 'report', `Received report from ${role}.`);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });

        server.middlewares.use("/api/task/orchestrator-report", async (req, res) => {
          if (req.method !== "POST") return res.end();
          try {
            const body = await jsonBody(req);
            const taskId = validateTaskId(body.taskId);
            const taskFile = findTaskFile(taskId);
            if (!taskFile) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: "Task not found" }));
            }
            if (body.schemaVersion !== 'orchestrator_report_v1') {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: "schemaVersion must be orchestrator_report_v1" }));
            }
            if (!body.summary || typeof body.summary !== 'string') {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: "summary is required" }));
            }
            if (!body.diffSummary || typeof body.diffSummary !== 'string') {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: "diffSummary is required" }));
            }
            if (!body.validationResults || typeof body.validationResults !== 'object' || Array.isArray(body.validationResults)) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: "validationResults object is required" }));
            }
            if (!Array.isArray(body.workersCalled) || !body.workersCalled.every((worker) => typeof worker === 'string')) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: "workersCalled must be a string array" }));
            }
            if (!Array.isArray(body.blockers) || !body.blockers.every((blocker) => typeof blocker === 'string')) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: "blockers must be a string array" }));
            }

            const t = readYaml(taskFile.path);
            const oldStatus = normalizeStatus(t.task.status);
            validateTransition(oldStatus, 'ORCHESTRATOR_REPORTED');
            validateTransition('ORCHESTRATOR_REPORTED', 'READY_FOR_FINAL_GATE');

            const report = {
              schemaVersion: 'orchestrator_report_v1',
              taskId,
              receivedAt: new Date().toISOString(),
              summary: body.summary,
              diffSummary: body.diffSummary,
              validationResults: body.validationResults,
              workersCalled: body.workersCalled,
              blockers: body.blockers
            };
            const filename = generateSafeTimestampFilename('orchestrator-report', 'json');
            writeAppendOnlyArtifact(path.join("reports", taskId, "reports", filename), JSON.stringify(report, null, 2) + "\n");

            t.task.status = 'READY_FOR_FINAL_GATE';
            const newPath = path.join(tasksActiveDir, `${taskId}.yaml`);
            if (taskFile.path !== newPath) fs.unlinkSync(taskFile.path);
            writeYaml(newPath, t);
            logEvent(taskId, 'report', `Received orchestrator_report_v1: reports/${filename}`);
            logEvent(taskId, 'task', `Status changed from ${oldStatus} to ORCHESTRATOR_REPORTED via orchestrator_report_v1.`);
            logEvent(taskId, 'task', `Status changed from ORCHESTRATOR_REPORTED to READY_FOR_FINAL_GATE via orchestrator_report_v1.`);

            const finalGateSummary = buildFinalGateSummary(taskId, report);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true, filename, report, finalGateSummary, task: t }));
          } catch (e) {
            res.statusCode = e.status_code || 409;
            if (e.message.includes('Path boundary') || e.message.includes('Invalid taskId')) res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });

        server.middlewares.use("/api/task/verifier-review", async (req, res) => {
          if (req.method !== "POST") return res.end();
          try {
            const { taskId, status, content } = await jsonBody(req);
            validateTaskId(taskId);
            if (!findTaskFile(taskId)) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: "Task not found" }));
            }
            if (!status) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: "Status is required" }));
            }
            const filename = generateSafeTimestampFilename('verifier');
            writeAppendOnlyArtifact(path.join("reports", taskId, "reviews", filename), content || `# Verifier Review

Status: ${status}
`);
            logEvent(taskId, 'task', `Verifier review: ${status}`);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });

        server.middlewares.use("/api/task/final-gate", async (req, res) => {
          if (req.method !== "POST") return res.end();
          try {
            const { taskId, decision, content } = await jsonBody(req);
            validateTaskId(taskId);
            if (!findTaskFile(taskId)) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: "Task not found" }));
            }
            if (!decision) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: "Decision is required" }));
            }
            const canonicalDecision = String(decision).toUpperCase();
            if (!['APPROVED', 'REJECTED'].includes(canonicalDecision)) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: "Decision must be APPROVED or REJECTED" }));
            }
            const filename = generateSafeTimestampFilename('final-gate');
            const finalContent = `---\ndecision: ${canonicalDecision}\n---\n${content || `# Final Gate Decision\n`}`;
            writeAppendOnlyArtifact(path.join("reports", taskId, "decisions", filename), finalContent);
            logEvent(taskId, 'task', `Final gate decision: ${canonicalDecision}`);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });

        server.middlewares.use("/api/task/timeline", async (req, res) => {
          if (req.method !== "POST") return res.end();
          try {
            const { taskId } = await jsonBody(req);
            validateTaskId(taskId);
            if (!findTaskFile(taskId)) {
               res.statusCode = 404;
               return res.end(JSON.stringify({ error: "Task not found" }));
            }
            const taskDir = checkSafePath(path.join("reports", taskId));
            const entries = [];

            if (fs.existsSync(taskDir)) {
               ['handoffs', 'decisions', 'reports', 'reviews', 'logs'].forEach(dirName => {
                  const subDir = path.join(taskDir, dirName);
                  if (fs.existsSync(subDir)) {
                     fs.readdirSync(subDir).forEach(f => {
                       let ts = "1970-01-01T00:00:00.000Z";
                       const match = f.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
                       if (match) {
                         ts = match[1].replace(/-(\d{2})-(\d{2})-(\d{3}Z)$/, ':$1:$2.$3');
                       } else {
                         const content = readText(path.join(subDir, f));
                         const tsMatch = content.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)/);
                         if (tsMatch) ts = tsMatch[1];
                       }
                       entries.push({
                         type: dirName,
                         filename: f,
                         timestamp: ts,
                         content: readText(path.join(subDir, f))
                       });
                     });
                  }
               });
            }

            entries.sort((a, b) => {
              if (a.timestamp < b.timestamp) return -1;
              if (a.timestamp > b.timestamp) return 1;
              return a.filename.localeCompare(b.filename);
            });

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(entries));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });

      }
    }
  ],
});
