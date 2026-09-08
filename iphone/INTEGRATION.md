# Integrating the phone controller

This repository contains the complete phone UI, motion processing, pairing/WebSocket bridge, and optional voice/editing service. Connect your own editor as a host. The existing Excalidraw app and Blender add-on are separate projects, not dependencies bundled here.

## Run on another Mac

Use Node 22.13+ and run `npm ci`. In two terminals in this repository:

```sh
npm run dev
```

```sh
TARGET=excalidraw node native/server.mjs
```

Motion, touchpad and drawing messages do not need an API key. For voice/editing, supply `OPENAI_API_KEY` to the bridge process through your own secret manager. `launch.py` is Touko's convenience launcher and expects his local hsec setup.

For an iPhone, run Cloudflare's `cloudflared tunnel --url http://127.0.0.1:4310` in a third terminal. Save the HTTPS address it prints as the sole line in `runtime/public-url.txt`. Open http://127.0.0.1:3002 on the Mac and scan the QR. Keep both servers and the tunnel running. The URL changes after a tunnel restart. The Vite configuration permits temporary `*.trycloudflare.com` hosts; configure it explicitly if using a different hostname.

On Safari, tap Enable motion, allow access, aim comfortably, and Recenter. Draw/Lasso/Pan use a held gesture; Select supports pointing and touchpad taps. Blender labels Pan as Orbit. Sensitivity and touchpad fallback are under Pointer settings. Orientation changes reset calibration. Motion is projected into a normalized 2D pointer; raw attitude/quaternions are not sent to the editor. Orbit is an editor interpretation of pointer movement while held.

## Attach an editor

From a trusted local backend/native process, POST `{"command":"bootstrap"}` to `http://127.0.0.1:4310/local`. This endpoint intentionally rejects browser Origin and tunneled requests. For a browser editor, use a loopback-only proxy with origin checks, following `vite.config.ts`; do not expose bootstrap publicly.

The response provides `id`, host `token`, `socketUrl` and `phoneUrl`. Connect to `socketUrl` and send:

```js
socket.send(JSON.stringify({type: 'join', id, token}));
```

Use `client: 'desktop'` in the join message for a native host. Desktop hosts take priority over browser hosts. A host can send `{type: 'claim-canvas'}` when focused. The bridge routes canvas gestures to one selected host. Keep the phone in Excalidraw (`canvas`) mode when integrating a custom WebSocket editor, including a custom 3D editor. Blender (`studio`) mode instead calls the separate Blender HTTP adapter on port 4311.

Handle these incoming messages:

| Message | Editor behavior |
| --- | --- |
| `joined` / `state` with `state` | Synchronize current tool and connection state. |
| `pointer` with `x`, `y`, `color` | Move cursor; when held, extend the active gesture. Coordinates are clamped to 0–1 across the viewport. |
| `down` with `tool`, `point: {x,y}`, `color` | Begin selection/drawing/lasso/pan-orbit at the supplied position. |
| `up` | End the current gesture. Safe to receive without a prior down. |
| `tool` with `tool` | Tool values: `point`, `draw`, `lasso`, `orbit`. |
| `undo-canvas` | Undo a manual editor transaction. |
| `fit-canvas` | Fit the view to content. |
| `disconnected` | Release any held gesture. Also do this on socket close. |

Map normalized coordinates through your viewport bounds and camera transform. In a 2D editor, `orbit` pans; in a 3D editor it can rotate the view using pointer deltas. The phone paces motion messages to 60 Hz and flushes the latest pointer before down/up. Preserve message order and release held gestures when the connection drops.

## Optional AI editing

The bridge sends `{type: 'canvas', id, command}` to the selected host. Reply with `{type: 'canvas-result', id, result}` or `{type: 'canvas-result', id, error}`. Commands include `inspect`, `image`, `edit`, and `undo_agent`; consult `native/server.mjs` and `native/model.mjs` for the current command payloads. The existing AI tools assume an Excalidraw scene schema; adapt those tools and scene context for another editor. A generic pointer integration does not need to implement AI editing.

Edits must return a renderer receipt after application; the model cannot report a successful edit without it. Keep host and phone credentials separate. Never commit `runtime/`, session tokens, API keys, or paired URLs.

## Checks

```sh
npm run check
npm run build
node --check native/server.mjs
node tests/motion.mjs
node tests/partner.mjs
node tests/canvas-routing.mjs
node tests/receipts.mjs
```

These run without live API calls or an editor. `tests/collaboration.mjs` additionally needs the sibling Excalidraw project's `agent-history.ts`. Other integration, renderer, hands-on and live tests require their editor/device/API fixtures; inspect their setup before running them. Local validation recordings and generated reports are excluded from Git. See `VALIDATION.md` for prior test observations; a physical iPhone motion/microphone/playback trial remains necessary.
