# Contributing

Small repository, three rules.

## 1. No build step, no dependencies

`lib/client.js` is both the source and the shipped artifact. Do not add a bundler, a
TypeScript compiler, or a runtime dependency — the value of this repository is that
`git clone` is enough to read, change and test it. Types belong in JSDoc comments;
behaviour belongs in tests.

If you genuinely need a module the shell does not expose, you need
`dsh.client.external`, and that means adding a row to the profile's module graph.
Open an issue before writing that code.

## 2. Every behaviour change comes with a test that would fail without it

```sh
node --test test/*.test.mjs
node scripts/smoke.mjs
```

There are two layers, and a change belongs in whichever one can actually catch its
regression.

`test/harness.mjs` runs the bundle in a `node:vm` context with a stub `window`/`document`
and a stub React that expands function components and runs `useEffect` once at mount. Use
it for the registration, the tree shape, the data projection, and teardown — it is fast and
needs nothing installed.

`test/interactive.test.mjs` runs the same bundle on real React, real `react-dom` and jsdom
with real events. Use it for anything about *interaction*: state that a click must move,
a ref a drag must write, a clamp a wheel must respect, re-render behavior. It borrows React
and jsdom from a DSH installation on the machine and skips when there is none, so a
regression it covers can reach CI undetected — run it locally before pushing.

If you change the sample canvas, regenerate the fixture:

```sh
node scripts/smoke.mjs --write
```

The smoke check fails when `examples/sample-canvas.json` is stale, so CI catches a
forgotten regeneration.

## 3. Nothing private ships

`test/sanitize.test.mjs` scans every text file for a personal name, an absolute home
path, a private domain, a server address, an email address, and credential-shaped
strings. It runs in CI. Do not weaken it to make a change pass — and never put a real
session, transcript or attachment into an example, a test fixture, or a screenshot.

If a marker is genuinely needed in the repository (for instance inside the scanner
itself), add the file to the scanner's skip list deliberately and say why in the
diff. The scanner is the only file currently skipped.

## Reporting a contract change

The canvas reads a specific client contract: the `conversation.view` list slot, the
`useChat` standard prop, and the `ChatNode` shape (`kind`, `anchorSeq`, `location`,
`data`). `docs/ARCHITECTURE.md` documents what is relied on and why.

If a DSH upgrade changes any of it, the failure should be loud rather than silent.
Open an issue with the DSH version, what changed, and the output of
`node --test test/*.test.mjs` — the harness is built to show which link broke.

## Style

- Plain JavaScript, two-space tabs, no semicolons at end of line, double quotes.
- Comment the *reason*, not the mechanics: a comment should say why this shape and
  not the obvious alternative.
- Keep the role taxonomy coarse. A new wire event usually belongs to an existing
  role, not to a new one.
