import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import YAML from "yaml";

const rootDir = process.cwd();
const registryDir = path.join(rootDir, "ai-ops-registry");
const projectsDir = path.join(registryDir, "projects");
const snapshotsDir = path.join(registryDir, "snapshots", "active-context");
const tasksDir = path.join(registryDir, "tasks", "inbox");
const reportsDir = path.join(registryDir, "reports");

function readYaml(filePath) {
  return YAML.parse(fs.readFileSync(filePath, "utf8"));
}

function listProjectProfiles() {
  return fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const filePath = path.join(projectsDir, entry.name, "project.yaml");
      const project = readYaml(filePath);
      const rulesPath = path.join(projectsDir, entry.name, project.project.rules_file);
      const forbiddenPath = path.join(projectsDir, entry.name, project.project.forbidden_actions_file);
      const workflowPath = path.join(projectsDir, entry.name, project.project.workflow_file);
      const skillsPath = path.join(projectsDir, entry.name, project.project.skills_file);
      return {
        slug: entry.name,
        profilePath: filePath,
        project: project.project,
        rules: readYamlOrText(rulesPath),
        forbiddenActions: readYamlOrText(forbiddenPath),
        workflow: readYamlOrText(workflowPath),
        skills: readYamlOrText(skillsPath),
      };
    });
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

function readYamlOrText(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) return YAML.parse(text);
  return text;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
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
    },
  };
  const snapshotPath = path.join(snapshotsDir, `${snapshot.active_context.id}.yaml`);
  ensureDir(snapshotPath);
  fs.writeFileSync(snapshotPath, YAML.stringify(snapshot), "utf8");
  return { snapshot, snapshotPath, profile };
}

function buildTaskCard(snapshot, objective, title) {
  const id = title || `${snapshot.active_context.project.id.toUpperCase()}-TASK-${Date.now()}`;
  const task = {
    schema_version: "1.0",
    task: {
      id,
      title: objective.slice(0, 72) || "Workspace dashboard task",
      status: "inbox",
      project_id: snapshot.active_context.project.id,
      active_context_snapshot: `snapshots/active-context/${snapshot.active_context.id}.yaml`,
      requested_by: "owner",
      objective,
      mode: "manual-safe",
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
        "D:\\ai-tools\\AI-Workspace\\ai-ops-registry\\registry\\tools.yaml",
        "D:\\ai-tools\\AI-Workspace\\ai-ops-registry\\registry\\runtimes.yaml",
      ],
      validation_commands: snapshot.active_context.validation_commands,
      outputs: ["worker-report", "verifier-report", "manual-dispatch-message"],
      handoff: { next_role: "verifier", automatic_dispatch: false, owner_approval_required: true },
    },
  };
  const taskPath = path.join(tasksDir, `${task.task.id}.yaml`);
  ensureDir(taskPath);
  fs.writeFileSync(taskPath, YAML.stringify(task), "utf8");
  return { task, taskPath };
}

function buildDispatchMessages(snapshot, objective, taskId) {
  const controller = `You are the Controller for LUMINA.\n\nTask ID: ${taskId}\nContext Snapshot: ai-ops-registry/snapshots/active-context/${snapshot.active_context.id}.yaml\n\nObjective:\n${objective}\n\nRules:\n- Manual-safe only.\n- No auto-send.\n- No Playwright bridge.\n- No subagent automation.\n- No CI or deployment.\n- No product repository edits.\n`;
  const worker = `You are the Worker for LUMINA.\n\nTask ID: ${taskId}\nScope:\n- Use only the registry-approved context.\n- Do not modify product files.\n- Do not run product build.\n- Do not automate dispatch.\n\nRequired tools: ${snapshot.active_context.required_tools.join(", ")}\nRequired runtimes: ${snapshot.active_context.required_runtimes.join(", ")}\n`;
  const verifier = `You are the Verifier for LUMINA.\n\nTask ID: ${taskId}\nVerify:\n- Registry boundary stayed intact.\n- No files under D:\\\\lumina-studio changed.\n- The active-context snapshot is referenced.\n- The task remained manual-safe.\n`;
  const base = path.join(reportsDir, taskId);
  ensureDir(path.join(base, "dummy"));
  fs.writeFileSync(path.join(base, "controller.md"), controller, "utf8");
  fs.writeFileSync(path.join(base, "worker.md"), worker, "utf8");
  fs.writeFileSync(path.join(base, "verifier.md"), verifier, "utf8");
  return {
    controllerPath: `ai-ops-registry/reports/${taskId}/controller.md`,
    workerPath: `ai-ops-registry/reports/${taskId}/worker.md`,
    verifierPath: `ai-ops-registry/reports/${taskId}/verifier.md`,
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
        server.middlewares.use("/api/workspace-data", (_req, res) => {
          const data = {
            workspaceRoot: rootDir,
            registryDir,
            projects: listProjectProfiles(),
            activeContexts: listYamlFiles(snapshotsDir),
            taskCards: listYamlFiles(tasksDir),
            reports: fs.existsSync(reportsDir)
              ? fs.readdirSync(reportsDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name)
              : [],
          };
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(data));
        });
        server.middlewares.use("/api/generate-snapshot", async (req, res) => {
          if (req.method !== "POST") return res.end("Method Not Allowed");
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          const { snapshot, snapshotPath } = buildSnapshot(body.projectSlug, body.objective || "Dashboard task");
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ snapshot, snapshotPath }));
        });
        server.middlewares.use("/api/generate-task", async (req, res) => {
          if (req.method !== "POST") return res.end("Method Not Allowed");
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          const { snapshot } = buildSnapshot(body.projectSlug, body.objective || "Dashboard task");
          const { task, taskPath } = buildTaskCard(snapshot, body.objective || "Dashboard task", body.taskId);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ task, taskPath, snapshotId: snapshot.active_context.id }));
        });
        server.middlewares.use("/api/generate-dispatch", async (req, res) => {
          if (req.method !== "POST") return res.end("Method Not Allowed");
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          const { snapshot } = buildSnapshot(body.projectSlug, body.objective || "Dashboard task");
          const output = buildDispatchMessages(snapshot, body.objective || "Dashboard task", body.taskId || snapshot.active_context.task_id);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(output));
        });
      }
    }
  ],
});
