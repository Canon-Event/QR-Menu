# 3D Dish Modeling for FlavorBox

## Decision

For FlavorBox, use a hybrid workflow:

1. Photograph each real dish on a turntable or stable table setup.
2. Reconstruct it with KIRI Engine Basic first, or RealityScan when a Windows workstation is available.
3. Use Blender to remove the table, repair the underside, simplify the mesh, and make the materials consistent.
4. Export a GLB with Draco or Meshopt geometry compression and KTX2/Basis textures.
5. Ship two or three levels of detail and load the 3D asset only after the customer asks to view it.

This gives the highest realism per rupee for a restaurant-specific menu. AI image-to-3D is useful for prototypes and for dishes that cannot be photographed, but it should not be the default source of truth for a dish whose appearance and portion need to match the restaurant.

## Ranked options, paid to free

The ranking is for an interactive mobile web menu, where visual credibility, repeatability, cost, and download/runtime performance all matter.

| Rank | Workflow | Typical cost | Realism | Repeatability | FlavorBox fit |
|---|---|---:|---|---|---|
| 1 | Commission a specialist 3D/photogrammetry artist or small studio | Highest; quote per dish or batch | Highest when art-directed and reviewed | Highest after a style guide exists | Best for flagship dishes, launch photography, and high-value restaurants |
| 2 | In-house photogrammetry plus Blender cleanup | Camera/lighting/software time; software can be free | Very high for the actual dish | High with a capture rig and checklist | Best overall production workflow |
| 3 | KIRI Engine Pro plus Blender | $17.99/month or $79.99/year on the official pricing page | High, especially when PBR and quad retopology help | High | Best paid phone-first workflow |
| 4 | Polycam Basic/Business plus Blender | Basic is $150/year or $30/month on the current pricing page; free tier exists | High when capture conditions are good | High | Good if the team already uses Polycam or needs its wider capture tooling |
| 5 | Meshy Pro/Premium/Ultra image-to-3D plus Blender | $20/$40/$100 per month on the current individual comparison | Medium to high for a single attractive view; geometry may be invented | Medium | Fastest route from a dish photo to a prototype; good for previews, weak for exact portion fidelity |
| 6 | Tripo image-to-3D plus Blender | Credit/API based; official API lists image-to-3D task credits | Medium to high depending on input and version | Medium | Worth benchmarking against Meshy on the same dish set; do not commit before testing commercial terms and output quality |
| 7 | RealityScan desktop or mobile plus Blender | Free for individuals and companies under $1M annual gross revenue under the current license | Very high with a good photo set | High, but capture and cleanup take more skill | Best free photogrammetry route if the team can use Windows and manage the workflow |
| 8 | KIRI Engine Basic plus Blender | Free; current Basic plan supports photo scan, up to 150 photos/2 GB per scan, high-poly export and decimation | High for matte, textured dishes | High | Best free phone-first route; upgrade only when reflective/featureless food or PBR/quad output blocks progress |
| 9 | Blender manual modeling and sculpting | Free and open source | Potentially highest, but depends on artist time | High after a reusable dish kit is built | Best for repeatable stylized dishes, bowls, plates, sauces, and hero assets with controllable topology |
| 10 | Open-source single-image reconstruction such as TripoSR, followed by Blender | Free; hardware and artist time are the cost | Low to medium for food; hidden surfaces are guesses | Medium | Useful for experiments and blocked-in shapes, not a production default |
| 11 | Downloaded marketplace/community models | Free to paid | Unpredictable and often visually generic | Low for restaurant-specific dishes | Use only for plates, cutlery, tables, and props after checking the license; do not represent a restaurant's signature food with an unrelated model |

The first rank is a service category rather than a single product. A strong artist can combine reference photography, procedural modeling, sculpting, and physically based materials. This is the most expensive option, but often cheaper than repeatedly fixing a large batch of inconsistent AI models when the dishes are central to a premium brand.

## What the tools actually provide

### Photogrammetry and phone scanning

Photogrammetry reconstructs geometry and textures from many overlapping views. It is the best match for a real plated dish because the texture is captured from the restaurant's own food. The limitations are physical: glossy sauces, transparent glass, steam, moving garnishes, repetitive textures, and very thin edges produce unstable geometry. KIRI's own technical guidance says photo scan performs best when the subject has clear patterns and rich details, while smooth or low-texture surfaces can become incomplete or unstable ([KIRI Engine 4.0](https://www.kiriengine.app/blog/kiri-engine-4.0-release)).

KIRI Engine Basic is unusually useful as a free starting point: it lists photo scan, LiDAR scan where supported, cropping and texturing, up to 150 photos/2 GB per scan, high-poly export, dynamic decimation, and unlimited exports ([KIRI pricing](https://www.kiriengine.app/pricing)). Pro adds featureless-object scanning, mesh-inclusive Gaussian splats, PBR materials, quad mesh, auto-rigging, higher photo limits, and faster queues. The annual Pro price shown by KIRI is $79.99; monthly is $17.99 ([KIRI pricing](https://www.kiriengine.app/pricing)).

Polycam's current free tier includes limited captures and GLTF export. Its Basic tier lists unlimited object captures and Gaussian splats, unlimited LiDAR space captures, unlimited AI captures, six mesh export formats, and private links at $150/year or $30/month ([Polycam pricing](https://poly.cam/pricing)). Polycam is a sound choice when its capture UX or team library is valuable, but price alone does not make it more accurate than a carefully captured KIRI or RealityScan set.

RealityScan is the strongest free desktop choice for this project if the licensing condition applies: its official download page says it is free for individuals and companies below $1M annual gross revenue, with all features included ([RealityScan download and license](https://www.realityscan.com/download)). It requires a capable computer for comfortable processing; the listed Windows requirements include 8 GB RAM and an NVIDIA CUDA-capable GPU. Confirm the license again when FlavorBox revenue approaches the threshold.

### AI image-to-3D

AI image-to-3D is fast because it infers unseen sides from a small number of images. That makes it excellent for a clickable prototype, a placeholder while a restaurant schedules photography, or a stylized menu where exact physical truth is less important. It also means that a single image can produce an invented underside, garnish, thickness, or ingredient arrangement. Use multi-view input whenever the tool supports it and inspect every model from top, side, and underside angles.

Meshy currently lists Free, Pro, Premium, and Ultra individual plans. Its comparison page lists $0/$20/$40/$100 per month, 100/1,000/3,000/8,000 credits, downloads only on paid plans, multi-view image-to-3D on paid plans, and CC BY 4.0 licensing for free-plan outputs versus private ownership on paid plans ([Meshy plan comparison](https://help.meshy.ai/en/articles/12062933-which-meshy-plan-is-right-for-you)). Meshy supports GLB, USDZ, FBX, OBJ, STL, and Blend downloads, and documents an API for automation ([Meshy pricing and formats](https://www.meshy.ai/pricing)). For a commercial SaaS, the free-plan attribution and asset-ownership terms are material; keep an export record and use a paid/private plan for production assets unless legal has approved the free license.

Tripo exposes credit-based pricing rather than a simple comparable subscription in its official API documentation. Its API page lists image-to-3D actions and credits, but costs and model behavior can change ([Tripo API pricing](https://developers.tripo3d.com/en/pricing)). Treat Tripo as a benchmark candidate: run the same 10 dishes through Meshy and Tripo, score geometry, texture, cleanup minutes, and GLB size, then choose based on measured results rather than demos.

### Manual Blender modeling

Blender is a free, open-source suite covering modeling, sculpting, retopology, texturing, rendering, compositing, and scripting ([Blender features](https://www.blender.org/features/)). Its pipeline includes glTF 2.0 export ([Blender pipeline](https://www.blender.org/features/pipeline/)). Manual modeling is slower for the first dish but becomes efficient when the team builds reusable assets: plate profiles, bowl shapes, cutlery, table surfaces, garnish meshes, sauce blobs, and a small material library. It also produces the cleanest topology and the most predictable mobile performance.

## Recommended FlavorBox production recipe

### Capture

Use the restaurant's real plated dish, at the same portion and garnish used for service. Capture 60–120 overlapping photos around the dish at three heights: slightly above, level with the rim, and slightly below. Keep the dish still, remove steam, use diffuse light, lock exposure and focus, and place it on a matte contrasting surface. Keep a ruler or known-size reference outside the final crop if scale matters.

For glossy, transparent, or very smooth ingredients, capture the dish but plan to rebuild those parts in Blender. A scan is allowed to be the reference rather than the final mesh. Do not scan a moving bowl of soup or a garnish that changes between frames.

### Cleanup in Blender

Delete the table and background, close holes on the underside, remove floating fragments, and separate food, plate, and disposable props into named objects. Reproject or paint texture seams. Rebuild transparent glass, liquid surfaces, and very thin herbs manually when the scan produces noisy geometry. Apply transforms, set the origin sensibly, and normalize scale and orientation across every dish.

### Web export targets

Use binary GLB as the delivery format. Khronos describes glTF as a royalty-free runtime format designed for efficient transmission/loading, with reduced asset size and runtime unpacking work ([Khronos glTF](https://www.khronos.org/gltf/)). Blender supports glTF 2.0 export, and Three.js GLTFLoader supports Draco geometry, Meshopt geometry, KTX2/Basis textures, WebP, and related extensions ([Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)).

These are engineering targets for a QR-menu device range, not universal laws:

| Variant | Use | Triangle target | Texture target | Download target |
|---|---|---:|---:|---:|
| LOD0 | Recent iPhone/desktop hero view | 50k–100k | 2K KTX2 | 2–6 MB |
| LOD1 | Normal phone view | 15k–40k | 1K–2K KTX2 | 0.8–2.5 MB |
| LOD2 | Slow phone/data saver | 5k–15k | 512–1K KTX2 | 0.2–0.8 MB |

Start with one model on screen. Avoid loading every dish's model with the menu page. Show a thumbnail first, then lazy-load the selected dish, dispose the scene when the viewer closes, and cache models by dish revision. The Three.js documentation specifically notes that image bitmaps require explicit disposal when no longer referenced ([GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)); make disposal part of the viewer lifecycle.

### Quality gate

Reject a model if any of these are true:

- The silhouette changes noticeably from the real dish.
- The camera sees holes, floating fragments, stretched UVs, or a detached plate.
- The texture invents ingredients or makes food look plastic.
- The model is over the device budget without a visible quality reason.
- The license or attribution record is missing.

## Best choice by situation

- **You need 10–30 restaurant dishes quickly:** KIRI Basic + Blender cleanup. Pay for KIRI Pro only if reflective/featureless objects, PBR maps, quad retopology, or queue speed are recurring blockers.
- **You need five signature dishes for a premium launch:** commission a photogrammetry/3D artist, provide exact dish photography, and require GLB/LOD deliverables.
- **You have no physical dish available yet:** Meshy paid multi-view image-to-3D, then Blender cleanup; use the result as a temporary or clearly stylized asset until photographed.
- **You want the lowest-cost serious route:** RealityScan desktop or KIRI Basic, Blender, and a repeatable phone capture rig.
- **You want a stylized brand system:** model a small reusable plate/food kit manually in Blender and vary materials and garnish; this often looks more intentional than trying to photogrammetrically scan every dish.

## 30-day implementation plan

### Days 1–3: benchmark

Choose 10 representative dishes: matte dry food, glossy curry, soup, dessert, leafy garnish, drink, and a plated combination. Capture each once. Generate versions with KIRI Basic, RealityScan, Meshy, and Tripo where available. Record success rate, cleanup minutes, final GLB size, and a 1–5 realism score from someone who knows the dish.

### Days 4–7: style and budget

Pick one camera framing, one light setup, one material treatment, one background, and the LOD budgets above. Build a Blender file template with naming, scale, camera, lights, export settings, and a material library. Keep an asset manifest containing source photos, tool/version, license, model revision, triangle count, texture sizes, and final hash.

### Weeks 2–3: production

Process the best capture route for 20–50 dishes. Keep the high-resolution source project offline, but publish only optimized GLBs. Create a fallback image for every dish so the menu still works when WebGL is unavailable or the connection is slow.

### Week 4: web integration

Add a “View in 3D” action beside the existing dish actions. Lazy-load on interaction, show progress, expose a reduced-motion/data-saver fallback, and measure load time and WebGL errors by device class. Do not make 3D a requirement for ordering.

## Final recommendation

Start with KIRI Engine Basic plus Blender for the first production batch. Benchmark it against RealityScan and one paid AI tool on 10 real dishes. If the benchmark shows that scan cleanup is the bottleneck, pay for KIRI Pro or commission a specialist for hero dishes. Keep Meshy or Tripo as a rapid fallback for dishes without photos, and ship every approved asset as optimized GLB with LODs rather than uploading raw scans directly to the customer browser.

## Sources

- [KIRI Engine pricing and feature limits](https://www.kiriengine.app/pricing)
- [KIRI Engine photogrammetry limitations and improvements](https://www.kiriengine.app/blog/kiri-engine-4.0-release)
- [Polycam pricing](https://poly.cam/pricing)
- [RealityScan download, requirements, and license](https://www.realityscan.com/download)
- [Meshy plan comparison and licensing](https://help.meshy.ai/en/articles/12062933-which-meshy-plan-is-right-for-you)
- [Meshy pricing, formats, and API](https://www.meshy.ai/pricing)
- [Tripo API pricing](https://developers.tripo3d.com/en/pricing)
- [Blender features](https://www.blender.org/features/)
- [Blender pipeline and glTF support](https://www.blender.org/features/pipeline/)
- [Khronos glTF runtime format](https://www.khronos.org/gltf/)
- [Three.js GLTFLoader and compression extensions](https://threejs.org/docs/pages/GLTFLoader.html)
