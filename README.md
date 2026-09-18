# Universal AI Workspace — Frontend (Day 1)

Day 1 scope only, per the build plan: a live, plain event feed in the browser
proving the pipeline `Bob Shell headless run → stream-json parsing → hash-chained
event log → WebSocket → browser`. No canvas yet — that's Day 2 (React Flow) and
the multiplayer layer (Yjs/Hocuspocus) after that. This app is structured so
Day 2 only adds a canvas view next to this feed, not a rewrite.

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev
```

Opens on http://localhost:3000. With `NEXT_PUBLIC_MOCK=1` (the default in
`.env.example`) it runs entirely against a built-in mock event generator, so
the UI is fully demoable before the backend WebSocket endpoint exists. Flip
`NEXT_PUBLIC_MOCK=0` and point `NEXT_PUBLIC_WORKSPACE_WS_URL` at the real
endpoint once it's up — no component changes needed, the mock and the real
socket feed the exact same code path.

## Deploy to GitHub Pages

The `main` branch deploys automatically through `.github/workflows/deploy-pages.yml`.
In the repository settings, open **Pages** and set **Source** to **GitHub Actions**.
After the workflow completes, the site is available at:

https://aashvarsha26.github.io/unfoldx_frontend/

## The contract with the backend

This is the part that has to match exactly for the two halves of the project
to integrate without a last-minute scramble. The canonical version is
[`schema/workspace-event.schema.json`](./schema/workspace-event.schema.json)
(language-agnostic — validate against it from FastAPI/Pydantic too); the
TypeScript mirror is [`lib/types.ts`](./lib/types.ts).

**Endpoint:** `GET {WORKSPACE_WS_URL}/{workspace_id}` upgraded to a WebSocket.
Every message the server sends is one `WorkspaceEvent` JSON object (not
batched — one event per frame). The frontend appends each one to the feed
and updates the budget strip in place; it does not currently send anything
back over this socket (task submission / control actions can go over REST
per the "Authorization checks" step in the architecture doc — flag if you'd
rather multiplex those over the same socket instead).

**`payload` shape per `event_type`** (the UI degrades gracefully — an
unrecognized field just doesn't render — but these are what it looks for):

| event_type | payload fields it reads |
|---|---|
| `provider_connected` | `provider`, `detail` |
| `task_submitted` | `summary` |
| `plan_decomposed` | `subtasks: string[]` |
| `route_decided` | `agent`, `reason` |
| `conflict_detected` | `detail` |
| `dispatch_started` | `command` |
| `log_line` | `line` |
| `budget_update` | `spent_usd`, `cap_usd` (also set top-level `cost_delta`/`tokens_delta` on the event itself, not inside payload) |
| `circuit_breaker_triggered` | none required — presence of the event trips the UI's red state for that provider |
| `handoff_emitted` | `decisions: string[]`, `constraints: string[]`, `rejected_approaches: string[]`, `files_touched: string[]` |
| `authorization_denied` | `detail` |
| `task_completed` | `summary` |
| `error` | `message` |

**`prev_hash` / `hash`**: the frontend doesn't verify the chain yet (that's a
Day 2/3 addition once the provenance layer is solid), it just displays the
first 8 characters of each event's `hash` as a visual anchor. Keep emitting
real hashes from day one anyway — retrofitting them later means re-deriving
history.

## What's deliberately not here yet

- No React Flow / canvas — Day 2.
- No Yjs/Hocuspocus multiplayer presence — after Day 2's single-viewer canvas is solid.
- No in-workspace role UI (view/control/approve) — stubbed as a flat feed for now; the socket already carries `agent_id`/`task_id` so routing control actions to the right scope later doesn't require a schema change.
- No task-submission form — Day 1 is read-only by design, to prove the pipeline before adding write paths.

## Canvas interactions (Day 2+)

- **Agent hub taskbar**: the hub is a movable bar pinned over the canvas. Each
  agent's logo sits on it — click a logo to drop that agent onto the canvas.
  Type a command and hit **Route** to have Bob decompose it; attach files first
  to hand them to the task.
- **Live preview**: the `PreviewWindow` floats over the canvas and renders the
  app the agents are producing in an iframe. Set the default target with
  `NEXT_PUBLIC_PREVIEW_URL`, and change it inline in the window's URL bar.
- **Attachments**: any agent node (and the hub itself) can take attached
  files/documents via the paperclip button — they persist on the node as chips
  and ride along with the next prompt/command. Purely in-memory until the
  backend REST layer lands.

## Stack

Next.js (App Router) + TypeScript + Tailwind, per the architecture doc.
IBM Plex Sans/Mono via `next/font/google` — no other runtime dependencies,
so `npm install` stays fast during the hackathon.
