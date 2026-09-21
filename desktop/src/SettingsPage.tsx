import { useState } from "react";
import type { Command, Snapshot, Preferences } from "../host/contracts";

type Props = {
  state: Snapshot;
  send(command: Command): Promise<boolean>;
  close(): void;
};
export function SettingsPage({ state, send, close }: Props) {
  const [pending, setPending] = useState<Partial<Preferences>>({});
  const prefs = { ...state.preferences, ...pending };
  const update = async (
    patch: Partial<Omit<Preferences, "downloadDirectory">>,
  ) => {
    setPending((current) => ({ ...current, ...patch }));
    await send({ type: "setPreferences", patch });
    setPending((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch) as (keyof typeof patch)[])
        if (next[key] === patch[key]) delete next[key];
      return next;
    });
  };
  return (
    <section className="settings-page" aria-label="Browser settings">
      <header>
        <div>
          <h1>Settings</h1>
          <p>Make Trailrest work the way you browse.</p>
        </div>
        <button onClick={close}>Back to browsing</button>
      </header>
      <section>
        <h2>Search</h2>
        <label>
          Default search engine
          <select
            aria-label="Default search engine"
            value={prefs.searchEngine}
            onChange={(event) =>
              void update({
                searchEngine: event.target.value as typeof prefs.searchEngine,
              })
            }
          >
            <option value="duckduckgo">DuckDuckGo</option>
            <option value="google">Google</option>
            <option value="bing">Bing</option>
            <option value="brave">Brave Search</option>
          </select>
        </label>
        <p>Used when you type a search in the address bar.</p>
      </section>
      <section>
        <h2>Appearance</h2>
        <p>
          Theme: {state.theme.name}. Follows your Omarchy theme automatically.
          The address bar stays dark.
        </p>
        <label className="check-option">
          <input
            type="checkbox"
            checked={prefs.autoHideToolbar}
            onChange={(event) =>
              void update({ autoHideToolbar: event.target.checked })
            }
          />
          Hide the address bar while scrolling down
        </label>
        <p>Scroll up, use the strip at the top, or press Ctrl+L to show it.</p>
        <label>
          Default page zoom
          <select
            aria-label="Default page zoom"
            value={prefs.defaultZoom}
            onChange={(event) =>
              void update({ defaultZoom: Number(event.target.value) })
            }
          >
            {[0.75, 0.9, 1, 1.1, 1.25, 1.5, 2].map((zoom) => (
              <option key={zoom} value={zoom}>
                {Math.round(zoom * 100)}%
              </option>
            ))}
          </select>
        </label>
      </section>
      <section>
        <h2>Downloads</h2>
        <label className="check-option">
          <input
            type="checkbox"
            checked={prefs.askDownloadLocation}
            onChange={(event) =>
              void update({ askDownloadLocation: event.target.checked })
            }
          />
          Ask where to save each file
        </label>
        <p className="folder-path">{prefs.downloadDirectory}</p>
        <button onClick={() => void send({ type: "chooseDownloadDirectory" })}>
          Change download folder
        </button>
      </section>
      <section>
        <h2>Privacy and storage</h2>
        <p>
          Tasks, notes and website cookies stay in this browser profile.
          Reopening Trailrest restores page addresses; unsaved forms are not
          restored.
        </p>
        <button onClick={() => void send({ type: "clearCache" })}>
          Clear cached website files
        </button>
        <p>
          Camera, microphone, location, notification and clipboard permission
          requests remain blocked in this build.
        </p>
      </section>
      <section>
        <h2>Keyboard shortcuts</h2>
        <dl className="shortcut-list">
          <dt>Alt+A–Z</dt>
          <dd>Switch tasks in creation order</dd>
          <dt>Alt+1–9 / 0</dt>
          <dd>Switch tabs 1–9 / 10</dd>
          <dt>Ctrl+L</dt>
          <dd>Show and focus the address bar</dd>
          <dt>Ctrl+T / W</dt>
          <dd>New tab / close tab</dd>
          <dt>Ctrl+F</dt>
          <dd>Find on page</dd>
          <dt>Alt+← / →</dt>
          <dd>Back / forward</dd>
        </dl>
      </section>
    </section>
  );
}
