# Local prototype status

Snapshot transcribed from the local Airspace README and validation notes on September 8, 2026. These checks were recorded by earlier work and have not been rerun for this documentation upload. The implementation is not included here.

## Recorded integration checks

The local notes report a fresh implementation after the rehearsal was deleted, with a shared iPhone controller, real Excalidraw canvas and native Blender workspace.

They record passing compilation/build, motion-math checks, authenticated pairing, Excalidraw drawing/selection/undo, and Blender drawing/orbit/raycast selection. Blender checks also covered general Python execution, stale-revision rejection, rollback, request-level undo and viewport inspection.

## Recorded Astra edits

- **Excalidraw:** Astra added a routed Test → Sketch feedback arrow labeled Iterate, inspected the canvas and preserved existing element IDs, positions and sizes. The recorded request took 20.565 seconds.
- **Blender:** Astra changed the selected chair upholstery to mustard yellow and added four named lamp components. It inspected the viewport and preserved pre-existing object positions, dimensions and other material assignments. The recorded request took 27.157 seconds.

The notes report successful Astra authentication and Astra as the active provider at that time. These are two individual runs, not latency guarantees or an end-to-end demo validation.

## Still open

- Physical iPhone sensor permission, calibration feel, drift and reconnection.
- Physical microphone and spoken-reply behavior.
- Broader Astra quality and latency testing.
- Realtime audio and actual mid-turn Astra steering, which the notes say are not implemented. Current voice uses browser dictation and optional speech synthesis.

The [rehearsal lessons](REHEARSAL_LEARNINGS.md) describe earlier non-Astra measurements and should remain separate from these event-build observations.
