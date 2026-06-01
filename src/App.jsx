import React, { useEffect, useState } from "react";

const WORKER_POOL = [
  {
    id: "chatgpt_55",
    label: "ChatGPT 5.5",
    description: "Controller / Final Gate / hard reasoning only",
    runnable: false
  },
  {
    id: "codex",
    label: "Codex CLI",
    description: "Main local orchestrator",
    runnable: true,
    patterns: ["codex", "codex exec \"<prompt>\""]
  },
  {
    id: "agy",
    label: "agy",
    description: "Antigravity CLI worker",
    runnable: true,
    patterns: ["agy --add-dir \"D:\\ai-tools\\AI-Workspace\" --print \"<prompt>\""]
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    description: "Evidence-only checker",
    runnable: true,
    patterns: ["gemini -p \"<evidence-only prompt>\""]
  },
  {
    id: "opencode",
    label: "OpenCode CLI",
    description: "Fast checker / patch-review worker",
    runnable: true,
    patterns: ["opencode run \"<prompt>\""]
  },
  {
    id: "aider",
    label: "Aider",
    description: "Optional patch-only terminal worker",
    runnable: true,
    patterns: ["aider <allowed files only>"]
  }
];

const RUNNABLE_WORKERS = WORKER_POOL.filter((worker) => worker.runnable);

async function apiCall(url, method = "GET", body = null) {
  const options = { method };
  if (body) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (!res.ok) {
    let errMsg = `Request failed: ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody.error) errMsg = errBody.error;
    } catch (e) {}
    throw new Error(errMsg);
  }
  return res.json();
}

function copy(text, onSuccess) {
  navigator.clipboard.writeText(text);
  if (onSuccess) onSuccess();
}

function normalizeStatus(statusRaw) {
  if (!statusRaw) return "";
  const s = statusRaw.toUpperCase();
  if (s === "READY_TO_DISPATCH") return "READY_TO_START";
  if (s === "ACCEPTED") return "DONE";
  if (s === "REJECTED") return "BLOCKED";
  return s;
}

function Card({ title, children, right, className = "" }) {
  return (
    <section className={`card ${className}`}>
      <div className="cardHead">
        <h2>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("Loading workspace...");
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState("commandCenter");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedCliWorker, setSelectedCliWorker] = useState("codex");
  const [codexCommandMode, setCodexCommandMode] = useState("interactive");
  const [cliCommandText, setCliCommandText] = useState("");

  // New Task Form
  const [newObjective, setNewObjective] = useState("");
  const [newProjectSlug, setNewProjectSlug] = useState("");
  const [newTaskId, setNewTaskId] = useState("");
  const [selController, setSelController] = useState("");
  const [selWorker, setSelWorker] = useState("");
  const [selVerifier, setSelVerifier] = useState("");

  // Data
  const [taskFiles, setTaskFiles] = useState({ dispatch: {}, responses: {}, decisions: [] });
  const [taskLogs, setTaskLogs] = useState({});
  const [taskTimeline, setTaskTimeline] = useState([]);

  // Forms
  const [controllerDecision, setControllerDecision] = useState("");
  const [controllerDecisionContent, setControllerDecisionContent] = useState("");

  const [reportRole, setReportRole] = useState("worker");
  const [reportContent, setReportContent] = useState("");

  const [verifierReviewStatus, setVerifierReviewStatus] = useState("APPROVED");
  const [verifierReviewContent, setVerifierReviewContent] = useState("");

  const [finalGateDecision, setFinalGateDecision] = useState("APPROVED");
  const [finalGateContent, setFinalGateContent] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const workspaceData = await apiCall("/api/workspace-data");
      setData(workspaceData);
      if (workspaceData.projects?.length > 0 && !newProjectSlug) {
        const defaultProject = workspaceData.projects.find(p => p.slug === 'expellirmud-ai-workspace') || workspaceData.projects[0];
        setNewProjectSlug(defaultProject.slug);
      }
      if (workspaceData.channels?.length > 0) {
        if (!selController) setSelController(workspaceData.channels.find(c => c.role === 'controller')?.channel_id || "");
        if (!selWorker) setSelWorker(workspaceData.channels.find(c => c.role === 'worker')?.channel_id || "");
        if (!selVerifier) setSelVerifier(workspaceData.channels.find(c => c.role === 'verifier')?.channel_id || "");
      }
      setStatus("Workspace loaded");
    } catch (err) {
      setError(String(err.message));
      setStatus("Failed to load workspace");
    }
  }

  useEffect(() => {
    if (selectedTaskId) {
      const taskEntry = data?.tasks?.find(t => t.name === `${selectedTaskId}.yaml`);
      if (taskEntry?.data?.task?.assigned_channels) {
        const assigned = taskEntry.data.task.assigned_channels;
        if (assigned.controller) setSelController(assigned.controller);
        if (assigned.worker) setSelWorker(assigned.worker);
        if (assigned.verifier) setSelVerifier(assigned.verifier);
      }
      loadTaskFiles();
    }
  }, [selectedTaskId]);

  async function loadTaskFiles() {
    try {
      const files = await apiCall("/api/task/files", "POST", { taskId: selectedTaskId });
      const logs = await apiCall("/api/task/logs", "POST", { taskId: selectedTaskId });
      const timeline = await apiCall("/api/task/timeline", "POST", { taskId: selectedTaskId });
      setTaskFiles(files);
      setTaskLogs(logs);
      setTaskTimeline(timeline);
      setError("");
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCreateTask() {
    setStatus("Creating task...");
    try {
      const channels = { controller: selController, worker: selWorker, verifier: selVerifier };
      await apiCall("/api/generate-task", "POST", { projectSlug: newProjectSlug, objective: newObjective, taskId: newTaskId, channels });
      setStatus("Task created");
      setNewObjective("");
      setNewTaskId("");
      await loadData();
    } catch (err) {
      setError(String(err.message));
    }
  }

  async function handleTransition(newStatus) {
    setError("");
    setStatus(`Transitioning to ${newStatus}...`);
    try {
      await apiCall("/api/task/status", "POST", { taskId: selectedTaskId, status: newStatus });
      setStatus(`Status updated to ${newStatus}`);
      await loadData();
      await loadTaskFiles();
    } catch (err) {
      setError(String(err.message));
      setStatus("Transition failed");
    }
  }

  async function handleGenerateDispatch() {
    const warns = [];
    [selController, selWorker, selVerifier].forEach(ch => {
       const channel = data.channels.find(c => c.channel_id === ch);
       if (channel && ['unavailable', 'needs_config'].includes(channel.readiness_status)) {
         warns.push(`${channel.label} is ${channel.readiness_status}`);
       }
    });

    if (warns.length > 0) {
       const proceed = window.confirm(`Warnings:\n${warns.join('\n')}\n\nDo you want to proceed?`);
       if (!proceed) return;
    }

    setStatus("Generating dispatch packages...");
    setError("");
    try {
      const channels = { controller: selController, worker: selWorker, verifier: selVerifier };
      await apiCall("/api/generate-dispatch", "POST", {
        projectSlug: newProjectSlug,
        objective: activeTask.task.objective,
        taskId: selectedTaskId,
        channels
      });
      setStatus("Dispatch generated (Status advanced to READY_TO_START)");
      await loadData();
      await loadTaskFiles();
    } catch (err) {
      setError(String(err.message));
    }
  }

  async function handlePrepareDispatch(role) {
      const assigned = activeTask.task.assigned_channels || {};
      const channelId = assigned[role];
      const channel = data.channels.find(c => c.channel_id === channelId);
      const message = taskFiles.dispatch[role];

      if (!message) return setError(`No dispatch message for ${role}. Generate dispatch first.`);

      copy(message);
      setStatus(`Prepared: Copied ${role} dispatch.`);

      if (channel?.target_url) {
         window.open(channel.target_url, "_blank");
      } else if (channel?.fallback_url) {
         window.open(channel.fallback_url, "_blank");
      }

      await apiCall("/api/task/log-event", "POST", { taskId: selectedTaskId, logType: "system", message: `Prepared dispatch for ${role}. Copied to clipboard and opened URL.` });
      await loadTaskFiles();
  }

  async function handleSaveControllerDecision() {
    setError("");
    setStatus("Saving Controller Decision...");
    try {
      await apiCall("/api/task/controller-decision", "POST", { taskId: selectedTaskId, decision: controllerDecision, content: controllerDecisionContent });
      setControllerDecision("");
      setControllerDecisionContent("");
      try {
        await apiCall("/api/task/status", "POST", { taskId: selectedTaskId, status: "CONTROLLER_PLAN_RECORDED" });
        setStatus("Controller Decision saved and transitioned to CONTROLLER_PLAN_RECORDED.");
      } catch (tErr) {
        setError(`Artifact saved, but status transition failed: ${tErr.message}`);
        setStatus("Partial success");
      }
    } catch (err) {
      setError(String(err.message));
    } finally {
      await loadData();
      await loadTaskFiles();
    }
  }

  async function handleSaveReport(advanceStatus = null) {
    setError("");
    setStatus("Saving report...");
    try {
      await apiCall("/api/task/report", "POST", { taskId: selectedTaskId, role: reportRole, content: reportContent });
      setReportContent("");
      if (advanceStatus) {
         try {
           await apiCall("/api/task/status", "POST", { taskId: selectedTaskId, status: advanceStatus });
           setStatus(`Report saved and transitioned to ${advanceStatus}.`);
         } catch (tErr) {
           setError(`Report saved, but transition failed: ${tErr.message}`);
           setStatus("Partial success");
         }
      } else {
         setStatus("Report saved.");
      }
    } catch (err) {
      setError(String(err.message));
    } finally {
      await loadData();
      await loadTaskFiles();
    }
  }

  async function handleSaveVerifierReview() {
    setError("");
    setStatus("Saving Verifier Review...");
    try {
      await apiCall("/api/task/verifier-review", "POST", { taskId: selectedTaskId, status: verifierReviewStatus, content: verifierReviewContent });
      setStatus("Verifier Review saved.");
      setVerifierReviewContent("");
      await loadData();
      await loadTaskFiles();
    } catch (err) {
      setError(String(err.message));
    }
  }

  async function handleSaveFinalGate() {
    setError("");
    setStatus("Saving Final Gate Decision...");
    try {
      await apiCall("/api/task/final-gate", "POST", { taskId: selectedTaskId, decision: finalGateDecision, content: finalGateContent });
      setFinalGateContent("");
      if (finalGateDecision === "APPROVED") {
        try {
          await apiCall("/api/task/status", "POST", { taskId: selectedTaskId, status: "READY_TO_COMMIT" });
          setStatus("Final Gate Decision saved and transitioned to READY_TO_COMMIT.");
        } catch (tErr) {
          setError(`Artifact saved, but transition failed: ${tErr.message}`);
          setStatus("Partial success");
        }
      } else {
        setStatus("Final Gate Decision saved. (No transition on REJECTED)");
      }
    } catch (err) {
      setError(String(err.message));
    } finally {
      await loadData();
      await loadTaskFiles();
    }
  }

  function psQuote(text) {
    if (typeof text !== 'string') return "''";
    return "'" + text.replace(/'/g, "''") + "'";
  }

  function buildCliWorkerCommand(workerId, task) {
    const objective = (task?.task?.objective || "Workspace task").replace(/\r?\n+/g, " ").trim();
    const taskId = task?.task?.id || selectedTaskId || "TASK-ID";
    const allowedFiles = Array.isArray(task?.task?.allowed_files) ? task.task.allowed_files : [];
    const forbiddenFiles = Array.isArray(task?.task?.forbidden_files) ? task.task.forbidden_files : [];

    if (workerId === "codex" && codexCommandMode === "interactive") {
      return "codex";
    }

    if (!allowedFiles.length) {
      return "# Denied: Task scope is missing allowed_files. Provide explicit allowed_files in the task card before generating a command.";
    }

    const commonRules = [
      `task_id: ${taskId}`,
      `objective: ${objective}`,
      `GOVERNANCE RULES:`,
      `- READ-FIRST required`,
      `- read and use workspace skills from D:\\ai-tools\\AI-Workspace\\skills`,
      `- Use Serena for workspace understanding`,
      `- Use CodeGraph for dependency / impact review`,
      `- stay within task allowed_files`,
      `- respect task forbidden_files`,
      `- no D:\\lumina-studio`,
      `- no external product repo edits`,
      `- no commit/push without owner approval`,
      `- one worker call at a time`,
      `- no auto-run`,
      `- report git diff/status`,
      `allowed_files: ${allowedFiles.join(", ")}`,
      `forbidden_files: ${forbiddenFiles.length ? forbiddenFiles.join(", ") : "none explicitly defined"}`
    ];

    if (workerId === "codex") {
      return `codex exec ${psQuote(commonRules.join("\n"))}`;
    }
    if (workerId === "agy") {
      return `agy --add-dir 'D:\\ai-tools\\AI-Workspace' --print ${psQuote(commonRules.join("\n"))}`;
    }
    if (workerId === "gemini") {
      const geminiRules = [
        `task_id: ${taskId}`,
        `objective: ${objective}`,
        `role: evidence-only checker`,
        `do_not_edit_files: true`,
        `report evidence only`,
        `GOVERNANCE RULES:`,
        `- READ-FIRST required`,
        `- read and use workspace skills from D:\\ai-tools\\AI-Workspace\\skills`,
        `- Use Serena for workspace understanding`,
        `- Use CodeGraph for dependency / impact review`,
        `- stay within task allowed_files`,
        `- respect task forbidden_files`,
        `- no D:\\lumina-studio`,
        `- no external product repo edits`,
        `- no commit/push without owner approval`,
        `- one worker call at a time`,
        `- no auto-run`,
        `- report git diff/status`,
        `allowed_files: ${allowedFiles.join(", ")}`,
        `forbidden_files: ${forbiddenFiles.length ? forbiddenFiles.join(", ") : "none explicitly defined"}`
      ];
      return `gemini -p ${psQuote(geminiRules.join("\n"))}`;
    }
    if (workerId === "opencode") {
      return `opencode run ${psQuote(commonRules.join("\n"))}`;
    }
    if (workerId === "aider") {
      return [
        "# Aider is manual/guarded. Use only with explicit allowed_files and owner approval.",
        `# Allowed files from task card: ${allowedFiles.join(", ")}`,
        `aider ${allowedFiles.map(f => psQuote(f)).join(" ")}`
      ].join("\n");
    }
    return `# Unsupported CLI worker: ${workerId}`;
  }

  async function handleGenerateCliCommand() {
    const worker = WORKER_POOL.find((item) => item.id === selectedCliWorker);
    if (!worker || !worker.runnable) return setError("Select a runnable CLI worker first.");
    if (!activeTask) return setError("Select a task first.");
    const command = buildCliWorkerCommand(worker.id, activeTask);
    setCliCommandText(command);
    setStatus(`Generated command for ${worker.label}.`);
    try {
      await apiCall("/api/task/log-event", "POST", {
        taskId: selectedTaskId,
        logType: "system",
        message: `Generated command-only prompt for ${worker.id}.`
      });
      await loadTaskFiles();
    } catch (err) {
      console.error(err);
    }
  }

  if (!data) return <div className="wrap">Loading...</div>;

  const tasksByFolder = { inbox: [], active: [], completed: [], blocked: [] };
  data.tasks.forEach(t => tasksByFolder[t.folder]?.push(t));
  const activeTask = data.tasks.find(t => t.name === `${selectedTaskId}.yaml`)?.data;
  const currentStatus = normalizeStatus(activeTask?.task?.status);
  const isDone = currentStatus === "DONE";

  // --- RENDERS ---
  const renderNav = () => (
    <nav className="global-nav">
      <ul>
        <li className={activeTab === 'commandCenter' ? 'active' : ''} onClick={() => setActiveTab('commandCenter')}>Command Center</li>
        <li className={activeTab === 'channels' ? 'active' : ''} onClick={() => setActiveTab('channels')}>AI Channels</li>
        <li className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>Settings & Policy</li>
      </ul>
    </nav>
  );

  const renderChannels = () => (
    <div className="channels-view">
      <h2>AI Channels & Readiness</h2>
      <p className="muted mb-4">Registry of known AI endpoints and communication settings.</p>
      <div className="grid">
        {data.channels.map(c => (
           <Card key={c.channel_id} title={c.label}>
             <div className="stack-small">
               <div><b>Role:</b> <span className="badge">{c.role}</span></div>
               <div><b>App:</b> {c.app}</div>
               <div><b>Binding:</b> {c.binding}</div>
               <div><b>Readiness:</b> <span className={`badge badge-${c.readiness_status}`}>{c.readiness_status}</span></div>
               <div><b>Automation:</b> {c.automation_status}</div>
               <div><b>Dispatch Method:</b> {c.dispatch_method}</div>
               <div><b>Response Method:</b> {c.response_method}</div>
               {c.target_url && <div><b>Target URL:</b> <a href={c.target_url} target="_blank" rel="noreferrer">Link</a></div>}
             </div>
             {c.limitations && (
               <div className="mt-4">
                 <b>Limitations:</b>
                 <ul className="muted">{c.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
               </div>
             )}
           </Card>
        ))}
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="settings-view">
      <h2>Automation Policy</h2>
      <p className="muted mb-4">Strict guardrails currently enforced by the workspace.</p>
      <Card title="Current Policy Config">
         <div className="stack-small">
           {Object.entries(data.automationPolicy).map(([k, v]) => (
             <div key={k}><b>{k}:</b> {v ? <span style={{color: 'green'}}>TRUE</span> : <span style={{color: 'red'}}>FALSE</span>}</div>
           ))}
         </div>
         <div className="mt-4 muted">
            Note: Auto-send, Playwright Bridge, and Subagent Automation are strictly disabled globally.
         </div>
      </Card>

      <Card title="Workspace Governance Readiness" className="mt-4">
         <div className="stack-small">
           <div><b>READ-FIRST Policy:</b> {data.governance?.readFirst ? <span className="badge badge-ready" style={{background: '#dcfce7', color: '#166534'}}>Present</span> : <span className="badge badge-needs_config">Missing</span>}</div>
           <div><b>Workspace Skills:</b> {data.governance?.workspaceSkills ? <span className="badge badge-ready" style={{background: '#dcfce7', color: '#166534'}}>Present</span> : <span className="badge badge-needs_config">Missing</span>}</div>
           <div><b>CodeGraph:</b> {data.governance?.codeGraph === 'ready' ? <span className="badge badge-ready" style={{background: '#dcfce7', color: '#166534'}}>Ready</span> : <span className="badge badge-needs_config">Not Initialized</span>}</div>
           <div><b>Serena MCP:</b> <span className="badge badge-ready" style={{background: '#dcfce7', color: '#166534'}}>Ready (Active Project Mapped)</span></div>
         </div>
      </Card>
    </div>
  );

  const renderCommandCenter = () => {
    const selectedProjectInfo = data.projects.find(p => p.slug === newProjectSlug)?.project;
    const isExternal = selectedProjectInfo && selectedProjectInfo.path !== "D:\\ai-tools\\AI-Workspace";

    return (
    <div className="main-layout">
        <aside className="sidebar">
          <Card title="Workspace Info" className="mb-4">
            <div className="stack-small text-sm">
              <div><b>Workspace Root:</b> D:\ai-tools\AI-Workspace</div>
              <div><b>Registry Module:</b> ai-ops-registry</div>
              <div>
                <b>Active Project:</b> {selectedProjectInfo?.name || newProjectSlug}
              </div>
              {isExternal && (
                <div className="mt-2 p-2" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px' }}>
                  <div style={{ color: '#991b1b', fontWeight: 'bold' }}>
                    <span className="badge" style={{ background: '#ef4444', color: 'white', marginRight: '8px' }}>External product repository</span>
                  </div>
                  <div style={{ color: '#b91c1c', marginTop: '4px' }}>
                    ⚠️ Do not edit unless task card explicitly allows it.
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card title="New Task">
            <label>Project</label>
            <select value={newProjectSlug} onChange={e => setNewProjectSlug(e.target.value)}>
              {data.projects.map(p => <option key={p.slug} value={p.slug}>{p.project.name}</option>)}
            </select>
            <label>Objective</label>
            <textarea value={newObjective} onChange={e => setNewObjective(e.target.value)} rows={3} />

            <label className="mt-2">Task ID (Optional)</label>
            <input value={newTaskId} onChange={e => setNewTaskId(e.target.value)} placeholder="Auto-generated if empty" />

            <button onClick={handleCreateTask} style={{ marginTop: 12 }}>Create Task</button>
          </Card>

          <Card title="Command Center" className="task-list-card">
            {Object.entries(tasksByFolder).map(([folder, tasks]) => (
              <div key={folder}>
                <h3 className="folder-title">{folder.toUpperCase()} ({tasks.length})</h3>
                <div className="task-list">
                  {tasks.map(t => (
                    <div
                      key={t.name}
                      className={`task-item ${selectedTaskId === t.name.replace('.yaml', '') ? 'selected' : ''}`}
                      onClick={() => setSelectedTaskId(t.name.replace('.yaml', ''))}
                    >
                      <div className="task-item-id">{t.name.replace('.yaml', '')}</div>
                      <div className="task-item-status badge">{normalizeStatus(t.data?.task?.status)}</div>
                    </div>
                  ))}
                  {tasks.length === 0 && <div className="muted">No tasks</div>}
                </div>
              </div>
            ))}
          </Card>
        </aside>

        <main className="content">
          {!activeTask ? (
            <div className="empty-state">Select a task from the Command Center to view details.</div>
          ) : (
            <div className="task-details">
              {isDone && <div className="done-banner">This task is marked as DONE and is read-only.</div>}

              <Card title={`Task: ${selectedTaskId}`}>
                <div className="task-header-grid">
                  <div><b>Status:</b> <span className="badge">{currentStatus}</span></div>
                  <div><b>Stage:</b> {activeTask.task.mode}</div>
                  <div><b>Project:</b> {activeTask.task.project_id}</div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <b>Objective:</b>
                  <p>{activeTask.task.objective}</p>
                </div>
                {activeTask.task.workspace_governance_readiness && (
                  <div style={{ marginTop: 12, padding: "8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "4px" }}>
                    <b>Workspace Governance Readiness:</b>
                    <div className="stack-small mt-2" style={{ fontSize: "0.9em" }}>
                      <div><b>READ-FIRST Policy:</b> <span className="badge badge-ready" style={{background: '#dcfce7', color: '#166534'}}>{activeTask.task.workspace_governance_readiness.read_first_policy}</span></div>
                      <div><b>Workspace Skills:</b> <span className="badge badge-ready" style={{background: '#dcfce7', color: '#166534'}}>{activeTask.task.workspace_governance_readiness.workspace_skills}</span></div>
                      <div><b>CodeGraph:</b> <span className="badge badge-ready" style={{background: '#dcfce7', color: '#166534'}}>{activeTask.task.workspace_governance_readiness.codegraph}</span></div>
                      <div><b>Serena MCP:</b> <span className="badge badge-ready" style={{background: '#dcfce7', color: '#166534'}}>{activeTask.task.workspace_governance_readiness.serena_mcp}</span></div>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                   <h4>Lifecycle Controls</h4>
                   <div className="buttonRow mt-2">
                     <button onClick={() => handleTransition("CODEX_ORCHESTRATING")} disabled={isDone || currentStatus !== "READY_TO_START"}>Start Codex Orchestration</button>
                     <button onClick={() => handleTransition("WORKER_RUNNING")} disabled={isDone || currentStatus !== "CODEX_ORCHESTRATING"}>Record Worker Running</button>
                     <button onClick={() => handleTransition("VALIDATING")} disabled={isDone || currentStatus !== "WORKER_RUNNING"}>Start Validation</button>
                     <button onClick={() => handleTransition("READY_FOR_FINAL_GATE")} disabled={isDone || currentStatus !== "ORCHESTRATOR_REPORTED"}>Send To Final Gate</button>
                     <button onClick={() => handleTransition("DONE")} className="btn-start" disabled={isDone || currentStatus !== "READY_TO_COMMIT"}>Mark Done</button>
                   </div>
                   <div className="buttonRow mt-2">
                     <button onClick={() => handleTransition("NEEDS_FIX")} className="btn-pause" disabled={!["WORKER_RUNNING", "VALIDATING", "READY_FOR_FINAL_GATE"].includes(currentStatus)}>Needs Fix</button>
                     <button onClick={() => handleTransition("BLOCKED")} className="btn-stop" disabled={!["WORKER_RUNNING", "VALIDATING", "READY_FOR_FINAL_GATE"].includes(currentStatus)}>Mark Blocked</button>
                   </div>
                   {["NEEDS_FIX", "BLOCKED"].includes(currentStatus) && !isDone && (
                     <div className="buttonRow mt-2" style={{ padding: "8px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px" }}>
                       <b style={{ color: "#991b1b", alignSelf: "center", marginRight: "8px" }}>Recovery:</b>
                       <button onClick={() => handleTransition("WORKER_RUNNING")} className="btn-secondary">Resume Worker (NEEDS_FIX / BLOCKED)</button>
                       {currentStatus === "BLOCKED" && (
                         <button onClick={() => handleTransition("READY_TO_START")} className="btn-secondary">Reset to Start (BLOCKED)</button>
                       )}
                     </div>
                   )}
                </div>
              </Card>

              <div className="grid">
                <Card title="Controller Decision Gate">
                   <div className="form-group">
                     <label>Decision Title / Summary</label>
                     <input value={controllerDecision} onChange={e => setControllerDecision(e.target.value)} disabled={isDone || currentStatus !== "DRAFT"} placeholder="e.g., Proceed with Phase 1" />
                   </div>
                   <div className="form-group">
                     <label>Content (Markdown)</label>
                     <textarea value={controllerDecisionContent} onChange={e => setControllerDecisionContent(e.target.value)} rows={3} disabled={isDone || currentStatus !== "DRAFT"}></textarea>
                   </div>
                   <button onClick={handleSaveControllerDecision} disabled={isDone || currentStatus !== "DRAFT" || !controllerDecision}>Save & Set CONTROLLER_PLAN_RECORDED</button>
                </Card>

                <Card title="Dispatch Execution Control">
                  <div className="mb-4 p-4" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label>Controller</label>
                        <select value={selController} onChange={e => setSelController(e.target.value)} disabled={isDone}>
                           {data.channels.filter(c => c.role === 'controller').map(c => <option key={c.channel_id} value={c.channel_id}>{c.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label>Worker</label>
                        <select value={selWorker} onChange={e => setSelWorker(e.target.value)} disabled={isDone}>
                           {data.channels.filter(c => c.role === 'worker').map(c => <option key={c.channel_id} value={c.channel_id}>{c.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label>Verifier</label>
                        <select value={selVerifier} onChange={e => setSelVerifier(e.target.value)} disabled={isDone}>
                           {data.channels.filter(c => c.role === 'verifier').map(c => <option key={c.channel_id} value={c.channel_id}>{c.label}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="buttonRow mb-4">
                    <button onClick={handleGenerateDispatch} disabled={isDone || !["DRAFT", "CONTROLLER_PLAN_RECORDED"].includes(currentStatus)}>Generate Dispatch (Sets READY_TO_START)</button>
                  </div>

                  {['controller', 'worker', 'verifier'].map(role => (
                    <div key={role} className="dispatch-block">
                       <h4>{role.toUpperCase()} Message</h4>
                       <pre>{taskFiles.dispatch[role] || "Not generated yet"}</pre>

                       {taskFiles.dispatch[role] && !isDone && (
                         <div className="execution-controls mt-2">
                           <div className="buttonRow">
                             <button onClick={() => handlePrepareDispatch(role)} className="btn-secondary">Copy & Open URL</button>
                           </div>
                         </div>
                       )}
                    </div>
                  ))}
                </Card>

                <Card title="CLI Worker Pool">
                  <p className="muted mb-4">Manual-safe command generation only. No auto-run.</p>

                  <div className="mb-4">
                    <b>Worker Pool Governance</b>
                    <ul className="muted guardrail-list" style={{ marginTop: '4px' }}>
                      <li><b>ChatGPT 5.5:</b> Controller / Final Gate / hard reasoning only</li>
                      <li><b>Codex CLI:</b> Main local orchestrator</li>
                      <li><b>agy:</b> Antigravity CLI worker</li>
                      <li><b>Gemini CLI:</b> Evidence-only checker</li>
                      <li><b>OpenCode CLI:</b> Fast checker / patch-review worker</li>
                      <li><b>Aider:</b> Optional patch-only terminal worker</li>
                    </ul>
                  </div>

                  <div className="mb-4">
                    <b>Visible Guardrails</b>
                    <ul className="muted guardrail-list" style={{ marginTop: '4px' }}>
                      <li>READ-FIRST required</li>
                      <li>Serena required</li>
                      <li>CodeGraph required</li>
                      <li>no D:\lumina-studio</li>
                      <li>no external product repo edits</li>
                      <li>no commit/push without approval</li>
                      <li>one worker call at a time</li>
                      <li>no auto-run</li>
                      <li>Aider requires explicit allowed_files</li>
                    </ul>
                  </div>

                  {selectedCliWorker === "aider" && (
                     <div className="guardrail-box mb-4">
                       <b>Aider Safety Note</b>
                       <div className="muted">
                         Aider can edit files. Use only for explicit patch-only tasks with allowed_files and owner approval.
                       </div>
                     </div>
                  )}

                  <div className="form-group">
                    <label>CLI Worker Channel</label>
                    <select value={selectedCliWorker} onChange={e => setSelectedCliWorker(e.target.value)}>
                      {RUNNABLE_WORKERS.map((worker) => (
                        <option key={worker.id} value={worker.id}>{worker.label}</option>
                      ))}
                    </select>
                  </div>
                  {selectedCliWorker === "codex" && (
                    <div className="form-group">
                      <label>Codex Command Mode</label>
                      <select value={codexCommandMode} onChange={e => setCodexCommandMode(e.target.value)}>
                        <option value="interactive">codex</option>
                        <option value="exec">codex exec "&lt;prompt&gt;"</option>
                      </select>
                    </div>
                  )}
                  <div className="buttonRow mb-4">
                    <button onClick={handleGenerateCliCommand} disabled={!selectedTaskId}>Generate Command</button>
                    <button onClick={() => cliCommandText && copy(cliCommandText, () => setStatus("Copied CLI command."))} disabled={!cliCommandText} className="btn-secondary">Copy Command</button>
                  </div>
                  <pre>{cliCommandText || "Select a task and generate a command."}</pre>

                  <div className="mt-4">
                    <b>Command patterns</b>
                    <ul className="muted guardrail-list" style={{ marginTop: '4px' }}>
                      <li><code>codex</code></li>
                      <li><code>codex exec "&lt;prompt&gt;"</code></li>
                      <li><code>agy --add-dir "D:\ai-tools\AI-Workspace" --print "&lt;prompt&gt;"</code></li>
                      <li><code>gemini -p "&lt;evidence-only prompt&gt;"</code></li>
                      <li><code>opencode run "&lt;prompt&gt;"</code></li>
                      <li><code>aider &lt;allowed files only&gt;</code></li>
                    </ul>
                  </div>
                </Card>

                <div className="stack">
                  <Card title="Typed Report Inbox">
                    <div className="form-group">
                      <label>AI Role</label>
                      <select value={reportRole} onChange={e => setReportRole(e.target.value)} disabled={isDone}>
                        <option value="orchestrator">Orchestrator</option>
                        <option value="worker">Worker</option>
                        <option value="verifier">Verifier</option>
                        <option value="controller">Controller</option>
                        <option value="final-gate">Final Gate</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Report Content (Markdown)</label>
                      <textarea value={reportContent} onChange={e => setReportContent(e.target.value)} rows={4} disabled={isDone}></textarea>
                    </div>
                    <div className="buttonRow">
                      <button onClick={() => handleSaveReport(null)} disabled={isDone || !reportContent}>Save Report Only</button>
                      {reportRole === "orchestrator" && currentStatus === "VALIDATING" && (
                         <button onClick={() => handleSaveReport("ORCHESTRATOR_REPORTED")} disabled={isDone || !reportContent} className="btn-start">Save & Advance to ORCHESTRATOR_REPORTED</button>
                      )}
                    </div>
                  </Card>

                  <Card title="Verifier Review Gate">
                    <div className="form-group">
                      <label>Status</label>
                      <input value={verifierReviewStatus} onChange={e => setVerifierReviewStatus(e.target.value)} disabled={isDone} placeholder="e.g., PASSED, FAILED" />
                    </div>
                    <div className="form-group">
                      <label>Review Content (Markdown)</label>
                      <textarea value={verifierReviewContent} onChange={e => setVerifierReviewContent(e.target.value)} rows={3} disabled={isDone}></textarea>
                    </div>
                    <button onClick={handleSaveVerifierReview} disabled={isDone}>Save Verifier Review Artifact</button>
                  </Card>

                  <Card title="Final Gate">
                    <div className="form-group">
                      <label>Decision</label>
                      <select value={finalGateDecision} onChange={e => setFinalGateDecision(e.target.value)} disabled={isDone}>
                        <option value="APPROVED">APPROVED</option>
                        <option value="REJECTED">REJECTED</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Decision Content (Markdown)</label>
                      <textarea value={finalGateContent} onChange={e => setFinalGateContent(e.target.value)} rows={3} disabled={isDone}></textarea>
                    </div>
                    <button onClick={handleSaveFinalGate} disabled={isDone || currentStatus !== "READY_FOR_FINAL_GATE"} className="btn-stop">
                       Apply Final Gate ({finalGateDecision})
                    </button>
                    <p className="muted mt-2">APPROVED unlocks READY_TO_COMMIT.</p>
                  </Card>
                </div>
              </div>

              <Card title="Lifecycle Timeline">
                 {taskTimeline.length === 0 ? (
                   <p className="muted">No events in timeline.</p>
                 ) : (
                   <div className="timeline-list stack-small">
                      {taskTimeline.map((item, idx) => (
                        <div key={idx} className="timeline-item" style={{ padding: "8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
                           <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                             <span style={{ fontSize: "0.85em", color: "#64748b" }}>{item.timestamp}</span>
                             <span className="badge">{item.type}</span>
                           </div>
                           <div style={{ fontWeight: "600", fontSize: "0.9em", marginBottom: "4px" }}>{item.filename}</div>
                           <details>
                             <summary style={{ fontSize: "0.85em", cursor: "pointer", color: "#2563eb" }}>View Content</summary>
                             <pre className="small-pre mt-2">{item.content}</pre>
                           </details>
                        </div>
                      ))}
                   </div>
                 )}
              </Card>

              <Card title="Task Logs">
                 <div className="grid">
                   <div>
                     <h4>System Log</h4>
                     <pre className="small-pre">{taskLogs.system || "Empty"}</pre>
                   </div>
                   <div>
                     <h4>Task State Log</h4>
                     <pre className="small-pre">{taskLogs.task || "Empty"}</pre>
                   </div>
                   <div>
                     <h4>Response Log</h4>
                     <pre className="small-pre">{taskLogs.response || "Empty"}</pre>
                   </div>
                   <div>
                     <h4>Banter Log</h4>
                     <pre className="small-pre">{taskLogs.banter || "Empty"}</pre>
                   </div>
                 </div>
              </Card>
            </div>
          )}
        </main>
      </div>
    );
  };

  return (
    <div className="app-container">
      <header className="topbar">
        <div>
          <h1>Dispatch Control Center</h1>
          <p>Manual-safe AI orchestration dashboard.</p>
        </div>
        <div className="statusBox">{status}</div>
      </header>

      {error && <div className="errorBox">{error}</div>}

      {renderNav()}

      <div className="tab-content">
         {activeTab === 'commandCenter' && renderCommandCenter()}
         {activeTab === 'channels' && renderChannels()}
         {activeTab === 'settings' && renderSettings()}
      </div>
    </div>
  );
}
