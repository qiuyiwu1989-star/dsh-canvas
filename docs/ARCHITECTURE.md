# Architecture

How the canvas gets its data, and why it is shaped the way it is.

## The two halves

| Half | File | What it does |
| --- | --- | --- |
| Host | `lib/index.js` | Nothing. `apply()` is empty. |
| Browser | `lib/client.js` | Registers one conversation view and renders the canvas. |

An empty host half looks like dead weight until you know how bundles are discovered:
the client module system scans **the Loader entries** of the running host tree for
packages declaring `dsh.client`. A package with a browser half but no mounted row
ships a bundle nothing ever requests. So `cordis.patch.yml` inserts one row whose
only job is to be mounted, and `exports["./client"]` carries the code.

That also means the host row needs no configuration. Row config reaches the host
`apply(ctx, config)` but not the browser `apply(ctx)`, so a `config:` block here
would read like a knob and behave like a comment. Canvas preferences live in the
browser instead — see *Local state* below.

## The registration

```js
ctx.slots.inject("conversation.view", () =>
  ctx.slots.register(
    {
      name: "conversation.view",
      id: "canvas",
      order: 30,
      label: () => t("view.canvas"),
      inject: () => ({ canvasT: t, canvasLocale }),
    },
    CanvasView,
  ),
)
```

`conversation.view` is the list slot that holds the conversation tabs. `chat` sits
at order 0, `trajectory` at 10, `graph` at 20; the canvas is 30.

`ctx.slots.inject` is the declaration-aware wait: the callback runs immediately when
the slot already exists and otherwise runs when the declaring `register()` commits,
and the returned controller belongs to the caller's fiber, so unloading the plugin
cancels a pending wait and removes an active contribution.

`label` is a thunk rather than a string, so it is re-read on every projection and
follows a language switch without re-registering.

### Why the component is wrapped

`CanvasView` picks between two components based on whether the `useChat` prop
exists:

```js
function CanvasView(props) {
  if (typeof props.useChat === "function") return h(LiveCanvas, props)
  return h(CanvasStage, { ...props, cards: [] })
}
```

`useChat` is a hook, and hooks cannot be called conditionally. Whether a Chat target
supplies the hook is fixed for the lifetime of the registration, so switching at the
component boundary keeps the hook order stable underneath React. If the hook ever
did appear or disappear, React would unmount one component type and mount the other,
which is exactly the behaviour we want and cannot produce a hook-order violation.

## Where the data comes from

The view receives the session's standard props, including `useChat`, a
`SnapshotSelectorHook<ChatSnapshot>` provided by the Chat target through
`ctx.uiSession.provide`. Subscribing is also what activates the target, so the canvas
gets a live snapshot without asking for anything else.

The selector returns the snapshot itself and the node list is derived in a
`useMemo`. Selecting `snapshot.nodes.values()` directly would build a fresh array on
every store read, which is the classic way to make `useSyncExternalStore` loop.

### The Chat node contract this reads

```ts
interface ChatNode {
  key: string
  kind: string        // user | steering | assistant-step | tool-call | context | ...
  anchorSeq: number   // monotonic sequence of the record behind this node
  location: { kind: string; turn?: number; step?: number }
  visibility: "visible" | string
  data: unknown       // kind-specific payload
}
```

`anchorSeq` is the provenance: every card keeps it, the canvas sorts on
`(turn, seq)`, and the detail panel and both exports show it. That is what makes a
card *traceable* rather than merely pretty.

Payload shapes the canvas reads:

| Kind | `data` | Read as |
| --- | --- | --- |
| `user`, `steering` | `{ content: Array<{ type: "text"; text } \| { type: "image" }> }` | Visible text; images become a placeholder |
| `assistant-step` | `{ status, turn, step, blocks: Array<{ kind: "text" \| "reasoning" \| "image" \| "tool-call", text? }> }` | `text` blocks are the body; `reasoning` blocks are kept separate |
| `tool-call` | `{ root: { callId, name, argsRaw, kind? } }` | `name` is the card title, `argsRaw` the body. A root **without** a `kind` has not settled yet, so the card reads as running |
| anything else | unknown | A bounded text projection, plus the role label as a title |

### Why the text projection is whitelisted

`collectText` descends only into `text`, `content`, `summary`, `message`, `title`,
`argsRaw`, `blocks`, `items`, at most three levels deep, at most 32 array elements
per level and a fixed character budget. Node payloads contain live objects —
attachments, tool lifecycles — and a generic deep walk would end up rendering or
copying runtime state instead of the text a reader asked for. Depth, breadth and
volume are all bounded so that one pathological node cannot stall a render.

## Roles

```js
const ROLE_OF_KIND = {
  user: "intent", steering: "choice", "assistant-step": "ai",
  "tool-call": "action", "workflow-run": "action", command: "action",
  "command-input": "action", context: "context", "system-prompt": "context",
  compaction: "system", "manual-compaction": "system", "model-retry": "system",
  "turn-process": "system", "turn-tail": "result",
  "turn-error": "error", "turn-max-tokens": "error",
}
```

The taxonomy answers "who contributed this", which is the question a session map has
to answer. It is deliberately coarser than the wire: `compaction`,
`manual-compaction`, `model-retry` and `turn-process` are four different events but
one thing to a reader — the machinery around the conversation. Unknown kinds fall
back to `other` rather than being dropped, so a new event type shows up on the
canvas the day it ships instead of vanishing silently.

## Layout

`layoutCards` places one column per turn and stacks within a turn in `anchorSeq`
order — deterministic, so an unchanged session always draws the same picture. Column
and row widths are constants; the card box is fixed so the wire endpoints land where
the drawn box ends.

Wires are a single chain across the visible cards: solid within a turn, dashed
across a turn boundary. The SVG layer is oversized and `overflow: visible`, the same
trick the original prototype used, so a deep canvas does not clip its arcs.

## Local state

| Key | Contents |
| --- | --- |
| `dsh-canvas:view:<sessionId>` | Pan and zoom |
| `dsh-canvas:layout:<sessionId>` | Card positions the user dragged |

Both are per session, so switching sessions does not carry a viewport across. Every
access is wrapped: `localStorage` throws in private mode and when the quota is full,
and a canvas that cannot remember where it was is still a working canvas.

## Styles

The stylesheet is one template literal inlined in the bundle and installed once by
`ctx.effect`, so unloading the plugin removes it. Ownership is tracked in a
module-level variable rather than on the DOM node: if a second activation merely
marked the existing tag as "not mine", unloading the first would strand the tag and
unloading the second would strip styles the first still needed.

Every surface colour is a published theme token (`--dsw-alias-bg-layer-1`,
`--dsw-alias-label-primary`, …) so light and dark follow the shell. Role accents are
the one exception: a map needs more distinguishable hues than the alias set carries,
so they are mid-tone literals that read on either ground, applied per card through a
`--role` custom property.

## Boundaries, restated as decisions

- **No host tools, no prompt text.** The canvas is presentation. Giving the model a
  way to read the canvas would make a rendering plugin part of the model's context
  budget for no benefit the session itself does not already provide.
- **Loaded window only.** Reading more history would mean the plugin fetching on its
  own, which would make scroll position and load state ambiguous between two
  consumers of the same session.
- **No reverse navigation in v0.1.** `openView` exists in the view-ring owner props
  and is the right mechanism for "jump to this record in Chat"; it is deferred rather
  than half-built, and the seq line covers the need meanwhile.
- **The sample is fictional and self-labelled.** A demo is the easiest place to leak
  a real session into a public repository, so the sample is invented, marked
  `sample: true` on every card, says so in the badge and in the detail panel, and is
  covered by the publication gate.
