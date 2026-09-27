# Tern design QA

final result: passed

No actionable P0, P1, or P2 visual findings remain after the spacing corrections below.

## Evidence

- Source visual truth: [selected mock-up](design/settle-and-resume.png), 1487 × 1058 pixels.
- Final implementation: [desktop capture](design/qa/pause-1488.png), 1488 × 1058 CSS and image pixels, device scale 1.
- Full comparison: [source left, implementation right](design/qa/comparison-final.png).
- Focused comparison: [pause drawer at readable size](design/qa/drawer-final.png).
- Narrow desktop: [900 × 1058 capture](design/qa/pause-900.png), with a modal overlay and reachable actions.

Both desktop views show the travel claim with unsaved values and the pause drawer open. The one-pixel source-width difference needs no scaling. The implementation capture includes keyboard focus on the note field. Captures come from the approved UI test runner's isolated Chromium browser. The connected Chrome browser also completed a live edit, pause, switch, and resume check. Its clean-load console reported no warnings or errors.

Chrome screenshot capture through the connector intermittently timed out. The comparisons use the deterministic UI-test captures, not a reconstructed rendering. The in-app browser was unavailable.

## Comparison history

The [initial full comparison](design/qa/comparison-initial.png) and [initial drawer comparison](design/qa/drawer-initial.png) revealed two P2 findings:

1. The task action bar pushed the website 44 pixels below its position in the source. The bar now hides while the modal drawer owns the interaction. The final form heading and fields align with the source's vertical placement.
2. Added review controls and wrapped warning copy pushed the drawer footer outside the first viewport. Tighter gaps, a shorter evidence-grounded recap, and adjusted warning text now keep the primary action, return link, and footer in view at the comparison size.

After these fixes, the final full and focused comparisons show no clipped primary controls. The later state-handling and focus corrections did not change the composition. The final suite recaptured both viewport sizes.

## Fidelity checks

- Fonts and typography: locally bundled Inter supplies the interface text, with Georgia for the expense website's serif wordmark. Heading weight, hierarchy, field typography, and wrapping follow the reference. Minor letterform differences from the generated image remain P3 polish.
- Spacing and layout: the 322-pixel sidebar, 430-pixel drawer, 56-pixel toolbar, website margins, compact rows, and bordered inputs preserve the source composition. The narrow view overlays the drawer instead of compressing its controls.
- Colors and tokens: graphite chrome, a light drawer, amber unsaved attention, teal actions, and separate assistant status text follow the selected design. Focus rings remain visible. No color is the only status indicator.
- Image quality and assets: the source contains UI controls and outline icons, with no photos or illustrations to generate. Phosphor supplies the icons; no hand-drawn asset replacements were used. Native window decorations are omitted because this is a webpage prototype.
- Copy and content: the main form and pause messages match the concept. Deliberate additions identify sample AI, selected sources, review actions, and session-only retention. Two seeded tasks replace illustrative counts. Search and task creation remain unavailable as specified.

## Interaction and accessibility checks

The automated suite covers keyboard operation, drawer focus and cancellation, all three task groups, retained form values, optional notes and the 500-character boundary, save failures, delayed acknowledgements, explicit submission, unknown page state, recap review, and the assistant-off journey. Pausing the last Active task places focus on Resume. Settled can be collapsed and its references inspected without reactivation.

The live Chrome check verified that an edited value and next-step note survived pausing and resuming. The final full run passed all 24 UI tests. Typechecking, production build, and all four bundled hosting tests also passed.

## Follow-up polish and limits

P3: icon shapes and some letterforms differ slightly from the generated reference. The drawer action sits slightly lower to accommodate explicit recap review controls.

This is visual and interaction QA for controlled sample sites. It is not an assistive-technology certification, a human resumption study, an arbitrary-site compatibility test, or evidence of recovery after restart. Human evaluation remains to be done.
