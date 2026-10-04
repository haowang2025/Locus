# Dust2 player-callout revision

New projects use `dust2-callouts` / `dust2-vrchris-08f7ab9c-v5`: fourteen measured player-region landmarks, Chinese labels and aliases, 42 meaning-unit capacity. `dust2v5-*` anchor IDs are distinct from old anchors. Model context, route legend and offline selector include regions and aliases.

Old `dust2` / `dust2-vrchris-08f7ab9c-v4` remains installed with exactly its original labels, coordinates, cue volumes and route. New-project selection hides v4; restoring v4 retains its identity and selection. Historical sixty-slot saves keep their original 200-span path. Do not change only the scene ID to migrate an old plan: create and review a new plan explicitly after saving a backup. Registry SHA tests pin v4 and reading hall to their prior complete definitions.

Capacities and Studio attachment counts derive from the selected scene, while global byte/texture limits remain enforced. Original source grounding, semantic review and attachment reveal roles remain mandatory. No model API, endpoint or credential is preconfigured.

Portrait v5 uses a genuine minimum 4:3 canvas, without stretching pixels, excessive FOV or moving the camera into geometry. Descriptions and controls remain outside the bounded scene. Smoother stair support respects the existing 0.34 m step limit and low ceilings; it does not increase jump allowance.

## Rebuild from source root

    npm ci --ignore-scripts
    npm test
    npm run lint
    npm run build
    node --import ./node_modules/tsx/dist/loader.mjs tools/buildOfflineStudio.ts ./releases/Locus-Dust2-Callouts-v5.html
    node --import ./node_modules/tsx/dist/loader.mjs tools/buildOfflineDemos.ts ./releases

To regenerate and freeze actual passed v5 walking evidence:

    mkdir -p ../scene-inspection
    NAV_STEP=.2 node --import ./node_modules/tsx/dist/loader.mjs tools/validate-dust2-callout-routes.ts
    node --import ./node_modules/tsx/dist/loader.mjs tools/embedDust2CalloutRoute.ts

The embedding command refuses failed or version/order-mismatched paths. Rebuild the HTML afterward. Studio construction verifies each current reference image's hash, bytes and dimensions before embedding.

CPU geometry, projection and DOM-emulation tests are engineering evidence. Blender images are diagnostic renders, not browser screenshots. Actual browser/WebGL, file://, touch, device performance and learning outcomes remain unverified.
