import http from 'http';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function readText(p) {
    return fs.readFileSync(p, 'utf-8');
}

function readYaml(p) {
    return yaml.parse(readText(p));
}

function validateTaskId(taskId) {
    if (!taskId || typeof taskId !== "string") throw new Error("Invalid taskId");
    if (!/^[a-zA-Z0-9-_]+$/.test(taskId)) throw new Error("taskId contains invalid characters");
    return taskId;
}

function checkSafePath(subPath) {
    const fullPath = path.resolve(ROOT_DIR, subPath);
    if (!fullPath.startsWith(ROOT_DIR)) {
        throw new Error("Path boundary violation");
    }
    return fullPath;
}

function findTaskFile(taskId) {
    const activePath = checkSafePath(path.join("ai-ops-registry", "tasks", "active", `${taskId}.yaml`));
    const completedPath = checkSafePath(path.join("ai-ops-registry", "tasks", "completed", `${taskId}.yaml`));
    if (fs.existsSync(activePath)) return { status: 'active', path: activePath };
    if (fs.existsSync(completedPath)) return { status: 'completed', path: completedPath };
    return null;
}

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
    const setJsonResponse = (statusCode, payload) => {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
    };

    try {
        if (req.method === 'GET' && req.url === '/health') {
            return setJsonResponse(200, { status: 'ok', service: 'connector-gateway' });
        }

        if (req.method === 'GET' && req.url === '/openapi.yaml') {
            const openapiPath = checkSafePath(path.join("ai-ops-registry", "openapi.yaml"));
            if (fs.existsSync(openapiPath)) {
                res.writeHead(200, { 'Content-Type': 'text/yaml' });
                res.end(readText(openapiPath));
                return;
            }
            return setJsonResponse(404, { error: 'Not found' });
        }

        if (req.method === 'GET' && req.url.startsWith('/api/task/final-gate-package/')) {
            const expectedToken = process.env.CHATGPT_CONNECTOR_TOKEN;
            if (!expectedToken) {
                return setJsonResponse(503, { error: "Connector token not configured" });
            }

            const authHeader = req.headers.authorization;
            if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
                return setJsonResponse(401, { error: "Unauthorized" });
            }

            const urlParts = req.url.split('?')[0].split('/');
            const taskId = urlParts[urlParts.length - 1];

            try {
                validateTaskId(taskId);
            } catch (err) {
                return setJsonResponse(400, { error: err.message });
            }

            const taskFile = findTaskFile(taskId);
            if (!taskFile) {
                return setJsonResponse(404, { error: "Task not found" });
            }

            const t = readYaml(taskFile.path);
            if (!t.task || !t.task.connector_exposed) {
                return setJsonResponse(403, { error: "Task is not exposed to connector" });
            }

            let orchestratorReport = null;
            const reportsDir = checkSafePath(path.join("ai-ops-registry", "reports", taskId, "reports"));
            if (fs.existsSync(reportsDir)) {
                const files = fs.readdirSync(reportsDir).sort().reverse();
                const reportFile = files.find(f => f.startsWith('orchestrator-report') && f.endsWith('.json'));
                if (reportFile) {
                    const content = readText(path.join(reportsDir, reportFile));
                    try {
                        orchestratorReport = JSON.parse(content);
                    } catch (err) {}
                }
            }

            const payload = {
                task_id: taskId,
                schema_version: "orchestrator_report_v1",
                status: t.task.status,
                orchestrator_summary: orchestratorReport?.summary || "",
                diff_summary: orchestratorReport?.diffSummary || "",
                validation_results: orchestratorReport?.validationResults || {},
                workers_called: orchestratorReport?.workersCalled || [],
                blockers: orchestratorReport?.blockers || [],
                changed_files: [],
                commit_hash: "",
                final_gate_request: true
            };

            return setJsonResponse(200, payload);
        }

        return setJsonResponse(404, { error: "Not found" });

    } catch (e) {
        return setJsonResponse(500, { error: "Internal Server Error" });
    }
});

server.listen(PORT, () => {
    console.log(`Connector Gateway listening on port ${PORT}`);
    console.log(`Test Health: http://127.0.0.1:${PORT}/health`);
});
