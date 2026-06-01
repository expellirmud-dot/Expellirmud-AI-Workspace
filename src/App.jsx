import React, { useEffect, useMemo, useState } from "react";

const CHATGPT_URL = "https://chatgpt.com/";

async function readJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function downloadText(name, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function Card({ title, children, right }) {
  return (
    <section className="card">
      <div className="cardHead">
        <h2>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function App() {
  const [workspace, setWorkspace] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [objective, setObjective] = useState("Review LUMINA motion, hover, scroll, and reveal behavior using existing visual context only.");
  const [taskId, setTaskId] = useState("LUMINA-MOTION-REVIEW-DISPATCH-001");
  const [snapshot, setSnapshot] = useState(null);
  const [task, setTask] = useState(null);
  const [dispatch, setDispatch] = useState(null);
  const [status, setStatus] = useState("Loading workspace registry...");
  const [error, setError] = useState("");

  useEffect(() => {
    readJson("/api/workspace-data")
      .then((data) => {
        setWorkspace(data);
        setProjects(data.projects || []);
        const first = data.projects?.[0];
        setSelectedSlug(first?.slug || "");
        setStatus("Workspace loaded");
      })
      .catch((err) => {
        setError(String(err.message || err));
        setStatus("Failed to load workspace");
      });
  }, []);

  const selectedProject = useMemo(
    () => projects.find((p) => p.slug === selectedSlug) || null,
    [projects, selectedSlug]
  );

  const latestSnapshot = workspace?.activeContexts?.at?.(-1) || null;
  const latestTask = workspace?.taskCards?.at?.(-1) || null;

  async function generateSnapshot() {
    setStatus("Generating snapshot...");
    const data = await readJson("/api/generate-snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectSlug: selectedSlug, objective })
    });
    setSnapshot(data);
    setStatus(`Snapshot created: ${data.snapshot.active_context.id}`);
  }

  async function generateTask() {
    setStatus("Generating task card...");
    const data = await readJson("/api/generate-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectSlug: selectedSlug, objective, taskId })
    });
    setTask(data);
    setSnapshot((prev) => prev || { snapshot: data.snapshot });
    setStatus(`Task card created: ${data.task.task.id}`);
  }

  async function generateDispatch() {
    setStatus("Generating dispatch messages...");
    const data = await readJson("/api/generate-dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectSlug: selectedSlug, objective, taskId })
    });
    setDispatch(data);
    setStatus("Dispatch messages ready");
  }

  function copy(text) {
    navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard");
  }

  return (
    <main className="wrap">
      <header className="topbar">
        <div>
          <h1>Expellirmud AI-Workspace Dashboard</h1>
          <p>Manual-safe MVP for project-aware snapshots, task cards, and dispatch messages.</p>
        </div>
        <div className="statusBox">{status}</div>
      </header>

      {error ? <div className="errorBox">{error}</div> : null}

      <Card title="Workspace Home" right={<button onClick={() => window.open(CHATGPT_URL, "_blank", "noopener,noreferrer")}>Open ChatGPT</button>}>
        <div className="twoCol">
          <label>
            Active Project
            <select value={selectedSlug} onChange={(e) => setSelectedSlug(e.target.value)}>
              {projects.map((project) => (
                <option key={project.slug} value={project.slug}>
                  {project.project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Objective
            <textarea value={objective} onChange={(e) => setObjective(e.target.value)} />
          </label>
        </div>
      </Card>

      <div className="grid">
        <Card title="Project Detail Panel">
          {selectedProject ? (
            <div className="stack">
              <div><b>Path:</b> {selectedProject.project.path}</div>
              <div><b>Status:</b> {selectedProject.project.status}</div>
              <div><b>Phase:</b> {selectedProject.project.phase}</div>
              <div><b>Required tools:</b> {(selectedProject.project.required_tools || []).join(", ")}</div>
              <div><b>Required runtimes:</b> {(selectedProject.project.required_runtimes || []).join(", ")}</div>
              <div><b>Allowed models:</b> {(selectedProject.project.allowed_model_ids || []).join(", ")}</div>
              <div><b>Rules file:</b> {selectedProject.project.rules_file}</div>
              <div><b>Workflow file:</b> {selectedProject.project.workflow_file}</div>
            </div>
          ) : <p className="muted">No project selected.</p>}
        </Card>

        <Card title="Existing Active Context Snapshot">
          {latestSnapshot ? (
            <>
              <div className="metaLine"><b>File:</b> {latestSnapshot.name}</div>
              <pre>{JSON.stringify(latestSnapshot.data, null, 2)}</pre>
            </>
          ) : <p className="muted">No active-context snapshot found yet.</p>}
        </Card>

        <Card title="Existing Task Card">
          {latestTask ? (
            <>
              <div className="metaLine"><b>File:</b> {latestTask.name}</div>
              <pre>{JSON.stringify(latestTask.data, null, 2)}</pre>
            </>
          ) : <p className="muted">No task card found yet.</p>}
        </Card>

        <Card title="Snapshot Builder">
          <div className="buttonRow">
            <button onClick={generateSnapshot}>Create Active Context Snapshot</button>
            {snapshot?.snapshot ? <button onClick={() => copy(JSON.stringify(snapshot.snapshot, null, 2))}>Copy Snapshot</button> : null}
          </div>
          <pre>{snapshot?.snapshot ? JSON.stringify(snapshot.snapshot, null, 2) : "No snapshot yet"}</pre>
        </Card>

        <Card title="Task Card Builder">
          <div className="buttonRow">
            <input value={taskId} onChange={(e) => setTaskId(e.target.value)} />
            <button onClick={generateTask}>Create Task Card</button>
            {task?.task ? <button onClick={() => copy(JSON.stringify(task.task, null, 2))}>Copy Task</button> : null}
          </div>
          <pre>{task?.task ? JSON.stringify(task.task, null, 2) : "No task card yet"}</pre>
        </Card>

        <Card title="Dispatch Message Preview">
          <div className="buttonRow">
            <button onClick={generateDispatch}>Generate Dispatch Messages</button>
            {dispatch?.controller ? <button onClick={() => copy(dispatch.controller)}>Copy Controller</button> : null}
            {dispatch?.worker ? <button onClick={() => copy(dispatch.worker)}>Copy Worker</button> : null}
            {dispatch?.verifier ? <button onClick={() => copy(dispatch.verifier)}>Copy Verifier</button> : null}
            <button onClick={() => downloadText("dispatch-notes.txt", `ChatGPT: ${CHATGPT_URL}\nRegistry: D:\\ai-tools\\AI-Workspace\\ai-ops-registry`)}>
              Open Local Note
            </button>
          </div>
          <div className="dispatchGrid">
            <div>
              <h3>Controller</h3>
              <pre>{dispatch?.controller || "No controller message yet"}</pre>
            </div>
            <div>
              <h3>Worker</h3>
              <pre>{dispatch?.worker || "No worker message yet"}</pre>
            </div>
            <div>
              <h3>Verifier</h3>
              <pre>{dispatch?.verifier || "No verifier message yet"}</pre>
            </div>
          </div>
        </Card>

        <Card title="Reports / Logs Panel">
          <ul>
            {(workspace?.reports || []).slice(0, 50).map((report) => <li key={report}>{report}</li>)}
          </ul>
        </Card>
      </div>
    </main>
  );
}
