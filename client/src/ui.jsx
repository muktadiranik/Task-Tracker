import { useEffect, useState } from "react";
import { X } from "lucide-react";

export function useResource(request, path, revision = 0) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    request(path, { signal: controller.signal }).then(
      data => { if (!controller.signal.aborted) setState({ path, revision, data }); },
      error => { if (!controller.signal.aborted) setState({ path, revision, error }); },
    );
    return () => controller.abort();
  }, [request, path, revision]);
  const current = state?.path === path ? state : null;
  return {
    data: current?.data,
    error: current?.revision === revision ? current?.error : null,
    loading: Boolean(path && current?.revision !== revision),
  };
}

export function Notice({ error }) {
  return error ? <p className="error" role="alert">{error.message ?? error}</p> : null;
}

export function Dialog({ title, children, close, drawer = false }) {
  const [element, setElement] = useState(null);
  useEffect(() => {
    if (element && !element.open) element.showModal();
  }, [element]);
  return <dialog ref={setElement} className={drawer ? "dialog drawer" : "dialog"} onCancel={event => { event.preventDefault(); close(); }} aria-label={title}>
    <div className="dialog-head"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="Close"><X size={20} /></button></div>
    {children}
  </dialog>;
}
