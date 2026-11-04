# Menu system audit and implementation scope

## Findings from the supplied screenshots and source

- Heritage's cover title occupies the same absolute coordinates as its illustration. Its inner text shrinks to about 1–2% of the page width. Italian and Bloom clamp names and descriptions; closing-page names use ellipsis.
- `menu-layout.ts` fills fixed illustrated slots, with capacities as low as three dishes. Missing categories leave holes; five dishes can create a continued section. Artwork dictates order instead of the owner's category ordering.
- `templates.css` and `category-layouts.css` repeatedly override typography with container units and `!important`. A fixed paper aspect ratio cannot accommodate arbitrary restaurant content.
- Public and preview routes separately choose renderers. Defaults differ between the font utility, gallery and editor (including slider defaults outside their range). Saving can change an otherwise untouched preview.
- The editor exposes every field at once. Its white surfaces inherit dark platform text, and responsive rules remove the preview's height constraint. Network failures can leave saving/uploading stuck. There is no saved snapshot, undo, or navigation protection.
- The gallery has a second, unused editor with sample content rather than the real menu, plus a dialog without focus containment.

## Implementation boundaries

Use one menu document and one normalized settings model for public, editor and gallery previews. Keep each template's artwork, palette and heading face. Content pages use intrinsic flow and the owner's ordering; decoration never controls text positions. Keep authentication, plan checks, routes, ordering actions, database schema and menu CRUD intact. Preserve the existing dashboard's shared dark/light sizing.

The editor will use progressive groups, explicit save/dirty/error states, a saved snapshot, undo/reset, protected navigation and bounded responsive preview modes. No new production dependency is needed.

## Verification

Record actual results and limitations in `docs/menu-system-qa.md`. Fixture/browser checks do not constitute authenticated production-database persistence verification.
