import React, { useEffect, useState } from "react";

async function apiCall(url, method = "GET", body = null) {
  const options = { method };
  if (body) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function copy(text, onSuccess) {
  navigator.clipboard.writeText(text);
  if (onSuccess) onSuccess();
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
  
  // New Task Form
  const [newObjective, setNewObjective] = useState("");
  const [newProjectSlug, setNewProjectSlug] = useState("");
  const [newTaskId, setNewTaskId] = useState("");
  const [selController, setSelController] = useState("");
  const [selWorker, setSelWorker] = useState("");
  const [selVerifier, setSelVerifier] = useState("");
  
  // Task Actions
  const [responseRole, setResponseRole] = useState("controller");
  const [responseContent, setResponseContent] = useState("");
  const [decision, setDecision] = useState("done");
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionNextAction, setDecisionNextAction] = useState("");
  const [pendingConfirmRole, setPendingConfirmRole] = useState(null);
  
  // Task Data
  const [taskFiles, setTaskFiles] = useState({ dispatch: {}, responses: {}, decisions: [] });
  const [taskLogs, setTaskLogs] = useState({});

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
      loadTaskFiles();
      setPendingConfirmRole(null);
    }
  }, [selectedTaskId]);

  async function loadTaskFiles() {
    try {
      const files = await apiCall("/api/task/files", "POST", { taskId: selectedTaskId });
      const logs = await apiCall("/api/task/logs", "POST", { taskId: selectedTaskId });
      setTaskFiles(files);
      setTaskLogs(logs);
      setError("");
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCreateTask() {
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

  async function handleGenerateDispatch() {
    setStatus("Generating dispatch packages...");
    try {
      await apiCall("/api/generate-dispatch", "POST", { projectSlug: newProjectSlug, objective: activeTask.task.objective, taskId: selectedTaskId });
      setStatus("Dispatch generated");
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
      setPendingConfirmRole(role);
      await loadTaskFiles();
  }

  async function handleConfirmSent(role) {
      const statusMap = { controller: "sent_to_controller", worker: "sent_to_worker", verifier: "sent_to_verifier" };
      setStatus(`Marking as sent...`);
      try {
        await apiCall("/api/task/status", "POST", { taskId: selectedTaskId, status: statusMap[role] });
        setStatus(`Status updated to ${statusMap[role]}`);
        setPendingConfirmRole(null);
        await loadData();
        await loadTaskFiles();
      } catch (err) {
        setError(String(err.message));
      }
  }

  async function handleSaveResponse() {
    setStatus("Saving response...");
    try {
      await apiCall("/api/task/response", "POST", { taskId: selectedTaskId, role: responseRole, content: responseContent });
      setStatus("Response saved");
      setResponseContent("");
      await loadData();
      await loadTaskFiles();
    } catch (err) {
      setError(String(err.message));
    }
  }

  async function handleSaveDecision() {
    let finalReason = decisionReason.trim();
    let finalNextAction = decisionNextAction.trim();
    
    if (decision === "done") {
      if (!finalReason) finalReason = "Dashboard communication-flow test completed successfully.";
      if (!finalNextAction) finalNextAction = "Close test task.";
    } else {
      if (!finalReason) return setError("Reason is required.");
      if (!finalNextAction) return setError("Next Action is required.");
    }
    
    setError("");
    setStatus("Saving decision...");
    try {
      await apiCall("/api/task/decision", "POST", { taskId: selectedTaskId, decision, reason: finalReason, nextAction: finalNextAction });
      await apiCall("/api/task/status", "POST", { taskId: selectedTaskId, status: decision });
      setStatus(`Decision saved: ${decision}`);
      setDecisionReason("");
      setDecisionNextAction("");
      await loadData();
      await loadTaskFiles();
    } catch (err) {
      setError(String(err.message));
    }
  }

  if (!data) return <div className="wrap">Loading...</div>;

  const tasksByFolder = { inbox: [], active: [], completed: [], blocked: [] };
  data.tasks.forEach(t => tasksByFolder[t.folder]?.push(t));
  const activeTask = data.tasks.find(t => t.name === `${selectedTaskId}.yaml`)?.data;
  const isDone = activeTask?.task?.status === "done";

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
            
            <label className="mt-2">Controller Channel</label>
            <select value={selController} onChange={e => setSelController(e.target.value)}>
               {data.channels.filter(c => c.role === 'controller').map(c => <option key={c.channel_id} value={c.channel_id}>{c.label} ({c.readiness_status})</option>)}
            </select>
            <label className="mt-2">Worker Channel</label>
            <select value={selWorker} onChange={e => setSelWorker(e.target.value)}>
               {data.channels.filter(c => c.role === 'worker').map(c => <option key={c.channel_id} value={c.channel_id}>{c.label} ({c.readiness_status})</option>)}
            </select>
            <label className="mt-2">Verifier Channel</label>
            <select value={selVerifier} onChange={e => setSelVerifier(e.target.value)}>
               {data.channels.filter(c => c.role === 'verifier').map(c => <option key={c.channel_id} value={c.channel_id}>{c.label} ({c.readiness_status})</option>)}
            </select>
            
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
                      <div className="task-item-status badge">{t.data?.task?.status}</div>
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
                  <div><b>Status:</b> <span className="badge">{activeTask.task.status}</span></div>
                  <div><b>Stage:</b> {activeTask.task.mode}</div>
                  <div><b>Next Action:</b> {isDone ? 'completed' : (activeTask.task.handoff?.next_role || 'owner')}</div>
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
              </Card>

              <div className="grid">
                <Card title="Dispatch Execution Control">
                  <div className="buttonRow mb-4">
                    <button onClick={handleGenerateDispatch} disabled={isDone}>Generate / Refresh Dispatch</button>
                  </div>
                  
                  {['controller', 'worker', 'verifier'].map(role => (
                    <div key={role} className="dispatch-block">
                       <h4>{role.toUpperCase()} Message</h4>
                       <pre>{taskFiles.dispatch[role] || "Not generated yet"}</pre>
                       
                       {taskFiles.dispatch[role] && !isDone && (
                         <div className="execution-controls mt-2">
                           <div className="buttonRow">
                             <button onClick={() => handlePrepareDispatch(role)} className="btn-start">Start / Prepare</button>
                             <button onClick={() => setPendingConfirmRole(null)} className="btn-pause" disabled={pendingConfirmRole !== role}>Cancel Prepare</button>
                           </div>
                           
                           {pendingConfirmRole === role && (
                             <div className="confirm-overlay mt-2">
                               <p>Message copied and URL opened. Did you paste and send it?</p>
                               <button onClick={() => handleConfirmSent(role)} className="btn-confirm">Yes, Confirm Sent</button>
                             </div>
                           )}
                         </div>
                       )}
                    </div>
                  ))}
                </Card>

                <div className="stack">
                  <Card title="Response Inbox">
                    <div className="form-group">
                      <label>AI Role</label>
                      <select value={responseRole} onChange={e => setResponseRole(e.target.value)} disabled={isDone}>
                        <option value="controller">Controller</option>
                        <option value="worker">Worker</option>
                        <option value="verifier">Verifier</option>
                        <option value="final">Final Review</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Paste Response (Markdown)</label>
                      <textarea value={responseContent} onChange={e => setResponseContent(e.target.value)} rows={6} disabled={isDone}></textarea>
                    </div>
                    <button onClick={handleSaveResponse} disabled={isDone}>Save Response</button>

                    <h4 className="mt-4">Saved Responses</h4>
                    {Object.entries(taskFiles.responses).map(([role, content]) => content ? (
                      <details key={role} style={{marginBottom: 8}}>
                        <summary className="capitalize">{role} Response</summary>
                        <pre className="small-pre">{content}</pre>
                      </details>
                    ) : null)}
                  </Card>

                  <Card title="Owner Decision Gate">
                    <div className="form-group">
                      <label>Decision</label>
                      <select value={decision} onChange={e => setDecision(e.target.value)} disabled={isDone}>
                        <option value="done">Done (Stop/Finish)</option>
                        <option value="accepted">Accept</option>
                        <option value="revise_requested">Request Revision</option>
                        <option value="rejected">Reject</option>
                        <option value="blocked">Block / Pause</option>
                        <option value="waiting_controller_response">Escalate to Controller</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Reason</label>
                      <textarea value={decisionReason} onChange={e => setDecisionReason(e.target.value)} rows={2} disabled={isDone} placeholder={decision === 'done' ? 'Auto-fills if empty' : ''}></textarea>
                    </div>
                    <div className="form-group">
                      <label>Next Action</label>
                      <input value={decisionNextAction} onChange={e => setDecisionNextAction(e.target.value)} disabled={isDone} placeholder={decision === 'done' ? 'Auto-fills if empty' : ''} />
                    </div>
                    <button onClick={handleSaveDecision} disabled={isDone} className="btn-stop">Confirm & Apply Decision</button>
                    
                    {taskFiles.decisions.length > 0 && (
                       <div className="mt-4">
                         <h4>Decision History</h4>
                         {taskFiles.decisions.map((dec, i) => (
                            <pre key={i} className="small-pre">{dec}</pre>
                         ))}
                       </div>
                    )}
                  </Card>
                </div>
              </div>

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
