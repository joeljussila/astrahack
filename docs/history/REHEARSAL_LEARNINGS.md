# What the rehearsal taught us

September 8, 2026. Ideas and observations retained after deleting the entire rehearsal implementation, dependencies, generated scenes, screenshots, logs and build artifacts. Rebuild the submission during the hackathon.

## The promising idea

A conversational 3D design partner: point with your phone, say “this,” and work with Astra on the actual editable Blender scene. The interesting moment is shared spatial understanding plus useful design reasoning. A phone cursor alone is a controller; voice-to-Python alone is a familiar agent demo.

Keep general Blender Python execution. Do not constrain the model to a small menu such as “move wall” or “add chair.” It should be able to create and edit arbitrary scene geometry, materials, modifiers, cameras and other Blender content. The app supplies reliable interaction and execution, while the model chooses how to make the requested change.

## What we actually observed

All model measurements below used Claude Sonnet 5, not Astra. These are individual local runs, not reliable latency guarantees.

| Test | Result |
| --- | --- |
| Initial broad request with default model settings | Reached its output allowance after 88.9 seconds without executing code. Thinking consumed the available output budget. |
| Courtyard-house construction with faster settings | First geometry after 14.6 seconds; 87 objects after 54.6 seconds. Still incomplete: no sofa and no visual review before the step limit. |
| Separate completion and visual correction pass | 61.6 seconds, including a Python error, repair and repeated viewport inspection. Finished with 92 objects. |
| Point at a glass panel and change only its material | First edit after 2.7 seconds; final response after 12.6 seconds, including two visual checks and a color adjustment. |
| Successful Blender construction/material batches | Approximately 24–68 milliseconds, including checkpoint overhead. |
| Local pointer command test | Latest run: 19 ms median, 22 ms p95 across 20 sequential commands. |
| Secure WebSocket relay test | 36–65 ms round trips across the observed runs. |
| Direct browser peer connection | About 2–3 ms on the same Mac. This does not predict phone performance. |

The initial timer incorrectly counted material initialization as a visible edit. The 14.6-second construction figure above is corrected to the first actual geometry. Measure first meaningful visible result, completion and input-to-screen latency separately.

Verified: general Python execution, actual viewport inspection by the model, error repair, real ray selection, projected lasso selection, orbit, stale-revision rejection, rollback, undo and typed phone-to-model requests.

**Not verified:** physical iPhone motion, drift, calibration feel, microphone permissions, conversational audio or Astra performance. Browser dictation existed in the UI; a full realtime voice experience did not.

## Best build approach today

1. **Prove the phone first, on the physical iPhone.** A secure page, one permission button, Recenter and a large hold button. Move a visible pointer in the real viewport. Test wrist movement, drift, pauses and reconnection before adding model work. Keep a touchpad fallback.
2. **Use one live Blender process as the 3D workspace.** Native viewport rendering handles live movement. Do not generate a rendered image for every pointer movement or create a second web-based scene that must stay synchronized.
3. **Start with an authenticated WebSocket connection.** It is enough to evaluate interaction. Add a direct WebRTC path only if measured phone latency justifies the complexity. The rehearsal eventually supported both, but pairing, signaling and development reloads consumed time.
4. **Give Astra general Python execution, scene inspection and viewport inspection.** Run Blender operations on its main thread. Keep executions short. Ask for one coherent first pass, then inspect and correct; avoid spending separate model turns defining helpers and materials before anything appears.
5. **Ground references in real objects.** Raycast the pointer into the scene; pass object identity, selection and hit position with the request. Keep pointer motion deterministic and immediate. The model interprets intent after a gesture; it does not generate cursor coordinates frame by frame.
6. **Make recovery dependable.** Checkpoint before edits and restore after failures. Reject stale results. Aim for one Undo per user request, grouping its internal steps. Stop should prevent future actions; already-running Python needs explicit handling.
7. **Start model interaction with text, then add voice.** First measure a creation request and a selected-object edit using the actual event API. Confirm the supported audio path early. Keep typed input as a fallback while making interruption and spoken interaction work.
8. **Build the demo around a meaningful revision.** Create the starting scene during the event, then show pointing, a spoken change, a useful design tradeoff and a new constraint. Let the audience choose a bounded variation rather than an unlimited surprise project.

Treat a 30–45 minute first integration check as a decision point: if physical pointing is unreliable, simplify to touchpad or mouse input while retaining spatial references and conversation. If arbitrary 3D edits are too slow or inconsistent, Excalidraw remains a simpler alternative for the same design-partner interaction.

## Specific traps to avoid

- More model steps can cost much more than more geometry. Inspect when feedback will change the next action, not after every trivial operation.
- Verify the model's claims against the viewport. Our agent reported completion while the view still obscured the interior; it needed another pass.
- Use meaningful object names and preserve unaffected geometry. A selected object's material may be shared, so a local color edit may need a separate material.
- Keep the viewport readable: good framing, visible pointer, useful selection highlight, and material colors that actually display in the chosen shading mode.
- Account for phone orientation relative to calibration, angle wraparound and roll. This is an orientation-based pointer, not tracked physical position. Recenter is essential; smoothing must not make it sluggish.
- Development hot reload can silently break pairing. Test the exact running demo build after changes. A loaded HTML page is not proof its controls have initialized.
- Browser screenshots in the controller are snapshots, not a live 3D viewport. Tell the presenter where to look.
- A successful tool return is not proof of perceived responsiveness. Observe the screen and the actual phone.

## What makes the technical story convincing

Show real spatial grounding, safe scene-state handling, general model-driven Blender operations, and visual correction. Use Astra's event-supported capabilities where they solve a real interaction problem. If demonstrating mid-turn changes or overlapping work, make stale actions and cancellation behave correctly; do not merely mention feature names.

Use Astra meaningfully during today's development too. Keep a few genuine examples of it diagnosing a failure, improving an implementation or validating behavior. Describe only what actually happened. The rehearsal's numbers and scenes are not evidence of Astra performance or today's submission.
