import { useDeferredValue, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Circle, ListTodo, Search, Trash2 } from "lucide-react";
import { Dialog, Notice, useResource } from "./ui.jsx";

const statuses = [
  ["todo", "To do"], ["in_progress", "In progress"], ["blocked", "Blocked"], ["done", "Done"],
];
const priorities = ["low", "medium", "high", "urgent"];

function statusOf(task) {
  return task.status ?? (task.completed ? "done" : "todo");
}

function dateLabel(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z"));
}

export function memberLabel(id, project, account) {
  if (!id) return "Unassigned";
  if (id === account?._id) return "You";
  if (id === project?.ownerId) return "Owner";
  const index = project?.memberIds.indexOf(id) ?? -1;
  return index < 0 ? "Former member" : "Member " + (index + 1);
}

function TaskPage({ request, path, params, revision, project, projects, account, openTask, refresh }) {
  const [cursors, setCursors] = useState([]);
  const [mutation, setMutation] = useState(null);
  const [error, setError] = useState(null);
  const query = new URLSearchParams(params);
  query.set("limit", "10");
  if (cursors.length) query.set("before", cursors.at(-1));
  const { data, error: loadError, loading } = useResource(request, path + "?" + query, revision);
  const items = data?.items;
  const projectTasks = path !== "/api/me/tasks";

  async function toggle(task) {
    setMutation(task._id);
    setError(null);
    const taskPath = task.projectId ? "/api/projects/" + task.projectId + "/tasks" : "/api/me/tasks";
    try {
      await request(taskPath + "/" + task._id, { method: "PATCH", body: { completed: !task.completed } });
      refresh();
    } catch (error) {
      setError(error);
    } finally {
      setMutation(null);
    }
  }

  return <>
    <Notice error={loadError ?? error} />
    {loading && !items && <p className="panel-message muted" role="status">Loading tasks…</p>}
    {items?.length === 0 && <div className="empty"><ListTodo size={25} /><p>No tasks match this view.</p></div>}
    {items?.length > 0 && <div className="table-wrap"><table>
      <thead><tr><th scope="col">Task</th><th scope="col">Status</th>{projectTasks && <><th scope="col">Priority</th><th scope="col">Due date</th><th scope="col">{project ? "Assignee" : "Project"}</th></>}</tr></thead>
      <tbody>{items.map(task => {
        const status = statusOf(task);
        const taskProject = project ?? projects.find(item => item._id === task.projectId);
        return <tr key={task._id}>
          <td><div className="task-cell">
            <button className={"complete-button" + (task.completed ? " checked" : "")} disabled={Boolean(mutation || loading || taskProject?.archived)} onClick={() => toggle(task)} aria-label={(task.completed ? "Reopen " : "Complete ") + task.title}>
              {task.completed ? <Check size={14} /> : <Circle size={17} />}
            </button>
            <div><button className="task-title" onClick={() => openTask(task)}>{task.title}</button>
              {projectTasks && <div className="mobile-task-meta">
                <span className={"priority " + task.priority}><i />{task.priority}</span>
                {task.dueOn && <span>{dateLabel(task.dueOn)}</span>}
                <span>{project ? memberLabel(task.assigneeId, taskProject, account) : taskProject?.name ?? "Project"}</span>
              </div>}
              {task.labels?.length > 0 && <div className="labels">{task.labels.map(label => <span key={label}>{label}</span>)}</div>}
            </div>
          </div></td>
          <td><span className={"pill " + status}><i />{statuses.find(([value]) => value === status)?.[1]}</span></td>
          {projectTasks && <>
            <td><span className={"priority " + task.priority}><i />{task.priority}</span></td>
            <td><span className="date">{task.dueOn && <CalendarDays size={14} />}{dateLabel(task.dueOn)}</span></td>
            <td>{project ? memberLabel(task.assigneeId, taskProject, account) : taskProject?.name ?? "Project"}</td>
          </>}
        </tr>;
      })}</tbody>
    </table></div>}
    {(items || cursors.length > 0) && <div className="panel-footer">
      <span>{items?.length ?? 0} {items?.length === 1 ? "task" : "tasks"} on this page</span>
      <div className="pagination"><button className="icon-button" aria-label="Previous page" disabled={loading || cursors.length === 0} onClick={() => setCursors(values => values.slice(0, -1))}><ChevronLeft size={17} /></button><span>Page {cursors.length + 1}</span><button className="icon-button" aria-label="Next page" disabled={loading || !data?.nextCursor} onClick={() => setCursors(values => [...values, data.nextCursor])}><ChevronRight size={17} /></button></div>
    </div>}
  </>;
}

export function TaskList({ request, view, project, revision, projects, account, openTask, refresh }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [overdue, setOverdue] = useState(false);
  const term = useDeferredValue(search);
  const projectTasks = view !== "private";
  const path = project ? "/api/projects/" + project._id + "/tasks" : projectTasks ? "/api/me/project-tasks" : "/api/me/tasks";
  const query = new URLSearchParams();
  if (status) query.set(projectTasks ? "status" : "completed", status);
  if (projectTasks) {
    if (term.trim()) query.set("q", term.trim());
    if (priority) query.set("priority", priority);
    if (overdue) query.set("overdue", "true");
  }
  const params = query.toString();
  return <section className="panel">
    <div className="panel-head"><h2>Tasks</h2>
      <div className="filters">
        {projectTasks && <label className="search"><Search size={17} /><input aria-label="Search tasks" placeholder="Search tasks" value={search} onChange={event => setSearch(event.target.value)} maxLength={120} /></label>}
        <select aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          {(projectTasks ? statuses : [["false", "Open"], ["true", "Done"]]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {projectTasks && <>
          <select aria-label="Filter by priority" value={priority} onChange={event => setPriority(event.target.value)}>
            <option value="">All priorities</option>{priorities.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
          </select>
          <button className={"button filter-button" + (overdue ? " selected" : "")} aria-pressed={overdue} onClick={() => setOverdue(!overdue)}>Overdue</button>
        </>}
      </div>
    </div>
    <TaskPage key={params} {...{ request, path, params, revision, project, projects, account, openTask, refresh }} />
  </section>;
}

function Collaboration({ task, path, project, account, disabled, mutate }) {
  const [editing, setEditing] = useState(null);
  const [renaming, setRenaming] = useState(null);
  async function add(event, field) {
    event.preventDefault();
    const form = event.currentTarget;
    const property = field === "comments" ? "text" : "title";
    const value = new FormData(form).get(property);
    if (await mutate(path + "/" + field, "POST", { [property]: value })) form.reset();
  }

  return <>
    <section className="detail-section">
      <h3>Checklist <span>{task.checklist?.filter(item => item.completed).length ?? 0}/{task.checklist?.length ?? 0}</span></h3>
      {task.checklist?.map(item => {
        const itemPath = path + "/checklist/" + item._id;
        return renaming === item._id ? <form key={item._id} className="inline-form" onSubmit={async event => {
          event.preventDefault();
          const title = new FormData(event.currentTarget).get("title");
          if (await mutate(itemPath, "PATCH", { title })) setRenaming(null);
        }}><input aria-label="Checklist item title" name="title" defaultValue={item.title} maxLength={120} required /><button className="button" disabled={disabled}>Save</button><button type="button" className="button" onClick={() => setRenaming(null)}>Cancel</button></form> : <div className="detail-row" key={item._id}>
          <label className="check-label"><input type="checkbox" checked={item.completed} disabled={disabled} onChange={event => mutate(itemPath, "PATCH", { completed: event.target.checked })} />{item.title}</label>
          <div className="actions"><button className="text-button" disabled={disabled} onClick={() => setRenaming(item._id)}>Edit</button><button className="icon-button" disabled={disabled} aria-label={"Remove " + item.title} onClick={() => mutate(itemPath, "DELETE")}><Trash2 size={15} /></button></div>
        </div>;
      })}
      {!task.checklist?.length && <p className="muted">No checklist items.</p>}
      {!project.archived && <form className="inline-form" onSubmit={event => add(event, "checklist")}><input aria-label="New checklist item" name="title" placeholder="Add a checklist item" maxLength={120} required /><button className="button" disabled={disabled}>Add</button></form>}
    </section>
    <section className="detail-section">
      <h3>Comments</h3>
      {task.comments?.map(comment => {
        const commentPath = path + "/comments/" + comment._id;
        const mine = comment.authorId === account?._id;
        const canDelete = mine || project.ownerId === account?._id;
        return <article key={comment._id} className="comment">
          <strong>{memberLabel(comment.authorId, project, account)}</strong>
          {editing === comment._id ? <form className="stack" onSubmit={async event => {
            event.preventDefault();
            const text = new FormData(event.currentTarget).get("text");
            if (await mutate(commentPath, "PATCH", { text })) setEditing(null);
          }}><textarea name="text" aria-label="Edit comment" defaultValue={comment.text} maxLength={1000} required /><div className="actions"><button className="button" disabled={disabled}>Save comment</button><button type="button" className="button" onClick={() => setEditing(null)}>Cancel</button></div></form>
            : <><p>{comment.text}</p><div className="actions">
              {mine && <button className="text-button" disabled={disabled} onClick={() => setEditing(comment._id)}>Edit</button>}
              {canDelete && <button className="text-button" disabled={disabled} onClick={() => mutate(commentPath, "DELETE")}>Delete</button>}
            </div></>}
        </article>;
      })}
      {!task.comments?.length && <p className="muted">No comments yet.</p>}
      {!project.archived && <form className="stack" onSubmit={event => add(event, "comments")}><textarea name="text" aria-label="New comment" placeholder="Write a comment" maxLength={1000} required /><button className="button align-start" disabled={disabled}>Post comment</button></form>}
    </section>
  </>;
}

export function TaskEditor({ request, path, task, account, close, refresh }) {
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const taskPath = task ? path + "/" + task._id : null;
  const projectPath = path.startsWith("/api/projects/") ? path.slice(0, -"/tasks".length) : null;
  const detail = useResource(request, taskPath, revision);
  const project = useResource(request, projectPath, revision);
  const current = detail.data;
  const archived = project.data?.archived;
  const disabled = Boolean(busy || detail.loading || project.loading || archived || project.error);

  async function mutate(route, method, body, finish = false) {
    setBusy(true);
    setError(null);
    try {
      await request(route, { method, body });
      refresh();
      if (finish) close();
      else setRevision(value => value + 1);
      return true;
    } catch (error) {
      setError(error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function save(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const body = { title: fields.get("title") };
    if (projectPath) {
      Object.assign(body, {
        description: fields.get("description"),
        status: fields.get("status"),
        priority: fields.get("priority"),
        dueOn: fields.get("dueOn") || null,
        labels: fields.get("labels").split(",").map(value => value.trim()).filter(Boolean),
      });
    } else body.completed = fields.has("completed");
    void mutate(taskPath ?? path, task ? "PATCH" : "POST", body, true);
  }

  return <Dialog title={task ? "Task details" : "New task"} close={() => { if (!busy) close(); }} drawer>
    <div className="dialog-body">
      <Notice error={error ?? detail.error ?? project.error} />
      {archived && <p className="muted">Restore this project to make changes.</p>}
      {task && !current && detail.loading && <p className="muted" role="status">Loading task…</p>}
      {(!task || current) && <form className="stack" onSubmit={save}>
        <label>Title<input name="title" defaultValue={current?.title} maxLength={120} required readOnly={archived} /></label>
        {projectPath ? <>
          <label>Description<textarea name="description" defaultValue={current?.description} maxLength={2000} rows={4} readOnly={archived} /></label>
          <div className="field-grid">
            <label>Status<select name="status" aria-label="Status" defaultValue={statusOf(current ?? {})} disabled={archived}>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Priority<select name="priority" aria-label="Priority" defaultValue={current?.priority ?? "medium"} disabled={archived}>{priorities.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
          </div>
          <label>Due date<input type="date" name="dueOn" defaultValue={current?.dueOn ?? ""} readOnly={archived} /></label>
          <label>Labels<input name="labels" defaultValue={current?.labels.join(", ")} placeholder="Separate labels with commas" readOnly={archived} /></label>
        </> : <label className="check-label"><input type="checkbox" name="completed" defaultChecked={current?.completed} />Completed</label>}
        {!archived && <button className="button primary align-start" disabled={disabled}>{busy ? "Saving…" : task ? "Save changes" : "Create task"}</button>}
      </form>}
      {current && project.data && <>
        <section className="detail-section"><h3>Assignment</h3><label>Assignee<select aria-label="Assignee" value={current.assigneeId ?? ""} disabled={disabled} onChange={event => mutate(taskPath + "/assignee", "PUT", { assigneeId: event.target.value || null })}>
          <option value="">Unassigned</option>
          {current.assigneeId && !project.data.memberIds.includes(current.assigneeId) && <option value={current.assigneeId} disabled>Former member</option>}
          {project.data.memberIds.map(id => <option key={id} value={id}>{memberLabel(id, project.data, account)}</option>)}
        </select></label></section>
        <Collaboration task={current} path={taskPath} project={project.data} account={account} disabled={disabled} mutate={mutate} />
      </>}
      {current && !archived && (!projectPath || project.data?.ownerId === account?._id) && <div className="detail-section actions">
        {confirmDelete ? <><span>Delete this task?</span><button className="button danger" disabled={disabled} onClick={() => mutate(taskPath, "DELETE", undefined, true)}>Confirm delete</button><button className="button" onClick={() => setConfirmDelete(false)}>Cancel</button></> : <button className="button danger" disabled={disabled} onClick={() => setConfirmDelete(true)}><Trash2 size={15} />Delete task</button>}
      </div>}
    </div>
  </Dialog>;
}
