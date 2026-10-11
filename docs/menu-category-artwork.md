# Category placement and artwork

Each template uses category types to choose page sections. Categories no longer move beside unrelated artwork when their sort order changes, and Green Bistro's two page designs receive different content.

In **Dashboard > Templates > Edit > Categories & artwork**, owners can override the category type suggested from its name. Green Bistro also supports a photo URL or upload for each category. The photo priority is category photo, a photo from an available dish in that category, an applicable saved default photo, then matching supplied artwork. Unrecognized categories receive general layouts without unrelated food images.

- **Heritage:** chaat/starters, South Indian, beverages and desserts use their own illustrated rows. Main courses and breads use the meal page. Other categories use a general framed page.
- **Green Bistro:** starters, soups/salads and drinks use the split page; pasta/main courses, pizza, grills and desserts use the four-section page. Owners can also select either page design exclusively. Categories and photos remain paired.
- **Italian:** pasta, grills, desserts and drinks stay in the matching feature-page sections. Other categories use the neutral two-section page.
- **Bloom & Brunch:** breakfast categories use the breakfast artwork, drinks use the drinks artwork, and other food categories use a general framed page.

Large categories continue on further pages using the same layout. Illustrated slots remain fixed when neighbouring categories are absent. Pages with no content are omitted. Unassigned dishes remain under Other; assign them in Dashboard > Menu to place individual dishes correctly. These changes do not rewrite restaurant dish/category data.

Overrides are stored in the existing `restaurants.template_settings` JSON under each template's `categoryPresentation` map, keyed by category ID. No additional SQL migration is required for category artwork. The template preview renders the same React components as the public menu.

## Validation

`node --test tests/menu-layout.test.cjs tests/menu-modes.test.cjs` covers category routing, stable artwork, overflow, missing categories, uniqueness of rendered dishes, validation and persistence of overrides.

`node artifacts/category-layouts/check.cjs` renders fixture menus in a local browser at phone and desktop widths. It writes screenshots and a report under `artifacts/category-layouts/` and checks image loading, horizontal overflow and dishes extending outside their category sections. It does not contact Supabase or alter restaurant data.

## Added dessert artwork

Asset: `public/templates/green-bistro/dessert-v1.png`.

Generated with the built-in image generation tool. Prompt:

> Create one photorealistic food cutout asset for an elegant cream-and-botanical restaurant menu. A small round off-white ceramic plate holds a chocolate lava cake with a little molten chocolate, one scoop vanilla ice cream, delicate powdered sugar and a tiny mint garnish. Warm natural side light, subtle realistic soft contact shadow, three-quarter overhead angle, appetizing editorial food photography. Entire plate visible and centered with generous transparent padding. Actual transparent background, no table, no text, no borders, no watermark. Output a single isolated dessert plate PNG suitable to sit beside the Desserts category in a classic green bistro menu.
