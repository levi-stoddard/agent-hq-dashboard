# Agent HQ dashboard

This is a browser-based 3D headquarters for a team of AI agents, plus a plain 2D dashboard with the same information. Each agent has a workstation in a three.js scene; the desks, the wall board and a central briefing table show what each agent is working on, what is waiting for an owner's decision, and which local services are up.

It is a cleaned-up public copy of a private project I built, published without its history. The private product, the real records and the private helper modules are not included. Everything you see here runs on small fictional sample data for "Acme Widgets", the same made-up team I use in [engineering-hq](https://github.com/levi-stoddard/engineering-hq), which ships fictional thermostat firmware.

Related repositories:

- [engineering-hq](https://github.com/levi-stoddard/engineering-hq): the public engineering headquarters framework
- [agent-hq-gateway](https://github.com/levi-stoddard/agent-hq-gateway): the backend gateway the owner desks link to
- [agent-hq-unreal](https://github.com/levi-stoddard/agent-hq-unreal): the same room built in Unreal Engine
- [agent-status-board](https://github.com/levi-stoddard/agent-status-board): the owners' Status Board
- [agent-hq-dashboard](https://github.com/levi-stoddard/agent-hq-dashboard): this repository

## What it does

- `public/prototype3d.html` is the 3D headquarters: nine agent workstations around a round room (Orchestrator, Analyst, Performance, Verification, Integration, Implementer, Requirements, Reviewer, Quality), two AI engineer desks (Claude and Gemini), a shared owner desk for Owner A and Owner B, a Command Board wall, a briefing table with a product hologram, and a Simulation Vault table. Click a desk, the board or the table to open its panel. Name tags show each agent's health and activity as read from the API.
- `public/index.html` is the 2D dashboard: a 2.5D floor plan, team cards, a meetings panel with fixed template answers, lessons, owner preferences, the event timeline, a daily briefing and a Kanban view of the Command Board.
- `server.js` is a single-file Node.js server with no npm dependencies. It serves `public/` and a JSON API.

## How to run

You need Node.js 18 or later. There is nothing to install.

```
node server.js
```

Then open http://127.0.0.1:8765/ for the 2D dashboard or http://127.0.0.1:8765/prototype3d.html for the 3D headquarters.

Useful URL parameters on the 3D page: `?liveFixture=1` plays a short fictional event log as speech bubbles, `?demo=1` fills an empty Command Board with demo cards, `?view=reviewer` (or any desk id) jumps the camera, `?dossier=analyst` opens a desk panel, `?table=system` opens the briefing table, and `?mode=BOARD_REVIEW` sends some agents to the board.

## Tests

```
npm test
```

This runs `test/smoke.test.js` with Node's built-in test runner. It starts the server, checks both pages, the main API routes, the path-traversal guard, the locked write routes and the stub security gate, and then stops the server. Port 8765 must be free. The private original had no automated tests; I wrote this smoke test for the public copy.

## Configuration

The server reads these environment variables. All are optional; `.env.example` lists them with empty values. The server does not load `.env` files itself, so export them before you start it.

| Variable | Default | Purpose |
|---|---|---|
| `HQ_WRITE_SESSION_TOKEN` | empty (writes locked) | Unlocks `POST /api/jobs` and `POST /api/sync/reconcile`. There is no built-in value: if you want those routes, generate a long random token yourself. |
| `AHQ_STATE_DIR` | `sample-state/` | Folder with the JSON state files. |
| `AHQ_SUPERVISOR_STATE_FILE` | `sample-state/launcher_state.json` (not shipped) | Optional supervisor state shown by Mission Control. |
| `AHQ_SIM_VAULT_PORT`, `AHQ_CALIBRATION_PORT`, `AHQ_VAULT_RUNTIME_PORT` | 8780, 8770, 8771 | Loopback ports Mission Control probes for the companion services. |

The pages read an optional `public/hq-config.local.js` (gitignored). Copy `public/hq-config.example.js` to start one. It sets the Status Board URL, the gateway address, the Simulation Vault address and an optional remote host. Without it, the Status Board link and the Simulation Vault table say "not configured" and the gateway links use `http://127.0.0.1:8892`.

## API

All routes are on `127.0.0.1:8765`.

- `GET /api/worker`, `/api/agents`, `/api/events`, `/api/debates`, `/api/lessons`, `/api/regression/run`, `/api/briefing`, `/api/jobs`, `/api/mission-control`, `/api/owner/preferences`, `/api/state`
- `POST /api/jobs` and `/api/sync/reconcile` (locked unless `HQ_WRITE_SESSION_TOKEN` is set and sent as `owner_auth_token` or the `X-Owner-Auth` header)
- `POST /api/owner/preferences`, `/api/owner/action/request`, `/api/owner/authorize`, `/api/owner/action/execute`, `/api/emergency/freeze`, `/api/emergency/unfreeze`, `/api/meetings/query`, `/api/lessons/rollback`

## Security model

This is what the code does, not more:

- It listens on `127.0.0.1` only.
- Static serving rejects `..`, null bytes and encoded dots, and resolves every path inside `public/`.
- CORS allows only `http://127.0.0.1:8765`. A `POST` whose `Origin` or `Referer` points somewhere else gets a 403. A request that sends neither header is allowed through.
- `/api/state`, `/api/events` and `/api/lessons` pass their JSON through a redaction step that masks string values under keys such as `secret`, `token`, `password`, `api_key`, `signature` and `nonce`.
- User-supplied strings that get stored or echoed are HTML-escaped.
- Owner approval is delegated to a security-gate module. In this public copy that module is a stub that refuses every protected action.

## What is stubbed or left out

- **Helper modules.** The private server loaded metrics, events, lessons, debates, briefing, security-gate and Command Board modules from a parent folder. Here they are replaced by small stubs in `lib/stubs/`, each marked at the top as standing in for a private module. They read the fictional files in `sample-state/` and never authorize anything.
- **Data.** All records (agents, jobs, events, lessons, briefing table, AI engineer desks, station list, the live-event fixture) are fictional Acme Widgets samples with the same shape as the originals.
- **The private product.** The original briefing table showed the private product. I rewrote that module (`public/briefing_table.js`) to show a schematic thermostat built from primitives instead.
- **Character models.** The private project used third-party character models and animation clips whose redistribution licence I could not confirm, so they are not included. The agents are simple mannequins built from three.js primitives. See `THIRD_PARTY.md`.
- **Companion services.** The Status Board, the gateway, the Simulation Vault and the approval console are separate projects. This dashboard only links to them or probes them.
- **Screenshots, video and internal notes** from the private repository are not included.

## Known limitations

- The host and the main port (8765) are constants at the top of `server.js`.
- Health, activity and effectiveness values come from the stub modules, so they are labelled as sample data.
- The meetings panel answers with fixed templates, not a model.
- `POST /api/owner/preferences` writes to the preferences file in the state folder (by default `sample-state/owner_preferences.json`).

## License

MIT, see `LICENSE`. Written by Levi Stoddard. three.js is included under its own MIT licence (see `THIRD_PARTY.md`).
