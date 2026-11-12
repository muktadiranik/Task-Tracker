import { useState } from "react";
import { Archive, RotateCcw, UserRound } from "lucide-react";
import { Dialog, Notice, useResource } from "./ui.jsx";
import { memberLabel } from "./tasks.jsx";

export function ProjectEditor({ request, project, account, close, refresh, created }) {
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const path = project ? "/api/projects/" + project._id : "/api/projects";
  const resource = useResource(request, project ? path : null, revision);
  const current = resource.data ?? project;
  const owner = current?.ownerId === account?._id;
  const disabled = busy || resource.loading;

  async function mutate(route, method, body) {
    setBusy(true);
    setError(null);
    try {
      const result = await request(route, { method, body });
      if (!project) created(result._id);
      else {
        setRevision(value => value + 1);
        refresh();
      }
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
    const values = new FormData(event.currentTarget);
    void mutate(path, project ? "PATCH" : "POST", { name: values.get("name"), description: values.get("description") });
  }

  return <Dialog title={project ? "Project details" : "New project"} close={() => { if (!busy) close(); }}>
    <div className="dialog-body">
      <Notice error={error ?? resource.error} />
      <form className="stack" onSubmit={save}>
        <label>Name<input name="name" defaultValue={current?.name} maxLength={120} required readOnly={Boolean(project && !owner)} /></label>
        <label>Description<textarea name="description" defaultValue={current?.description ?? ""} maxLength={2000} rows={3} readOnly={Boolean(project && !owner)} /></label>
        {(!project || owner) && <button className="button primary align-start" disabled={disabled}>{project ? "Save project" : "Create project"}</button>}
      </form>
      {current && <section className="detail-section">
        <h3>Members</h3>
        {current.memberIds.map(id => <div className="detail-row" key={id}>
          <div className="member"><UserRound size={17} /><div><strong>{memberLabel(id, current, account)}{id === current.ownerId && id === account?._id && " · Owner"}</strong><small>{id}</small></div></div>
          {owner && id !== current.ownerId && !current.archived && <button className="text-button" disabled={disabled} onClick={() => mutate(path + "/members/" + id, "DELETE")}>Remove</button>}
        </div>)}
        {owner && !current.archived && <form className="inline-form" onSubmit={async event => {
          event.preventDefault();
          const form = event.currentTarget;
          const id = new FormData(form).get("id").trim();
          if (await mutate(path + "/members/" + id, "PUT")) form.reset();
        }}><input name="id" aria-label="Member account ID" placeholder="Member account ID" pattern="[0-9a-fA-F]{24}" required /><button className="button" disabled={disabled}>Add member</button></form>}
      </section>}
      {current && owner && <div className="detail-section">
        <button className="button" disabled={disabled} onClick={() => mutate(path, "PATCH", { archived: !current.archived })}>{current.archived ? <RotateCcw size={16} /> : <Archive size={16} />}{current.archived ? "Restore project" : "Archive project"}</button>
      </div>}
    </div>
  </Dialog>;
}
