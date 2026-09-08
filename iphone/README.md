# iPhone controller and voice

For Joel or another editor integration, start with [INTEGRATION.md](INTEGRATION.md): portable setup, pairing, and drawing/pan/orbit message contracts.

Phone motion, pointing/drawing/selection, HTTPS pairing, and continuous OpenAI Realtime audio over WebRTC. This project connects to either independent editor. Airspace Canvas is a standalone Mac app; there is no desktop design dashboard.

```sh
cd iphone
npm install
python3 launch.py --target excalidraw
# Or: python3 launch.py --target blender
```

Open Airspace Canvas and click Connect iPhone to start/reuse this service automatically, or launch the editors separately using their READMEs. The phone has Excalidraw and Blender buttons; switching stops the current edit and voice session, then connects pointing to that editor. Tap Start live voice again after switching. Open http://127.0.0.1:3002 on the Mac and scan the QR with the iPhone camera. In Safari, tap Enable motion, allow motion access, aim at the screen, and tap Recenter. Start live voice requests microphone access and opens a WebRTC connection. Stop live voice releases the mic and connection. Backgrounding ends voice and releases held drawing gestures.

The controller uses ports 3002 and 4310. Excalidraw uses port 3000; native Blender uses port 4311. OPENAI_API_KEY is injected only into the Node bridge through hsec and never returned to the browser. Pairing tokens in the URL fragment authorize phone requests. Local bootstrap is blocked over the tunnel.

Voice uses gpt-realtime with Marin. Its edit_workspace function delegates scene inspection/editing to gpt-6-astra using live pointer/selection state. Incoming speech interrupts playback through Realtime VAD. Backchannels do not cancel drawing; a new edit request or explicit Stop cancels/replaces the active Astra request. Completed edits remain undoable; the next request reads the latest scene. No browser SpeechRecognition or speechSynthesis fallback.

REALTIME_MODEL and AIRSPACE_MODEL can override model names explicitly. Keep runtime/ private and untracked. runtime/bin/cloudflared supplies the temporary HTTPS tunnel; its address changes after restart.

Checks: npm run check, npm run build, and node --check native/server.mjs. Live API accepted the Realtime configuration. A real WebRTC microphone connection reached Listening in Chrome and Stop live voice released it. Both editors passed actual geometry gesture and undo tests. Physical iPhone motion, playback and interruption still require your device tryout.

Reference: [OpenAI Realtime WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc).

The phone now has Select/Draw/Lasso/Pan (Orbit in Blender), an integrated touchpad with tap-to-select, explicit Fit View, and sensitivity/connection diagnostics under Pointer settings. Pointer messages are paced to 60 Hz while preserving down/up ordering. Closing or backgrounding releases held gestures. The desktop canvas receives input in preference to a forgotten browser tab.


Partner responsiveness: Realtime acknowledges the intended change before its edit tool. The tool streams confirmed progress to optional spoken updates while Astra is still working. Speech and drawing have separate cancellation lifetimes. Realtime forwards its understanding of the original audio. The auxiliary transcript is displayed but cannot overwrite the edit request. Voice output is instructed to stay in English and discuss the actual objects and design.

Astra Responses stream completed tool calls immediately; no partial JSON is executed. Compact scene context omits persistence bookkeeping. Fresh context is supplied once per request. The general canvas tool remains available; a graph-layout helper uses Dagre for legible editable diagrams. Every edit is revision checked, and new graph nodes do not erase existing work.

Validation: `node tests/partner.mjs` tests streaming boundaries, cancellation and voice event ordering. `tests/partner-live.mjs` and `tests/voice-live.mjs` are explicit live API benchmarks using an isolated validation canvas at port 3010 and test bridge 4312; run them from this folder with the existing key injected through hsec. They never operate on the native app's drawing. Results are in `validation/`. The voice benchmark uses text input and real generated audio, so physical iPhone microphone, playback and Wi-Fi still require a device check.

Edits require a receipt from the editor after rendering. Missing receipts cannot produce a successful completion. New objects outside the current viewport are revealed, and pairing closes when the phone connects. During pending work, brief spoken updates use confirmed objects, positions and connections; completion is based on the tool outcome. Completed response streams release transport cleanup asynchronously so cleanup cannot delay later edits or checks.

Voice Undo uses a dedicated editor transaction, preserving unrelated later manual changes. If later work conflicts with the same properties, it refuses to overwrite those changes. Corrections automatically replace the pending edit; explicit Stop halts it. See [latest hands-on validation](VALIDATION.md) for actual audio-driven correction, Stop, Undo and narration checks.
