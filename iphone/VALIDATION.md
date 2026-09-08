# Hands-on fixes verified — September 8, 2026

These checks used the installed Airspace Canvas app, the production controller/bridge, real OpenAI Realtime audio, and Astra. Test speech was synthesized with macOS Samantha and streamed into Realtime. Phone messages used the actual WebSocket protocol. Physical iPhone motion, microphone, speaker and Wi-Fi remain a separate device check.

- **Mid-edit correction:** interrupted “three GPU racks” with “actually, only two.” Realtime automatically submitted the replacement request, stopped the previous run, and created exactly Backend server, GPU rack 1 and GPU rack 2. No second prompt was required. Replacement started 4.8 seconds after the first request; the corrected result completed 26.4 seconds after the first request.
- **Explicit Stop:** interrupted a larger eight-rack request. Editing halted without automatically restarting.
- **Real Undo:** the dedicated undo tool restored all 25 original objects. A separate test drew a manual line after stopping the agent, then undid the agent edit. Geometry and styles matched the original, original stacking order was preserved, and the manual stroke was byte-identical. One internal fractional index was renumbered to coexist with that stroke.
- **Questions during work:** a spoken whiteboard question was answered while the table edit continued.
- **Grounded narration:** the six-chair round-table request visibly applied after 10.70 seconds and completed after 15.14 seconds. Speech said “The changes to the round table and six chairs are visible now,” then confirmed completion. It did not invent four chairs per side or speak prompt instructions.
- **Native File Open:** changed the macOS picker from a sheet to a standalone dialog. Open became enabled; selecting the saved meeting-room document loaded exactly 25 objects, including eight chairs. The native window title and represented file URL matched the selected document.
- **Regression checks:** collaboration, streamed partner and rendered-receipt suites passed; both projects typechecked; controller production build and native app packaging passed. Installed app contains the real undo implementation.

Evidence: `validation/fixed-hands-on/`, `validation/fixed-correction/`, and `validation/fixed-narration/`. `validation/fixed-correction/manual-undo-verification.json` contains the exact scene comparison. The earlier failure report in `validation/hands-on/REPORT.md` is retained as historical evidence and is superseded by these checks.

# Earlier voice and visible-edit verification — September 8, 2026

- Installed native app: a real request created Browser → API → GPU workers. The editor returned a rendered/applied receipt for 8 elements; the visible native window was inspected. That run exposed a stream-cleanup delay, subsequently fixed.
- Updated running native service: renaming Browser to Browser client rendered in 2.40 seconds and completed in 12.07 seconds, with the exact saved labels read back.
- After the stream fix, the live Realtime + Astra + isolated browser-renderer test completed in 14.46 seconds. First generated audio: 1.47 seconds; first visible edit: 5.42 seconds; design work finished: 11.83 seconds. A spoken update at 8.75 seconds described the backend and three GPU racks while work was pending. Final speech followed completion. All observed speech was English and referred to diagram content.
- The benchmark uses text input with real generated audio, not an iPhone microphone. Physical phone audio quality, ambient-noise recognition and interruption still need a device tryout.
- Missing-render-receipt test passed: no successful outcome or forwarded model success claim when the editor has not confirmed rendering.
- Stream test passed with a transport whose cancellation promise never resolves. Completed responses no longer wait for transport cleanup.
- Existing streamed-tool, cancellation, voice-backchannel and completion-order tests passed. Controller typecheck and production build passed.

## Earlier checks (historical)

- Controller TypeScript and production build passed.
- Standalone Excalidraw production build and local bootstrap guards passed.
- Live Realtime API accepted gpt-realtime, Marin, VAD, transcription and edit/stop tools.
- Live integration passed: Realtime called edit_workspace, Astra inspected the actual existing Excalidraw diagram without changes, Realtime produced a spoken answer (441600 audio bytes received in the test).
- A real browser WebRTC session also reached Listening in Chrome through the secure phone URL, with one-time microphone permission. Stop live voice returned Voice off. Physical iPhone motion/playback/interruption are still pending.
- Post-split gesture tests passed: Excalidraw editable freehand/lasso/undo; Blender editable3Dcurve/undo/orbit/raycast selection. Original element/object counts restored.
- Phone editor switching to Excalidraw verified through the live UI; no app restart needed.
- Voice lifecycle checks passed for interrupted tool responses, request cancellation and microphone cleanup.
- Secure tunnel bootstrap returned403; unauthenticated voice access returned403; local bootstrap returned200.
- Saved Excalidraw scene retained its13elements. Native Blender project owns the saved15object scene.
- No custom desktop dashboard remains. Phone setup is at localhost3002; Excalidraw at localhost3000; Blender is a native window.

Earlier Astra edit checks passed before the split: Excalidraw feedback loop in about21seconds; Blender upholstery+floorlamp edit in about27seconds. These are historical measurements, not new post-split edit tests.
