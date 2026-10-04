# Offline Studio and portable palace delivery

## Build

Use the repository's installed dependencies; no second dependency tree is needed.

```sh
npm ci
npm run build
node --import tsx tools/buildOfflineDemos.ts
node --import tsx tools/buildOfflineAssetFixture.ts
node --import tsx tools/buildOfflineStudio.ts
node --import tsx --test tests/*.test.ts
```

Studio and demo tools write to the sibling `deliverables/` directory; the asset fixture tool writes under the sibling `qa/` directory. The asset fixture is QA-only, not a learning sample. Studio is the primary authoring entry point; the three authored preview palaces are examples, not claims of a live model run.

## Entry points and boundaries

- `src/studio/Studio.tsx`: in-memory authoring UI. Uses the same source segmentation, model proposal parser, semantic review and final validation as the main app.
- `src/studio/core.ts`: pure project-to-portable compilation and validated backup import. It does not access IndexedDB.
- `src/studio/chapters.ts`: one active chapter, full original source retained in the project, explicit replace semantics. A chapter HTML carries only its chapter text and minimal origin metadata. Other chapters' text is omitted.
- `src/offline/assemble.ts`: exact card/plan agreement, complete unit coverage, explicit field allowlists, scene/version-bound content fingerprint and progress seed.
- `src/lib/offlineExport.ts`: main-app collector for local card blobs and a supported scene. Inactive legacy custom-map metadata does not override a semantic scene. Active unsupported custom maps fail clearly.
- `src/offline/serialize.ts`: JSON/script escaping, payload/reference checks, static resource limits and single-HTML serialization.
- `src/offline/runtime.ts`: bundled classic script with Three.js, scene construction/loading, shared cue renderer, capsule walking, viewport-aware framing and per-unit retrieval practice. It never calls a model.

## File and storage behavior

No CDN or relative scene fetch is required by the built Studio or exported viewer. Studio embeds both scene data and 26 versioned visual reference images. An optional visual-context ZIP is built from those embedded bytes; it does not contact a provider.

The authoring project lives in memory. A `.locus-studio.json` backup retains original material, draft/review flags and attachments. A download request is not proof that the browser saved a file; the UI requires explicit confirmation before dismissing its backup warning. Chapter switching clears only the active draft after a warning, and preserves the complete source/layout. Other chapter drafts are not archived automatically.

The viewer attempts localStorage and continues in memory if it is unavailable. Progress restore checks palace ID, content fingerprint and unit IDs. Explicit progress-file confirmation avoids treating a blocked download as a saved backup. Local storage is not a guarantee of durable retention.

## Resources and safety

- Binary assets: 80 MiB; output HTML and project backup: 120 MiB.
- PNG/JPEG/GIF/WebP raster headers are inspected before browser image decode.
- Single raster: 16 million pixels, maximum edge 8192. Combined external images and embedded GLB textures: 24 million pixels.
- GLB must be self-contained. External resource URIs, unsupported decoder dependencies, invalid buffers/accessors, invalid/cyclic node graphs and nonfinite numeric data are rejected before GLTFLoader.
- Model attachments use a static pose and preserve proportions inside the anchor's bounded cue volume. They do not participate in walking collision.
- These limits reduce risk, but do not prove a specific device has enough CPU/GPU memory.

The output includes full relevant learning text and referenced attachments. Treat it according to the input's confidentiality. A chapter HTML does not include other chapter text; workspace backups and chapter-list JSON do include the whole original and must not be shared accidentally.

## Validation and limits of the evidence

Source tests, TypeScript compilation, production builds, exact-byte manifest checks, embedded-script syntax, fallback DOM simulations, geometry bounds, texture/header checks and CPU walking replay have been exercised. Actual browser rendering, file:// storage/download behavior, mobile interaction, texture display and the full React UI have not been accepted through a real browser in this environment.

Regenerate every HTML after changes to the runtime, shared scene/cue code, semantic core, or visual-context assets. Recheck the exact generated artifact rather than treating a prior source test as evidence for a newly packaged file. Each generated artifact has a byte-count/SHA-256 manifest; source versions and licenses remain embedded.

## Attachment roles and active-unit practice

Attachment policy is per asset and per stable semantic unit, with an optional explicitly selected anchor-wide scope. Semantic cue bindings include the source fingerprint. Missing legacy bindings default to post-answer references; stale bindings cannot authorize a cue. Cue assets are intentionally visible before answer reveal and may help recall; they are not an answer-security mechanism. Reference assets are visible only after reveal. Unit switches and hiding answers reset an ineligible reference selection. Gallery display preserves one bounded attachment at a time. The current generated mnemonic slot is highlighted and its siblings muted without changing geometry.

Studio split/merge resets attachment review and bindings; moving a cue between anchors invalidates attachments at both affected anchors. Changes must be reviewed again. One explicit per-unit acknowledgment follows a visible canonical source/rendered/imagined/not-encoded summary; optional detailed edits remain, and no import or all-unit bulk action fabricates approvals.
