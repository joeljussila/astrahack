# Excalidraw design partner

## Concept

Collaborate with Astra on a real, editable software architecture diagram through pointing and conversation. Select a component, say “this,” explain a changing requirement and have Astra revise the diagram while discussing the tradeoffs.

The value is reasoning about a design as requirements evolve. Diagram generation is the starting point; useful revisions and continuity make it a design partner.

## Proposed demo

1. Create a small architecture diagram during the event.
2. Point at or select a component in Excalidraw.
3. Ask how the design should change for a concrete constraint, such as background processing or retry handling.
4. Have Astra explain the tradeoff and update the relevant components, arrows and labels while preserving unrelated elements.
5. Change a requirement, revise the diagram again and demonstrate undo or direct manual editing.

This is a proposed demo flow, not a claim that the complete spoken interaction has been validated.

## Interaction and engineering

- Use a real Excalidraw document with editable shapes, text, arrows and freehand strokes.
- Supply selection IDs, pointer position and scene state so references have a concrete target.
- Use phone pointing, drawing and lasso selection, with touchpad or desktop input as fallbacks.
- Give Astra general scene-editing tools and visual inspection of the resulting canvas.
- Preserve unaffected element IDs and layout during targeted edits; keep undo and local autosave available.
- Keep gesture input responsive while model work handles the requested design change.

## Why this direction

Architecture diagrams make changes in requirements easy to show and discuss. The canvas is simpler to present than a 3D scene, which may make it easier to deliver a complete live interaction in the available time.

To distinguish it from diagram dictation, show Astra identifying a meaningful tradeoff, retaining context and updating an existing design correctly. Tie the demo to the same four judging categories in [the event brief](EVENT.md).

## Risks and scope

Keep the diagram small and readable. Validate connector correctness, layout preservation and the quality of the reasoning. The phone and audio paths still need physical testing. Current local voice support is browser dictation and optional spoken replies; Realtime audio and actual mid-turn Astra steering are not implemented according to the validation notes.

See [prototype status](PROTOTYPE_STATUS.md) for the recorded Astra canvas edit. The [3D concept](PROJECT_3D.md) explores the same interaction in a spatial workspace.
