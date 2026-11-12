import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Archive, ArrowDown, ArrowRight, ArrowUpRight, CheckCircle2, ChevronRight, Circle,
  Clock3, Folder, Layers3, ListTodo, LogOut, Menu, Plus, Settings2, UserRound,
} from "lucide-react";
import { api } from "./api.js";
import { TaskList, TaskEditor } from "./tasks.jsx";
import { ProjectEditor } from "./projects.jsx";
import { Notice, useResource } from "./ui.jsx";
import "./styles.css";

const tokenKey = "task-tracker-session";

function Brand() {
  return <div className="brand"><span className="brand-icon"><Layers3 size={20} /></span><span>Task Tracker</span></div>;
}

function SignIn({ onLogin, expired }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const body = { email: values.get("email"), password: values.get("password") };
    setBusy(true);
    setError(null);
    try {
      if (register) await api("/api/auth/register", { method: "POST", body });
      const session = await api("/api/auth/login", { method: "POST", body });
      onLogin(session.token);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <div className="auth-card">
      <Brand />
      <h1>{register ? "Create your account" : "Welcome back"}</h1>
      <p className="muted">{register ? "Set up your Task Tracker workspace." : "Sign in to manage your tasks and projects."}</p>
      <form className="stack" onSubmit={submit}>
        <label>Email<input type="email" name="email" placeholder="you@example.com" autoComplete="email" required /></label>
        <label>Password<input type="password" name="password" placeholder="Enter your password" autoComplete={register ? "new-password" : "current-password"} minLength={12} maxLength={128} required /></label>
        <Notice error={error ?? (expired && "Your session expired. Sign in again.")} />
        <button className="button primary full" disabled={busy}>{busy ? "Please wait…" : register ? "Create account" : "Sign in"}<ArrowRight size={17} /></button>
      </form>
      <p className="auth-switch">{register ? "Already have an account?" : "New to Task Tracker?"} <button className="text-button" disabled={busy} onClick={() => { setRegister(!register); setError(null); }}>{register ? "Sign in" : "Create an account"}</button></p>
    </div>
  </main>;
}

const pages = [
  { id: "projects", label: "Projects", Icon: Folder },
  { id: "private", label: "My tasks", Icon: ListTodo },
  { id: "assigned", label: "Assigned to me", Icon: UserRound },
];

function Metrics({ stats }) {
  const metrics = [
    ["Total tasks", stats.total, Layers3, "violet"],
    ...(stats.byStatus ? [["In progress", stats.byStatus.in_progress, Clock3, "blue"]] : [["Pending", stats.pending, Clock3, "blue"]]),
    ["Completed", stats.completed, CheckCircle2, "green"],
    ...(stats.overdue === undefined ? [] : [["Overdue", stats.overdue, ArrowDown, "orange"]]),
  ];
  return <div className="metrics">{metrics.map(([label, value, Icon, color]) =>
    <div className="metric" key={label}><span className={"metric-icon " + color}><Icon size={17} /></span><div><p>{label}</p><strong>{value}</strong></div></div>,
  )}</div>;
}

function ProjectsView({ projects, archived, select, setArchived }) {
  const list = archived ? projects.archived : projects.active;
  return <>
    <div className="view-switch" aria-label="Project state">
      <button className={!archived ? "selected" : ""} aria-pressed={!archived} onClick={() => setArchived(false)}><Folder size={15} />Active</button>
      <button className={archived ? "selected" : ""} aria-pressed={archived} onClick={() => setArchived(true)}><Archive size={15} />Archived</button>
    </div>
    <Notice error={list.error} />
    {!list.data && list.loading && <p className="muted" role="status">Loading projects…</p>}
    {list.data?.length === 0 && <div className="empty"><Folder size={25} /><p>{archived ? "No archived projects." : "No projects yet. Create a project to get started."}</p></div>}
    <div className="project-grid">{list.data?.map(project =>
      <button className="project-card" key={project._id} onClick={() => select(project._id)}>
        <span className="project-icon"><Folder size={19} /></span><ArrowUpRight size={18} className="card-arrow" />
        <h2>{project.name}</h2>{project.description && <p>{project.description}</p>}
        <span className="project-members"><UserRound size={14} />{project.memberIds.length} {project.memberIds.length === 1 ? "member" : "members"}</span>
      </button>,
    )}</div>
  </>;
}

function Workspace({ request, onLogout }) {
  const [view, setView] = useState("projects");
  const [archived, setArchived] = useState(false);
  const [revision, setRevision] = useState(0);
  const [mobileNav, setMobileNav] = useState(false);
  const [modal, setModal] = useState(null);
  const account = useResource(request, "/api/me");
  const active = useResource(request, "/api/projects", revision);
  const archive = useResource(request, "/api/projects?archived=true", revision);
  const navigationItem = pages.find(item => item.id === view);
  const isProject = !navigationItem;
  const projectPath = isProject ? "/api/projects/" + view : null;
  const project = useResource(request, projectPath, revision);
  const stats = useResource(request, projectPath ? projectPath + "/stats" : view === "private" ? "/api/me/stats" : null, revision);
  const title = navigationItem?.label ?? project.data?.name ?? "Project";
  const refresh = () => setRevision(value => value + 1);

  function select(id) {
    setView(id);
    setModal(null);
    setMobileNav(false);
  }

  function editTask(task) {
    const path = projectPath ? projectPath + "/tasks" : task.projectId
      ? "/api/projects/" + task.projectId + "/tasks" : "/api/me/tasks";
    setModal({ type: "task", path, task });
  }

  return <div className="shell">
    {mobileNav && <button className="nav-overlay" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
    <aside className={"sidebar" + (mobileNav ? " visible" : "")}>
      <Brand />
      <nav aria-label="Workspace">
        <p className="nav-label">Workspace</p>
        {pages.map(({ id, label, Icon }) => <button key={id} className={"nav-button" + (view === id ? " active" : "")} aria-current={view === id ? "page" : undefined} onClick={() => select(id)}><Icon size={18} />{label}</button>)}
        <div className="nav-project-heading"><p className="nav-label">Your projects</p><button className="icon-button" title="New project" aria-label="New project" onClick={() => { setMobileNav(false); setModal({ type: "project" }); }}><Plus size={17} /></button></div>
        {active.data?.map(item => <button key={item._id} title={item.name} className={"nav-button project-nav" + (view === item._id ? " active" : "")} aria-current={view === item._id ? "page" : undefined} onClick={() => select(item._id)}><Circle size={9} fill="currentColor" /><span>{item.name}</span></button>)}
      </nav>
      <div className="sidebar-foot">
        <a href="/api-docs/" target="_blank" rel="noreferrer" className="nav-button"><ArrowUpRight size={17} />API documentation</a>
        <div className="profile"><span className="avatar">{account.data?.email.slice(0, 1).toUpperCase() ?? <UserRound size={16} />}</span><span title={account.data?.email}>{account.data?.email ?? "Account"}</span><button className="icon-button" onClick={onLogout} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button></div>
      </div>
    </aside>
    <div className="main">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={21} /></button>
        <span className="crumb">Workspace</span><ChevronRight size={15} /><span>{title}</span>
      </header>
      <main className="content">
        <div className="page-heading">
          <div><h1>{title}</h1>{project.data?.archived && <span className="pill neutral"><Archive size={13} />Archived</span>}
            <p>{view === "projects" ? "Browse and manage the projects you belong to." : view === "private" ? "Your personal task list." : view === "assigned" ? "Tasks assigned to you across active projects." : project.data?.description}</p></div>
          <div className="actions">
            {project.data && <button className="button" onClick={() => setModal({ type: "project", project: project.data })}><Settings2 size={16} />Project details</button>}
            {view === "projects" && <button className="button primary" onClick={() => setModal({ type: "project" })}><Plus size={17} />New project</button>}
            {(view === "private" || (project.data && !project.data.archived)) && <button className="button primary" onClick={() => setModal({ type: "task", path: projectPath ? projectPath + "/tasks" : "/api/me/tasks" })}><Plus size={17} />New task</button>}
          </div>
        </div>
        <Notice error={project.error ?? stats.error ?? account.error} />
        {view === "projects" ? <ProjectsView projects={{ active, archived: archive }} archived={archived} setArchived={setArchived} select={select} /> : <>
          {stats.data && <Metrics stats={stats.data} />}
          {(!isProject || project.data) && <TaskList key={view} request={request} revision={revision} view={view} project={project.data} projects={active.data ?? []} account={account.data} openTask={editTask} refresh={refresh} />}
          {isProject && !project.data && project.loading && <p className="muted" role="status">Loading project…</p>}
        </>}
      </main>
    </div>
    {modal?.type === "project" && <ProjectEditor request={request} project={modal.project} account={account.data} close={() => setModal(null)} refresh={refresh} created={id => { refresh(); select(id); }} />}
    {modal?.type === "task" && <TaskEditor request={request} path={modal.path} task={modal.task} account={account.data} close={() => setModal(null)} refresh={refresh} />}
  </div>;
}

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(tokenKey));
  const [expired, setExpired] = useState(false);
  const [logoutError, setLogoutError] = useState(null);
  function login(value) {
    sessionStorage.setItem(tokenKey, value);
    setExpired(false);
    setToken(value);
  }
  const clearSession = useCallback((wasExpired = false) => {
    sessionStorage.removeItem(tokenKey);
    setExpired(wasExpired);
    setToken(null);
  }, []);
  const request = useCallback(async (path, options) => {
    try {
      return await api(path, { ...options, token });
    } catch (error) {
      if (error.status === 401) clearSession(true);
      throw error;
    }
  }, [token, clearSession]);

  async function logout() {
    setLogoutError(null);
    try {
      await request("/api/auth/logout", { method: "POST" });
      clearSession();
    } catch (error) {
      if (error.status !== 401) setLogoutError(error);
    }
  }

  return token ? <><Workspace request={request} onLogout={logout} />{logoutError && <div className="floating-error"><Notice error={logoutError} /></div>}</> : <SignIn onLogin={login} expired={expired} />;
}

createRoot(document.getElementById("root")).render(<App />);
