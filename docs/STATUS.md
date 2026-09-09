# Implementation and verification

The phone uses WebRTC for Realtime audio. Requests are forwarded to the separate Astra Responses/WebSocket session, with `response.steer` for changed instructions during generation. Ending the call leaves accepted work running. Questions and documents have independent lifecycles.

Blender edits run in a serialized queue against private copies of the last committed `.blend`. Both request epoch and scene revision must match before execution and after export. Only valid results publish their GLB/model/preview. Failed edits, stale results and protected-place changes preserve the previous scene. Request undo restores its checkpoint. These controls coordinate trusted local work; they are not a Python security sandbox.

Phone marks freeze normalized screen coordinates. The visible renderer supplies an actual mesh hit or ground-plane location and current revision. Marks expire, reject removed targets, and are not moved by subsequent phone motion. The latest fix makes every orb tap mark; recentering has a separate control. The display confirms each loaded GLB after visible animation frames before spoken completion is released.

An independent Astra request proposes materials allowances with quantity bases, rate ranges, assumptions and exclusions. Code calculates row totals and their sum. ReportLab produces the PDF; confirmed file delivery triggers the save effect. Displayed allowances round to EUR 1,000 with rounding disclosed. SMTP uses TLS and memory-only credentials. Provider acceptance is distinguished from inbox delivery; uncertain sends are not blindly retried. No live external email was tested.

## Verification

Tests cover actual Blender fixtures and geometric sections, partial-Python rollback, conflicting writes, two revisions during execution, stale reviews, protected geometry, undo, voice hangup/interrupt isolation, render acknowledgments, material arithmetic, actual PDF/file delivery, email failure/deduplication, calibration, explicit marks, expiry, recenter clearing and the first-tap regression.

A real Astra backend/browser rehearsal resolved a ground point, added a 3 m shark beside an existing design, and accepted a colour change mid-build. First geometry committed at 18.029 s, revised geometry at 36.095 s, and inspected completion at 41.797 s. An independent PDF saved 22.701 s after its request. All 38 existing object fingerprints stayed unchanged. These are server/browser measurements with programmatically supplied request text, not physical-phone latency or a generation guarantee.

Physical iPhone sensor accuracy, speech-to-mark timing and a complete complex design remain manual rehearsal items. The latest phone controls are served by the bridge. No claims of universal architectural quality, engineering validation or a one-minute build are made.

## Boundaries

- Main designer: `gpt-6-astra`, low reasoning, priority service; availability depends on the supplied API account.
- Blender 4.5 LTS, configured executable paths and Python/ReportLab are required.
- Individual Blender processes: 90-second bound; design sessions: 96 response rounds; scene metadata: 3,000 objects.
- Access measurements: conservative projected bounds overlap, not full connectivity or regulatory checks.
- Generated files, transcripts, credentials and local runtime data are excluded from Git.
- Opening the main display clears the world; opening the phone joins the current world.
