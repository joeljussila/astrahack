# Astra contributions and provenance

The four equally weighted event criteria are preserved in [the event guide](history/EVENT.md).

| Criterion | Implementation |
| --- | --- |
| Astra in development — 25% | Codex/Astra built and debugged the Blender bridge, versioned edits, phone integration, render acknowledgments, spatial handoff, background documents, UI and regression tests. Iteration followed user phone feedback and observed model failures. |
| Astra in the product — 25% | Runtime Astra interprets the brief, writes Blender edits, inspects renders, incorporates steering and can initiate a bounded review. The voice model is Realtime; it is not presented as Astra. |
| Live demo — 25% | An empty canvas develops through actual checkpoints. A marked location and changed brief alter work in progress. A PDF can save while building continues. The team supplies the video. |
| Technicality — 25% | Serialized mutation, revision/epoch rejection, rollback, undo, raycast-confirmed pointing, display-confirmed speech, async analysis and deterministic cost arithmetic. |

## Reused foundations and event work

The starting repository contained planning documents and an earlier iPhone controller, introduced in `8a5ceb6` and updated in `0ef2229`. Its motion projection/smoothing was adapted into `silta/voice-client.mjs`. The original source remains in Git history; we do not present the entire earlier controller as invented during this integration.

The event implementation in `silta/` connects that interaction to a Blender-backed shared canvas, transactional editing/recovery, native steering, visible checkpoint acknowledgments, marked targets and estimate documents. Earlier Excalidraw and primitive-preview directions are superseded. Historical notes describe previous versions and are not current validation claims.

Dependencies include Blender, Three.js, ws, qrcode, ReportLab and Cloudflare's tunnel client. Blender/Cloudflare binaries are installed separately. The report layout is original; a public construction-productivity report informed its presentation, not its material prices. No third-party building assets, supplier database or private participant information is included in the application source.

## Honest autonomy

The model receives general Blender editing and inspection tools. It does not replay a prerecorded design or a fake review. Background review is chosen for an observed concern and checked against current state. Tests use labelled authored fixtures. The recorded shark rehearsal used real Astra-generated geometry with request text supplied by a test harness.

The prototype proposes concepts. It does not certify structural integrity, underwater pressure resistance, utilities, building-code compliance, permits, public consultation or construction feasibility.
