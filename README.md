# Thinking Canvas for DeepSeek Harness

**Lay one session out as a map you can drag, zoom, and trace back to its source.**

A DeepSeek Harness conversation is a vertical stream. Streams are good for reading
and bad for seeing structure: which line was your intent, which paragraph was the
model's judgement, which tool call was the one that actually changed a file, and at
which turn you changed your mind. None of that is visible on a straight line.

This plugin adds a **Canvas** tab to the conversation view ring and renders the
current session as a card map. Every card carries the `anchorSeq` of the record
behind it, so any card on the canvas can be traced back to its line in the session.

English | [中文](README.zh.md)

---

## Install

```sh
dsh plugin --profile <your profile> add github:qiuyiwu1989-star/dsh-canvas
```

`dsh plugin` forwards to pnpm inside the profile directory and then reconciles
`dsh.profile.bundles` against what is installed: this package declares
`dsh.bundle`, so it joins the bundle layer list automatically. **Restart the app**
— a profile is read at boot.

The profile name is the one you boot: `dsh web` uses `web`; a custom boot uses
whatever you passed. If you are unsure, look at which directory under
`$DSH_HOME/profiles/` was written to most recently.

There is no `prepare` script, so nothing has to be added to `allowBuilds` in
`pnpm-workspace.yaml`: this repository has no build step, and `lib/` is the source.

To mount the patch by hand instead:

```sh
dsh web --patch /path/to/dsh-canvas/cordis.patch.yml
```

Remove it with:

```sh
dsh plugin --profile <your profile> remove dsh-canvas
```

### What a successful install looks like

The host half scans the plugin into the client boot graph at startup. Boot once
and this row in the served page means it is wired up:

```json
{
  "id": "dsh-canvas",
  "url": "/plugins/??dsh-canvas/client.js&rev=...",
  "inject": ["@deepseek-ai/dsh-client-ui-conversation"]
}
```

It is ordered into the application combo directly after the package it declares a
dependency on.

## Using it

Open any session and pick **Canvas** from the tabs above the conversation.

| Action | How |
| --- | --- |
| Pan | Drag empty space |
| Zoom | Wheel (centred on the cursor), or `−` / `+` in the toolbar |
| Fit | "Fit" in the toolbar |
| Read a card | Click it — the right panel shows the full text, turn, step and seq |
| Select a card | `＋` on the card, or "Add to selection" in the detail panel |
| Search | The toolbar search box; "Dim others" / "Hide others" decides what happens to misses |
| Filter by role | Click a role chip; click again to exclude; "All" resets |
| Move a card | Drag it — positions are remembered per session |
| Clear | `Esc` |
| Export | From the tray: selection as Markdown with provenance, or the whole canvas as JSON |

## Card roles

The canvas classifies by *who contributed this*, not by the wire shape of the event.

| Role | What it is in the session |
| --- | --- |
| My intent | A message you sent |
| My choice | Steering — a correction you injected while the model was working |
| AI contribution | One assistant step (reasoning is kept aside, in the card detail) |
| Tool action | A tool call; the title is the tool name |
| Result | A turn tail |
| Context | Injected context and the system prompt |
| System | Compaction, retries, process folding |
| Error | Turn errors and token ceilings |
| Other | Event kinds the canvas does not recognise |

## The sample canvas

When there is nothing to draw (an empty session), the canvas offers a five-card
sample — a fictional neighbourhood reading-club sign-up page, from intent to
delivery. **Every word is invented**; no real transcript, name or file is
involved. The sample data is committed at
[`examples/sample-canvas.json`](examples/sample-canvas.json).

## Boundaries

- **Read-only.** The canvas reads the session snapshot. It does not write to the
  session, touch files, call a model, or make network requests.
- **It draws the loaded window only.** Like Chat and Trajectory, it reads the
  session window the client currently holds. Older history enters the canvas only
  once the conversation loads it — the canvas will not quietly fetch everything.
- **It is invisible to the model.** This is a browser-only plugin with an empty
  host half: it registers no Tool and writes no prompt text.
- **v0.1 cannot jump back to the conversation.** Reverse navigation is not built;
  use the turn / step / seq line to find the record yourself.
- **One stylesheet per page.** A second activation neither installs a second copy
  of the CSS nor takes ownership of the first one's.

## Where state lives

All of it, locally in the browser. Nothing is uploaded.

| Key | Contents |
| --- | --- |
| `dsh-canvas:view:<sessionId>` | Pan and zoom |
| `dsh-canvas:layout:<sessionId>` | Card positions you dragged |

Clearing those keys restores the default layout. When `localStorage` is
unavailable (private mode, full quota) the canvas still works; it just forgets.

## Why there is no build step

A DSH client bundle is not an ES module. It is
`window.__ModuleLoader__.load({ id, factory })` — a registered factory whose module
body materializes on first use — and `require` resolves React from the shell's
frozen module table. That format is perfectly writable by hand, so:

- `lib/client.js` **is** the source. No `src/`, no tsdown, no second artifact.
- Zero runtime dependencies: `dependencies`, `peerDependencies` and
  `devDependencies` are all empty.
- `pnpm add github:...` needs no `allowBuilds`, because there is no script to run.

The cost is that types come from JSDoc and tests rather than from a compiler. What
you get back is a repository anyone can clone, read, change and test.

## Development

```sh
node --test test/*.test.mjs     # contract tests
node scripts/smoke.mjs          # end to end: load, mount, render, export, compare the example
node scripts/smoke.mjs --write  # regenerate examples/sample-canvas.json after a change
```

The tests need no browser and no installs. `test/harness.mjs` runs the bundle in a
`node:vm` context that supplies `window`, `document` and `navigator`, then walks the
real render path with a stub React — function components are expanded and
`useEffect` runs once at mount. So "what did it register", "how many cards did it
render" and "does unloading leave a stylesheet behind" are asserted by actually
running the code, not by reading it.

`test/sanitize.test.mjs` is the publication gate: it scans every text file in the
tree and fails on a personal name, an absolute home path, a private domain, a
server address, or a credential-shaped string.

## Layout

```
lib/index.js          Host half (an empty shell — the row is what makes the bundle discoverable)
lib/client.js         Browser half: the canvas itself
cordis.patch.yml      Inserts one row into a profile
docs/ARCHITECTURE.md  The data contract: what it reads, from where, and why it classifies this way
examples/             Fictional example data
test/                 Contract tests plus the publication gate
scripts/smoke.mjs     Browser-free end-to-end self-check
```

## Compatibility and verification

Written and verified against the client slot contract of DeepSeek Harness
`0.1.2-rc.1`, desktop app `0.8.2`. It depends on one client service (`slots`);
`locale` is optional — without it the copy falls back to `navigator.language`.

Before publication this was verified in a **real boot**, against an isolated
`DSH_HOME` so no existing session was touched: the profile composed the canvas row,
the client module system scanned it into the boot graph, and `/plugins` served the
bundle from this repository. The row quoted under *What a successful install looks
like* is a transcript from that boot.

## License

[MIT](LICENSE). The repository contains a general implementation and fictional
examples only: no real session, transcript, customer information or credential.
