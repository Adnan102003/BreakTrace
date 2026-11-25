import { useState } from 'react';
import type { RecorderCommand, Recording } from '../../packages/shared/contracts';
import { api, type Catalog } from './client';
import { ErrorMessage, Panel } from './ui';

export function WorkflowRecorder({
  catalog,
  draft,
  update,
}: {
  catalog: Catalog;
  draft: string;
  update: (json: string) => void;
}) {
  const [project, setProject] = useState(catalog.projects[0].id);
  const [start, setStart] = useState('/');
  const [recording, setRecording] = useState<Recording>();
  const [target, setTarget] = useState('');
  const [value, setValue] = useState('');
  const [action, setAction] = useState<'click' | 'fill' | 'visible' | 'text' | 'navigate'>('click');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function dispatch(operation: () => Promise<Recording | undefined>) {
    setBusy(true);
    setError('');
    try {
      const next = await operation();
      setRecording(next);
      if (next) update(JSON.stringify(next.draft, null, 2));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      setValue('');
    }
  }
  const record = (command: RecorderCommand) => {
    if (!recording) return;
    void dispatch(() => api(`/recordings/${recording.id}/steps`, { method: 'POST', body: command }));
  };
  return (
    <Panel title="Workflow recorder">
      {!recording ? (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void dispatch(() =>
              api('/recordings', { method: 'POST', body: { projectId: project, start } }),
            );
          }}
        >
          <div className="field-grid">
            <label>
              Recording project
              <select value={project} onChange={(event) => setProject(event.target.value)}>
                {catalog.projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Start path
              <input required value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
          </div>
          <button className="button primary" disabled={busy}>
            Start recording
          </button>
        </form>
      ) : (
        <div className="stack">
          <p className="muted">
            {recording.path} · {recording.draft.steps.length} recorded steps · Inputs are masked and
            stored as variable names.
          </p>
          <button
            type="button"
            className="recorder-preview"
            aria-label="Interact with the recorded page"
            disabled={busy}
            onClick={(event) => {
              if (event.detail === 0) {
                document.getElementById('recording-target')?.focus();
                return;
              }
              const bounds = event.currentTarget.getBoundingClientRect();
              record({
                action: 'pick',
                x: Math.min(
                  1159,
                  Math.max(0, Math.round(((event.clientX - bounds.left) / bounds.width) * 1160)),
                ),
                y: Math.min(
                  759,
                  Math.max(0, Math.round(((event.clientY - bounds.top) / bounds.height) * 760)),
                ),
              });
            }}
          >
            <img
              src={recording.screenshot}
              alt="Current page in the recording browser with input values masked"
            />
          </button>
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              if (action === 'fill') record({ action: 'fill', target, value });
              else if (action === 'navigate') record({ action: 'step', step: { action, path: target } });
              else if (action === 'text') record({ action: 'step', step: { action, target, value } });
              else record({ action: 'step', step: { action, target } });
            }}
          >
            <div className="field-grid">
              <label>
                Record action
                <select
                  value={action}
                  onChange={(event) => setAction(event.target.value as typeof action)}
                >
                  <option value="click">Click element</option>
                  <option value="fill">Enter input</option>
                  <option value="navigate">Navigate</option>
                  <option value="visible">Expect visible element</option>
                  <option value="text">Expect text</option>
                </select>
              </label>
              <label>
                {action === 'navigate' ? 'Relative path' : 'Element test ID'}
                <input
                  id="recording-target"
                  required
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                />
              </label>
              {(action === 'fill' || action === 'text') && (
                <label>
                  {action === 'fill' ? 'Temporary input value' : 'Expected text'}
                  <input
                    type={action === 'fill' ? 'password' : 'text'}
                    autoComplete="off"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                  />
                </label>
              )}
            </div>
            <button className="button primary" disabled={busy}>
              Record action
            </button>
          </form>
          <div className="actions">
            <button
              className="button ghost"
              disabled={busy || !recording.draft.steps.length}
              onClick={() =>
                void dispatch(() =>
                  api(`/recordings/${recording.id}/replay`, { method: 'POST', body: JSON.parse(draft) }),
                )
              }
            >
              Validate and replay draft
            </button>
            <button
              className="button ghost"
              disabled={busy}
              onClick={() =>
                void dispatch(async () => {
                  await api(`/recordings/${recording.id}`, { method: 'DELETE' });
                  return undefined;
                })
              }
            >
              Close recording
            </button>
          </div>
          {recording.validated && (
            <p role="status" className="message success">
              Replay passed in a fresh context.
            </p>
          )}
          {recording.operations.length > 0 && (
            <details>
              <summary>Recorded API requests</summary>
              <ul>
                {recording.operations.map((item, index) => (
                  <li key={index}>
                    <code>
                      {item.method} {item.path} · {item.status ?? 'blocked'}
                    </code>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {busy && <p role="status">Waiting for Chromium…</p>}
      {error && <ErrorMessage error={error} />}
    </Panel>
  );
}
