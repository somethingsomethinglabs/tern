import { useState } from "react";
import type { Command, Snapshot } from "../host/contracts";

export function ExtensionsPanel({
  extensions,
  notice,
  send,
  close,
}: {
  extensions: Snapshot["extensions"];
  notice: string;
  send(command: Command): Promise<boolean>;
  close(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState("");
  const run = async (command: Command) => {
    setBusy(true);
    try {
      await send(command);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h2 id="dialog-title">Extensions</h2>
      <p>
        Download a package from a Chrome Web Store link, or import a ZIP/CRX
        supplied by its developer. Chrome's Add to Chrome button is not
        connected to Trailrest.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run({ type: "downloadExtension", source });
        }}
      >
        <label>
          Chrome Web Store link or extension ID
          <input
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="https://chromewebstore.google.com/detail/…"
          />
        </label>
        <button className="primary" disabled={busy || !source.trim()}>
          Download package
        </button>
      </form>
      <div className="extension-imports">
        <button
          disabled={busy}
          onClick={() => void run({ type: "importExtension" })}
        >
          Import package
        </button>
        <button
          disabled={busy}
          onClick={() => void run({ type: "loadExtension" })}
        >
          Load unpacked
        </button>
      </div>
      <p>
        Only load extensions you trust. Some Chrome APIs and extension toolbar
        popups are unsupported. Importing a package does not guarantee it will
        work.
      </p>
      {busy && <p role="status">Working…</p>}
      {!busy && notice.startsWith("Extension package downloaded") && (
        <p role="status">{notice}</p>
      )}
      <div className="extension-list">
        {extensions.length ? (
          extensions.map((extension) => (
            <div className="extension" key={extension.path}>
              <strong>{extension.name}</strong>
              <small>{extension.version}</small>
              <p className="extension-path">{extension.path}</p>
              {extension.error && <p role="alert">{extension.error}</p>}
              <button
                disabled={busy}
                onClick={() =>
                  void run({ type: "removeExtension", path: extension.path })
                }
              >
                Remove {extension.name}
              </button>
            </div>
          ))
        ) : (
          <p>No extensions loaded.</p>
        )}
      </div>
      <p>
        Changes apply to newly opened or reloaded pages. Loaded extensions are
        remembered when you reopen Trailrest.
      </p>
      <footer>
        <button disabled={busy} onClick={close}>
          Done
        </button>
      </footer>
    </section>
  );
}
