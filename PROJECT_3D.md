# Interactive 3D design partner

## Concept

Point into a live Blender scene with an iPhone, say “this,” and collaborate with Astra on the actual editable design. Astra interprets the selected object and scene, reasons about the requested change, edits it and inspects the result.

The ambition is a conversational creative partner with Blender’s general capabilities: geometry, materials, modifiers, cameras and scene composition. Keep it open to arbitrary design work rather than a fixed menu of furniture or wall operations.

## Proposed demo

1. Open a readable scene created during the hackathon.
2. Point at an object with the phone and select it.
3. Ask for a visible change, such as changing a chair’s upholstery and adding a matching lamp.
4. Discuss a design consequence and introduce a new constraint, such as keeping a walkway clear.
5. Show the revised, editable scene and undo a request if needed.

This is a proposed demo flow. End-to-end physical phone and voice interaction still needs validation.

## Interaction and engineering

- Native Blender is the live viewport and scene authority.
- The phone supplies an orientation-based pointer, selection, drawing and orbit controls, with Recenter and a touchpad fallback. It does not track physical phone position.
- Raycasting grounds “this” in an actual object and hit position. Selection and sketches provide additional context.
- Astra receives scene information and viewport images, and can execute general Blender Python to create or edit content.
- Pointer movement stays immediate and local to the interaction path. Model calls handle meaningful design requests.
- Revision checks, checkpoints, error recovery and request-level undo protect the editing flow. General Python execution is not a security sandbox.

## Why this direction

It can make shared spatial understanding and model reasoning visible within seconds of the audience seeing the scene. The compelling moment is a meaningful design revision that preserves the rest of the work.

The four equally weighted judging categories require genuine Astra development contributions, consequential runtime use, a compelling live demo and sound engineering. Preserve actual development examples and show actual scene edits.

## Risks and decision point

Physical pointer calibration, drift, microphone behavior and perceived responsiveness remain open. Broad scene creation can be slower than a targeted edit. Start with one bounded change in an event-built scene; measure first visible result and completion separately.

If phone motion is unreliable, use touchpad or mouse selection. If 3D editing is too slow or inconsistent for a complete demo, evaluate the [Excalidraw concept](PROJECT_EXCALIDRAW.md).

See [prototype status](PROTOTYPE_STATUS.md) for recorded integration checks and [rehearsal lessons](REHEARSAL_LEARNINGS.md) for historical measurements.
