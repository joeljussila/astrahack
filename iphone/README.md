# iPhone controller and voice

Phone motion, pointing/drawing/selection, HTTPS pairing, and continuous OpenAI Realtime audio over WebRTC. This project connects to either independent editor. There is no desktop design dashboard.

```sh
cd iphone
npm install
python3 launch.py --target excalidraw
# Or: python3 launch.py --target blender
```

Launch the chosen editor separately using its README. Open http://127.0.0.1:3002 on the Mac and scan the QR with the iPhone camera. In Safari, tap Enable motion, allow motion access, aim at the screen, and tap Recenter. Start live voice requests microphone access and opens a WebRTC connection. Stop live voice releases the mic and connection. Backgrounding ends voice and releases held drawing gestures.

The controller uses ports 3002 and 4310. Excalidraw uses port 3000; native Blender uses port 4311. OPENAI_API_KEY is injected only into the Node bridge through hsec and never returned to the browser. Pairing tokens in the URL fragment authorize phone requests. Local bootstrap is blocked over the tunnel.

Voice uses gpt-realtime with Marin. Its edit_workspace function delegates scene inspection/editing to gpt-6-astra using live pointer/selection state. Incoming speech interrupts playback through Realtime VAD and cancels active Astra work. Completed edits remain undoable; the next request reads the latest scene. No browser SpeechRecognition or speechSynthesis fallback.

REALTIME_MODEL and AIRSPACE_MODEL can override model names explicitly. Keep runtime/ private and untracked. runtime/bin/cloudflared supplies the temporary HTTPS tunnel; its address changes after restart.

Checks: npm run check, npm run build, and node --check native/server.mjs. Live API accepted the Realtime configuration. Physical iPhone mic, playback, motion and interruption still require a device test.

Reference: [OpenAI Realtime WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc).
